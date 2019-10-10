import { parse_svelte_tag } from './svelte_tags';
import { parse_svelte_block } from './svelte_blocks';

import unified from 'unified';
import markdown from 'remark-parse';

function mdsvex_parser() {
	const Parser = this.Parser;
	const tokenizers = Parser.prototype.blockTokenizers;
	const methods = Parser.prototype.blockMethods;

	// Add an inline tokenizer (defined in the following example).
	tokenizers.svelteBlock = parse_svelte_block;
	tokenizers.svelteTag = parse_svelte_tag;
	// Run it just before `text`.
	methods.splice(methods.indexOf('html'), 0, 'svelteBlock');
	methods.splice(methods.indexOf('html'), 0, 'svelteTag');
}

const tree = unified()
	.use(markdown)
	.use(mdsvex_parser).parse(`
{#each array as {p}}

 # hello

 <p>Hello i am a <p>

 <svelte:head>
  # boohoo
 </svelte:head>

 `);

console.log(tree);
