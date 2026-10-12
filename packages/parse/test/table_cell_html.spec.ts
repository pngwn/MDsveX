import { describe, expect, test, vi } from 'vitest';

import {
	checked_tree,
	every_path,
	lines,
	pick,
	problems,
	random,
	revoked_once,
} from './stream_shape';

describe('an html element left open in a table cell', () => {
	test('a close tag in a later row is text', () => {
		expect(checked_tree('| <span>- [ ] \n---\n~</span>---\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "<span>"',
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
				'        text "<span>"',
				'        text ":::"',
				'    table_row',
				'      table_cell',
				'        text "*"',
				'        text "</span>"',
				'        text "~"',
				'        text "~"'
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
				'        text "<div>"',
				'        text "```"',
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
				'        text "<span>"',
				'        text "b"',
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
				'        text "<i>"',
				'        text "b"',
				'  line_break',
				'  paragraph',
				'    text "c"',
				'    text "</i> d"',
				'  line_break'
			)
		);
	});

	test('an element around the table still closes at the start of a row line', () => {
		expect(checked_tree('<span> |---\n---\n<i>:::\n</span>&amp;')).toBe(
			lines(
				'root',
				'  html tag="span"',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          text "---"',
				'      table_row',
				'        table_cell',
				'          text "<i>"',
				'          text ":::"',
				'  paragraph',
				'    text "&amp;"'
			)
		);
	});

	test('a block level tag at the start of a row line ends the table', () => {
		expect(checked_tree('<span> |---\n---\n<div>:::\n</span>&amp;')).toBe(
			lines(
				'root',
				'  html tag="span"',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          text "---"',
				'    html tag="div"',
				'      paragraph',
				'        text ":::"',
				'      line_break',
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
				'        text "<i>"',
				'        text "b"',
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

describe('the open tag of an element left open in a table cell', () => {
	test('is whole when it ends a body cell', () => {
		expect(every_path('| a |\n|-|\n| <span>|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text "<span>"'
			)
		);
	});

	test('is whole when it ends a header cell', () => {
		expect(every_path('|<span>|\n|-|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "<span>"'
			)
		);
	});

	test('is whole over the wire before text', () => {
		expect(every_path('| <span>a |\n|-|\n| x <a href="u">y | \n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "<span>"',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text "x "',
				'        text "<a href=\\"u\\">"',
				'        text "y"'
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
				'        text "<span>"',
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
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "d"',
				'  line_break'
			)
		);
	});

	test('a body cell does not close the element either', () => {
		expect(checked_tree('<span>|<span>|</span>\n-|-\n|</span> x\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<span>"',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        text "<span>"',
				'      table_cell',
				'        text "</span>"',
				'    table_row',
				'      table_cell',
				'        text "</span> x"',
				'      table_cell'
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
				'          text " "',
				'          text "</div>"',
				'    line_break',
				'  line_break'
			)
		);
	});
});

describe('padding before the end of a table cell', () => {
	test('after an element in a body cell is no text node', () => {
		expect(every_path('| a | b |\n|-|-|\n| <b>c</b> | d |\n')).toBe(
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
				'        html tag="b"',
				'          text "c"',
				'      table_cell',
				'        text "d"'
			)
		);
	});

	test('after an element in a header cell is no text node', () => {
		expect(every_path('| <b>c</b> | <i>d</i>\t\n|-|-|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none","none"] col_count=2',
				'    table_header',
				'      table_cell',
				'        html tag="b"',
				'          text "c"',
				'      table_cell',
				'        html tag="i"',
				'          text "d"'
			)
		);
	});

	test('after a span, a link, an expression or a directive is no text node', () => {
		expect(
			every_path(
				'| a | b |\n|-|-|\n| `c` | *d* \t|\n| [e](u)  | {f} |\n| :g[h](i=j)  | _k_ \n'
			)
		).toBe(
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
				'        code_span "c"',
				'      table_cell',
				'        strong_emphasis',
				'          text "d"',
				'    table_row',
				'      table_cell',
				'        link href="u"',
				'          text "e"',
				'      table_cell',
				'        mustache "f"',
				'    table_row',
				'      table_cell',
				'        directive_inline name="g" args.i="j"',
				'          text "h"',
				'      table_cell',
				'        emphasis',
				'          text "k"'
			)
		);
	});

	test('after a span that follows text is no text node', () => {
		expect(every_path('| a |\n|-|\n| b, `c` |\n| *d* `e`\t\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text "b, "',
				'        code_span "c"',
				'    table_row',
				'      table_cell',
				'        strong_emphasis',
				'          text "d"',
				'        text " "',
				'        code_span "e"'
			)
		);
	});

	test('after a span that escapes a pipe is no text node', () => {
		expect(every_path('| a |\n|-|\n| `b\\|c` |\n| d `e\\|f` \t\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        code_span "b|c"',
				'    table_row',
				'      table_cell',
				'        text "d "',
				'        code_span "e|f"'
			)
		);
	});

	test('at the end of the input is no text node', () => {
		expect(every_path('| a |\n|-|\n| <b>c</b>  ')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        html tag="b"',
				'          text "c"'
			)
		);
	});

	test('inside a delimiter left open is no text node', () => {
		expect(every_path('| a |\n|-|\n| *_b_ |\n| [ *c* \t|\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text "*"',
				'        emphasis',
				'          text "b"',
				'    table_row',
				'      table_cell',
				'        text "["',
				'        text " "',
				'        strong_emphasis',
				'          text "c"'
			)
		);
	});

	test('after an open bracket is no text node', () => {
		expect(every_path('| a |\n|-|\n| b [\t|\n| :y[ \n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        text "b "',
				'        text "["',
				'    table_row',
				'      table_cell',
				'        text ":y["'
			)
		);
	});

	test('before more text is kept', () => {
		expect(every_path('| a |\n|-|\n| <b>c</b> d |\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'    table_row',
				'      table_cell',
				'        html tag="b"',
				'          text "c"',
				'        text " d"'
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

	test('adds no paragraph after an unclosed tag', () => {
		expect(every_path('<span>[a] b\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<span>"',
				'    text "[a"',
				'    text "] b"',
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
	'`c`',
	'*d*',
	'[e](u)',
	'a',
	'b c',
	' ',
	' ',
	'\t',
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
	' |',
	' |',
	'\t|',
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
		const padding = rand() < 0.3 ? ' ' : '';
		source += `${rand() < 0.7 ? '|' : ''}${cells(rand)}${padding}\n`;
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
			for (const chunk of [0, 1, 3]) {
				const found = problems(source, chunk);
				// an expect per document is most of the run time
				if (found.length === 0 && loops.mock.calls.length === 0) continue;
				const label = `${JSON.stringify(source)} fed ${chunk}`;
				expect(found, label).toEqual([]);
				expect(loops.mock.calls, label).toEqual([]);
			}
		}
		loops.mockRestore();
	}, 30_000);
});

/** a table of one column in a div, the row as its header and then as a body row */
function in_div(row: string, ...cell: string[]): void {
	const table = [
		'  html tag="div"',
		'    line_break',
		'    line_break',
		'    table alignments=["none"] col_count=1',
	];
	const tail = [
		'    line_break',
		'    paragraph',
		'      text "d"',
		'    line_break',
		'    line_break',
		'  line_break',
	];
	const children = cell.map((child) => `          ${child}`);
	expect(every_path(`<div>\n\n|${row}|\n|-|\n\nd\n\n</div>\n`), 'header').toBe(
		lines(
			'root',
			...table,
			'      table_header',
			'        table_cell',
			...children,
			...tail
		)
	);
	// with no pipe after it a close tag could end the row line
	for (const end of row.trimEnd().endsWith('>') ? ['|'] : ['|', '']) {
		expect(
			every_path(`<div>\n\n|h|\n|-|\n|${row}${end}\n\nd\n\n</div>\n`),
			`body ${JSON.stringify(end)}`
		).toBe(
			lines(
				'root',
				...table,
				'      table_header',
				'        table_cell',
				'          text "h"',
				'      table_row',
				'        table_cell',
				...children,
				...tail
			)
		);
	}
}

describe('a close tag in a cell of a table inside an element', () => {
	test('is text, the table and the element carry on', () => {
		in_div(' a </div> b ', 'text "a "', 'text "</div> b"');
		in_div('</div>', 'text "</div>"');
		in_div(' </div> ', 'text "</div>"');
	});

	test('after an element closed in the cell', () => {
		in_div(
			' <b>x</b> </div> ',
			'html tag="b"',
			'  text "x"',
			'text " "',
			'text "</div>"'
		);
	});

	test('inside an element left open in the cell', () => {
		in_div(' <b>x </div> y ', 'text "<b>"', 'text "x "', 'text "</div> y"');
	});

	test('the cells after it stay in the row', () => {
		expect(
			every_path(
				'<div>\n\n| h | i |\n|-|-|\n| a </div> b | c |\n\nd\n\n</div>\n'
			)
		).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    line_break',
				'    table alignments=["none","none"] col_count=2',
				'      table_header',
				'        table_cell',
				'          text "h"',
				'        table_cell',
				'          text "i"',
				'      table_row',
				'        table_cell',
				'          text "a "',
				'          text "</div> b"',
				'        table_cell',
				'          text "c"',
				'    line_break',
				'    paragraph',
				'      text "d"',
				'    line_break',
				'    line_break',
				'  line_break'
			)
		);
	});

	test('a close tag that starts a row line ends the table and closes the element', () => {
		expect(every_path('<div>\n\n| h |\n|-|\n| a |\n</div>\n\nx\n')).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    line_break',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          text "h"',
				'      table_row',
				'        table_cell',
				'          text "a"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "x"',
				'  line_break'
			)
		);
	});

	test('a close tag that ends the row line ends the table and closes the element', () => {
		for (const end of ['\n', ' \n', '']) {
			expect(
				every_path(`<div>\n\n| h | i |\n|-|-|\n| a </div>${end}`),
				JSON.stringify(end)
			).toBe(
				lines(
					'root',
					'  html tag="div"',
					'    line_break',
					'    line_break',
					'    table alignments=["none","none"] col_count=2',
					'      table_header',
					'        table_cell',
					'          text "h"',
					'        table_cell',
					'          text "i"',
					'      table_row',
					'        table_cell',
					'          text "a "',
					'        table_cell',
					...(end === '' ? [] : ['  line_break'])
				)
			);
		}
	});

	test('a close tag of no open element still starts a row', () => {
		expect(every_path('<div>\n\n| h |\n|-|\n</b> a\n\n</div>\n')).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    line_break',
				'    table alignments=["none"] col_count=1',
				'      table_header',
				'        table_cell',
				'          text "h"',
				'      table_row',
				'        table_cell',
				'          text "</b> a"',
				'    line_break',
				'  line_break'
			)
		);
	});
});

describe('random tables inside an element', () => {
	const pieces = [
		'</div>',
		'</div>',
		'</b>',
		'<b>',
		'<span>',
		'</span>',
		'a',
		'b c',
		' ',
		' | ',
		'*',
		'`',
		'{x}',
	];

	test('no cell ends the element', () => {
		const rand = random(975);
		for (let i = 0; i < 1500; i++) {
			const row = () => {
				let out = '| ';
				const length = 1 + Math.floor(rand() * 5);
				for (let k = 0; k < length; k++) out += pick(rand, pieces);
				// a close tag that ends the row line would close the element
				return `${out} |`;
			};
			let source = '<div>\n\n| h | i |\n|-|-|\n';
			const rows = Math.floor(rand() * 3);
			for (let r = 0; r < rows; r++) source += `${row()}\n`;
			source += '\nd\n\n</div>\n';
			const label = JSON.stringify(source);
			const tree = checked_tree(source);
			const top = tree.split('\n').filter((line) => /^ {2}\S/.test(line));
			expect(top, label).toEqual(['  html tag="div"', '  line_break']);
			expect(tree, label).toContain('\n    paragraph\n      text "d"\n');
			expect(tree.split('\n      table_row').length - 1, label).toBe(rows);
			for (const chunk of [0, 1, 3]) {
				expect(problems(source, chunk), `${label} fed ${chunk}`).toEqual([]);
			}
		}
	}, 30_000);
});
