import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { parse_svelte_tag } from '../../src/parsers';

const tags = suite('svelte-tags');

// I have no idea what the unified/ remark eat function returns but i need to fake it.
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

tags('svelte blocks with children should be correctly parsed', () => {
	const s = `<svelte:head>
  <meta property="og:title" content={title} />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="{host}{path}" />
</svelte:head>

# hello`;
	//@ts-ignore
	assert.equal(parse_svelte_tag(eat, s, false), {
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
	tags(
		`${name}: it should it should correctly match and parse any svelte tag`,
		() => {
			assert.equal(
				//@ts-ignore
				parse_svelte_tag(eat, `<${component}></ ${component}>`, false),
				{
					value: `<${component}></ ${component}>`,
					node: {
						value: `<${component}></ ${component}>`,
						name,
						type: 'svelteTag',
					},
				},
				'opening tags'
			);

			assert.equal(
				//@ts-ignore
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

			assert.equal(
				//@ts-ignore
				parse_svelte_tag(eat, `   <${component} />`, false),
				{
					value: `   <${component} />`,
					node: {
						value: `<${component} />`,
						name,
						type: 'svelteTag',
					},
				},
				`ignoring whitespace`
			);

			const output = parse_svelte_tag(
				//@ts-ignore
				eat,
				`<${component} foo=bar quu="quux" hello on:click foo={bar} />`,
				false
			);
			assert.equal(
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
		}
	);
});

tags.run();
