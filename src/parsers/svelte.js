// these regex don't check if it is a valid svelte tag name
// i want to defer to svelte's compiler errors so i don't end up reimplementing the svelte parser

const RE_SVELTE_TAG = /^<(?:[\\/\s])*svelte:([a-z]*)(?:.|\n)*>$/;
const RE_SVELTE_TAG_START = /(^\s*)<([\\/\s])*svelte:/;

export function parse_svelte_tag(eat, value, silent) {
	const is_svelte_tag = RE_SVELTE_TAG_START.exec(value);

	if (is_svelte_tag) {
		if (silent) return true;

		const trimmed_value = value.trim();
		let cbPos = 0;
		let pos = 1;

		while (cbPos > -1) {
			if (trimmed_value[pos].match(/</)) cbPos++;
			if (trimmed_value[pos].match(/>/)) cbPos--;
			pos++;
		}

		const match = RE_SVELTE_TAG.exec(trimmed_value.substring(0, pos));

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

export function parse_svelte_block(eat, value, silent) {
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

		return eat(is_svelte_block[1] + match[0])({
			type: 'svelteBlock',
			value: `${is_svelte_block[1]}${match[0]}`,
			name: match[1],
		});
	}
}
