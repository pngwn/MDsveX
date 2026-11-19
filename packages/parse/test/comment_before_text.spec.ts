import { describe, expect, test } from 'vitest';

import { both, every_path, lines, sound_tree } from './stream_shape';

describe('a comment that starts a line', () => {
	test('is in the paragraph of the text after it on its line', () => {
		expect(every_path('<!-- a --> b\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html_comment " a "',
				'    text " b"',
				'  line_break'
			)
		);
	});

	test('alone on its line is a block, and the line after it starts one of its own', () => {
		expect(every_path('<!-- a -->\nb\n')).toBe(
			lines(
				'root',
				'  html_comment " a "',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break'
			)
		);
		expect(every_path('<!-- a -->\n<g>\n\nb\n\n</g>\n')).toBe(
			lines(
				'root',
				'  html_comment " a "',
				'  line_break',
				'  html tag="g"',
				'    line_break',
				'    line_break',
				'    paragraph',
				'      text "b"',
				'    line_break',
				'    line_break',
				'  line_break'
			)
		);
	});

	test.each([
		['<!-- a -->\n', ['html_comment " a "', 'line_break']],
		['<!-- a -->  \n', ['html_comment " a "', 'line_break']],
		[
			'<!-- a -->\n<!-- b -->\n',
			['html_comment " a "', 'line_break', 'html_comment " b "', 'line_break'],
		],
		[
			'<!-- a --> <Chart />\n',
			[
				'html_comment " a "',
				'text " "',
				'html tag="Chart" self_closing=true',
				'line_break',
			],
		],
	])('%j has no paragraph with no text beside it', (source, rows) => {
		expect(every_path(source)).toBe(
			lines('root', ...rows.map((row) => `  ${row}`))
		);
	});

	test('is the same in a block quote and a list item', () => {
		expect(every_path('> <!-- a --> b\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      html_comment " a "',
				'      text " b"',
				'  line_break'
			)
		);
		expect(every_path('> <!-- a -->\n> b\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    html_comment " a "',
				'    paragraph',
				'      text "b"',
				'  line_break'
			)
		);
		expect(every_path('- x\n\n- <!-- a --> b\n')).toContain(
			lines(
				'    list_item',
				'      paragraph',
				'        html_comment " a "',
				'        text " b"'
			)
		);
	});

	test('reads as it does in a table cell', () => {
		both('<!-- a --> b', ['html_comment " a "', 'text " b"']);
	});

	test.each([
		'<div>\n<!-- a --> b\n</div>\n',
		'{#if x}\n<!-- a --> b\n{/if}\n',
		':::note\n<!-- a --> b\n:::\n',
		'<!--\na\n--> b\n',
		'> <!--\n> a\n> --> b\n',
		'<!-- a --> *b\n',
		'<p>\n<!-- a --> b\n</p>\n',
	])('%j holds no text right under a container', (source) => {
		sound_tree(source);
	});
});
