import { describe, expect, test } from 'vitest';

import {
	every_path,
	fed_mismatch,
	lines,
	pick,
	problems,
	random,
} from './stream_shape';

function paragraph(...children: string[]): string {
	return lines(
		'root',
		'  paragraph',
		...children.map((child) => `    ${child}`),
		'  line_break'
	);
}

describe('a pipe outside a table is text', () => {
	test('in a paragraph', () => {
		expect(every_path('one | two | three\n')).toBe(
			paragraph('text "one | two | three"')
		);
		expect(every_path('a|b\n')).toBe(paragraph('text "a|b"'));
		expect(every_path('a || b |\n')).toBe(paragraph('text "a || b |"'));
		expect(every_path('a |> b |^ c\n')).toBe(
			paragraph('text "a |> b |"', 'text "^ c"')
		);
	});

	test('at the start of a line that is no table row', () => {
		expect(every_path('| a\n')).toBe(paragraph('text "| a"'));
		expect(every_path('|\n')).toBe(paragraph('text "|"'));
		expect(every_path('| a | b |\nc\n')).toBe(
			paragraph('text "| a | b |"', 'soft_break', 'text "c"')
		);
	});

	test('in a heading', () => {
		expect(every_path('# a | b\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "a | b"',
				'    text "a | b"',
				'  line_break'
			)
		);
	});

	test('in a list item', () => {
		expect(every_path('- a | b\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a | b"',
				'  line_break'
			)
		);
	});

	test('in a block quote', () => {
		expect(every_path('> a | b\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a | b"',
				'  line_break'
			)
		);
	});

	test('inside emphasis, a link and an element', () => {
		expect(every_path('*a | b*\n')).toBe(
			paragraph('strong_emphasis', '  text "a | b"')
		);
		expect(every_path('[a | b](u)\n')).toBe(
			paragraph('link href="u"', '  text "a | b"')
		);
		expect(every_path('x <b>a | b</b>\n')).toBe(
			paragraph('text "x "', 'html tag="b"', '  text "a | b"')
		);
	});

	test('after an inline node', () => {
		expect(every_path('`a` | b\n')).toBe(
			paragraph('code_span "a"', 'text " | b"')
		);
		expect(every_path('{a}|b\n')).toBe(paragraph('mustache "a"', 'text "|b"'));
	});

	test('after a table has ended', () => {
		expect(every_path('|a|\n|-|\n\nx | y\n')).toBe(
			lines(
				'root',
				'  table alignments=["none"] col_count=1',
				'    table_header',
				'      table_cell',
				'        text "a"',
				'  line_break',
				'  paragraph',
				'    text "x | y"',
				'  line_break'
			)
		);
	});
});

describe('a pipe next to an emphasis mark is the intraword marker', () => {
	test('it gets no text', () => {
		expect(every_path('fan|_tas_|tic\n')).toBe(
			paragraph('text "fan"', 'emphasis', '  text "tas"', 'text "tic"')
		);
		expect(every_path('caf|*e*|s\n')).toBe(
			paragraph('text "caf"', 'strong_emphasis', '  text "e"', 'text "s"')
		);
		expect(every_path('caf|~~e~~|s\n')).toBe(
			paragraph('text "caf"', 'strikethrough', '  text "e"', 'text "s"')
		);
	});

	test('with a pipe that is text on the same line', () => {
		expect(every_path('a | fan|_tas_|tic | b\n')).toBe(
			paragraph('text "a | fan"', 'emphasis', '  text "tas"', 'text "tic | b"')
		);
	});

	test('a pipe after an escaped mark is text', () => {
		expect(every_path('a\\*|b\n')).toBe(paragraph('text "a"', 'text "*|b"'));
	});
});

describe('random lines with pipes', () => {
	const PIECES = [
		'|',
		'|',
		' | ',
		'||',
		'a',
		'b c',
		' ',
		'*',
		'_',
		'~~',
		'~',
		'\\',
		'`',
		'[',
		'](u)',
		'{x}',
		'<b>',
		'</b>',
		'\n',
		'\n\n',
		'# ',
		'> ',
		'- ',
		'|-|\n',
	];

	test('build one tree whole and fed, and a sound one over the wire', () => {
		const rand = random(967);
		for (let i = 0; i < 1500; i++) {
			let source = '';
			const length = 1 + Math.floor(rand() * 10);
			for (let k = 0; k < length; k++) source += pick(rand, PIECES);
			expect(fed_mismatch(source), JSON.stringify(source)).toBe('');
			for (const chunk of [0, 1, 3]) {
				expect(
					problems(source, chunk),
					`${JSON.stringify(source)} fed ${chunk}`
				).toEqual([]);
			}
		}
	});

	test('keep every pipe that is not next to a mark', () => {
		const rand = random(968);
		const pieces = ['|', ' | ', '||', 'a', 'b c', ' ', '.', '(', ')'];
		for (let i = 0; i < 500; i++) {
			let source = 'x';
			const length = 1 + Math.floor(rand() * 8);
			for (let k = 0; k < length; k++) source += pick(rand, pieces);
			source = source.replace(/ +$/, '') + '.';
			expect(every_path(source + '\n'), JSON.stringify(source)).toBe(
				paragraph(`text "${source}"`)
			);
		}
	});
});
