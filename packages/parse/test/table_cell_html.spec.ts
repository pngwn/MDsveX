import { describe, expect, test, vi } from 'vitest';

import {
	broken,
	checked_tree,
	every_path,
	lines,
	pick,
	random,
	revoked_once,
	wire_revokes,
} from './stream_shape';

describe('an html element left open in a table cell', () => {
	test('a close tag in a later row is text', () => {
		expect(checked_tree('| <span>- [ ] \n---\n~</span>---\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text tag="span" "<span>"',
				'        text "- "',
				'        text "[ "',
				'        text "]"',
				'    table_row',
				'      table_cell',
				'        text "~</span>---"'
			)
		);
	});

	test('opened in a body row', () => {
		expect(checked_tree('| ]\n---\n<span>:::\n*</span>~~')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "]"',
				'    table_row',
				'      table_cell',
				'        text tag="span" "<span>:::"',
				'    table_row',
				'      table_cell',
				'        text "*"',
				'        text "</span>"',
				'        text "~~"'
			)
		);
	});

	test('a block level tag name', () => {
		expect(checked_tree(' |<div>```\n---\n[</div>b c')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text tag="div" "<div>```"',
				'    table_row',
				'      table_cell',
				'        text "[</div>b c"'
			)
		);
	});

	test('a close tag in the next cell of the same row is text', () => {
		expect(checked_tree('| a <span>b | c</span> |\n|-|-|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        text "a "',
				'        text tag="span" "<span>b"',
				'      table_cell',
				'        text "c"',
				'        text "</span>"'
			)
		);
	});

	test('a close tag after the table is text', () => {
		expect(checked_tree('| a <i>b |\n|-|\n\nc</i> d\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a "',
				'        text tag="i" "<i>b"',
				'  line_break',
				'  paragraph',
				'    text "c"',
				'    text "</i> d"',
				'  line_break'
			)
		);
	});

	test('an element around the table still closes from a row', () => {
		expect(checked_tree('<span> |---\n---\n<div>:::\n</span>&amp;')).toBe(
			lines(
				'root',
				'  html tag="span"',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          text "---"',
				'      table_row',
				'        table_cell',
				'          text tag="div" "<div>:::"',
				'      table_row',
				'        table_cell',
				'  paragraph',
				'    text "&amp;"'
			)
		);
	});

	test('an element closed in its own cell is kept', () => {
		expect(
			checked_tree('| <b>a</b> | <i>b |\n|-|-|\n| c</i> |<b>d</b>|\n')
		).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        html tag="b"',
				'          text "a"',
				'      table_cell',
				'        text tag="i" "<i>b"',
				'    table_row',
				'      table_cell',
				'        text "c"',
				'        text "</i>"',
				'      table_cell',
				'        html tag="b"',
				'          text "d"'
			)
		);
	});
});

describe('a close tag in a header cell', () => {
	test('for an element opened before the table is text', () => {
		expect(checked_tree('<div>\n|</div>\n-')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<div>"',
				'  line_break',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "</div>"'
			)
		);
	});

	test('for an element opened on the header line before the first pipe', () => {
		expect(checked_tree('<span>|<span>|</span>\n-|-')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<span>"',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        text tag="span" "<span>"',
				'      table_cell',
				'        text "</span>"'
			)
		);
	});

	test('the element still closes after the table', () => {
		expect(
			checked_tree('<div>\n| a </div> b |\n|---|\n| c |\n</div>\n\nd\n')
		).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          text "a "',
				'          text "</div> b"',
				'      table_row',
				'        table_cell',
				'          text "c"',
				'      table_row',
				'        table_cell',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "d"',
				'  line_break'
			)
		);
	});

	test('the element still closes from a body row', () => {
		expect(checked_tree('<span>|<span>|</span>\n-|-\n|</span> x\n')).toBe(
			lines(
				'root',
				'  html tag="span"',
				'    table alignments=["none","none"] col_count=2',
				'      table_header',
				'        table_cell',
				'          text tag="span" "<span>"',
				'        table_cell',
				'          text "</span>"',
				'      table_row',
				'        table_cell',
				'        table_cell',
				'  paragraph',
				'    text "x"',
				'  line_break'
			)
		);
	});

	test('an element opened in the cell closes in it', () => {
		expect(
			checked_tree('<div>\n\n| <b>x</b> </div> |\n|---|\n\n</div>\n')
		).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    line_break',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          html tag="b"',
				'            text "x"',
				'          text "</div>"',
				'    line_break',
				'  line_break'
			)
		);
	});
});

describe('a bracket that is no link', () => {
	test('is revoked once in a header cell', () => {
		revoked_once('| <span>- [ ] \n---\n');
	});

	test('is revoked once in a body cell', () => {
		revoked_once('| a |\n|-|\n| [b] c | \n');
	});

	test('is revoked once in a paragraph', () => {
		expect(every_path('[a *b* c\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "["',
				'    text "a "',
				'    strong_emphasis',
				'      text "b"',
				'    text " c"',
				'  line_break'
			)
		);
	});

	test('with a reference that has no definition is revoked once', () => {
		revoked_once('[a][b] c\n\n[d][] e\n');
	});

	test('of an inline directive that ends at its line is revoked once', () => {
		revoked_once('a :y[b\n\nc\n');
	});

	// the text after an unclosed tag has no paragraph, with a bracket or without
	test('adds no paragraph after an unclosed tag', () => {
		expect(every_path('<span>[a] b\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<span>"',
				'  text "[a"',
				'  text "] b"',
				'  line_break'
			)
		);
	});
});

const CELL_PIECES = [
	'<span>',
	'</span>',
	'<div>',
	'</div>',
	'<b>',
	'</b>',
	'<img src="i.png">',
	'a',
	'b c',
	' ',
	'[',
	']',
	'](u)',
	'`',
	':y[',
	'{x}',
	'- ',
	'&amp;',
	'---',
	'*',
	'**',
	'_',
	'~~',
	'~',
	'^',
	'\\',
	'\\|',
	'|',
	'|',
];

const DELIMITER_ROWS = ['---', '|-|', '|-|-|', '-|-'];

const LEADS = ['', '', '', '', '<span>', '<div>\n', '<b>\n'];

function cells(rand: () => number): string {
	let row = '';
	const length = Math.floor(rand() * 7);
	for (let k = 0; k < length; k++) row += pick(rand, CELL_PIECES);
	return row;
}

function table(rand: () => number): string {
	let source = pick(rand, LEADS);
	if (rand() < 0.7) source += '|';
	source += `${cells(rand)}\n${pick(rand, DELIMITER_ROWS)}\n`;
	const rows = Math.floor(rand() * 4);
	for (let r = 0; r < rows; r++) {
		source += `${rand() < 0.7 ? '|' : ''}${cells(rand)}\n`;
	}
	if (rand() < 0.5) source += `\n${cells(rand).replace(/\|/g, '')}\n`;
	return rand() < 0.3 ? source.slice(0, -1) : source;
}

describe('random tables with html in their cells', () => {
	test('every node is opened once and ended once', () => {
		// the parser reports a state loop it had to break out of here
		const loops = vi.spyOn(console, 'error').mockImplementation(() => {});
		const rand = random(1);
		for (let i = 0; i < 4000; i++) {
			const source = table(rand);
			for (const chunk of [0, 3]) {
				const label = `${JSON.stringify(source)} fed ${chunk}`;
				expect(broken(source, chunk), label).toEqual([]);
				const ids = wire_revokes(source, chunk);
				expect(new Set(ids).size, `${label} over the wire`).toBe(ids.length);
				expect(loops.mock.calls, label).toEqual([]);
			}
		}
		loops.mockRestore();
	});
});
