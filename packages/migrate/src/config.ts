import { Parser } from "acorn";
import { tsPlugin } from "@sveltejs/acorn-typescript";

import type { MigrateResult, MigrationNote, NoteKind } from "./notes.js";

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
	/** local names bound to the whole mdsvex module */
	namespaces: Set<string>;
	edits: Edit[];
	notes: MigrationNote[];
	seen: Set<Node>;
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

/** rewrite the legacy layout option in a js or ts config to templates, throws a SyntaxError when the source does not parse */
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
		namespaces: new Set(),
		edits: [],
		notes: [],
		seen: new Set(),
	};

	collect_top_level(ctx, program);

	let found = false;
	walk(program, (node) => {
		if (!is_mdsvex_call(ctx, node) || !node.arguments[0]) return;
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

	return { code: apply_edits(source, ctx.edits), notes: ctx.notes };
}

function collect_top_level(ctx: Context, program: Node): void {
	for (let statement of program.body as Node[]) {
		if (statement.type === "ImportDeclaration") {
			if (statement.source.value !== "mdsvex") continue;
			for (const specifier of statement.specifiers as Node[]) {
				if (specifier.type === "ImportNamespaceSpecifier") {
					ctx.namespaces.add(specifier.local.name);
				} else {
					ctx.functions.add(specifier.local.name);
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
						if (p.type === "Property" && p.value.type === "Identifier") {
							ctx.functions.add(p.value.name);
						}
					}
				}
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
	const key = property.key as Node;
	if (key.type === "Identifier") return key.name;
	if (key.type === "Literal" && typeof key.value === "string") return key.value;
	return undefined;
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

function remove_property(ctx: Context, object: Node, property: Node): void {
	const properties = object.properties as Node[];
	const i = properties.indexOf(property);
	if (i < properties.length - 1) {
		edit(ctx, property.start, properties[i + 1].start, "");
	} else if (i > 0) {
		edit(ctx, properties[i - 1].end, property.end, "");
	} else {
		edit(ctx, property.start, property.end, "");
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
