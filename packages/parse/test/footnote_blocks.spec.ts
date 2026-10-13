import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

const P = (indent: string, text: string): string[] => [
	`${indent}paragraph`,
	`${indent}  text "${text}"`,
];

describe('a footnote definition holds blocks', () => {
	test('a block after a blank line belongs to it when it is indented by four', () => {
		expect(
			every_path('[^1]: one\n\n    two\n\n    - three\n      four\n\nafter\n')
		).toBe(
			lines(
				'root',
				'  footnote_definition label="1"',
				...P('    ', 'one'),
				...P('    ', 'two'),
				'    list ordered=false start=0 tight=true',
				'      list_item',
				'        text "three"',
				'        soft_break',
				'        text "four"',
				'  line_break',
				'  line_break',
				...P('  ', 'after'),
				'  line_break'
			)
		);
	});

	test.each([
		['three spaces', '[^1]: one\n\n   two\n'],
		['no indent', '[^1]: one\n\ntwo\n'],
	])('a line with %s after a blank line ends it', (_, source) => {
		expect(every_path(source)).toBe(
			lines(
				'root',
				'  footnote_definition label="1"',
				...P('    ', 'one'),
				'  line_break',
				'  line_break',
				...P('  ', 'two'),
				'  line_break'
			)
		);
	});

	test('tabs count as the columns a list item counts them as', () => {
		expect(every_path('[^1]: one\n\n\t\ttwo\n')).toBe(
			lines(
				'root',
				'  footnote_definition label="1"',
				...P('    ', 'one'),
				...P('    ', 'two'),
				'  line_break'
			)
		);
	});

	test('its paragraph still goes on over a line that is not indented', () => {
		expect(every_path('[^1]: one\ntwo\n\n    three\nfour\n')).toBe(
			lines(
				'root',
				'  footnote_definition label="1"',
				'    paragraph',
				'      text "one"',
				'      soft_break',
				'      text "two"',
				'    paragraph',
				'      text "three"',
				'      soft_break',
				'      text "four"',
				'  line_break'
			)
		);
	});

	test.each([
		[
			'a list',
			'[^1]: - a\n    - b\n',
			[
				'    list ordered=false start=0 tight=true',
				'      list_item',
				'        text "a"',
				'      list_item',
				'        text "b"',
			],
		],
		[
			'a heading',
			'[^1]: # a\n\n    b\n',
			['    heading depth=1 "a"', '      text "a"', ...P('    ', 'b')],
		],
		[
			'a block quote',
			'[^1]: > a\n    > b\n',
			[
				'    block_quote',
				'      paragraph',
				'        text "a"',
				'        soft_break',
				'        text "b"',
			],
		],
		[
			'a fence',
			'[^1]: ```js\n    let a;\n      let b;\n    ```\n',
			['    code_fence info="js" "let a;\\n  let b;"'],
		],
	])('the line of its label may start %s', (_, source, kids) => {
		expect(every_path(source)).toBe(
			lines('root', '  footnote_definition label="1"', ...kids, '  line_break')
		);
	});

	test('a block that is indented under its paragraph with no blank line belongs to it', () => {
		expect(every_path('[^1]: one\n    - two\n# three\n')).toBe(
			lines(
				'root',
				'  footnote_definition label="1"',
				...P('    ', 'one'),
				'    list ordered=false start=0 tight=true',
				'      list_item',
				'        text "two"',
				'  line_break',
				'  heading depth=1 "three"',
				'    text "three"',
				'  line_break'
			)
		);
	});

	test('in a block quote the indent counts from the marker', () => {
		expect(every_path('> [^1]: one\n>\n>     two\n>\n> after\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    footnote_definition label="1"',
				...P('      ', 'one'),
				...P('      ', 'two'),
				'    line_break',
				...P('    ', 'after'),
				'  line_break'
			)
		);
	});

	test('in a list item the indent counts from the content of the item', () => {
		expect(every_path('- [^1]: one\n\n      two\n\n  after\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=false',
				'    list_item',
				'      footnote_definition label="1"',
				...P('        ', 'one'),
				...P('        ', 'two'),
				...P('      ', 'after'),
				'  line_break'
			)
		);
	});

	test('a definition in a definition is one of its blocks', () => {
		expect(every_path('[^1]: one\n\n    [^2]: two\n\n        three\n')).toBe(
			lines(
				'root',
				'  footnote_definition label="1"',
				...P('    ', 'one'),
				'    footnote_definition label="2"',
				...P('      ', 'two'),
				...P('      ', 'three'),
				'  line_break'
			)
		);
	});

	test('an element and a table inside it', () => {
		const tree = every_path(
			'[^1]: one\n\n    <div>\n\n    two\n\n    </div>\n\n    | a |\n    |---|\n    | b |\n\nafter\n'
		);
		expect(tree).toContain('    html tag="div"');
		expect(tree).toContain('    table alignments=["none"] col_count=1');
		expect(tree).toContain('  paragraph\n    text "after"');
	});
});
