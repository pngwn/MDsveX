import unified from 'unified';
import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import hast_to_html from '@starptech/prettyhtml-hast-to-html';
import frontmatter from 'remark-frontmatter';

import visit from 'unist-util-visit';
import retext from 'retext';
import smartypants from 'retext-smartypants';

import containers from 'remark-containers';

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

export function transform({
	remarkPlugins = [],
	rehypePlugins = [],
	smartypants,
} = {}) {
	const MDAST = unified()
		.use(markdown)
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
	});

	apply_plugins(rehypePlugins, HAST);

	const processor = HAST.use(stringify, {
		allowDangerousHTML: true,
		allowDangerousCharacters: true,
	});

	return processor;
}

const tree = transform({
	remarkPlugins: [containers],
	smartypants: true,
}).process(
	`
---
hello: friends
hello_other: friends
---

<svelte:component this={foo}/>
<Component />

He said, "A 'simple' english sentence..."

Where can I find an ATM machine?

He’s pretty set on beating your butt for sheriff.

::: div outer
hello
:::

`
);

tree.then(v => console.log('hello', v, v.messages));
