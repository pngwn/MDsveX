import { describe, expect, test } from 'vitest';

import { checked_tree, lines } from './stream_shape';

function row(kind: string, cells: string[][]): string[] {
	const out = [`    ${kind}`];
	for (const cell of cells) {
		out.push('      table_cell');
		for (const child of cell) out.push(`        ${child}`);
	}
	return out;
}

/** the row as the header of one table and as the body row of another, each cell with the same children */
function both(source: string, ...cells: string[][]): void {
	const cols = cells.length;
	const delimiters = `${'|-'.repeat(cols)}|\n`;
	const table = `  table alignments=[${Array(cols).fill('"none"').join(',')}] col_count=${cols}`;
	expect(checked_tree(`|${source}|\n${delimiters}`), 'header').toBe(
		lines('root', table, ...row('table_header', cells))
	);
	const titles = cells.map(() => ['text "x"']);
	for (const end of ['|\n', '\n', '']) {
		expect(
			checked_tree(`${'|x'.repeat(cols)}|\n${delimiters}|${source}${end}`),
			`body ${JSON.stringify(end)}`
		).toBe(
			lines(
				'root',
				table,
				...row('table_header', titles),
				...row('table_row', cells)
			)
		);
	}
}

describe('a code span with no closer in a table cell', () => {
	test('its backticks are text', () => {
		both('`a', ['text "`"', 'text "a"']);
		both('``a', ['text "``"', 'text "a"']);
	});

	test('the text after it is still inline', () => {
		both('`a *b* c', [
			'text "`"',
			'text "a "',
			'strong_emphasis',
			'  text "b"',
			'text " c"',
		]);
		both('``a `b` c', ['text "``"', 'text "a "', 'code_span "b"', 'text " c"']);
	});

	test('an escape after it is read', () => {
		both('`a\\*b', ['text "`"', 'text "a"', 'text "*b"']);
	});

	test('a delimiter around it still closes', () => {
		both('*`a*', ['strong_emphasis', '  text "`"', '  text "a"']);
	});

	test('a pipe ends the cell', () => {
		both('`a|b`', ['text "`"', 'text "a"'], ['text "b"', 'text "`"']);
		both('` a|b', ['text "`"', 'text " a"'], ['text "b"']);
	});
});

describe('an escaped pipe in a code span in a table cell', () => {
	test('stays in the span, with its backslash', () => {
		both('`a\\|b`', ['code_span "a\\\\|b"']);
		both('`\\|`', ['code_span "\\\\|"']);
		both('`\\|\\|`', ['code_span "\\\\|\\\\|"']);
	});

	test('with two backticks and text around it', () => {
		both('``a\\|b`` c', ['code_span "a\\\\|b"', 'text " c"']);
		both('x ``a\\|`b`` c', ['text "x "', 'code_span "a\\\\|`b"', 'text " c"']);
	});

	test('the span still loses its padding spaces', () => {
		both('` a\\|b `', ['code_span "a\\\\|b"']);
		both('` \\| `', ['code_span "\\\\|"']);
		both('`` \\|a ``', ['code_span "\\\\|a"']);
	});

	test('after a hint, and in one', () => {
		both('`#!js a\\|b`', ['code_span info="js" "a\\\\|b"']);
		both('`#!js  a\\|b `', ['code_span info="js" "a\\\\|b"']);
		both('`#!a\\|b c`', ['code_span info="a\\\\|b" "c"']);
	});

	test('inside emphasis, with a cell after it', () => {
		both(
			'*`a\\|b`*|`c\\|d`',
			['strong_emphasis', '  code_span "a\\\\|b"'],
			['code_span "c\\\\|d"']
		);
	});

	test('a pipe after the span still ends the cell', () => {
		both('`a\\|`|`b`', ['code_span "a\\\\|"'], ['code_span "b"']);
		both('`a\\|b` \\| c', ['code_span "a\\\\|b"', 'text " "', 'text "| c"']);
	});

	test('a backslash that is itself escaped escapes no pipe', () => {
		both(
			'`a\\\\|b`',
			['text "`"', 'text "a"', 'text "\\\\"'],
			['text "b"', 'text "`"']
		);
		both('`a\\\\\\|b`', ['code_span "a\\\\\\\\\\\\|b"']);
	});

	test('a span with no closer is text and the pipe stays in the cell', () => {
		both('`\\|', ['text "`"', 'text "|"']);
		both('` \\|', ['text "`"', 'text " "', 'text "|"']);
		both('`a\\|b', ['text "`"', 'text "a"', 'text "|b"']);
		both('``a\\|b', ['text "``"', 'text "a"', 'text "|b"']);
		both('` a\\|b', ['text "`"', 'text " a"', 'text "|b"']);
		both('`a\\|b|c', ['text "`"', 'text "a"', 'text "|b"'], ['text "c"']);
	});

	test('a hint with no closer', () => {
		both('`#!js a\\|b', [
			'text info="js" "`"',
			'text "#"',
			'text "!js a"',
			'text "|b"',
		]);
	});
});
