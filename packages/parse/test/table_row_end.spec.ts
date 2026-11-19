import { describe, expect, test } from 'vitest';

import { both, every_path, lines } from './stream_shape';

const HEAD = '| a | b |\n|---|---|\n';
const TABLE = [
	'root',
	'  table alignments=["none","none"] col_count=2',
	'    table_header',
	'      table_cell',
	'        text "a"',
	'      table_cell',
	'        text "b"',
];

function row(...cells: (string | string[])[]): string[] {
	const out = ['    table_row'];
	for (const cell of cells) {
		out.push('      table_cell');
		for (const kid of typeof cell === 'string' ? [cell] : cell) {
			out.push(`        ${kid}`);
		}
	}
	return out;
}

describe('a construct at the end of a table row', () => {
	test.each([
		['<!--', ['text "<"', 'text "!--"'], '--> | d |', ['text "-->"']],
		['{x', ['text "{x"'], '} | d |', ['text "}"']],
		['{@html x', ['text "{@html x"'], '} | d |', ['text "}"']],
		['<i x="', ['text "<i x=\\""'], '"> | d |', ['text "\\">"']],
		['<i', ['text "<i"'], 'x> | d |', ['text "x>"']],
		[
			'<script>',
			['text "<script>"'],
			'x</script> | d |',
			['text "x"', 'text "</script>"'],
		],
		['<style>', ['text "<style>"'], '</style> | d |', ['text "</style>"']],
	])(
		'%j ends with its row and the next line is a row',
		(open, last, next, first) => {
			expect(every_path(`${HEAD}| c | ${open}\n${next}\n`)).toBe(
				lines(...TABLE, ...row('text "c"', last), ...row(first, 'text "d"'))
			);
		}
	);

	test('an open tag before a line that starts a block quote stays text', () => {
		expect(every_path(`${HEAD}| c | <i\n> | d |\n`)).toBe(
			lines(
				...TABLE,
				...row('text "c"', 'text "<i"'),
				'  block_quote',
				'    paragraph',
				'      text "| d |"',
				'  line_break'
			)
		);
	});

	test('a raw text element with no close tag on its row is text', () => {
		expect(every_path(`${HEAD}| <script> | d |\n| e | f |\n`)).toBe(
			lines(
				...TABLE,
				...row('text "<script>"', 'text "d"'),
				...row('text "e"', 'text "f"')
			)
		);
	});

	test.each([
		['<i>x</i>', ['html tag="i"', '  text "x"']],
		['<!-- x -->', ['html_comment " x "']],
		['{x}', ['mustache "x"']],
		['<script>x</script>', ['html tag="script"']],
		['<img alt="x">', ['html tag="img" alt="x" self_closing=true']],
	])('%j that ends on its row is read as before', (cell, kids) => {
		expect(every_path(`${HEAD}| c | ${cell} |\n| e | f |\n`)).toBe(
			lines(
				...TABLE,
				'    table_row',
				'      table_cell',
				'        text "c"',
				'      table_cell',
				...kids.map((kid) => `        ${kid}`),
				...row('text "e"', 'text "f"')
			)
		);
	});

	test.each([
		['<i', ['text "<i"']],
		['<!--', ['text "<"', 'text "!--"']],
		['{x', ['text "{x"']],
		['<script>', ['text "<script>"']],
		['<i x="', ['text "<i x=\\""']],
	])('%j is the same text in a header cell and a body cell', (open, kids) => {
		both(`c|${open}`, ['text "c"'], kids);
	});
});
