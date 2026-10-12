import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

const LINKED = (title: string): string[] => [
	'  paragraph',
	`    link href="/u" title="${title}"`,
	'      text "x"',
	'  line_break',
];

describe('a definition title in parentheses', () => {
	test('an open parenthesis in it makes the line no definition', () => {
		expect(every_path('[r]: /u ("t"\n1. a [b](/c "d")\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "[r"',
				'    text "]: /u (\\"t\\""',
				'  line_break',
				'  list ordered=true start=1 tight=true',
				'    list_item',
				'      text "a "',
				'      link href="/c" title="d"',
				'        text "b"',
				'  line_break'
			)
		);
	});

	test('an open parenthesis on its second line makes the line no definition', () => {
		expect(every_path('[r]: /u (t\n(u)\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "[r"',
				'    text "]: /u (t"',
				'    soft_break',
				'    text "(u)"',
				'  line_break'
			)
		);
	});

	test('in a block quote too', () => {
		expect(every_path('> [r]: /u (a (b)\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "[r"',
				'      text "]: /u (a (b)"',
				'  line_break'
			)
		);
	});

	test('an escaped parenthesis is part of the title', () => {
		expect(every_path('[r]: /u (t \\(u\\) v)\n\n[x][r]\n')).toBe(
			lines('root', '  line_break', ...LINKED('t (u) v'))
		);
	});

	test('a title over two lines is read as before', () => {
		expect(every_path('[r]: /u (t\nu)\n\n[x][r]\n')).toBe(
			lines('root', '  line_break', ...LINKED('t\\nu'))
		);
	});

	test('a quoted title may hold a parenthesis', () => {
		expect(every_path('[r]: /u "t (u"\n\n[x][r]\n')).toBe(
			lines('root', '  line_break', ...LINKED('t (u'))
		);
	});
});
