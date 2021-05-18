import type { Transformer } from 'unified';
import type { Text, Code, HTML } from 'mdast';
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

import * as path from 'path';

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
} from '../types';

// this needs a big old cleanup

const newline = '\n';
// extract the yaml from 'yaml' nodes and put them in the vfil for later use

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function default_frontmatter(
	value: string,
	messages: VFileMessage[]
): Record<string, unknown> | undefined {
	try {
		return yaml.safeLoad(value) as Record<string, unknown>;
	} catch (e) {
		messages.push(new Message('YAML failed to parse', e));
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

// in code nodes replace the character witrh the html entities
// maybe I'll need more of these

const entites: Array<[RegExp, string]> = [
	[/</g, '&lt;'],
	[/>/g, '&gt;'],
	[/{/g, '&#123;'],
	[/}/g, '&#125;'],
];

export function escape_code({ blocks }: { blocks: boolean }): Transformer {
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
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						children?: any[] | undefined; // eslint-disable-next-line @typescript-eslint/no-explicit-any
						start: any; // eslint-disable-next-line @typescript-eslint/no-explicit-any
						end: any; // eslint-disable-next-line @typescript-eslint/no-explicit-any
						[x: string]: any;
				  }
				| undefined; // eslint-disable-next-line @typescript-eslint/no-explicit-any
			instance?: any; // eslint-disable-next-line @typescript-eslint/no-explicit-any
			module?: any;
		};
		try {
			result = parse(nodes[i].value as string);
		} catch (e) {
			parts.html.push(nodes[i]);
			continue children;
		}

		// svelte special tags that have to be top level
		if (!result.html || !result.html.children) return parts;

		const _parts: Array<[
			'html' | 'css' | 'special' | 'instance' | 'module',
			number,
			number
		]> = result.html.children.map((v) => {
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

		results: for (const key in result) {
			if (key === 'html' || !result[key as 'html' | 'instance' | 'module'])
				continue results;
			_parts.push([
				key as 'html' | 'instance' | 'module',
				result[key as 'html' | 'instance' | 'module'].start,
				result[key as 'html' | 'instance' | 'module'].end,
			]);
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

export function transform_hast({
	layout,
	layout_mode,
}: {
	layout: Layout | undefined;
	layout_mode: LayoutMode;
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

			const fm =
				(vFile.data as { fm: Record<string, unknown> }).fm &&
				`export const metadata = ${JSON.stringify(
					(vFile.data as { fm: Record<string, unknown> }).fm
				)};${newline}` +
					`\tconst { ${Object.keys(
						(vFile.data as { fm: Record<string, unknown> }).fm
					).join(', ')} } = metadata;`;

			const _fm_layout =
				(vFile.data as { fm: Record<string, unknown> }).fm &&
				((vFile.data as { fm: Record<string, unknown> }).fm.layout as
					| string
					| undefined
					| false);

			const [import_script, components, error] = generate_layout({
				frontmatter_layout: _fm_layout,
				layout_options: layout,
				layout_mode,
				//@ts-ignore
				filename: vFile.filename,
			});

			if (error) vFile.messages.push(new Message(error.reason));

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
					value: `${newline}<script>${newline}\t${import_script}${newline}</script>${newline}`,
				});
			} else if (import_script) {
				instance[0].value = (instance[0].value as string).replace(
					RE_SCRIPT,
					`$1${newline}\t${import_script}`
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
					`$1${newline}\t${fm}`
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
						? `<Layout_MDSVEX_DEFAULT {...$$props}${
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function load_language_metadata() {
	if (!(process as RollupProcess).browser) {
		const {
			meta,
			...languages
		}: Record<string, PrismLanguage> & // eslint-disable-next-line
			Meta = require('prismjs/components.json').languages;

		for (const lang in languages) {
			const [lang_info, aliases] = get_lang_info(
				lang,
				languages[lang],
				meta.path
			);

			langs[lang] = lang_info;
			// console.log(langs);
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
}

function load_language(lang: string) {
	if (!(process as RollupProcess).browser) {
		if (!langs[lang]) return;

		langs[lang].deps.forEach((name) => load_language(name));

		require(langs[lang].path);
	}
}

export function highlight_blocks({
	highlighter: highlight_fn,
	alias,
}: {
	highlighter?: Highlighter;
	alias?: { [x: string]: string };
} = {}): Transformer {
	if (highlight_fn && !(process as RollupProcess).browser) {
		load_language_metadata();

		if (alias) {
			for (const lang in alias) {
				langs[lang] = langs[alias[lang]];
			}
		}
	}

	return async function (tree) {
		if (highlight_fn && !(process as RollupProcess).browser) {
			const nodes: (Code | HTML)[] = [];
			visit<Code>(tree, 'code', (node) => {
				nodes.push(node);
			});

			await Promise.all(
				nodes.map(async (node) => {
					(node as HTML).type = 'html';
					node.value = await highlight_fn(node.value, (node as Code).lang);
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

export const code_highlight: Highlighter = (code, lang) => {
	const normalised_lang = lang?.toLowerCase();
	if (!(process as RollupProcess).browser) {
		let _lang = !!normalised_lang && langs[normalised_lang];

		if (!Prism) Prism = require('prismjs');

		if (_lang && !Prism.languages[_lang.name]) {
			load_language(_lang.name);
		}

		if (!_lang && normalised_lang && Prism.languages[normalised_lang]) {
			langs[normalised_lang] = { name: lang } as MdsvexLanguage;
			_lang = langs[normalised_lang];
		}
		const highlighted = escape_svelty(
			_lang
				? Prism.highlight(code, Prism.languages[_lang.name], _lang.name)
				: escape(code)
		);
		return `<pre class="language-${normalised_lang}">{@html \`<code class="language-${normalised_lang}">${highlighted}</code>\`}</pre>`;
	} else {
		const highlighted = escape_svelty(escape(code));
		return `<pre class="language-${normalised_lang}">{@html \`<code class="language-${normalised_lang}">${highlighted}</code>\`}</pre>`;
	}
};
