import { parse_svelte_tag } from '../../src/parsers';

// I have no idea what the unified/ remark eat function returns but i need to fake it.
const eat = value => node => ({
	value,
	node,
});

export default function(test) {
	// console.log(test);
	const svelte_tags = [
		['component', 'svelte:component'],
		['self', 'svelte:self'],
		['window', 'svelte:window'],
		['body', 'svelte:body'],
		['options', 'svelte:options'],
	];

	svelte_tags.forEach(([name, component]) => {
		test(`${name}: it should it should correctly match and parse any svelte tag`, t => {
			t.equal(
				parse_svelte_tag(eat, `<${component}>`, false),
				{
					value: `<${component}>`,
					node: {
						value: `<${component}>`,
						name,
						type: 'svelteTag',
					},
				},
				'opening tags'
			);

			t.equal(
				parse_svelte_tag(eat, `</ ${component}>`, false),
				{
					value: `</ ${component}>`,
					node: {
						value: `</ ${component}>`,
						name,
						type: 'svelteTag',
					},
				},
				'closing tags'
			);

			t.equal(
				parse_svelte_tag(eat, `<${component} />`, false),
				{
					value: `<${component} />`,
					node: {
						value: `<${component} />`,
						name,
						type: 'svelteTag',
					},
				},
				'void tags'
			);

			t.equal(
				parse_svelte_tag(eat, `   <${component} />`, false),
				{
					value: `   <${component} />`,
					node: {
						value: `<${component} />`,
						name,
						type: 'svelteTag',
					},
				},
				`ignoring whitespace (max 3)`
			);

			t.equal(
				parse_svelte_tag(eat, `    <${component} />`, false),
				undefined,
				`no match if whitespace > 3`
			);

			const output = parse_svelte_tag(
				eat,
				`<${component} foo=bar quu="quux" hello on:click foo={bar} />`,
				false
			);
			t.equal(
				output,
				{
					value: `<${component} foo=bar quu="quux" hello on:click foo={bar} />`,
					node: {
						value: `<${component} foo=bar quu="quux" hello on:click foo={bar} />`,
						name,
						type: 'svelteTag',
					},
				},
				'with attributes'
			);
		});
	});
}
