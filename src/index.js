import unified from 'unified';
import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import hast_to_html from '@starptech/prettyhtml-hast-to-html';
import frontmatter from 'remark-frontmatter';
import { parse } from 'svelte/compiler';

import visit from 'unist-util-visit';
import retext from 'retext';
import smartypants from 'retext-smartypants';
import external from 'remark-external-links';

import { mdsvex_parser } from './parsers/';
import { mdsvex_transformer } from './transformers/';

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

function smartypants_processor(options = {}) {
	const processor = retext().use(smartypants, options);

	function transformer(tree) {
		visit(tree, 'text', node => {
			node.value = String(processor.processSync(node.value));
		});
	}
	return transformer;
}

const entites = [
	[/</g, '&lt;'],
	[/>/g, '&gt;'],
	[/{/g, '&#123;'],
	[/}/g, '&#125;'],
];

function code() {
	function transformer(tree) {
		visit(tree, 'code', node => {
			for (let i = 0; i < entites.length; i += 1) {
				node.value = node.value.replace(entites[i][0], entites[i][1]);
			}
		});
	}
	return transformer;
}

const attrs = `(?:\\s{0,1}[a-zA-z]+=(?:"){0,1}[a-zA-Z0-9]+(?:"){0,1})*`;

// const RE_MODULE_SCRIPT = new RegExp(
// 	`^(<script` +
// 		attrs +
// 		`(?:\\s{0,1}(?:context)+=(?:"){0,1}(?:module)+(?:"){0,1}){1,}` +
// 		attrs +
// 		`>)[^]+?<\\/script>`
// );

const RE_SCRIPT = new RegExp(`^(<script` + attrs + `>)`);
//const RE_STYLES = new RegExp(`^(<style` + attrs + `>)[^]+?<\\/style>`);

function html(layout) {
	function transformer(tree) {
		visit(tree, 'element', node => {
			if (node.tagName === 'a' && node.properties.href) {
				node.properties.href = node.properties.href
					.replace(/%7B/g, '{')
					.replace(/%7D/g, '}');
			}

			if (node.tagName === 'img' && node.properties.src) {
				node.properties.src = node.properties.src
					.replace(/%7B/g, '{')
					.replace(/%7D/g, '}');
			}
		});

		if (!layout) return;

		// breaks positioning
		visit(tree, 'root', node => {
			// don't even ask

			const parts = {
				special: [],
				html: [],
				instance: [],
				module: [],
				css: [],
			};

			children: for (let i = 0; i < node.children.length; i += 1) {
				if (
					(node.children[i].type !== 'raw' &&
						(node.children[i].type === 'text' &&
							/\n+/.exec(node.children[i].value))) ||
					!node.children[i].value
				) {
					parts.html.push(node.children[i]);
					continue children;
				}

				const result = parse(node.children[i].value);

				const _parts = result.html.children.map(v => {
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

				if (result.module) {
					_parts.push(['module', result.module.start, result.module.end]);
				}

				if (result.css) {
					_parts.push(['css', result.css.start, result.css.end]);
				}

				if (result.instance) {
					_parts.push(['instance', result.instance.start, result.instance.end]);
				}

				const sorted = _parts.sort((a, b) => a[1] - b[1]);

				sorted.forEach(next => {
					if (!parts[next[0]]) parts.html.push(next);

					parts[next[0]].push({
						type: 'raw',
						value: node.children[i].value.substring(next[1], next[2]),
					});
				});
			}


			const { special, html, instance, module: _module, css } = parts;

			const _import = `import Layout_MDSVEX_DEFAULT from '${layout}';`;
			if (!instance[0]) {
				instance.push({
					type: 'raw',
					value: `\n<script>\n  ${_import}\n</script>\n`,
				});
			} else {
				instance[0].value = instance[0].value.replace(
					RE_SCRIPT,
					`$1\n  ${_import}`
				);
			}

			// please clean this up

			node.children = [
				..._module,
				{ type: 'raw', value: _module[0] ? '\n' : '' },
				...instance,
				{ type: 'raw', value: instance[0] ? '\n' : '' },
				...css,
				{ type: 'raw', value: css[0] ? '\n' : '' },
				...special,
				{ type: 'raw', value: special[0] ? '\n' : '' },
				{ type: 'raw', value: '<Layout_MDSVEX_DEFAULT>' },
				...html,
				{ type: 'raw', value: '</Layout_MDSVEX_DEFAULT>' },
			];

		});
	}

	return transformer;
}

export function transform({
	remarkPlugins = [],
	rehypePlugins = [],
	smartypants,
	layout,
} = {}) {
	const toMDAST = unified()
		.use(markdown)
		.use(external, { target: false, rel: ['nofollow'] })
		.use(code)
		.use(frontmatter)
		.use(mdsvex_parser)
		.use(mdsvex_transformer);

	if (smartypants) {
		toMDAST.use(
			smartypants_processor,
			typeof smartypants === 'boolean' ? {} : smartypants
		);
	}

	// plugins : [ [plugin, opts] ] | [ plugin ]

	apply_plugins(remarkPlugins, toMDAST);

	const toHAST = toMDAST
		.use(remark2rehype, {
			allowDangerousHTML: true,
			allowDangerousCharacters: true,
		})
		.use(html, layout);

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
};

export const mdsvex = ({
	remarkPlugins = [],
	rehypePlugins = [],
	smartypants = true,
	extension = '.svexy',
	layout = false,
} = defaults) => {
	return {
		markup: async ({ content, filename }) => {
			if (filename.split('.').pop() !== extension.split('.').pop()) return;
			const parser = transform({
				remarkPlugins,
				rehypePlugins,
				smartypants,
				layout,
			});

			const parsed = await parser.process(content);

			return { code: parsed.contents };
		},
	};
};
