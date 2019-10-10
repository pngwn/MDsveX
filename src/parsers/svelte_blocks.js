// these regex don't check if it is a valid block name
// i want to defer to svelte's compiler errors so i don't end up reimplementing the svelte parser
// 'else if' is a special case due to the annoying whitespace

const RE_SVELTE_BLOCK_START = /{[#:/@]/;
const RE_SVELTE_BLOCK = /^{[#:/@](else if|[a-z]+).*}$/;

export function parse_svelte_block(eat, value, silent) {
	const is_svelte_block = RE_SVELTE_BLOCK_START.exec(value);

	if (is_svelte_block) {
		if (silent) return true;

		let cbPos = 0;
		let pos = 1;

		while (cbPos > -1) {
			if (value[pos].match(/{/)) cbPos++;
			if (value[pos].match(/}/)) cbPos--;
			pos++;
		}

		const match = RE_SVELTE_BLOCK.exec(value.substring(0, pos));

		return eat(match[0])({
			type: 'svelteBlock',
			value: match[0],
			name: match[1],
		});
	}
}
