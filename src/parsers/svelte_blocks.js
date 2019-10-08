const RE_SVELTE_BLOCK = /{[#:/@]((else if|[a-z]*))(?:(?:{.+}|\s.*?))*}/;

export function parse_svelte_block(eat, value, silent) {
	const match = RE_SVELTE_BLOCK.exec(value);

	if (match) {
		if (silent) return true;

		return eat(match[0])({
			type: 'svelteBlock',
			value: match[0],
			name: match[1],
		});
	}
}
