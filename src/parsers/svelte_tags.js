const RE_SVELTE_SELFCLOSING =
	'\\s*<svelte:([a-z]+) (?:(?:[a-z:]+(?:="*[a-z]+"*)*)\\s*)*\\/>';
const RE_SVELTE_START =
	'\\s*<svelte:([a-z]+)\\s*(?:(?:[a-z:]+(?:="*[a-z]+"*)*)\\s*)*>';
const RE_SVELTE_END = '\\s*<\\/\\s*svelte:([a-z]+)\\s*>';

const RE_SVELTE_TAG = new RegExp(
	RE_SVELTE_SELFCLOSING + '|' + RE_SVELTE_START + '|' + RE_SVELTE_END
);

export function parse_svelte_tag(eat, value, silent) {
	const match = RE_SVELTE_TAG.exec(value);

	if (match) {
		if (silent) return true;

		return eat(match[0])({
			type: 'svelteTag',
			value: match[0],
			name: match[1],
		});
	}
}
