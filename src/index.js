import unified from 'unified';
import markdown from 'remark-parse';
import remark2rehype from 'remark-rehype';
import hast_to_html from '@starptech/prettyhtml-hast-to-html';

import { mdsvex_parser } from './parsers/';
import { mdsvex_transformer } from './transformers/';

function stringify(options = {}) {
	this.Compiler = compiler;

	function compiler(tree) {
		return hast_to_html(tree, options);
	}
}

const tree = unified()
	.use(markdown)
	.use(mdsvex_parser)
	.use(mdsvex_transformer)
	.use(remark2rehype, {
		allowDangerousHTML: true,
		allowDangerousCharacters: true,
	})
	.use(stringify, {
		allowDangerousHTML: true,
		allowDangerousCharacters: true,
	})
	.process(
		`
<svelte:component this={foo}/>
<Component />

`
	);

tree.then(v => console.log('hello', v));
