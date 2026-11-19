import { describe, expect, test } from 'vitest';

import type { ParsePlugin } from '../src/plugin_types';
import { expect_parity_logged } from './plugin_harness';
import { every_path, lines } from './stream_shape';

/** a fused handler that reads a link when it closes and appends to it */
const read_at_close = (log: string[]): ParsePlugin[] => [
	{
		link: {
			parse: (node) => () => {
				log.push(`${String(node.attrs.href)} | ${node.text_content}`);
				node.append('html', { tag: 'span' });
			},
		},
	},
];

describe('an autolink', () => {
	test('has its href and its text when a link handler sees it close', () => {
		const { log, tree } = expect_parity_logged(
			'<https://example.com> and [text](https://example.com)\n',
			read_at_close,
			{ attrs: ['href', 'tag'] }
		);
		expect(log).toEqual([
			'https://example.com | https://example.com',
			'https://example.com | text',
		]);
		expect(tree).toEqual([
			'root',
			[
				'paragraph',
				[
					'link href="https://example.com"',
					'text:https://example.com',
					'html tag="span"',
				],
				'text: and ',
				['link href="https://example.com"', 'text:text', 'html tag="span"'],
			],
		]);
	});

	test.each([
		'# <https://a.example/b?c=d>\n',
		'| <https://a.example> | x |\n|---|---|\n| <mailto:a@b.example> | y |\n',
		'> - *<https://a.example>*\n',
		'<b><https://a.example></b> c\n',
	])('%j is seen whole wherever it is', (source) => {
		const { log } = expect_parity_logged(source, read_at_close);
		expect(log.length).toBeGreaterThan(0);
		for (const row of log) {
			const [href, text] = row.split(' | ');
			expect(href).not.toBe('undefined');
			expect(text).toBe(href);
		}
	});

	test('is the same tree as before, whole, fed and over the wire', () => {
		expect(every_path('a <https://example.com> b\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a "',
				'    link href="https://example.com"',
				'      text "https://example.com"',
				'    text " b"',
				'  line_break'
			)
		);
	});
});
