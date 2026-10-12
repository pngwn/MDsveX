import { describe, expect, test } from 'vitest';

import { every_path, lines, sound_tree } from './stream_shape';

describe('an inline element that opens a paragraph and closes on a later line', () => {
	test('is in one paragraph with the text after it', () => {
		expect(every_path('<b>a\nb</b> c\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="b"',
				'      text "a"',
				'      soft_break',
				'      text "b"',
				'    text " c"',
				'  line_break'
			)
		);
	});

	test('has no paragraph around it with no text beside it', () => {
		expect(every_path('<b>a\nb</b>\n')).toBe(
			lines(
				'root',
				'  html tag="b"',
				'    text "a"',
				'    soft_break',
				'    text "b"',
				'  line_break'
			)
		);
	});

	test('closes at a close tag split over two lines', () => {
		expect(every_path('<a href="u">x</a\n>. y\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="a" href="u"',
				'      text "x"',
				'    text ". y"',
				'  line_break'
			)
		);
	});

	test('is literal text when its paragraph ends before it closes', () => {
		expect(every_path('<b>a\n\nb</b> c\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "<b>"',
				'    text "a"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'    text "</b> c"',
				'  line_break'
			)
		);
	});

	test.each([
		['> <b>a\n> b</b> c\n', 'block_quote'],
		['- x\n\n- <b>a\n  b</b> c\n', 'list_item'],
		['<div>\n\n<b>a\nb</b> c\n\n</div>\n', 'html tag="div"'],
		['{#if x}\n<b>a\nb</b> c\n{/if}\n', 'svelte_branch'],
		[':::note\n<b>a\nb</b> c\n:::\n', 'directive_container'],
	])('%j is the same in a container', (source, container) => {
		const tree = every_path(source);
		expect(tree).toContain(container);
		const at = tree.indexOf('paragraph\n');
		const pad = tree.slice(tree.lastIndexOf('\n', at) + 1, at);
		expect(tree).toContain(
			[
				'paragraph',
				'  html tag="b"',
				'    text "a"',
				'    soft_break',
				'    text "b"',
				'  text " c"',
			]
				.map((row) => pad + row)
				.join('\n')
		);
	});

	test('an element whose open tag ends its line still holds what its lines hold', () => {
		expect(every_path('<a href="/post">\n\n## b\n\nc\n\n</a>\n')).toBe(
			lines(
				'root',
				'  html tag="a" href="/post"',
				'    line_break',
				'    line_break',
				'    heading depth=2 "b"',
				'      text "b"',
				'    line_break',
				'    line_break',
				'    text "c"',
				'    line_break',
				'    line_break',
				'  line_break'
			)
		);
	});

	test('a component that stays open past its line still holds blocks', () => {
		expect(every_path('<Box>a\n\nb\n\n</Box>\n')).toBe(
			lines(
				'root',
				'  html tag="Box"',
				'    paragraph',
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
	});

	test.each([
		'<b>a\nb</b> *c\n',
		'<b>a `\nb</b>` c\n',
		'<span>a\n<i>b\nc</i></span> d\n',
		'<b>a\n# c\n',
		'<b>a\n> b</b> c\n',
	])('%j is the same tree whole, fed and over the wire', (source) => {
		sound_tree(source);
	});
});
