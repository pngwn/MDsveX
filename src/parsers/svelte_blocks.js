const RE_SVELTE_BLOCK_START = /{[#:/@]/;
const RE_SVELTE_BLOCK = /{[#:/@](else if|[a-z]+).*}$/;
export function parse_svelte_block(eat, value, silent) {
	const match = RE_SVELTE_BLOCK_START.exec(value);

	if (match) {
		if (silent) return true;

		let cbPos = 0;
		let pos = 1;

		while (cbPos > -1) {
			if (value[pos].match(/{/)) cbPos++;
			if (value[pos].match(/}/)) cbPos--;
			pos++;
		}

		const match_2 = RE_SVELTE_BLOCK.exec(value.substring(0, pos));

		return eat(match_2[0])({
			type: 'svelteBlock',
			value: match_2[0],
			name: match_2[1],
		});
	}
}
