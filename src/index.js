import { join } from 'path';

import unified from 'unified';
import markdown from 'remark-parse';
import external from 'remark-external-links';
import frontmatter from 'remark-frontmatter';
import remark2rehype from 'remark-rehype';
import hast_to_html from '@starptech/prettyhtml-hast-to-html';

import { mdsvex_parser } from './parsers/';
import {
	parse_yaml,
	escape_code,
	transform_hast,
	smartypants_transformer,
	highlight_blocks,
	code_highlight,
} from './transformers/';

function stringify(options = {}) {
	this.Compiler = compiler;

	function compiler(tree) {
		return hast_to_html(tree, options);
	}
}

const apply_plugins = (plugins, parser) => {
	plugins.forEach(plugin => {
		if (Array.isArray(plugin)) {
			if (plugin[1]) parser.use(plugin[0], plugin[1]);
			else parser.use(plugin[0]);
		} else {
			parser.use(plugin);
		}
	});

	return parser;
};

export function transform({
	remarkPlugins = [],
	rehypePlugins = [],
	smartypants,
	layout,
	highlight,
} = {}) {
	const toMDAST = unified()
		.use(markdown)
		.use(mdsvex_parser)
		.use(external, { target: false, rel: ['nofollow'] })
		.use(escape_code, { blocks: !!highlight })
		.use(frontmatter)
		.use(parse_yaml)
		.use(highlight_blocks, { highlighter: highlight });

	if (smartypants) {
		toMDAST.use(
			smartypants_transformer,
			typeof smartypants === 'boolean' ? {} : smartypants
		);
	}

	apply_plugins(remarkPlugins, toMDAST);

	const toHAST = toMDAST
		.use(remark2rehype, {
			allowDangerousHTML: true,
			allowDangerousCharacters: true,
		})
		.use(transform_hast, { layout });

	apply_plugins(rehypePlugins, toHAST);

	const processor = toHAST.use(stringify, {
		allowDangerousHTML: true,
		allowDangerousCharacters: true,
	});

	return processor;
}

const defaults = {
	remarkPlugins: [],
	rehypePlugins: [],
	smartypants: true,
	extension: '.svexy',
	layout: false,
	highlight: code_highlight,
};

function resolve_layout(layout_path) {
	try {
		require.resolve(layout_path);
		return layout_path;
	} catch (e) {
		try {
			const _path = join(process.cwd(), layout_path);
			require.resolve(_path);
			return _path;
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

export const mdsvex = ({
	remarkPlugins = [],
	rehypePlugins = [],
	smartypants = true,
	extension = '.svexy',
	layout = false,
	highlight = code_highlight,
} = defaults) => {
	const _layout = layout ? {} : layout;

	if (typeof layout === 'string') {
		_layout.__mdsvex_default = { path: resolve_layout(layout) };
	} else if (typeof layout === 'object') {
		for (const name in layout) {
			_layout[name] = { path: resolve_layout(layout[name]) };
		}
	}

	// layout
	// { layout: path, components: { [key: string] : [string] } }

	// _layout = process_layouts(_layout);

	const parser = transform({
		remarkPlugins,
		rehypePlugins,
		smartypants,
		layout: _layout,
		highlight,
	});

	return {
		markup: async ({ content, filename }) => {
			if (filename.split('.').pop() !== extension.split('.').pop()) return;

			// if (filename === 'blah/one/file.svexy') console.log('layout: ', layout);

			const parsed = await parser.process({ contents: content, filename });
			console.log(parsed.messages);
			return { code: parsed.contents };
		},
	};
};
