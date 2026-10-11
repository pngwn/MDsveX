import { describe, expect, it } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin } from '../src/plugin_types';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import {
	every_tree,
	joined_tree,
	lines,
	pick,
	random,
	sound_tree,
	misplaced_text,
} from './stream_shape';

describe('a tag left open at the start of a line', () => {
	it('is text in the paragraph of its line', () => {
		expect(sound_tree('<span>a b\n')).toBe(
			lines('paragraph', '  "<span>a b"', 'line_break')
		);
		expect(sound_tree('<span> a b')).toBe(lines('paragraph', '  "<span>a b"'));
	});

	it('keeps the text after an unclosed delimiter once', () => {
		expect(sound_tree('<span>*a b\n')).toBe(
			lines('paragraph', '  "<span>*a b"', 'line_break')
		);
		expect(sound_tree('<span>**[a\n')).toBe(
			lines('paragraph', '  "<span>**[a"', 'line_break')
		);
		expect(sound_tree('<span>[a] b\n')).toBe(
			lines('paragraph', '  "<span>[a] b"', 'line_break')
		);
	});

	it('keeps inline nodes of its line in that paragraph', () => {
		expect(sound_tree('<span>a *b* `c` [d](e)\n')).toBe(
			lines(
				'paragraph',
				'  "<span>a "',
				'  strong_emphasis',
				'    "b"',
				'  " "',
				'  code_span',
				'  " "',
				'  link',
				'    "d"',
				'line_break'
			)
		);
		expect(sound_tree('<span>a\nb\n')).toBe(
			lines('paragraph', '  "<span>a"', '  soft_break', '  "b"', 'line_break')
		);
	});

	it('joins the paragraph a block level tag already had', () => {
		expect(sound_tree('<div>a b\n')).toBe(
			lines('paragraph', '  "<div>a b"', 'line_break')
		);
		expect(sound_tree('<div>a b\n\nc\n')).toBe(
			lines(
				'paragraph',
				'  "<div>a b"',
				'line_break',
				'line_break',
				'paragraph',
				'  "c"',
				'line_break'
			)
		);
	});

	it('is a paragraph of its own when its line holds nothing else', () => {
		expect(sound_tree('<span>\na b\n')).toBe(
			lines(
				'paragraph',
				'  "<span>"',
				'line_break',
				'paragraph',
				'  "a b"',
				'line_break'
			)
		);
		expect(sound_tree('<div>\na b\n')).toBe(
			lines(
				'paragraph',
				'  "<div>"',
				'line_break',
				'paragraph',
				'  "a b"',
				'line_break'
			)
		);
	});

	it('gives every later line of text a paragraph', () => {
		expect(sound_tree('<span>a b\n\nc\n\n*d\n')).toBe(
			lines(
				'paragraph',
				'  "<span>a b"',
				'line_break',
				'line_break',
				'paragraph',
				'  "c"',
				'line_break',
				'line_break',
				'paragraph',
				'  "*d"',
				'line_break'
			)
		);
	});

	it('leaves blocks after it as they were', () => {
		expect(sound_tree('<span>\n\n# h\n\n- a\n- b\n\ntail\n')).toBe(
			lines(
				'paragraph',
				'  "<span>"',
				'line_break',
				'line_break',
				'heading',
				'  "h"',
				'line_break',
				'line_break',
				'list',
				'  list_item',
				'    "a"',
				'  list_item',
				'    "b"',
				'line_break',
				'line_break',
				'paragraph',
				'  "tail"',
				'line_break'
			)
		);
	});

	it('leaves a line of only tags with no paragraph', () => {
		expect(sound_tree('<span>\n<b>x</b>\n\ny <i>z</i>\n')).toBe(
			lines(
				'paragraph',
				'  "<span>"',
				'line_break',
				'html b',
				'  "x"',
				'line_break',
				'line_break',
				'paragraph',
				'  "y "',
				'  html i',
				'    "z"',
				'line_break'
			)
		);
	});

	it('takes an unclosed tag inside it into the same paragraph', () => {
		expect(sound_tree('<span><b>a\n')).toBe(
			lines('paragraph', '  "<span><b>a"', 'line_break')
		);
		expect(sound_tree('<div><span>*a b\n')).toBe(
			lines('paragraph', '  "<div><span>*a b"', 'line_break')
		);
		expect(sound_tree('<span>\n<div>\nx\n')).toBe(
			lines(
				'paragraph',
				'  "<span>"',
				'line_break',
				'paragraph',
				'  "<div>"',
				'line_break',
				'paragraph',
				'  "x"',
				'line_break'
			)
		);
	});

	it('does the same in a block quote', () => {
		// no element holds blocks in a quote, the lines are one paragraph
		expect(sound_tree('> <div>\n> [a] b\n')).toBe(
			lines(
				'block_quote',
				'  paragraph',
				'    "<div>"',
				'    soft_break',
				'    "[a] b"',
				'line_break'
			)
		);
		expect(sound_tree('> <div>*a b\n\nc\n')).toBe(
			lines(
				'block_quote',
				'  paragraph',
				'    "<div>*a b"',
				'line_break',
				'line_break',
				'paragraph',
				'  "c"',
				'line_break'
			)
		);
	});

	it('keeps the text after a delimiter on the line of a closed block tag once', () => {
		for (const [name, nodes] of every_tree('<div>x</div> *a b\n')) {
			expect(joined_tree(nodes, '<div>x</div> *a b\n'), name).toBe(
				lines('html div', '  "x"', '" *a b"', 'line_break')
			);
		}
	});
});

describe('a tag left open at the start of a line, with parse plugins', () => {
	const plugins = (): ParsePlugin[] => [
		{
			paragraph: {
				parse(node) {
					node.attrs.seen = true;
				},
			},
			html: {
				parse(node) {
					const wrapper = node.wrap_inner('emphasis');
					return () => {
						wrapper.attrs.closed = true;
					};
				},
			},
		},
	];

	it('builds the tree it builds without them', () => {
		for (const source of [
			'<span>a *b\n\nc\n',
			'<div>a b\n\nc\n',
			'<span><b>a\n',
			'> <div>\n> [a] b\n',
		]) {
			const plain = joined_tree(parse_markdown_svelte(source).nodes, source);
			const { nodes } = parse_markdown_svelte(source, { plugins: plugins() });
			expect(misplaced_text(nodes, source), source).toEqual([]);
			expect(joined_tree(nodes, source), source).toBe(plain);

			const builder = new WireTreeBuilder(128, new PluginDispatcher(plugins()));
			const emitter = new WireEmitter();
			emitter.set_source(source);
			new PFMParser(emitter).parse(source);
			builder.apply(emitter.flush());
			expect(joined_tree(builder.get_buffer(), source), source).toBe(plain);
		}
	});

	it('keeps what a handler wrote on the paragraph that takes the tag', () => {
		const source = '<div>a b\n';
		const { nodes } = parse_markdown_svelte(source, { plugins: plugins() });
		const paragraph = nodes.get_node(nodes.get_node(0).children[0]);
		expect(paragraph.kind).toBe('paragraph');
		expect(paragraph.metadata.seen).toBe(true);
		expect(paragraph.start).toBe(0);
	});
});

const PREFIX = ['', '', '', '> ', '- ', '  ', '> - ', '1. '];
const TAGS = [
	'<span>',
	'<span>',
	'<div>',
	'<b>',
	'<p>',
	'<a href="u">',
	'<Chart>',
	'<em class="x">',
];
const PIECES = [
	'a',
	'b c',
	' ',
	'*',
	'**',
	'_',
	'~~',
	'[',
	']',
	'](u)',
	'![',
	'`',
	'{x}',
	'<i>y</i>',
	'<b>',
	'<br>',
	':y[',
	'&amp;',
	'd',
];
const ENDS = ['\n', '\n', '\n\n', ''];

function document(rand: () => number): string {
	let source = '';
	const rows = 1 + Math.floor(rand() * 3);
	for (let row = 0; row < rows; row++) {
		source += pick(rand, PREFIX);
		if (rand() < 0.75) source += pick(rand, TAGS);
		const count = Math.floor(rand() * 4);
		for (let k = 0; k < count; k++) source += pick(rand, PIECES);
		source += pick(rand, ENDS);
	}
	return source;
}

describe('random lines that start at an unclosed tag', () => {
	it('repeat no text and leave none outside a paragraph', () => {
		const rand = random(1);
		for (let i = 0; i < 2000; i++) {
			const source = document(rand);
			for (const [name, nodes] of every_tree(source)) {
				expect(
					misplaced_text(nodes, source),
					`${JSON.stringify(source)} ${name}`
				).toEqual([]);
			}
		}
	});
});
