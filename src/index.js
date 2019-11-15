if (global === undefined) {
	window.global = window;
}

import unified from 'unified';
import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import hast_to_html from '@starptech/prettyhtml-hast-to-html';
import frontmatter from 'remark-frontmatter';

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

const RE_MODULE_SCRIPT = new RegExp(
	`^(<script` +
		attrs +
		`(?:\\s{0,1}(?:context)+=(?:"){0,1}(?:module)+(?:"){0,1}){1,}` +
		attrs +
		`>)[^]+?<\\/script>`
);

const RE_SCRIPT = new RegExp(`^(<script` + attrs + `>)[^]+?<\\/script>`);
const RE_STYLES = new RegExp(`^(<style` + attrs + `>)[^]+?<\\/style>`);

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
			const nodes = [];
			const instances = {
				match: false,
				nodes: [],
			};
			const modules = {
				match: false,
				nodes: [],
			};
			const styles = {
				match: false,
				nodes: [],
			};

			// don't even ask

			children: for (let i = 0; i < node.children.length; i += 1) {
				if (node.children[i].type != 'raw' || !node.children[i].value) {
					nodes.push(node.children[i]);
					continue children;
				}

				let start = 0;
				let depth = 0;
				let started = false;

				for (let c = 0; c < node.children[i].value.length; c += 1) {
					if (
						node.children[i].value[c] === '<' &&
						node.children[i].value[c + 1] !== '/'
					) {
						depth += 1;
						started = true;
					}
					if (
						node.children[i].value[c] === '<' &&
						node.children[i].value[c + 1] === '/'
					)
						depth -= 1;

					if (started && depth === 0) {
						if (node.children[i].value[c] === '>') {
							const value = node.children[i].value
								.substring(start, c + 1)
								.trim();
							let match;
							if ((match = RE_MODULE_SCRIPT.exec(value))) {
								modules.match = match;
								modules.nodes.push({ type: 'raw', meta: 'module', value });
							} else if ((match = RE_SCRIPT.exec(value))) {
								instances.match = match;
								instances.nodes.push({ type: 'raw', meta: 'instance', value });
							} else if ((match = RE_STYLES.exec(value))) {
								styles.match = match;
								styles.nodes.push({ type: 'raw', meta: 'style', value });
							} else {
								nodes.push({ type: 'raw', value });
							}

							start = c + 1;
							started = false;
						}
					}
				}
			}

			const _import = `import Layout_MDSVEX_DEFAULT from '${layout}';`;
			if (!instances.match) {
				instances.nodes.push({
					type: 'raw',
					value: `\n<script>\n  ${_import}\n</script>\n`,
				});
			} else {
				instances.nodes[0].value = instances.nodes[0].value.replace(
					instances.match[1],
					`${instances.match[1]}\n  ${_import}`
				);
			}

			// please clean this up

			node.children = [
				...modules.nodes,
				{ type: 'raw', value: '\n' },
				...instances.nodes,
				{ type: 'raw', value: '\n' },
				...styles.nodes,
				{ type: 'raw', value: '\n' },
				{ type: 'raw', value: '<Layout_MDSVEX_DEFAULT>' },
				...nodes,
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
