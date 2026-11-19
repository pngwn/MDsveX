import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

describe('a close tag split over two lines', () => {
	test.each([
		['a <b>x</b\n>. y\n', '. y'],
		['a <b>x</b\n\t>. y\n', '. y'],
		['a <b>x</b \n  > y\n', ' y'],
		['a <b>x</b\n>\n', null],
	])('%j closes its element', (source, after) => {
		expect(every_path(source)).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a "',
				'    html tag="b"',
				'      text "x"',
				...(after === null ? [] : [`    text ${JSON.stringify(after)}`]),
				'  line_break'
			)
		);
	});

	test('closes an element whose open tag is split too, as prettier writes both', () => {
		expect(
			every_path('<p>\n\tFrom <a href="u"\n\t\t>B</a\n\t>. CC\n</p>\n')
		).toBe(
			lines(
				'root',
				'  html tag="p"',
				'    line_break',
				'    text "From "',
				'    html tag="a" href="u"',
				'      text "B"',
				'    text ". CC"',
				'    line_break',
				'  line_break'
			)
		);
	});

	test('closes a block element', () => {
		expect(every_path('<div>\n\na\n\n</div\n>\n\nb\n')).toBe(
			lines(
				'root',
				'  html tag="div"',
				'    line_break',
				'    line_break',
				'    paragraph',
				'      text "a"',
				'    line_break',
				'    line_break',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break'
			)
		);
	});

	test.each([
		['> a <b>x</b\n> >. y\n', 'block_quote'],
		['- a <b>x</b\n  >. y\n', 'list_item'],
	])('%j reads its bracket after the line prefix of a container', (source) => {
		const tree = every_path(source);
		expect(tree).toContain('html tag="b"\n');
		expect(tree).toContain('text ". y"');
		expect(tree).not.toContain('</b');
	});

	test('does not reach out of a block quote', () => {
		expect(every_path('> a <b>x</b\n>. y\n')).not.toContain('html');
		expect(every_path('> a <b>x</b\n\n>. y\n')).not.toContain('html');
	});

	test('does not reach over a blank line', () => {
		expect(every_path('a <b>x</b\n\n> y\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a "',
				'    text "<b>"',
				'    text "x"',
				'    text "</b"',
				'  line_break',
				'  line_break',
				'  block_quote',
				'    paragraph',
				'      text "y"',
				'  line_break'
			)
		);
	});

	test('a close tag that closes nothing leaves the next line a block quote', () => {
		expect(every_path('a </b\n> y\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a "',
				'    text "</b"',
				'  line_break',
				'  block_quote',
				'    paragraph',
				'      text "y"',
				'  line_break'
			)
		);
	});

	test.each(['| a |\n|---|\n| <b>x</b\n> | d |\n', '# a <b>x</b\n> y\n'])(
		'%j stays on the line of a table row and a heading',
		(source) => {
			const tree = every_path(source);
			expect(tree).toContain('text "</b"');
			expect(tree).toContain('block_quote');
		}
	);
});
