import { expect, test } from 'vitest';

import type { ParsePlugin } from '../src/plugin_types';
import { expect_parity_logged } from './plugin_harness';

test('a code_span handler sees inline math, with the flag and the latex', () => {
	const { tree, log } = expect_parity_logged(
		'# a $`x^2`$\n\nb `c` $`d`$ $5 | e |\n\n| $`f \\| g`$ |\n|---|\n',
		(log) => {
			const plugin: ParsePlugin = {
				code_span: {
					parse(node) {
						const math = node.math;
						return () => {
							log.push(`${math ? 'math' : 'code'} ${node.text_content}`);
							if (math) node.attrs.class = 'm';
						};
					},
				},
				paragraph: {
					parse: (node) => () => void log.push(`math ${node.math}`),
				},
			};
			return { plugins: [plugin] };
		},
		{ attrs: ['class'] }
	);
	expect(log).toEqual([
		'math x^2',
		'code c',
		'math d',
		'math undefined',
		'math f | g',
	]);
	expect(tree).toEqual([
		'root',
		['heading', 'text:a ', 'code_span class="m"'],
		[
			'paragraph',
			'text:b ',
			'code_span',
			'text: ',
			'code_span class="m"',
			'text: $5 | e |',
		],
		['table', ['table_header', ['table_cell', 'code_span class="m"']]],
	]);
});
