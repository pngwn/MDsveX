import type { Eat } from 'remark-parse';
import type { Node } from 'unist';

const void_els = [
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
];

// these regex don't check if it is a valid svelte tag name
// i want to defer to svelte's compiler errors so i don't end up reimplementing the svelte parser

const RE_SVELTE_TAG = /^<svelte:([a-z]*)[\s\S]*(?:(?:svelte:[a-z]*)|(?:\/))>$/;
const RE_SVELTE_TAG_START = /(^\s*)<([\\/\s])*svelte:/;

export function parse_svelte_tag(
	eat: Eat,
	value: string,
	silent: boolean
): true | Node | undefined {
	const is_svelte_tag = RE_SVELTE_TAG_START.exec(value);

	if (is_svelte_tag) {
		if (silent) return true;

		const trimmed_value = value.trim();
		let cbPos = 0;
		let pos = 1;
		let current_tag = '';
		let in_tag_name = false;

		while (cbPos > -1) {
			if (!trimmed_value[pos]) {
				break;
			}

			if (trimmed_value[pos].match(/</)) {
				cbPos++;
				current_tag = '';
				in_tag_name = true;
			}

			if (in_tag_name && trimmed_value[pos].match(/\s/)) {
				in_tag_name = false;
			}

			if (in_tag_name && !trimmed_value[pos].match(/</)) {
				current_tag += trimmed_value[pos];
			}

			const is_void = void_els.includes(current_tag);

			if (
				(is_void && trimmed_value[pos].match(/>/)) ||
				(trimmed_value[pos - 1] + trimmed_value[pos]).match(/\/>/)
			) {
				cbPos--;
			}

			if ((trimmed_value[pos - 1] + trimmed_value[pos]).match(/<\//)) {
				let inner_indent = 0;

				while (inner_indent > -1) {
					if (trimmed_value[pos].match(/>/)) {
						pos++;
						inner_indent -= 1;
						cbPos -= 2;
					} else {
						pos++;
					}
				}
			}

			pos++;
		}

		const match = RE_SVELTE_TAG.exec(trimmed_value.substring(0, pos).trim());

		if (!match) return;

		return eat(is_svelte_tag[1] + match[0])({
			type: 'svelteTag',
			value: match[0],
			name: match[1],
		});
	}
}

// these regex don't check if it is a valid block name
// i want to defer to svelte's compiler errors so i don't end up reimplementing the svelte parser
// 'else if' is a special case due to the annoying whitespace

const RE_SVELTE_BLOCK_START = /(^\s*){[#:/@]/;
const RE_SVELTE_BLOCK = /^{[#:/@](else if|[a-z]+).*}$/;

export function parse_svelte_block(
	eat: Eat,
	value: string,
	silent: boolean
): true | Node | undefined {
	const is_svelte_block = RE_SVELTE_BLOCK_START.exec(value);

	if (is_svelte_block) {
		if (silent) return true;

		const trimmed_value = value.trim();
		let cbPos = 0;
		let pos = 1;

		while (cbPos > -1) {
			if (trimmed_value[pos].match(/{/)) cbPos++;
			if (trimmed_value[pos].match(/}/)) cbPos--;
			pos++;
		}

		const match = RE_SVELTE_BLOCK.exec(trimmed_value.substring(0, pos));

		if (!match) return;

		return eat(is_svelte_block[1] + match[0])({
			type: 'svelteBlock',
			value: `${is_svelte_block[1]}${match[0]}`,
			name: match[1],
		});
	}
}
