import type { ExportNamedDeclaration } from 'estree';
import type { Node } from 'unist';
import type { Processor } from 'unified';

import type {
	TransformOptions,
	MdsvexOptions,
	MdsvexCompileOptions,
	Layout,
	Preprocessor,
	PreprocessorReturn,
	UnifiedPlugins,
	LayoutMode,
} from './types';
export * from './types';

import { join } from 'path';
import fs from 'fs';
import { parse } from 'svelte/compiler';
import unified from 'unified';
import markdown from 'remark-parse';
//@ts-ignore
import external from 'remark-external-links';
import extract_frontmatter from 'remark-frontmatter';
import remark2rehype from 'remark-rehype';
//@ts-ignore
import hast_to_html from '@starptech/prettyhtml-hast-to-html';

import { mdsvex_parser } from './parsers';
import {
	default_frontmatter,
	parse_frontmatter,
	escape_code,
	transform_hast,
	smartypants_transformer,
	highlight_blocks,
	code_highlight,
} from './transformers';

function stringify(this: Processor, options = {}) {
	this.Compiler = compiler;

	function compiler(tree: Node): string {
		return hast_to_html(tree, options);
	}
}

const apply_plugins = (plugins: UnifiedPlugins, parser: Processor) => {
	(plugins as UnifiedPlugins).forEach((plugin) => {
		if (Array.isArray(plugin)) {
			if (plugin[1] && plugin[1]) parser.use(plugin[0], plugin[1]);
			else parser.use(plugin[0]);
		} else {
			parser.use(plugin);
		}
	});

	return parser;
};

export function transform(
	{
		remarkPlugins = [],
		rehypePlugins = [],
		frontmatter,
		smartypants,
		layout,
		layout_mode,
		highlight,
	}: TransformOptions = { layout_mode: 'single' }
): Processor {
	const fm_opts = frontmatter
		? frontmatter
		: { parse: default_frontmatter, type: 'yaml', marker: '-' };
	const toMDAST = unified()
		.use(markdown)
		.use(mdsvex_parser)
		.use(external, { target: false, rel: ['nofollow'] })
		.use(escape_code, { blocks: !!highlight })
		.use(extract_frontmatter, [{ type: fm_opts.type, marker: fm_opts.marker }])
		.use(parse_frontmatter, { parse: fm_opts.parse, type: fm_opts.type });

	if (smartypants) {
		toMDAST.use(
			smartypants_transformer,
			typeof smartypants === 'boolean' ? {} : smartypants
		);
	}

	apply_plugins(remarkPlugins, toMDAST).use(highlight_blocks, highlight || {});

	const toHAST = toMDAST
		.use(remark2rehype, {
			// @ts-ignore
			allowDangerousHtml: true,
			allowDangerousCharacters: true,
		})
		.use(transform_hast, { layout, layout_mode });

	apply_plugins(rehypePlugins, toHAST);

	const processor = toHAST.use(stringify, {
		allowDangerousHtml: true,
		allowDangerousCharacters: true,
	});

	return processor;
}

const defaults = {
	remarkPlugins: [],
	rehypePlugins: [],
	smartypants: true,
	extension: '.svx',
	highlight: { highlighter: code_highlight },
};

function to_posix(_path: string): string {
	const isExtendedLengthPath = /^\\\\\?\\/.test(_path);
	const hasNonAscii = /[^\u0000-\u0080]+/.test(_path);

	if (isExtendedLengthPath || hasNonAscii) {
		return _path;
	}

	return _path.replace(/\\/g, '/');
}

function resolve_layout(layout_path: string): string {
	try {
		return to_posix(require.resolve(layout_path));
	} catch (e) {
		try {
			const _path = join(process.cwd(), layout_path);
			return to_posix(require.resolve(_path));
		} catch (e) {
			throw new Error(
				`The layout path you provided couldn't be found at either ${layout_path} or ${join(
					process.cwd(),
					layout_path
				)}. Please double-check it and try again.`
			);
		}
	}
}

// handle custom components

function process_layouts(layouts: Layout) {
	const _layouts = layouts;

	for (const key in _layouts) {
		const layout = fs.readFileSync(_layouts[key].path, { encoding: 'utf8' });
		const ast = parse(layout);

		if (ast.module) {
			const component_exports = ast.module.content.body.filter(
				(node) => node.type === 'ExportNamedDeclaration'
			) as ExportNamedDeclaration[];

			if (component_exports.length) {
				_layouts[key].components = [];

				for (let i = 0; i < component_exports.length; i++) {
					if (
						component_exports[i].specifiers &&
						component_exports[i].specifiers.length
					) {
						for (let j = 0; j < component_exports[i].specifiers.length; j++) {
							_layouts[key].components.push(
								component_exports[i].specifiers[j].exported.name
							);
						}
						//@ts-ignore
					} else if (component_exports[i].declaration.declarations) {
						//@ts-ignore
						const declarations = component_exports[i].declaration.declarations;

						for (let j = 0; j < declarations.length; j++) {
							_layouts[key].components.push(declarations[j].id.name);
						}
					} else if (component_exports[i].declaration) {
						_layouts[key].components.push(
							//@ts-ignore
							component_exports[i].declaration.id.name
						);
					}
				}
			}
		}
	}
	return _layouts;
}

/**
 * The svelte preprocessor for use with svelte.preprocess
 *
 * **options** - An options object with the following properties, all are optional.
 *
 * - `extension` - The extension to use for mdsvex files
 * - `extensions` - The extensions to use for mdsvex files
 * - `layout` - Layouts to apply to mdsvex documents
 * - `frontmatter` - frontmatter options for documents
 * - `highlight` - syntax highlighting options
 * - `smartypants` - smart typography options
 * - `remarkPlugins` - remark plugins to apply to the markdown
 * - `rehypePlugins` - rehype plugins to apply to the rendered html
 *
 */

export const mdsvex = (options: MdsvexOptions = defaults): Preprocessor => {
	const {
		remarkPlugins = [],
		rehypePlugins = [],
		smartypants = true,
		extension = '.svx',
		extensions,
		layout = false,
		highlight = { highlighter: code_highlight },
		frontmatter,
	} = options;

	//@ts-ignore
	if (options.layouts) {
		throw new Error(
			`mdsvex: "layouts" is not a valid option. Did you mean "layout"?`
		);
	}

	const unknown_opts = [];
	const known_opts = [
		'filename',
		'remarkPlugins',
		'rehypePlugins',
		'smartypants',
		'extension',
		'extensions',
		'layout',
		'highlight',
		'frontmatter',
	];

	for (const opt in options) {
		if (!known_opts.includes(opt)) unknown_opts.push(opt);
	}

	if (unknown_opts.length) {
		console.warn(
			`mdsvex: Received unknown options: ${unknown_opts.join(
				', '
			)}. Valid options are: ${known_opts.join(', ')}.`
		);
	}

	let _layout: Layout = {};
	let layout_mode: LayoutMode = 'single';

	if (typeof layout === 'string') {
		_layout.__mdsvex_default = { path: resolve_layout(layout), components: [] };
	} else if (typeof layout === 'object') {
		layout_mode = 'named';
		for (const name in layout) {
			_layout[name] = { path: resolve_layout(layout[name]), components: [] };
		}
	}
	if (highlight && highlight.highlighter === undefined) {
		highlight.highlighter = code_highlight;
	}

	_layout = process_layouts(_layout);
	const parser = transform({
		remarkPlugins,
		rehypePlugins,
		smartypants,
		layout: _layout,
		layout_mode,
		highlight,
		frontmatter,
	});

	return {
		markup: async ({ content, filename }) => {
			const extensionsParts = (extensions || [extension]).map((ext) =>
				ext.split('.').pop()
			);
			if (!extensionsParts.includes(filename.split('.').pop())) return;

			const parsed = await parser.process({ contents: content, filename });
			return {
				code: parsed.contents as string,
				data: parsed.data as Record<string, unknown>,
				map: '',
			};
		},
	};
};

/**
 * The standalone compile function.
 *
 * - **source** - the source code to convert.
 * - **options** - An options object with the following properties, all are optional.
 *
 * - `filename` - The filename of the generated file
 * - `extension` - The extension to use for mdsvex files
 * - `extensions` - The extensions to use for mdsvex files
 * - `layout` - Layouts to apply to mdsvex documents
 * - `frontmatter` - frontmatter options for documents
 * - `highlight` - syntax highlighting options
 * - `smartypants` - smart typography options
 * - `remarkPlugins` - remark plugins to apply to the markdown
 * - `rehypePlugins` - rehype plugins to apply to the rendered html
 */

const _compile = (
	source: string,
	opts?: MdsvexCompileOptions
): PreprocessorReturn =>
	mdsvex(opts).markup({
		content: source,
		filename:
			(opts && opts.filename) ||
			`file${
				(opts && ((opts.extensions && opts.extensions[0]) || opts.extension)) ||
				'.svx'
			}`,
	});

export { _compile as compile };
