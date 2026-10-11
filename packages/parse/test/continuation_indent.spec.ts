import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { print_ast } from './print';
import {
	every_path,
	fed_mismatch,
	lines,
	pick,
	problems,
	random,
} from './stream_shape';

function item(...children: string[]): string {
	return lines(
		'root',
		'  list ordered=false start=0 tight=true',
		'    list_item',
		...children.map((child) => `      ${child}`),
		'  line_break'
	);
}

function quoted(...children: string[]): string {
	return lines(
		'root',
		'  block_quote',
		...children.map((child) => `    ${child}`),
		'  line_break'
	);
}

describe('a continuation line of a list item', () => {
	test('gives its indent no text', () => {
		expect(every_path('- a\n  b\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"')
		);
		expect(every_path('- a\n b\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"')
		);
		expect(every_path('- a\n      b\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"')
		);
		expect(every_path('- a\n  b\n  c\n')).toBe(
			item('text "a"', 'soft_break', 'text "b"', 'soft_break', 'text "c"')
		);
	});

	test('gives it none before another node', () => {
		expect(every_path('- a\n  :b\n')).toBe(
			item('text "a"', 'soft_break', 'text ":b"')
		);
		expect(every_path('- a\n  *b*\n')).toBe(
			item('text "a"', 'soft_break', 'strong_emphasis', '  text "b"')
		);
		expect(every_path('- a\n  `b`\n')).toBe(
			item('text "a"', 'soft_break', 'code_span "b"')
		);
		expect(every_path('- a\n  {b}\n')).toBe(
			item('text "a"', 'soft_break', 'mustache "b"')
		);
	});

	test('gives it none inside an inline node', () => {
		expect(every_path('- a *x\n  y* b\n')).toBe(
			item(
				'text "a "',
				'strong_emphasis',
				'  text "x"',
				'  soft_break',
				'  text "y"',
				'text " b"'
			)
		);
		expect(every_path('- [x\n  y](u)\n')).toBe(
			item('link href="u"', '  text "x"', '  soft_break', '  text "y"')
		);
		expect(every_path('- a <b>x\n  y</b>\n')).toBe(
			item(
				'text "a "',
				'html tag="b"',
				'  text "x"',
				'  soft_break',
				'  text "y"'
			)
		);
	});

	test('in an ordered and a nested list', () => {
		expect(every_path('1. a\n   b\n')).toBe(
			lines(
				'root',
				'  list ordered=true start=1 tight=true',
				'    list_item',
				'      text "a"',
				'      soft_break',
				'      text "b"',
				'  line_break'
			)
		);
		expect(every_path('- a\n  - b\n    c\n')).toBe(
			item(
				'text "a"',
				'list ordered=false start=0 tight=true',
				'  list_item',
				'    text "b"',
				'    soft_break',
				'    text "c"'
			)
		);
	});

	test('in a paragraph of a loose item', () => {
		expect(every_path('- a\n\n  b\n  c\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=false',
				'    list_item',
				'      paragraph',
				'        text "a"',
				'      paragraph',
				'        text "b"',
				'        soft_break',
				'        text "c"',
				'  line_break'
			)
		);
	});

	test('in a block quote', () => {
		expect(every_path('> - a\n>   b\n')).toBe(
			quoted(
				'list ordered=false start=0 tight=true',
				'  list_item',
				'    text "a"',
				'    soft_break',
				'    text "b"'
			)
		);
		expect(every_path('> - a\n>   *b*\n')).toBe(
			quoted(
				'list ordered=false start=0 tight=true',
				'  list_item',
				'    text "a"',
				'    soft_break',
				'    strong_emphasis',
				'      text "b"'
			)
		);
	});

	test('keeps a tab, as a paragraph does', () => {
		expect(every_path('a\n\tb\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a"',
				'    soft_break',
				'    text "\tb"',
				'  line_break'
			)
		);
		expect(every_path('- a\n\tb\n')).toBe(
			item('text "a"', 'soft_break', 'text "\tb"')
		);
	});
});

describe('a continuation line of a quoted paragraph', () => {
	test('gives its indent no text', () => {
		expect(every_path('> a\n>   b\n')).toBe(
			quoted('paragraph', '  text "a"', '  soft_break', '  text "b"')
		);
		expect(every_path('> a\n>  *b*\n')).toBe(
			quoted(
				'paragraph',
				'  text "a"',
				'  soft_break',
				'  strong_emphasis',
				'    text "b"'
			)
		);
		expect(every_path('> a *x\n>   y*\n')).toBe(
			quoted(
				'paragraph',
				'  text "a "',
				'  strong_emphasis',
				'    text "x"',
				'    soft_break',
				'    text "y"'
			)
		);
	});
});

describe('random indented continuation lines', () => {
	// no backtick, the indent of a line inside a code span is code
	const PIECES = ['a', 'b c', ' ', '*', '_', '[', '](u)', '{x}', '<b>'];

	function inline(source: string, drop: number): string {
		return print_ast(parse_markdown_svelte(source).nodes, source)
			.split('\n')
			.slice(drop, -1)
			.map((row) => row.trim())
			.join('\n');
	}

	test('hold the inline nodes of a paragraph with the same lines', () => {
		const rand = random(986);
		const differ: string[] = [];
		for (let i = 0; i < 300; i++) {
			const rows: string[] = [];
			const count = 2 + Math.floor(rand() * 2);
			for (let l = 0; l < count; l++) {
				let row = pick(rand, ['a', 'b c', 'x ', '[']);
				const length = Math.floor(rand() * 4);
				for (let k = 0; k < length; k++) row += pick(rand, PIECES);
				rows.push(row);
			}
			const indent = ' '.repeat(2 + Math.floor(rand() * 3));
			const plain = rows.join('\n') + '\n';
			const list = '- ' + rows.join('\n' + indent) + '\n';
			const quote = '> ' + rows.join('\n>' + indent) + '\n';
			const quoted_list = '> - ' + rows.join('\n> ' + indent) + '\n';
			const want = inline(plain, 2);
			if (inline(list, 3) !== want) differ.push(JSON.stringify(list));
			if (inline(quote, 3) !== want) differ.push(JSON.stringify(quote));
			if (inline(quoted_list, 4) !== want)
				differ.push(JSON.stringify(quoted_list));
			for (const source of [list, quote, quoted_list]) {
				expect(problems(source, 0), JSON.stringify(source)).toEqual([]);
				expect(problems(source, 1), JSON.stringify(source)).toEqual([]);
				expect(fed_mismatch(source), JSON.stringify(source)).toBe('');
			}
		}
		expect(differ).toEqual([]);
	});
});
