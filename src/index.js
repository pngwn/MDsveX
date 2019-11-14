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

const apply_plugins = (plugins, parser) =>
	plugins.forEach(plugin => {
		if (Array.isArray(plugin)) {
			if (plugin[1]) parser.use(plugin[0], plugin[1]);
			else parser.use(plugin[0]);
		} else {
			parser.use(plugin);
		}
	});

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

		// visit(tree, 'link', node => {
		// 	console.log()
		// });
	}
	return transformer;
}

function html() {
	function transformer(tree) {
		if (
			tree.children[2] &&
			tree.children[2].children &&
			tree.children[2].children[1]
		) {
			console.log(tree.children[tree.children.length - 1].children[0]);
		}
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
	}

	return transformer;
}

export function transform({
	remarkPlugins = [],
	rehypePlugins = [],
	smartypants,
} = {}) {
	const MDAST = unified()
		.use(markdown)
		.use(external, { target: false, rel: ['nofollow'] })
		.use(code)
		.use(frontmatter)
		.use(mdsvex_parser)
		.use(mdsvex_transformer);

	if (smartypants) {
		MDAST.use(
			smartypants_processor,
			typeof smartypants === 'boolean' ? {} : smartypants
		);
	}

	// plugins : [ [plugin, opts] ] | [ plugin ]

	apply_plugins(remarkPlugins, MDAST);

	const HAST = MDAST.use(remark2rehype, {
		allowDangerousHTML: true,
		allowDangerousCharacters: true,
	}).use(html);

	apply_plugins(rehypePlugins, HAST);

	const processor = HAST.use(stringify, {
		allowDangerousHTML: true,
		allowDangerousCharacters: true,
	});

	return processor;
}

// const tree = transform({
// 	remarkPlugins: [containers],
// 	smartypants: true,
// }).process(
// 	`
// ---
// hello: friends
// hello_other: friends
// ---

// <svelte:component this={foo}/>
// <Component />

// He said, "A 'simple' english sentence..."

// Where can I find an ATM machine?

// He’s pretty set on beating your butt for sheriff.

// ::: div outer
// hello
// :::

// `
// );

// tree.then(v => console.log('hello', v, v.messages));
