import { describe, expect, test } from 'vitest';

import { every_path, lines, sound_tree } from './stream_shape';

describe('a paragraph that opens at a tag keeps its wrapper when it holds text', () => {
	test('with a brace as a link destination inside the element', () => {
		expect(every_path('<b>[]({)</b> a\n\nx\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="b"',
				'      link href="{"',
				'    text " a"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "x"',
				'  line_break'
			)
		);
	});

	test('with a backtick in an autolink that pairs with one after the element', () => {
		expect(every_path('<Badge><ht:`></Badge>`\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="Badge"',
				'      link href="ht:`"',
				'        text "ht:`"',
				'    text "`"',
				'  line_break'
			)
		);
	});

	test('with a backtick in a link destination that pairs with one after the element', () => {
		expect(every_path('<b>[](`)</b>`\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    html tag="b"',
				'      link href="`"',
				'    text "`"',
				'  line_break'
			)
		);
	});

	test.each([
		'<b>[]({)</b> a\n\nx\n',
		'> <b>[]({)</b> a\n>\n> x\n',
		':::note\n<b>[]({)</b> a\n\nx\n:::\n',
		'- a\n\n- <b>[]({)</b> a\n\n  x\n',
		'><b><ht:`></b>\n>`\n',
		'<Badge /> [a]({) b\n\nx\n',
		'<Badge /> `{` b\n\nx {y}\n',
		'<Badge /> <!-- { --> b\n\nx\n',
	])('%j is the same tree whole, fed and over the wire', (source) => {
		sound_tree(source);
	});

	test('with text after a script that ends where its list item does', () => {
		expect(every_path('- a\n\n- <C/>\n<script>\nl\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=false',
				'    list_item',
				'      paragraph',
				'        text "a"',
				'    list_item',
				'      paragraph',
				'        html tag="C" self_closing=true',
				'        soft_break',
				'        html tag="script"',
				'        soft_break',
				'        text "l"',
				'  line_break'
			)
		);
	});
});
