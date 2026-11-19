import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { checked_tree, lines } from './stream_shape';

function body_cell(...children: string[]): string {
	return lines(
		'root',
		'  table alignments=["none"] col_count=1',
		'    table_header',
		'      table_cell',
		'        text "a"',
		'    table_row',
		'      table_cell',
		...children.map((child) => `        ${child}`)
	);
}

describe('a delimiter with no text before the end of its table cell', () => {
	// the parser reports a state loop it had to break out of here
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		expect(console.error).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	test.each(['*', '**', '_', '~', '^'])(
		'a lone %s before a pipe is text',
		(delimiter) => {
			expect(checked_tree(`|a|\n|-|\n|${delimiter}|\n`)).toBe(
				body_cell(`text "${delimiter}"`)
			);
		}
	);

	test.each(['*', '_', '~', '^'])(
		'a lone %s before the line end is text',
		(delimiter) => {
			expect(checked_tree(`|a|\n|-|\n|${delimiter}\n`)).toBe(
				body_cell(`text "${delimiter}"`)
			);
		}
	);

	// before whitespace a doubled delimiter opens nothing, each char is read alone
	test.each(['*', '~'])(
		'a doubled %s before the line end is text',
		(delimiter) => {
			expect(checked_tree(`|a|\n|-|\n|${delimiter}${delimiter}\n`)).toBe(
				body_cell(`text "${delimiter}"`, `text "${delimiter}"`)
			);
		}
	);

	test('a doubled ~ before a pipe is read as before the line end', () => {
		expect(checked_tree('|a|\n|-|\n|~~|\n')).toBe(
			body_cell('text "~"', 'text "~"')
		);
	});

	test('in a later cell of the row', () => {
		expect(checked_tree('| a | b |\n|-|-|\n| x |*|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'      table_cell',
				'        text "b"',
				'    table_row',
				'      table_cell',
				'        text "x"',
				'      table_cell',
				'        text "*"'
			)
		);
	});

	test('before an expression', () => {
		expect(checked_tree('| a |\n|-|\n| *{x}|\n')).toBe(
			body_cell('text "*"', 'mustache "x"')
		);
	});

	test('before a code span', () => {
		expect(checked_tree('| a |\n|-|\n| **`b`|\n')).toBe(
			body_cell('text "*"', 'text "*"', 'code_span "b"')
		);
	});

	test('before an html element', () => {
		expect(checked_tree('| a |\n|-|\n| ~~<b>x</b>|\n')).toBe(
			body_cell('text "~~"', 'html tag="b"', '  text "x"')
		);
	});

	test('before an inline directive', () => {
		expect(checked_tree('|a\n-\n^:x[]\n')).toBe(
			body_cell('text "^"', 'directive_inline name="x"')
		);
	});

	test('a row with no leading pipe', () => {
		expect(checked_tree('|a\n-\n*{x}\n')).toBe(
			body_cell('text "*"', 'mustache "x"')
		);
	});

	test('the rows after it are kept', () => {
		expect(checked_tree('|a|\n|-|\n|_|\n|b|\n\nc\n')).toBe(
			lines(
				body_cell('text "_"'),
				'    table_row',
				'      table_cell',
				'        text "b"',
				'  line_break',
				'  paragraph',
				'    text "c"',
				'  line_break'
			)
		);
	});
});
