import { Parser } from "acorn";
import { tsPlugin } from "@sveltejs/acorn-typescript";

import type { MigrateResult, MigrationNote, NoteKind } from "./notes.js";
import { PLUGINS_GUIDE, replacement_of } from "./plugins.js";

const TSParser = Parser.extend(tsPlugin());

/** an estree node, including typescript ones */
interface Node {
	type: string;
	start: number;
	end: number;
	loc: { start: { line: number; column: number } };
	[key: string]: any;
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

interface Context {
	source: string;
	/** initialisers of top level variables by name */
	bindings: Map<string, Node>;
	/** local names of functions imported from mdsvex */
	functions: Set<string>;
	/** local names of the mdsvex function itself */
	plugins: Set<string>;
	/** local names bound to the whole mdsvex module */
	namespaces: Set<string>;
	/** the module each other imported or required local name comes from */
	modules: Map<string, string>;
	edits: Edit[];
	notes: MigrationNote[];
	seen: Set<Node>;
	/** properties an edit removes */
	removed: Set<Node>;
	/** properties to add once every removal is known */
	additions: { object: Node; text: string }[];
}

// expressions that evaluate to the path of a single layout
const PATH_LIKE = new Set([
	"Literal",
	"TemplateLiteral",
	"TaggedTemplateExpression",
	"CallExpression",
	"NewExpression",
	"MemberExpression",
	"BinaryExpression",
]);

const TS_WRAPPERS = new Set([
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"TSTypeAssertion",
	"ParenthesizedExpression",
]);

/** where the migration guide explains the highlight changes */
export const HIGHLIGHT_GUIDE = "https://mdsvex.com/docs#syntax-highlighting-in-0x";

/** where the migration guide explains smart punctuation */
export const SMART_GUIDE = "https://mdsvex.com/docs#smart-punctuation-in-0x";

// twinkleplop languages and the aliases mdsvex has for them, alias targets
// outside this list are prism languages that next can not highlight
const LANGUAGES = new Set([
	"bash",
	"c",
	"cpp",
	"css",
	"diff",
	"dockerfile",
	"dotenv",
	"go",
	"graphql",
	"html",
	"http",
	"ini",
	"javascript",
	"json",
	"jsonc",
	"markdown",
	"powershell",
	"python",
	"rust",
	"shellsession",
	"sql",
	"svelte",
	"toml",
	"tsx",
	"typescript",
	"yaml",
	"js",
	"mjs",
	"cjs",
	"ts",
	"mts",
	"cts",
	"jsx",
	"sh",
	"shell",
	"zsh",
	"console",
	"shell-session",
	"yml",
	"md",
	"env",
	"patch",
	"py",
	"rs",
]);

/**
 * rewrite the legacy layout, highlight and smartypants options in a js or ts
 * config, and flag escapeSvelte, throws a SyntaxError when the source does
 * not parse
 */
export function migrate_config(source: string): MigrateResult {
	const program = TSParser.parse(source, {
		ecmaVersion: "latest",
		sourceType: "module",
		locations: true,
	}) as unknown as Node;

	const ctx: Context = {
		source,
		bindings: new Map(),
		functions: new Set(),
		plugins: new Set(),
		namespaces: new Set(),
		modules: new Map(),
		edits: [],
		notes: [],
		seen: new Set(),
		removed: new Set(),
		additions: [],
	};

	collect_top_level(ctx, program);

	let found = false;
	walk(program, (node) => {
		if (
			node.type === "MemberExpression" &&
			node.object.type === "Identifier" &&
			ctx.namespaces.has(node.object.name) &&
			key_name_of(node.property) === "escapeSvelte"
		) {
			escape_svelte_note(ctx, node);
			return;
		}
		if (!is_mdsvex_call(ctx, node)) return;
		if (!node.arguments[0]) {
			// 0.x had smart punctuation on with no options at all
			if (is_plugin_call(ctx, node)) {
				found = true;
				edit(ctx, node.end - 1, node.end - 1, "{ smart_punctuation: true }");
				smart_note(ctx, node, ADDED, DASHES, true);
				nofollow_note(ctx, node);
			}
			return;
		}
		const options = resolve(ctx, node.arguments[0]);
		if (options.type !== "ObjectExpression") return;
		found = true;
		migrate_options(ctx, options);
	});

	if (!found) {
		const exported = default_export(program);
		if (exported) {
			const options = resolve(ctx, exported);
			if (options.type === "ObjectExpression") migrate_options(ctx, options);
		}
	}

	for (const { object, text } of ctx.additions) add_property(ctx, object, text);

	return { code: apply_edits(source, ctx.edits), notes: ctx.notes };
}

function collect_top_level(ctx: Context, program: Node): void {
	for (let statement of program.body as Node[]) {
		if (statement.type === "ImportDeclaration") {
			if (statement.source.value !== "mdsvex") {
				for (const specifier of statement.specifiers as Node[])
					ctx.modules.set(specifier.local.name, String(statement.source.value));
				continue;
			}
			for (const specifier of statement.specifiers as Node[]) {
				if (specifier.type === "ImportNamespaceSpecifier") {
					ctx.namespaces.add(specifier.local.name);
				} else {
					if (key_name_of(specifier.imported) === "escapeSvelte") {
						escape_svelte_note(ctx, specifier);
						continue;
					}
					ctx.functions.add(specifier.local.name);
					if (key_name_of(specifier.imported) === "mdsvex")
						ctx.plugins.add(specifier.local.name);
				}
			}
			continue;
		}

		if (statement.type === "ExportNamedDeclaration" && statement.declaration) {
			statement = statement.declaration;
		}
		if (statement.type !== "VariableDeclaration") continue;

		for (const declarator of statement.declarations as Node[]) {
			const { id, init } = declarator;
			if (!init) continue;

			if (is_require_mdsvex(init)) {
				if (id.type === "Identifier") ctx.namespaces.add(id.name);
				if (id.type === "ObjectPattern") {
					for (const p of id.properties as Node[]) {
						if (key_name(p) === "escapeSvelte") {
							escape_svelte_note(ctx, p);
						} else if (p.type === "Property" && p.value.type === "Identifier") {
							ctx.functions.add(p.value.name);
							if (key_name(p) === "mdsvex") ctx.plugins.add(p.value.name);
						}
					}
				}
				continue;
			}

			const required = required_module(init);
			if (required !== undefined) {
				if (id.type === "Identifier") ctx.modules.set(id.name, required);
				if (id.type === "ObjectPattern")
					for (const p of id.properties as Node[])
						if (p.type === "Property" && p.value.type === "Identifier")
							ctx.modules.set(p.value.name, required);
				continue;
			}

			if (id.type === "Identifier") ctx.bindings.set(id.name, init);
		}
	}
}

function is_require_mdsvex(node: Node): boolean {
	return (
		node.type === "CallExpression" &&
		node.callee.type === "Identifier" &&
		node.callee.name === "require" &&
		node.arguments[0]?.type === "Literal" &&
		node.arguments[0].value === "mdsvex"
	);
}

/** the module of require('x') and require('x').default, undefined for anything else */
function required_module(node: Node): string | undefined {
	if (node.type === "MemberExpression") node = node.object;
	if (
		node.type === "CallExpression" &&
		node.callee.type === "Identifier" &&
		node.callee.name === "require" &&
		node.arguments[0]?.type === "Literal" &&
		typeof node.arguments[0].value === "string"
	)
		return node.arguments[0].value;
	return undefined;
}

function is_mdsvex_call(ctx: Context, node: Node): boolean {
	if (node.type !== "CallExpression") return false;
	const callee = node.callee as Node;
	if (callee.type === "Identifier") return ctx.functions.has(callee.name);
	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" &&
		ctx.namespaces.has(callee.object.name)
	);
}

/** a call of the mdsvex function itself, by the name it is exported under */
function is_plugin_call(ctx: Context, node: Node): boolean {
	const callee = node.callee as Node;
	if (callee.type === "Identifier") return ctx.plugins.has(callee.name);
	return key_name_of(callee.property) === "mdsvex";
}

function default_export(program: Node): Node | undefined {
	for (const statement of program.body as Node[]) {
		if (statement.type === "ExportDefaultDeclaration") {
			return statement.declaration;
		}
		const expression = statement.expression as Node | undefined;
		if (
			statement.type === "ExpressionStatement" &&
			expression?.type === "AssignmentExpression" &&
			expression.left.type === "MemberExpression" &&
			expression.left.object.name === "module" &&
			expression.left.property.name === "exports"
		) {
			return expression.right;
		}
	}
}

/** follow top level variables and mdsvex helper calls to the value they hold */
function resolve(ctx: Context, node: Node): Node {
	const visited = new Set<Node>();
	while (!visited.has(node)) {
		visited.add(node);
		node = unwrap(node);
		if (node.type === "Identifier" && ctx.bindings.has(node.name)) {
			node = ctx.bindings.get(node.name)!;
		} else if (is_mdsvex_call(ctx, node) && node.arguments[0]) {
			node = node.arguments[0];
		}
	}
	return node;
}

function unwrap(node: Node): Node {
	while (TS_WRAPPERS.has(node.type)) node = node.expression;
	return node;
}

function key_name(property: Node): string | undefined {
	if (property.type !== "Property" || property.computed) return undefined;
	return key_name_of(property.key as Node);
}

function key_name_of(key: Node): string | undefined {
	if (key.type === "Identifier") return key.name;
	if (key.type === "Literal" && typeof key.value === "string") return key.value;
	return undefined;
}

function escape_svelte_note(ctx: Context, node: Node): void {
	note(
		ctx,
		node,
		"escape_svelte",
		`\`escapeSvelte\` is gone: mdsvex escapes whatever a highlighter returns. Return plain HTML and remove the import. See ${HIGHLIGHT_GUIDE}`,
	);
}

function migrate_options(ctx: Context, options: Node): void {
	if (ctx.seen.has(options)) return;
	ctx.seen.add(options);

	const properties = options.properties as Node[];
	const find = (name: string) => properties.find((p) => key_name(p) === name);

	const forwarding = find("layoutPropForwarding");
	if (forwarding) {
		note(
			ctx,
			forwarding,
			"layout_prop_forwarding",
			"`layoutPropForwarding` is gone: templates always get the document's props through `$props()`. Remove the option.",
		);
	}

	const highlight = find("highlight");
	if (highlight) migrate_highlight(ctx, options, highlight);

	// a config that already has the new option was migrated before
	if (!find("smart_punctuation")) nofollow_note(ctx, options);
	migrate_smartypants(ctx, options, find("smartypants"), find("smart_punctuation"));

	for (const name of ["remarkPlugins", "rehypePlugins"]) {
		const plugins = find(name);
		if (plugins) migrate_plugins(ctx, options, plugins, name);
	}

	const extension = find("extension");
	if (extension) migrate_extension(ctx, extension, find("extensions"));

	const frontmatter = find("frontmatter");
	if (frontmatter) check_frontmatter(ctx, frontmatter);

	const layout = find("layout");
	if (!layout) return;

	if (find("templates")) {
		note(
			ctx,
			layout,
			"manual",
			"Both `layout` and `templates` are set. Move the layouts into `templates` by hand.",
		);
		return;
	}

	migrate_layout(ctx, options, layout);
}

function nofollow_note(ctx: Context, node: Node): void {
	note(
		ctx,
		node,
		"external_links",
		`mdsvex 0.x put \`rel="nofollow"\` on every link to another site. Links are written as they are now. To keep it, install \`@mdsvex/plugin-external-links\` and add \`external_links({ rel: ['nofollow'] })\` to \`plugins\`. See ${PLUGINS_GUIDE}`,
	);
}

/** the module a plugin entry comes from, a plugin, a call of one or a [plugin, options] pair */
function plugin_module(ctx: Context, entry: Node): { module?: string; options: boolean } {
	let node = unwrap(entry);
	let options = false;
	if (node.type === "ArrayExpression") {
		options = node.elements.length > 1;
		if (!node.elements[0]) return { options };
		node = unwrap(node.elements[0]);
	}
	if (node.type === "CallExpression") {
		options ||= node.arguments.length > 0;
		node = unwrap(node.callee);
	}
	if (node.type === "MemberExpression") node = unwrap(node.object);
	if (node.type !== "Identifier") return { options };
	const module = ctx.modules.get(node.name);
	if (module !== undefined) return { module, options };
	const bound = ctx.bindings.get(node.name);
	return { module: bound === undefined ? undefined : required_module(unwrap(bound)), options };
}

/** remark and rehype plugins do not run, each entry gets a note that says what replaces it */
function migrate_plugins(ctx: Context, options: Node, plugins: Node, name: string): void {
	const list = resolve(ctx, plugins.value);
	const kind = name === "remarkPlugins" ? "remark" : "rehype";
	const gone = `\`${name}\` is gone: mdsvex has its own parser and runs no ${kind} plugins.`;

	if (list.type !== "ArrayExpression") {
		note(
			ctx,
			plugins,
			"plugin",
			`${gone} Can't tell which plugins this holds. Remove the option, and find what replaces each plugin at ${PLUGINS_GUIDE}`,
		);
		return;
	}

	const properties = options.properties as Node[];
	const has = (key: string) => properties.some((p) => key_name(p) === key);

	for (const entry of list.elements as (Node | null)[]) {
		if (entry === null) continue;
		const { module, options: configured } = plugin_module(ctx, entry);
		const text = ctx.source.slice(entry.start, entry.end);
		if (module === undefined) {
			note(
				ctx,
				entry,
				"plugin",
				`\`${text}\` does not run now. Find what replaces it at ${PLUGINS_GUIDE}`,
			);
			continue;
		}
		const replacement = replacement_of(module);
		if (replacement === undefined) {
			note(
				ctx,
				entry,
				"plugin",
				`\`${module}\` does not run now, and nothing is listed for it. If it changed elements or attributes, a parse plugin can do the same. See ${PLUGINS_GUIDE}`,
			);
			continue;
		}
		let message = `\`${module}\` does not run now. ${replacement.message}`;
		const option = replacement.option;
		if (option !== undefined) {
			const key = option.slice(0, option.indexOf(":"));
			if (configured) {
				message += ` It had options here, so set \`${key}\` by hand.`;
			} else if (!has(key) && !ctx.additions.some((a) => a.object === options && a.text === option)) {
				ctx.additions.push({ object: options, text: option });
				message += ` \`${option}\` was added.`;
			}
		}
		note(ctx, entry, "plugin", `${message} See ${PLUGINS_GUIDE}`);
	}

	comment_before(
		ctx,
		plugins,
		`TODO(mdsvex-migrate): ${name} is gone, remove it and its imports once each plugin has a replacement. See ${PLUGINS_GUIDE}`,
	);
}

/** the singular extension option of 0.x */
function migrate_extension(ctx: Context, extension: Node, extensions: Node | undefined): void {
	if (extensions) {
		note(
			ctx,
			extension,
			"manual",
			"Both `extension` and `extensions` are set. `extension` is gone, remove it by hand.",
		);
		return;
	}
	const text = extension.shorthand
		? "extension"
		: ctx.source.slice(extension.value.start, extension.value.end);
	edit(ctx, extension.start, extension.end, `extensions: [${text}]`);
}

/** the fences of frontmatter are always --- now */
function check_frontmatter(ctx: Context, frontmatter: Node): void {
	const target = resolve(ctx, frontmatter.value);
	if (target.type !== "ObjectExpression") return;
	for (const property of target.properties as Node[]) {
		const name = key_name(property);
		if (name === "marker" || name === "type") {
			note(
				ctx,
				property,
				"manual",
				`\`frontmatter.${name}\` is gone. Frontmatter is always fenced with \`---\`, and \`frontmatter.parse\` gets the text between the fences, whatever language it is in. Remove the option, and change the fences of your documents if they used another marker.`,
			);
		}
		const value = name === "parse" ? unwrap(property.value) : undefined;
		if (
			(value?.type === "ArrowFunctionExpression" || value?.type === "FunctionExpression") &&
			value.params.length > 1
		) {
			note(
				ctx,
				property,
				"manual",
				"`frontmatter.parse` now gets one argument, the text between the fences, and returns the metadata. It no longer gets a `messages` array.",
			);
		}
	}
}

function migrate_layout(ctx: Context, options: Node, layout: Node): void {
	const value = unwrap(layout.value);

	// false was the default so there is nothing to carry over
	if (
		(value.type === "Literal" && (value.value === false || value.value === null)) ||
		(value.type === "Identifier" && value.name === "undefined")
	) {
		remove_property(ctx, options, layout);
		return;
	}

	const target = resolve(ctx, value);

	if (target.type === "ObjectExpression") {
		if (layout.shorthand) {
			edit(ctx, layout.start, layout.end, `templates: ${layout.key.name}`);
		} else {
			edit(ctx, layout.key.start, layout.key.end, "templates");
		}
		migrate_layout_map(ctx, target, layout);
		return;
	}

	if (target.type === "Identifier") {
		note(
			ctx,
			layout,
			"manual",
			`Can't tell what \`${target.name}\` holds. A single layout becomes \`templates: { default: ${target.name} }\`. Named layouts become \`templates\`, with \`_\` renamed to \`default\`.`,
		);
		return;
	}

	if (!PATH_LIKE.has(target.type)) {
		note(
			ctx,
			layout,
			"manual",
			"Can't rewrite this `layout` value. A single layout becomes `templates: { default: ... }`. Named layouts become `templates`, with `_` renamed to `default`.",
		);
		return;
	}

	const text = ctx.source.slice(layout.value.start, layout.value.end);
	edit(ctx, layout.start, layout.end, `templates: { default: ${text} }`);
}

function migrate_layout_map(ctx: Context, map: Node, layout: Node): void {
	if (ctx.seen.has(map)) return;
	ctx.seen.add(map);

	const properties = map.properties as Node[];
	const names: string[] = [];
	let fallback: Node | undefined;

	for (const property of properties) {
		const name = key_name(property);
		if (name === undefined) {
			note(
				ctx,
				property,
				"manual",
				"Can't migrate this entry. Keys are template names, and the `_` fallback is now `default`.",
			);
		} else if (name === "_") {
			fallback = property;
		} else {
			names.push(name);
		}
	}

	if (names.includes("default")) {
		const property = properties.find((p) => key_name(p) === "default")!;
		note(
			ctx,
			property,
			"manual",
			"`default` is now the fallback template for every document, but this layout was only used when named. Rename it, and any `layout: default` in frontmatter.",
		);
	} else if (fallback) {
		if (fallback.shorthand) {
			edit(ctx, fallback.start, fallback.end, "default: _");
		} else {
			edit(ctx, fallback.key.start, fallback.key.end, "default");
		}
	}

	if (names.length > 0) {
		let selector = "undefined";
		for (let i = names.length - 1; i >= 0; i--) {
			const name = names[i];
			selector = `id.includes(${quote("/" + name + "/")}) ? ${quote(name)} : ${selector}`;
		}
		note(
			ctx,
			layout,
			"select_template",
			"mdsvex 0.x applied a named layout to documents inside a folder with the same name. Templates aren't matched by folder. Choose them with `select_template(id, metadata)`, for example:\n\n" +
				`select_template: (id) => (${selector}),`,
		);
	}
}

const DASHES =
	"`--` was an em dash in mdsvex 0.x. It is an en dash now, and `---` is the em dash.";
const INVERTED =
	"`dashes: 'inverted'` is gone. `--` is an en dash now and `---` an em dash.";
const BACKTICKS = "Backtick quotes are gone.";
const REWRITE =
	"Pass your old `smartypants` value to `migrate`, `migrate(source, { smartypants: true })` for the default, and your documents are rewritten to render as they did.";

/** what the documents of a 0.x config need, the default had both */
function smart_note(ctx: Context, node: Node, lead: string, dashes: string, backticks: boolean): void {
	const parts = [lead, dashes, backticks ? BACKTICKS : ""].filter((p) => p !== "");
	if (dashes !== "" || backticks) parts.push(REWRITE);
	if (parts.length === 0) return;
	note(ctx, node, "smart_punctuation", `${parts.join(" ")} See ${SMART_GUIDE}`);
}

const ADDED =
	"mdsvex 0.x turned smart punctuation on by default. It is off by default now, so `smart_punctuation: true` was added. Remove it for text as written.";

/** smartypants was on unless it was false, smart_punctuation is off unless it is set */
function migrate_smartypants(
	ctx: Context,
	options: Node,
	legacy: Node | undefined,
	current: Node | undefined,
): void {
	if (!legacy) {
		// a config that already has the new option was migrated before
		if (current) return;
		ctx.additions.push({ object: options, text: "smart_punctuation: true" });
		smart_note(ctx, options, ADDED, DASHES, true);
		return;
	}
	if (current) {
		note(
			ctx,
			legacy,
			"manual",
			"Both `smartypants` and `smart_punctuation` are set. Remove `smartypants` by hand.",
		);
		return;
	}

	const value = unwrap(legacy.value);
	// off is the default of smart_punctuation
	if (value.type === "Literal" && value.value === false) {
		remove_property(ctx, options, legacy);
		return;
	}
	if (value.type === "Literal" && value.value === true) {
		edit(ctx, legacy.start, legacy.end, "smart_punctuation: true");
		smart_note(ctx, legacy, "", DASHES, true);
		return;
	}

	const target = resolve(ctx, value);
	if (target.type !== "ObjectExpression") {
		note(
			ctx,
			legacy,
			"manual",
			`Can't rewrite this \`smartypants\` value. The option is now \`smart_punctuation\`, with \`quotes\`, \`dashes\` and \`ellipses\`. \`backticks\` is gone and \`dashes\` is true or false. See ${SMART_GUIDE}`,
		);
		return;
	}
	if (ctx.seen.has(target)) return;
	ctx.seen.add(target);

	if (legacy.shorthand) {
		edit(ctx, legacy.start, legacy.end, "smart_punctuation: smartypants");
	} else {
		edit(ctx, legacy.key.start, legacy.key.end, "smart_punctuation");
	}

	const properties = target.properties as Node[];
	const find = (name: string) => properties.find((p) => key_name(p) === name);

	// 0.x had both on unless the object turned them off
	let dashes = DASHES;
	const dash = find("dashes");
	if (dash) {
		const mode = unwrap(dash.value);
		if (mode.type !== "Literal") {
			dashes = "";
			note(
				ctx,
				dash,
				"manual",
				`Can't tell what \`dashes\` holds. It is true or false now, \`--\` is an en dash and \`---\` an em dash. See ${SMART_GUIDE}`,
			);
		} else if (mode.value === false) {
			dashes = "";
		} else if (mode.value === "oldschool") {
			// the dashes of next
			dashes = "";
			edit(ctx, dash.value.start, dash.value.end, "true");
		} else if (mode.value === "inverted") {
			dashes = INVERTED;
			edit(ctx, dash.value.start, dash.value.end, "true");
		}
	}

	let backticks = true;
	const backtick = find("backticks");
	if (backtick) {
		const mode = unwrap(backtick.value);
		backticks = !(mode.type === "Literal" && mode.value === false);
		remove_property(ctx, target, backtick);
	}
	smart_note(ctx, legacy, "", dashes, backticks);
}

/** a new last property, on its own line when the last one has its own */
function add_property(ctx: Context, object: Node, text: string): void {
	const properties = object.properties as Node[];
	const before_close = object.end - 1;
	if (properties.length === 0) {
		edit(ctx, object.start, object.end, `{ ${text} }`);
		return;
	}
	// nothing is left to follow, it takes the place of the first, whose removal is applied first
	if (properties.every((p) => ctx.removed.has(p))) {
		edit(ctx, properties[0].start, properties[0].start, text);
		return;
	}
	const last = properties[properties.length - 1];
	const line_start = ctx.source.lastIndexOf("\n", last.start - 1) + 1;
	const indent = ctx.source.slice(line_start, last.start);
	const comma = ctx.source.slice(last.end, before_close).indexOf(",");
	// after the trailing comma when there is one, a removed last property takes the comma before it along
	const at = comma === -1 ? last.end : last.end + comma + 1;
	const lead = comma === -1 ? "," : "";
	if (/^[ \t]*$/.test(indent) && line_start > object.start) {
		edit(ctx, at, at, `${lead}\n${indent}${text}${comma === -1 ? "" : ","}`);
	} else {
		edit(ctx, at, at, `${lead} ${text}`);
	}
}

function migrate_highlight(ctx: Context, options: Node, highlight: Node): void {
	const value = unwrap(highlight.value);
	// false still turns highlighting off
	if (value.type === "Literal" && value.value === false) return;

	const target = resolve(ctx, value);
	if (target.type !== "ObjectExpression") {
		note(
			ctx,
			highlight,
			"manual",
			`Can't rewrite this \`highlight\` value. \`alias\` is now \`languages\`, \`optimise\` is gone, and a \`highlighter\` function becomes \`highlight\` itself. See ${HIGHLIGHT_GUIDE}`,
		);
		return;
	}
	if (ctx.seen.has(target)) return;
	ctx.seen.add(target);

	const properties = target.properties as Node[];
	const find = (name: string) => properties.find((p) => key_name(p) === name);

	const highlighter = find("highlighter");
	const alias = find("alias");
	const optimise = find("optimise");

	if (alias) {
		if (find("languages")) {
			note(
				ctx,
				alias,
				"manual",
				"Both `alias` and `languages` are set. Merge the aliases into `languages` by hand.",
			);
		} else {
			if (alias.shorthand) {
				edit(ctx, alias.start, alias.end, "languages: alias");
			} else {
				edit(ctx, alias.key.start, alias.key.end, "languages");
			}
			check_aliases(ctx, resolve(ctx, alias.value));
		}
	}

	if (optimise) {
		// an object that only held optimise goes with it
		if (properties.length === 1 && target === value) {
			remove_property(ctx, options, highlight);
			return;
		}
		remove_property(ctx, target, optimise);
	}

	if (highlighter) {
		const message =
			"`highlighter` is gone. `highlight` takes the function itself, `(code, { lang, meta, inline, filename }) => html`. It must be synchronous and return plain HTML, without `escapeSvelte` or `{@html}`. Return `null` to render the code plain.";
		comment_before(
			ctx,
			highlighter,
			`TODO(mdsvex-migrate): pass a synchronous highlighter as \`highlight\` itself, returning plain HTML without escapeSvelte or {@html}. See ${HIGHLIGHT_GUIDE}`,
		);
		note(ctx, highlighter, "highlighter", `${message} See ${HIGHLIGHT_GUIDE}`);
	}
}

/** alias targets that are prism languages twinkleplop does not have */
function check_aliases(ctx: Context, map: Node): void {
	if (map.type !== "ObjectExpression") return;
	const names = new Set<string>();
	for (const property of map.properties as Node[]) {
		const name = key_name(property);
		if (name !== undefined) names.add(name);
	}
	for (const property of map.properties as Node[]) {
		const value = property.type === "Property" ? unwrap(property.value) : null;
		if (value?.type !== "Literal" || typeof value.value !== "string") continue;
		const target = value.value;
		if (LANGUAGES.has(target) || LANGUAGES.has(target.toLowerCase()) || names.has(target))
			continue;
		note(
			ctx,
			property,
			"highlight_language",
			`\`${target}\` is a Prism language. mdsvex highlights with twinkleplop, which has no \`${target}\`. Alias a twinkleplop language, or pass a twinkleplop language module. See ${HIGHLIGHT_GUIDE}`,
		);
	}
}

/** a line comment above the node when it starts its line, a block comment before it otherwise */
function comment_before(ctx: Context, node: Node, text: string): void {
	const line_start = ctx.source.lastIndexOf("\n", node.start - 1) + 1;
	const indent = ctx.source.slice(line_start, node.start);
	if (/^[ \t]*$/.test(indent)) {
		edit(ctx, line_start, line_start, `${indent}// ${text}\n`);
	} else {
		edit(ctx, node.start, node.start, `/* ${text.replace(/\*\//g, "* /")} */ `);
	}
}

function remove_property(ctx: Context, object: Node, property: Node): void {
	const properties = object.properties as Node[];
	const i = properties.indexOf(property);
	ctx.removed.add(property);
	if (i < properties.length - 1) {
		edit(ctx, property.start, properties[i + 1].start, "");
	} else if (i > 0) {
		edit(ctx, properties[i - 1].end, property.end, "");
	} else {
		// the only property takes its trailing comma with it
		const comma = ctx.source.slice(property.end, object.end - 1).indexOf(",");
		edit(ctx, property.start, comma === -1 ? property.end : property.end + comma + 1, "");
	}
}

function quote(text: string): string {
	return "'" + text.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

function edit(ctx: Context, start: number, end: number, text: string): void {
	ctx.edits.push({ start, end, text });
}

function note(ctx: Context, node: Node, kind: NoteKind, message: string): void {
	ctx.notes.push({
		kind,
		message,
		line: node.loc.start.line,
		column: node.loc.start.column + 1,
	});
}

function apply_edits(source: string, edits: Edit[]): string {
	let code = source;
	for (const { start, end, text } of [...edits].sort((a, b) => b.start - a.start)) {
		code = code.slice(0, start) + text + code.slice(end);
	}
	return code;
}

function walk(node: Node, visit: (node: Node) => void): void {
	visit(node);
	for (const key in node) {
		if (key === "loc") continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value) {
				if (child && typeof child.type === "string") walk(child, visit);
			}
		} else if (value && typeof value.type === "string") {
			walk(value, visit);
		}
	}
}
