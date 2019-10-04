import { parse_svelte_tag } from '../src/parsers';

// I have no idea what the unified/ remark eat function returns but i need to fake it.
const eat = value => node => ({
	value,
	node,
});

describe('parse_svelte_tag', () => {
	const svelte_tags = [
		['component', 'svelte:component'],
		['self', 'svelte:self'],
		['window', 'svelte:window'],
		['body', 'svelte:body'],
		['options', 'svelte:options'],
	];

	svelte_tags.forEach(([name, component]) => {
		test(`it should it should correctly match and parse any svelte tag: ${name}`, () => {
			expect(parse_svelte_tag(eat, `<${component} />`, false)).toEqual({
				value: `<${component} />`,
				node: {
					value: `<${component} />`,
					name,
					type: 'svelteTag',
				},
			});
		});

		test(`it should it should correctly match and parse any svelte tag ignoring whitespace: ${name}`, () => {
			expect(parse_svelte_tag(eat, `  		  		<${component} />`, false)).toEqual({
				value: `  		  		<${component} />`,
				node: {
					value: `  		  		<${component} />`,
					name,
					type: 'svelteTag',
				},
			});
		});

		test(`it should it should correctly match and parse any svelte tag regardless of attributes: ${name}`, () => {
			const output = parse_svelte_tag(
				eat,
				`<${component} foo=bar quu="quux" hello on:click on:keypress={boo} />`,
				false
			);

			expect(output).toEqual({
				value: `<${component} foo=bar quu="quux" hello on:click on:keypress={boo} />`,
				node: {
					value: `<${component} foo=bar quu="quux" hello on:click on:keypress={boo} />`,
					name,
					type: 'svelteTag',
				},
			});
		});
	});

	test('in silent mode, matches should return true', () => {
		const input = '<svelte:component />';

		const output = parse_svelte_tag(eat, input, true);

		expect(output).toBe(true);
	});
});
