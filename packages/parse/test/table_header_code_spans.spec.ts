import { describe, expect, test } from 'vitest';

import { checked_tree, lines } from './stream_shape';

function header_cell(...children: string[]): string {
	return lines(
		'root',
		'  table alignments=["none"] col_count=1',
		'    table_header',
		'      table_cell',
		...children.map((child) => `        ${child}`)
	);
}

describe('an escaped pipe in a code span in a header cell', () => {
	test('stays in the span', () => {
		expect(checked_tree('|`a\\|b`|\n|-|\n')).toBe(
			header_cell('code_span "a\\\\|b"')
		);
	});

	test('with two backticks and text after it', () => {
		expect(checked_tree('| ``a\\|b`` c |\n|-|\n')).toBe(
			header_cell('code_span "a\\\\|b"', 'text " c"')
		);
	});

	test('the span still loses its padding spaces', () => {
		expect(checked_tree('| ` a\\|b ` |\n|-|\n')).toBe(
			header_cell('code_span "a\\\\|b"')
		);
	});

	test('after a hint', () => {
		expect(checked_tree('|`#!js a\\|b`|\n|-|\n')).toBe(
			header_cell('code_span info="js" "a\\\\|b"')
		);
	});

	test('inside emphasis, with a cell after it', () => {
		expect(checked_tree('| *`a\\|b`* |`c`|\n|-|-|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        strong_emphasis',
				'          code_span "a\\\\|b"',
				'      table_cell',
				'        code_span "c"'
			)
		);
	});

	test('an escaped pipe after the span is text', () => {
		expect(checked_tree('|`a\\|b` \\| c|\n|-|\n')).toBe(
			header_cell('code_span "a\\\\|b"', 'text " "', 'text "| c"')
		);
	});

	test('a span with no closer is text', () => {
		expect(checked_tree('|`\\|\n-')).toBe(header_cell('text "`"', 'text "|"'));
		expect(checked_tree('|` \\|\n-')).toBe(
			header_cell('text "`"', 'text " "', 'text "|"')
		);
		expect(checked_tree('|`a\\|b|\n|-|\n')).toBe(
			header_cell('text "`"', 'text "a"', 'text "|b"')
		);
	});

	test('the rows after the header are kept', () => {
		expect(checked_tree('|`\\|\n-\n|c|\n\nd\n')).toBe(
			lines(
				header_cell('text "`"', 'text "|"'),
				'    table_row',
				'      table_cell',
				'        text "c"',
				'  line_break',
				'  paragraph',
				'    text "d"',
				'  line_break'
			)
		);
	});
});
