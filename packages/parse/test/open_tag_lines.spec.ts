import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

const ELEMENT = ['text "a "', 'html tag="b" id="u"', '  text "x"', 'text " y"'];

const LIST = [
	'  list ordered=false start=0 tight=true',
	'    list_item',
	'      text "x"',
];

function kids(indent: string, rows: string[]): string[] {
	return rows.map((row) => indent + row);
}

describe('an open tag split over lines', () => {
	test('passes over the marker of a block quote', () => {
		expect(every_path('> a <b\n> id="u">x</b> y\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				...kids('      ', ELEMENT),
				'  line_break'
			)
		);
	});

	test('passes over the indent of a list item in a block quote', () => {
		expect(every_path('> - a <b\n>   id="u">x</b> y\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    list ordered=false start=0 tight=true',
				'      list_item',
				...kids('        ', ELEMENT),
				'  line_break'
			)
		);
	});

	test('reads a name, an equals sign and a value on three quoted lines', () => {
		expect(every_path('> a <b id\n> =\n> "u">x</b> y\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				...kids('      ', ELEMENT),
				'  line_break'
			)
		);
	});

	test('a component over the lines of a block quote is a block', () => {
		expect(every_path('> <Comp\n>   a="1"\n> />\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    html tag="Comp" a="1" self_closing=true',
				'  line_break'
			)
		);
	});

	test('a bracket on its own quoted line closes the tag', () => {
		expect(every_path('> <div\n>   class="x"\n> >\n> text\n> </div>\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    html tag="div" class="x"',
				'      line_break',
				'      paragraph',
				'        text "text"',
				'      line_break',
				'  line_break'
			)
		);
	});

	test('a bracket on its own line closes the tag outside a quote', () => {
		expect(every_path('a <b\nid="u"\n>x</b> y\n')).toBe(
			lines('root', '  paragraph', ...kids('    ', ELEMENT), '  line_break')
		);
	});

	test('a line that leaves the block quote ends the tag', () => {
		expect(every_path('> a <b\nid="u">x</b> y\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      text "<b"',
				'  line_break',
				'  paragraph',
				'    text "id=\\"u\\">x"',
				'    text "</b> y"',
				'  line_break'
			)
		);
	});

	test('a line that leaves the list item ends the tag', () => {
		expect(every_path('- a <b\nid="u">x</b> y\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a "',
				'      text "<b"',
				'      soft_break',
				'      text "id=\\"u\\">x"',
				'      text "</b> y"',
				'  line_break'
			)
		);
	});

	test.each([
		['a blank line', 'a <b\n\nid="u">x</b> y\n'],
		['a line of spaces', 'a <b\n \t\nid="u">x</b> y\n'],
	])('%s ends the tag and its paragraph', (_, source) => {
		expect(every_path(source)).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a "',
				'    text "<b"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "id=\\"u\\">x"',
				'    text "</b> y"',
				'  line_break'
			)
		);
	});

	test('a blank quoted line ends the tag and its paragraph', () => {
		expect(every_path('> a <b\n>\n> id="u">x</b> y\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      text "<b"',
				'    line_break',
				'    paragraph',
				'      text "id=\\"u\\">x"',
				'      text "</b> y"',
				'  line_break'
			)
		);
	});

	test('a blank line between two attributes of a component ends the tag', () => {
		expect(every_path('<Comp\n  a="1"\n\n  b="2"\n/>\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<Comp"',
				'    soft_break',
				'    text "a=\\"1\\""',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b=\\"2\\""',
				'    soft_break',
				'    text "/>"',
				'  line_break'
			)
		);
	});

	test.each([
		['a block quote', '<d>|<B\nq>\n>\n', ['  block_quote']],
		['a list', '<d>|<B\nq>\n- x\n', LIST],
	])(
		'an element left open before %s keeps its whole tag as text',
		(_, source, after) => {
			expect(every_path(source)).toBe(
				lines(
					'root',
					'  paragraph',
					'    text "<d>"',
					'    text "|"',
					'    text "<B\\nq>"',
					'  line_break',
					...after,
					'  line_break'
				)
			);
		}
	);

	test('a blank line inside an attribute expression is part of it', () => {
		expect(every_path('<Comp\n  on={() => {\n\n  }}\n/>\n')).toBe(
			lines(
				'root',
				'  html tag="Comp" on=[object Object] self_closing=true',
				'  line_break'
			)
		);
	});
});
