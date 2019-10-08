import { parse_svelte_block } from '../../src/parsers';

// I have no idea what the unified/ remark eat function returns but i need to fake it.
const eat = value => node => ({
	value,
	node,
});

export default function(test) {
	// console.log(test);
	const svelte_blocks = [
		['each', 'basic', '#each array as el', '#each [1, 2, 3, 4] as el'],
		['else', 'basic', ':else x'],
		['if', 'basic', '#if condition'],
		['else if', 'basic', '#else if condition'],
		['await', 'basic', '#await promise'],
		['then', 'basic', ':then resolved_promise'],
		['catch', 'basic', ':catch error'],
		['html', 'basic', '@html html'],
		['debug', 'basic', '@debug breakpoint'],
	];

	svelte_blocks.forEach(([name, desc, block]) => {
		test(`${name}: it should it should correctly match and parse any svelte block`, t => {
			t.equal(
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

			t.equal(
				parse_svelte_block(
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
		});
	});
	// console.log('boo', name);
}
