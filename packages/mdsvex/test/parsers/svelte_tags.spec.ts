import { test, expect } from 'vitest';

import { parse_svelte_tag } from '../../src/parsers';

// I have no idea what the unified/ remark eat function returns but i need to fake it.
//@ts-ignore
const eat = (value) => (node) => ({
	value,
	node,
});

const svelte_tags = [
	['component', 'svelte:component'],
	['self', 'svelte:self'],
	['window', 'svelte:window'],
	['body', 'svelte:body'],
	['options', 'svelte:options'],
	['head', 'svelte:head'],
];

test('svelte blocks with children should be correctly parsed', () => {
	const s = `<svelte:head>
  <meta property="og:title" content={title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{host}{path}" />
</svelte:head>

# hello`;
	//@ts-ignore
	expect(parse_svelte_tag(eat, s, false)).toEqual({
		value: `<svelte:head>
  <meta property="og:title" content={title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{host}{path}" />
</svelte:head>`,
		node: {
			value: `<svelte:head>
  <meta property="og:title" content={title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{host}{path}" />
</svelte:head>`,
			name: 'head',
			type: 'svelteTag',
		},
	});
});

svelte_tags.forEach(([name, component]) => {
	test(`${name}: it should it should correctly match and parse any svelte tag`, () => {
		expect(
			//@ts-ignore
			parse_svelte_tag(eat, `<${component}></ ${component}>`, false)
		).toEqual({
			value: `<${component}></ ${component}>`,
			node: {
				value: `<${component}></ ${component}>`,
				name,
				type: 'svelteTag',
			},
		});

		expect(
			//@ts-ignore
			parse_svelte_tag(eat, `<${component} />`, false)
		).toEqual({
			value: `<${component} />`,
			node: {
				value: `<${component} />`,
				name,
				type: 'svelteTag',
			},
		});

		expect(
			//@ts-ignore
			parse_svelte_tag(eat, `   <${component} />`, false)
		).toEqual({
			value: `   <${component} />`,
			node: {
				value: `<${component} />`,
				name,
				type: 'svelteTag',
			},
		});

		const output = parse_svelte_tag(
			//@ts-ignore
			eat,
			`<${component} foo=bar quu="quux" hello on:click foo={bar} />`,
			false
		);
		expect(output).toEqual({
			value: `<${component} foo=bar quu="quux" hello on:click foo={bar} />`,
			node: {
				value: `<${component} foo=bar quu="quux" hello on:click foo={bar} />`,
				name,
				type: 'svelteTag',
			},
		});
	});
});
