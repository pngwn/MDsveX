import { describe, expect, test } from 'vitest';

import { every_path, lines, sound_tree } from './stream_shape';

describe('an element that holds its own name again closes on its line', () => {
	test('with a self closing tag of its name in it', () => {
		expect(every_path('<Badge><Badge /></Badge> x\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="Badge"',
				'      html tag="Badge" self_closing=true',
				'    text " x"',
				'  line_break'
			)
		);
	});

	test('with its name in a code span', () => {
		expect(every_path('<Badge>`<Badge>`</Badge> x\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="Badge"',
				'      code_span "<Badge>"',
				'    text " x"',
				'  line_break'
			)
		);
		expect(every_path('<b>`<b>`</b>\n')).toBe(
			lines('root', '  html tag="b"', '    code_span "<b>"', '  line_break')
		);
		expect(every_path('<Badge>``<Badge> ` ``</Badge>\n')).toBe(
			lines(
				'root',
				'  html tag="Badge"',
				'    code_span "<Badge> ` "',
				'  line_break'
			)
		);
	});

	test('an element of its name that opens in it still has to close first', () => {
		expect(every_path('<Box><Box>a</Box>\n\nb\n\n</Box>\n')).toBe(
			lines(
				'root',
				'  html tag="Box"',
				'    html tag="Box"',
				'      text "a"',
				'    line_break',
				'    line_break',
				'    paragraph',
				'      text "b"',
				'    line_break',
				'    line_break',
				'  line_break'
			)
		);
		expect(every_path('<Box><Box>a</Box></Box> x\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="Box"',
				'      html tag="Box"',
				'        text "a"',
				'    text " x"',
				'  line_break'
			)
		);
	});

	test.each([
		'<Badge>`<Badge></Badge> x\n',
		'<Badge>\\`a</Badge> `b`\n',
		'<Badge>\\\\`<Badge>`</Badge> `b`\n',
		'<Badge>```<Badge>```</Badge> x\n',
		'<Badge><Badge /> x\n',
		'<Badge><Badge/><Badge a="/>" /></Badge> x\n',
		'> <Badge><Badge /></Badge> x\n',
		'- a\n\n- <Badge>`<Badge>`</Badge> x\n',
	])('%j is the same tree whole, fed and over the wire', (source) => {
		sound_tree(source);
	});
});

describe('a code span on a later tag line', () => {
	test('is found after lines with no backtick', () => {
		expect(every_path('<b>a</b>\n\n<b>c</b>\n\n<b>`<b>`</b>\n')).toBe(
			lines(
				'root',
				'  html tag="b"',
				'    text "a"',
				'  line_break',
				'  line_break',
				'  html tag="b"',
				'    text "c"',
				'  line_break',
				'  line_break',
				'  html tag="b"',
				'    code_span "<b>"',
				'  line_break'
			)
		);
	});

	test('and after a line whose backtick is behind', () => {
		expect(every_path('<b>`x`</b>\n\n<b>a</b>\n\n<b>`<b>`</b>\n')).toBe(
			lines(
				'root',
				'  html tag="b"',
				'    code_span "x"',
				'  line_break',
				'  line_break',
				'  html tag="b"',
				'    text "a"',
				'  line_break',
				'  line_break',
				'  html tag="b"',
				'    code_span "<b>"',
				'  line_break'
			)
		);
	});
});
