import { suite } from 'uvu';
import * as assert from 'uvu/assert';

import { parse_svelte_block } from '../../src/parsers';

const blocks = suite('svelte-blocks');

// I have no idea what the unified/ remark eat function returns but i need to fake it.
const eat = (value) => (node) => ({
	value,
	node,
});

const svelte_blocks = [
	[
		'each',
		'basic',
		'#each array as el',
		'#each [{a: {hello: []}, {a: {b: {c: {}}}}} as {a, b: { c, d }}',
	],
	['else', 'basic', ':else', false],
	['if', 'basic', '#if condition', '#if new Array([123] === {a, b, c})'],
	[
		'else if',
		'basic',
		'#else if condition',
		'#else if new Array([123] === {a, b, c})',
	],
	['await', 'basic', '#await promise', '#await new Promise((r, r) => r())'],
	['then', 'basic', ':then resolved_promise', '#then {a, b: { c, d }}'],
	['catch', 'basic', ':catch error', ':catch {a, b: { c, d }}'],
	['html', 'basic', '@html html'],
	['debug', 'basic', '@debug breakpoint'],
];

svelte_blocks.forEach(
	([name, desc, block, advanced]: [
		string,
		string,
		string,
		boolean | string
	]) => {
		blocks(
			`${name}: it should it should correctly match and parse any svelte block`,
			() => {
				assert.equal(
					//@ts-ignore
					parse_svelte_block(eat, `{${block}}`, false),
					{
						value: `{${block}}`,
						node: {
							value: `{${block}}`,
							name,
							type: 'svelteBlock',
						},
					},
					desc
				);

				assert.equal(
					//@ts-ignore
					parse_svelte_block(eat, `     {${block}}`, false),
					{
						value: `     {${block}}`,
						node: {
							value: `     {${block}}`,
							name,
							type: 'svelteBlock',
						},
					},
					'with whitespace'
				);

				assert.equal(
					parse_svelte_block(
						//@ts-ignore
						eat,
						`{${block}}hello jesus /n/n iam a paragraph with words \n\n #hello everyone`,
						false
					),
					{
						value: `{${block}}`,
						node: {
							value: `{${block}}`,
							name,
							type: 'svelteBlock',
						},
					},
					'with random stuff after it'
				);

				if (advanced) {
					assert.equal(
						//@ts-ignore
						parse_svelte_block(eat, `{${advanced}}`, false),
						{
							value: `{${advanced}}`,
							node: {
								value: `{${advanced}}`,
								name,
								type: 'svelteBlock',
							},
						},
						'a more advanced case'
					);
				}
			}
		);
	}
);

blocks.run();
