import type { Transformer } from 'unified';
import type { Text, Code, Html, Literal } from 'mdast';
import type { Element, Root } from 'hast';
import type { VFileMessage } from 'vfile-message';

import Message from 'vfile-message';
//@ts-ignore
import retext from 'retext';
//@ts-ignore
import smartypants from 'retext-smartypants';
import visit from 'unist-util-visit';
import yaml from 'js-yaml';
import { parse } from 'svelte/compiler';
import escape from 'escape-html';

// import * as path from 'path';

import type {
	FrontMatterNode,
	parser_frontmatter_options,
	Parts,
	PrismLanguage,
	PrismMeta,
	MdsvexLanguage,
	RollupProcess,
	Highlighter,
	LayoutMode,
	Layout,
	LayoutMeta,
	LayoutPropForwarding,
} from '../types';

let path: typeof import('path');
// const _require = import.meta.url ? createRequire(import.meta.url) : require;

// this needs a big old cleanup

const newline = '\n';
const layout_props_name = '__mdsvex_generated_layout_props';
const layout_rest_props_name = '__mdsvex_generated_layout_rest';
const layout_prop_name_prefix = '__mdsvex_generated_layout_prop_';
// extract the yaml from 'yaml' nodes and put them in the vfil for later use

export function default_frontmatter(
	value: string,
	messages: VFileMessage[]
): Record<string, unknown> | undefined {
	try {
		return yaml.safeLoad(value) as Record<string, unknown>;
	} catch (e) {
		messages.push(new Message('YAML failed to parse'));
	}
}

export function parse_frontmatter({
	parse,
	type,
}: parser_frontmatter_options): Transformer {
	const transformer: Transformer = (tree, vFile) => {
		visit(tree, type, (node: FrontMatterNode) => {
			const data = parse(node.value, vFile.messages);
			if (data) {
				// @ts-ignore
				vFile.data.fm = data;
			}
		});
	};

	return transformer;
}

export function escape_code({ blocks }: { blocks: boolean }): Transformer {
	// in code nodes replace the character witrh the html entities
	// maybe I'll need more of these

	const entites: Array<[RegExp, string]> = [
		[/</g, '&lt;'],
		[/>/g, '&gt;'],
		[/{/g, '&#123;'],
		[/}/g, '&#125;'],
	];

	return function (tree) {
		if (!blocks) {
			visit(tree, 'code', escape);
		}

		visit(tree, 'inlineCode', escape);

		function escape(node: FrontMatterNode) {
			for (let i = 0; i < entites.length; i += 1) {
				node.value = node.value.replace(entites[i][0], entites[i][1]);
			}
		}
	};
}

// remark-parse already partially escapes <>'s, but then re-emits them raw in the AST,
// which we stringify raw (Should we be?)
export function escape_brackets(): Transformer {
	const entites: Array<[RegExp, string]> = [
		// remark-parse does not transform \<
		[/\\</g, '&lt;'],
		// remark-parse transforms \> to '>', and &gt; to '>'
		[/^>$/g, '&gt;'],
		// remark-parse transforms &lt; to '<'
		[/^<$/g, '&lt;'],
	];

	return function (tree) {
		visit(tree, 'text', escape);

		function escape(node: Text) {
			for (let i = 0; i < entites.length; i += 1) {
				node.value = node.value.replace(entites[i][0], entites[i][1]);
			}
		}
	};
}

/**
 * Unescapes pipes in table cells.
 *
 * **NOTE**: This is necessary with `remark-parse` v8.  If it gets upgraded and `remark-parse` is
 * added, this is probably not necessary anymore.
 * @returns A `unified` transformer function that visits literal nodes and corrects escaped pipes.
 */
export function unescape_pipes_in_tables(): Transformer {

	function isLiteral(node: unknown): node is Literal {
		return !!node && typeof node === 'object' && 'value' in node && !('children' in node);
	}

	return (tree) => {
		visit(tree, 'tableCell', (cell) => {
			visit(cell, ['text', 'inlineCode'], (cellChild) => {
				if (isLiteral(cellChild)) {
					cellChild.value = cellChild.value.replace(/\\\|/g, '|');
				}
			})
		});
	};
}

// special case - process nodes with retext and smartypants
// retext plugins can't work generally due to the difficulties in converting between the two trees

export function smartypants_transformer(options = {}): Transformer {
	const processor = retext().use(smartypants, options);

	return function (tree) {
		visit(tree, 'text', (node) => {
			node.value = String(processor.processSync(node.value));
		});
	};
}

// regex for scripts and attributes

const attrs = `(?:\\s{0,1}[a-zA-z]+=(?:"){0,1}[a-zA-Z0-9]+(?:"){0,1})*`;
const context = `(?:\\s{0,1}context)=(?:"){0,1}module(?:"){0,1}`;

const RE_BLANK = /^\n+$|^\s+$/;

const RE_SCRIPT = new RegExp(`^(<script` + attrs + `>)`);

const RE_MODULE_SCRIPT = new RegExp(
	`^(<script` + attrs + context + attrs + `>)`
);

function extract_parts(nodes: Array<Element | Text>): Parts {
	// since we are wrapping and replacing we need to keep track of the different component 'parts'
	// many special tags cannot be wrapped nor can style or script tags
	const parts: Parts = {
		special: [],
		html: [],
		instance: [],
		module: [],
		css: [],
	};

	// iterate through all top level child nodes and assign them to the correct 'part'
	// anything that is a normal HAST node gets stored as HTML untouched
	// everything else gets parsed by the svelte parser

	children: for (let i = 0; i < nodes.length; i += 1) {
		const empty_node =
			nodes[i].type === 'text' && RE_BLANK.exec(nodes[i].value as string);

		// i no longer knwo why i did this

		if (empty_node || !nodes[i].value) {
			if (
				!parts.html.length ||
				!(
					RE_BLANK.exec(nodes[i].value as string) &&
					RE_BLANK.exec(parts.html[parts.html.length - 1].value as string)
				)
			) {
				parts.html.push(nodes[i]);
			}

			continue children;
		}

		let result: {
			html?:
				| {
						children?: any[] | undefined;
						start: any;
						end: any;
						[x: string]: any;
				  }
				| undefined;
			instance?: any;
			module?: any;
			css?: any;
		};
		try {
			// @ts-ignore
			result = parse(nodes[i].value as string);
		} catch (e) {
			parts.html.push(nodes[i]);
			continue children;
		}

		// svelte special tags that have to be top level
		if (!result.html || !result.html.children) return parts;

		const _parts: Array<
			['html' | 'css' | 'special' | 'instance' | 'module', number, number]
		> = result.html.children.map((v) => {
			if (
				v.type === 'Options' ||
				v.type === 'Head' ||
				v.type === 'Window' ||
				v.type === 'Body'
			) {
				return ['special', v.start, v.end];
			} else {
				return ['html', v.start, v.end];
			}
		});

		// The parser in Svelte >= 5.53.0 includes a _comments key, so
		// only loop through the keys we know about to avoid breaking on
		// comments and other future additions
		for (const key of ['instance', 'module', 'css'] as const) {
			if (!result[key]) continue;
			_parts.push([key, result[key].start, result[key].end]);
		}

		// sort them to ensure the array is in the order they appear in the source, no gaps
		// this might not be necessary any more, i forget
		const sorted = _parts.sort((a, b) => a[1] - b[1]);

		// push the nodes into the correct 'part' since they are sorted everything should be in the correct order
		sorted.forEach((next) => {
			parts[next[0]].push({
				type: 'raw',
				value: (nodes[i].value as string).substring(next[1], next[2]),
			});
		});
	}

	return parts;
}

function map_layout_to_path(
	filename: string,
	layout_map: Layout
): LayoutMeta | undefined {
	const match = Object.keys(layout_map).find((l) =>
		new RegExp(`\\` + `${path.sep}${l}` + `\\` + `${path.sep}`).test(
			path.normalize(filename).replace(process.cwd(), '')
		)
	);

	if (match) {
		return layout_map[match];
	} else {
		return layout_map['_'] ? layout_map['_'] : undefined;
	}
}

function generate_layout_import(
	layout: LayoutMeta | undefined
): string | false {
	if (!layout) return false;

	return `import Layout_MDSVEX_DEFAULT${
		layout.components.length ? `, * as Components` : ''
	} from '${layout.path}';`;
}

function generate_layout({
	frontmatter_layout,
	layout_options,
	layout_mode,
	filename,
}: {
	frontmatter_layout: false | undefined | string;
	layout_options: undefined | Layout;
	layout_mode: LayoutMode;
	filename: string;
}): [string | false, string[] | false, { reason: string } | false] {
	let selected_layout: LayoutMeta | undefined;
	const error: { reason: string } = { reason: '' };

	if (!layout_options || frontmatter_layout === false) {
		return [false, false, false];
	} else if (layout_mode === 'single') {
		selected_layout = layout_options.__mdsvex_default;
		if (frontmatter_layout)
			error.reason = `You attempted to apply a named layout in the front-matter of "${filename}", but did not provide any named layouts as options to the preprocessor. `;
	} else if (frontmatter_layout) {
		selected_layout = layout_options[frontmatter_layout];
		if (!selected_layout)
			error.reason = `Could not find a layout with the name "${frontmatter_layout}" and no fall back layout ("_") was provided.`;
	} else {
		selected_layout = map_layout_to_path(filename, layout_options);
	}

	return [
		generate_layout_import(selected_layout),
		selected_layout !== undefined &&
			selected_layout.components.length > 0 &&
			selected_layout.components,
		error.reason ? error : false,
	];
}

function node_contains_props_rune(node: any): boolean {
	if (!node || typeof node !== 'object') return false;

	if (
		node.type === 'CallExpression' &&
		node.callee &&
		node.callee.type === 'Identifier' &&
		node.callee.name === '$props'
	) {
		return true;
	}

	for (const key in node) {
		if (key === 'parent') continue;

		const value = node[key];
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i += 1) {
				if (node_contains_props_rune(value[i])) return true;
			}
		} else if (value && typeof value === 'object') {
			if (node_contains_props_rune(value)) return true;
		}
	}

	return false;
}

function create_generated_name(script: string, base: string): string {
	let name = base;
	let i = 1;

	while (script.includes(name)) {
		name = `${base}_${i}`;
		i += 1;
	}

	return name;
}

function create_props_rune_conflict_error(filename: string): Error {
	return new Error(
		`mdsvex: Cannot forward \`$props()\` to an mdsvex layout from this .svx file.\n\n` +
			`Use a top level object destructuring declaration such as \`let { title } = $props();\`, or bind the object directly with \`let props = $props();\`.\n\n` +
			`File: ${filename}`
	);
}

function create_layout_props_name(script: string | undefined): string {
	return create_generated_name(script || '', layout_props_name);
}

function get_line_indentation(source: string, index: number): string {
	const line_start = source.lastIndexOf(newline, index - 1) + 1;
	const line = source.slice(line_start, index);
	const match = line.match(/^\s*/);
	return match ? match[0] : '';
}

function get_layout_prop_name(property: any): string | false {
	if (property.computed) return false;
	if (property.key.type === 'Identifier') return property.key.name;
	if (property.key.type === 'Literal' && typeof property.key.value === 'string')
		return property.key.value;
	return false;
}

function transform_props_rune_declaration(
	script: string,
	declaration: any,
	variable_declaration: any
): { script: string; attributes: string } | false {
	if (declaration.id.type === 'Identifier') {
		return {
			script,
			attributes: `{...${declaration.id.name}}`,
		};
	}

	if (declaration.id.type !== 'ObjectPattern') return false;

	const properties = declaration.id.properties as any[];
	const rest_property = properties.find(
		(property) => property.type === 'RestElement'
	);
	const named_properties = properties.filter(
		(property) => property.type === 'Property'
	);
	const forwarding_properties: Array<{
		property_name: string;
		key_source: string;
	}> = [];

	for (let i = 0; i < named_properties.length; i += 1) {
		const property_name = get_layout_prop_name(named_properties[i]);
		if (property_name === false) return false;
		if (
			property_name !== 'children' &&
			!forwarding_properties.some(
				(property) => property.property_name === property_name
			)
		)
			forwarding_properties.push({
				property_name,
				key_source: script.slice(
					named_properties[i].key.start,
					named_properties[i].key.end
				),
			});
	}

	if (
		rest_property &&
		(!rest_property.argument || rest_property.argument.type !== 'Identifier')
	)
		return false;

	const declaration_indentation = get_line_indentation(
		script,
		variable_declaration.start
	);
	const property_indentation = `${declaration_indentation}  `;
	const generated_names = new Set<string>();
	const raw_properties = forwarding_properties.map(
		({ property_name, key_source }) => {
			const safe_name = property_name.replace(/[^A-Za-z0-9_$]/g, '_');
			const base = `${layout_prop_name_prefix}${safe_name}`;
			let name = create_generated_name(script, base);
			let i = 1;

			while (generated_names.has(name)) {
				name = `${base}_${i}`;
				i += 1;
			}

			generated_names.add(name);
			return { property_name, key_source, name };
		}
	);
	const rest_name = rest_property
		? rest_property.argument.name
		: create_generated_name(script, layout_rest_props_name);
	const original_properties = named_properties.map((property) =>
		script.slice(property.start, property.end)
	);
	const generated_properties = raw_properties.map(
		({ key_source, name }) => `${key_source}: ${name}`
	);
	const rest_source = rest_property
		? script.slice(rest_property.start, rest_property.end)
		: `...${rest_name}`;
	const replacement =
		`{${newline}` +
		[...original_properties, ...generated_properties, rest_source]
			.map((property) => `${property_indentation}${property}`)
			.join(`,${newline}`) +
		`${newline}${declaration_indentation}}`;
	const attributes = [
		`{...${rest_name}}`,
		...raw_properties.map(
			({ property_name, name }) => `${property_name}={${name}}`
		),
	].join(' ');

	return {
		script:
			script.slice(0, declaration.id.start) +
			replacement +
			script.slice(declaration.id.end),
		attributes,
	};
}

function get_props_rune_layout_forwarding(
	script: string
): { script: string; attributes: string } | false | undefined {
	try {
		// @ts-ignore
		const result = parse(script);
		const instance = result.instance && result.instance.content;
		if (!instance) return undefined;

		for (let i = 0; i < instance.body.length; i += 1) {
			const statement = instance.body[i];
			if (statement.type !== 'VariableDeclaration') continue;

			for (let j = 0; j < statement.declarations.length; j += 1) {
				const declaration = statement.declarations[j];
				if (
					!declaration.init ||
					declaration.init.type !== 'CallExpression' ||
					declaration.init.callee.type !== 'Identifier' ||
					declaration.init.callee.name !== '$props'
				)
					continue;

				return transform_props_rune_declaration(script, declaration, statement);
			}
		}

		return node_contains_props_rune(instance) ? false : undefined;
	} catch (e) {
		return undefined;
	}
}

export const handle_path = async (): Promise<void> => {
	path = await import('path');
};

export function transform_hast({
	layout,
	layout_mode,
	layoutPropForwarding,
}: {
	layout: Layout | undefined;
	layout_mode: LayoutMode;
	layoutPropForwarding?: LayoutPropForwarding;
}): Transformer {
	return function transformer(tree, vFile) {
		// we need to keep { and } intact for svelte, so reverse the escaping in links and images
		// if anyone actually uses these characters for any other reason i'll probably just cry
		visit<Element>(tree, 'element', (node) => {
			if (
				node.tagName === 'a' &&
				node.properties &&
				typeof node.properties.href === 'string'
			) {
				node.properties.href = node.properties.href
					.replace(/%7B/g, '{')
					.replace(/%7D/g, '}');
			}

			if (
				node.tagName === 'img' &&
				node.properties &&
				typeof node.properties.src === 'string'
			) {
				node.properties.src = node.properties.src
					.replace(/%7B/g, '{')
					.replace(/%7D/g, '}');
			}
		});

		// the rest only applies to layouts and front matter
		// this  breaks position data
		// svelte preprocessors don't currently support sourcemaps
		// i'll fix this when they do

		//@ts-ignore
		if (!layout && !vFile.data.fm) return tree;

		visit<Root>(tree, 'root', (node) => {
			const { special, html, instance, module: _module, css } = extract_parts(
				node.children as (Element | Text)[]
			);

			const { fm: metadata } = vFile.data as { fm: Record<string, unknown> };

			// Workaround for script and style tags in strings
			// https://github.com/sveltejs/svelte/issues/5292
			const stringified =
				metadata &&
				JSON.stringify(metadata).replace(/<(\/?script|\/?style)/g, '<"+"$1');

			const fm =
				metadata &&
				`export const metadata = ${stringified};${newline}` +
					`\tconst { ${Object.keys(metadata)
						.map((key) =>
							key.includes('-') ? `'${key}': ${key.replace(/-/g, '_')}` : key
						)
						.join(', ')} } = metadata;`;

			const frontmatter_layout =
				metadata && (metadata.layout as string | undefined | false);

			const [import_script, components, error] = generate_layout({
				frontmatter_layout,
				layout_options: layout,
				layout_mode,
				//@ts-ignore
				filename: vFile.filename,
			});
			const use_runes_layout_props = layoutPropForwarding === 'runes';
			const runes_layout_forwarding =
				import_script && use_runes_layout_props && instance[0]
					? get_props_rune_layout_forwarding(instance[0].value as string)
					: undefined;
			const layout_props = create_layout_props_name(
				instance[0] && (instance[0].value as string)
			);
			const layout_attributes = use_runes_layout_props
				? runes_layout_forwarding
					? runes_layout_forwarding.attributes
					: `{...${layout_props}}`
				: '{...$$props}';

			if (error) vFile.messages.push(new Message(error.reason));

			if (runes_layout_forwarding === false) {
				//@ts-ignore
				throw create_props_rune_conflict_error(vFile.filename);
			}

			if (runes_layout_forwarding && instance[0]) {
				instance[0].value = runes_layout_forwarding.script;
			}

			if (components) {
				for (let i = 0; i < components.length; i++) {
					visit(tree, 'element', (node) => {
						if (node.tagName === components[i]) {
							node.tagName = `Components.${components[i]}`;
						}
					});
				}
			}

			// add the layout if we are using one, reusing the existing script if one exists
			if (import_script && !instance[0]) {
				instance.push({
					type: 'raw',
					value: `${newline}<script>${newline}\t${import_script}${
						use_runes_layout_props && !runes_layout_forwarding
							? `${newline}\tconst ${layout_props} = $props();`
							: ''
					}${newline}</script>${newline}`,
				});
			} else if (import_script) {
				instance[0].value = (instance[0].value as string).replace(
					RE_SCRIPT,
					`$1${newline}\t${import_script}${
						use_runes_layout_props && !runes_layout_forwarding
							? `${newline}\tconst ${layout_props} = $props();`
							: ''
					}`
				);
			}

			// inject the frontmatter into the module script if there is any, reusing the existing module script if one exists
			if (!_module[0] && fm) {
				_module.push({
					type: 'raw',
					value: `<script context="module">${newline}\t${fm}${newline}</script>`,
				});
			} else if (fm) {
				// @ts-ignore
				_module[0].value = _module[0].value.replace(
					RE_MODULE_SCRIPT,
					(match: string) => `${match}${newline}\t${fm}`
				);
			}

			// smoosh it all together in an order that makes sense,
			// if using a layout we only wrap the html and nothing else
			//@ts-ignore
			node.children = [
				//@ts-ignore
				..._module,
				//@ts-ignore
				{ type: 'raw', value: _module[0] ? newline : '' },
				//@ts-ignore
				...instance,
				//@ts-ignore
				{ type: 'raw', value: instance[0] ? newline : '' },
				//@ts-ignore
				...css,
				//@ts-ignore
				{ type: 'raw', value: css[0] ? newline : '' },
				//@ts-ignore
				...special,
				//@ts-ignore
				{ type: 'raw', value: special[0] ? newline : '' },

				{
					//@ts-ignore
					type: 'raw',
					value: import_script
						? `<Layout_MDSVEX_DEFAULT ${layout_attributes}${
								fm ? ' {...metadata}' : ''
						  }>`
						: '',
				},
				//@ts-ignore
				{ type: 'raw', value: newline },
				//@ts-ignore
				...html,
				//@ts-ignore
				{ type: 'raw', value: newline },
				//@ts-ignore
				{ type: 'raw', value: import_script ? '</Layout_MDSVEX_DEFAULT>' : '' },
			];
		});
	};
}

// highlighting stuff

// { [lang]: { path, deps: pointer to key } }
const langs: { [x: string]: MdsvexLanguage } = {};
let Prism: any;

const make_path = (base_path: string, id: string) =>
	base_path.replace('{id}', id);

// we need to get all language metadata
// also track if they depend on other languages so we can autoload without breaking
// i don't actually know what the require key means but it sounds important

function get_lang_info(
	name: string,
	lang_meta: PrismLanguage,
	base_path: string
): [MdsvexLanguage, Set<string>] {
	const _lang_meta = {
		name,
		path: `prismjs/${make_path(base_path, name)}`,
		deps: new Set<string>(),
	};

	const aliases = new Set<string>();

	// TODO: DRY this up, it is literally identical

	if (lang_meta.require) {
		if (Array.isArray(lang_meta.require)) {
			lang_meta.require.forEach((id) => _lang_meta.deps.add(id));
		} else {
			_lang_meta.deps.add(lang_meta.require);
		}
	}

	if (lang_meta.peerDependencies) {
		if (Array.isArray(lang_meta.peerDependencies)) {
			lang_meta.peerDependencies.forEach((id) => _lang_meta.deps.add(id));
		} else {
			_lang_meta.deps.add(lang_meta.peerDependencies);
		}
	}

	if (lang_meta.alias) {
		if (Array.isArray(lang_meta.alias)) {
			lang_meta.alias.forEach((id) => aliases.add(id));
		} else {
			aliases.add(lang_meta.alias);
		}
	}

	return [{ ..._lang_meta, aliases }, aliases];
}

// workaround for ts weirdness - intersection types work better with interfaces vs object literals
interface Meta {
	meta: PrismMeta;
}

async function load_language_metadata() {
	const mod: Record<string, PrismLanguage> & Meta = await import(
		//@ts-ignore
		'prismjs/components'
	);

	// @ts-ignore
	const languages = mod.languages || mod.default.languages;
	// @ts-ignore
	const meta = languages.meta;

	for (const lang in languages) {
		const [lang_info, aliases] = get_lang_info(
			lang,
			// @ts-ignore
			languages[lang],
			meta.path
		);

		langs[lang] = lang_info;
		aliases.forEach((_n) => {
			langs[_n] = langs[lang];
		});
	}

	const svelte_meta = {
		name: 'svelte',
		aliases: new Set(['sv']),
		path: 'prism-svelte',
		deps: new Set(['javscript', 'css']),
	};

	langs.svelte = svelte_meta;
	langs.sv = svelte_meta;
}

async function load_language(lang: string) {
	if (!langs[lang]) return;

	await Promise.all(
		Array.from(langs[lang].deps).map(async (name) => await load_language(name))
	);
	try {
		await import(/* @vite-ignore */ langs[lang].path);
	} catch (e) {
		try {
			await import(/* @vite-ignore */ langs[lang].path + '.js');
		} catch (e) {
			console.log('failed to load language', lang);
		}
	}
}

export function highlight_blocks({
	highlighter: highlight_fn,
	alias,
	optimise = true,
}: {
	highlighter?: Highlighter;
	alias?: { [x: string]: string };
	optimise?: boolean;
} = {}): Transformer {
	let pending_langs: Promise<void>;
	let processed_langs = false;
	if (highlight_fn) {
		pending_langs = load_language_metadata();
	}

	return async function (tree, vFile) {
		if (highlight_fn) {
			if (!processed_langs) {
				await pending_langs;
				if (alias) {
					for (const lang in alias) {
						langs[lang] = langs[alias[lang]];
					}
				}
				processed_langs = true;
			}
			const nodes: (Code | Html)[] = [];
			visit<Code>(tree, 'code', (node) => {
				nodes.push(node);
			});

			await Promise.all(
				nodes.map(async (node) => {
					(node as Html).type = 'html';
					node.value = await highlight_fn(
						node.value,
						(node as Code).lang,
						(node as Code).meta,
						//@ts-ignore
						vFile.filename,
						optimise
					);
				})
			);
		}
	};
}
// escape curlies, backtick, \t, \r, \n to avoid breaking output of {@html `here`} in .svelte
export const escape_svelty = (str: string): string =>
	str
		.replace(
			/[{}`]/g,
			//@ts-ignore
			(c) => ({ '{': '&#123;', '}': '&#125;', '`': '&#96;' }[c])
		)
		.replace(/\\([trn])/g, '&#92;$1');

export const code_highlight: Highlighter = async (
	code,
	lang,
	_meta,
	_filename,
	optimise
) => {
	const normalised_lang = lang?.toLowerCase();
	let _lang = !!normalised_lang && langs[normalised_lang];
	//@ts-ignore
	if (!Prism) Prism = await import('prismjs');

	let status = 'loading';
	if (_lang && !Prism.languages[_lang.name]) {
		try {
			await load_language(_lang.name);
			status = 'loaded';
		} catch (e) {
			status = 'failed';
		}
	}

	if (
		!_lang &&
		normalised_lang &&
		Prism.languages[normalised_lang] &&
		status === 'loaded'
	) {
		langs[normalised_lang] = { name: lang } as MdsvexLanguage;
		_lang = langs[normalised_lang];
	}
	const highlighted = escape_svelty(
		_lang && Prism.languages[_lang.name]
			? Prism.highlight(code, Prism.languages[_lang.name], _lang.name)
			: escape(code)
	);
	return optimise
		? `<pre class="language-${normalised_lang}">{@html \`<code class="language-${normalised_lang}">${highlighted}</code>\`}</pre>`
		: `<pre class="language-${normalised_lang}"><code class="language-${normalised_lang}">${highlighted}</code></pre>`;
};
