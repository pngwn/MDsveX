import type { Processor } from 'unified';

import { parse_svelte_tag } from './svelte';
import { parse_svelte_block } from './svelte';
import { blockHtml } from './html_block';

export function mdsvex_parser(this: Processor): void {
	const Parser = this.Parser;
	const block_tokenizers = Parser.prototype.blockTokenizers;
	const methods = Parser.prototype.blockMethods;

	block_tokenizers.svelteBlock = parse_svelte_block;
	block_tokenizers.svelteTag = parse_svelte_tag;
	block_tokenizers.html = blockHtml;
	block_tokenizers.indentedCode = indentedCode;

	methods.splice(methods.indexOf('html'), 0, 'svelteBlock');
	methods.splice(methods.indexOf('html'), 0, 'svelteTag');
}

function indentedCode(): boolean {
	return true;
}

export { parse_svelte_block, parse_svelte_tag };
