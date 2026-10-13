import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { every_path, lines } from './stream_shape';

describe('an expression over lines in a container', () => {
	test('leaves out the quote markers', () => {
		expect(every_path('> a {b\n> c} d\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      mustache "b\\nc"',
				'      text " d"',
				'  line_break'
			)
		);
	});

	test('leaves out the indent of a list item and keeps what is past it', () => {
		expect(every_path('- a {b\n  c} d\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a "',
				'      mustache "b\\nc"',
				'      text " d"',
				'  line_break'
			)
		);
		expect(every_path('- a {b\n      c} d\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a "',
				'      mustache "b\\n    c"',
				'      text " d"',
				'  line_break'
			)
		);
	});

	test('in a list item in a block quote', () => {
		expect(every_path('> - a {b\n>   c} d\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    list ordered=false start=0 tight=true',
				'      list_item',
				'        text "a "',
				'        mustache "b\\nc"',
				'        text " d"',
				'  line_break'
			)
		);
	});

	test('a svelte tag too', () => {
		expect(every_path('> a {@html b +\n> c} d\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      svelte_tag tag="html" "b +\\nc"',
				'      text " d"',
				'  line_break'
			)
		);
	});

	test('a line that leaves the quote ends it, the brace is text', () => {
		expect(every_path('> a {b\nc} d\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      text "{b"',
				'  line_break',
				'  paragraph',
				'    text "c} d"',
				'  line_break'
			)
		);
	});

	test('outside a container it is as written', () => {
		expect(every_path('a {b\n  c} d\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a "',
				'    mustache "b\\n  c"',
				'    text " d"',
				'  line_break'
			)
		);
	});
});

describe('an attribute value over lines in a container', () => {
	test('a quoted value leaves out the quote markers', () => {
		expect(every_path('> a <b class="x\n> y">z</b>\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      html tag="b" class="x\\ny"',
				'        text "z"',
				'  line_break'
			)
		);
	});

	test('an expression value leaves out the indent of a list item', () => {
		const source = '- a <Badge value={b +\n  c} {...d,\n  e} /> f\n';
		every_path(source);
		const { nodes } = parse_markdown_svelte(source);
		const badge = nodes.get_node(nodes.get_node(2).children[1]);
		expect(badge.metadata).toEqual({
			tag: 'Badge',
			self_closing: true,
			attributes: {
				value: { type: 'expression', value: 'b +\nc' },
				'...d,\ne': { type: 'expression', value: '...d,\ne' },
			},
		});
	});

	test('a value whose line leaves the quote is no tag', () => {
		expect(every_path('> a <b class="x\ny">z</b>\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      text "<b class=\\"x"',
				'  line_break',
				'  paragraph',
				'    text "y\\">z"',
				'    text "</b>"',
				'  line_break'
			)
		);
	});

	test('outside a container it is as written', () => {
		expect(every_path('a <b class="x\n  y">z</b>\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "a "',
				'    html tag="b" class="x\\n  y"',
				'      text "z"',
				'  line_break'
			)
		);
	});
});
