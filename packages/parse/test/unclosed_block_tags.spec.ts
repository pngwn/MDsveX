import { describe, expect, it } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import { PluginDispatcher } from '../src/plugin_dispatch';
import type { ParsePlugin } from '../src/plugin_types';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import {
	every_path,
	every_tree,
	fed_mismatch,
	joined_tree,
	lines,
	pick,
	problems,
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

describe('a tag left open in a svelte block', () => {
	const block = (...rows: string[]) =>
		lines(
			'root',
			'  svelte_block tag="if"',
			'    svelte_branch tag="if" "x"',
			...rows.map((row) => `      ${row}`)
		);
	const after = [
		'  line_break',
		'  line_break',
		'  paragraph',
		'    text "after"',
		'  line_break',
	];

	it('is text in a paragraph of the branch and the block closes', () => {
		expect(every_path('{#if x}\n<n>\n{/if}\n\nafter\n')).toBe(
			lines(
				block('line_break', 'paragraph', '  text "<n>"', 'line_break'),
				...after
			)
		);
		expect(every_path('{#if x}\n<span>\n{/if}\n\nafter\n')).toBe(
			lines(
				block('line_break', 'paragraph', '  text "<span>"', 'line_break'),
				...after
			)
		);
		expect(every_path('{#if x}\n<div class="a">\n{/if}\n\nafter\n')).toBe(
			lines(
				block(
					'line_break',
					'paragraph',
					'  text "<div class=\\"a\\">"',
					'line_break'
				),
				...after
			)
		);
	});

	it('ends at the next branch', () => {
		expect(every_path('{#if x}\n<n>\n{:else}\nb\n{/if}\n')).toBe(
			lines(
				'root',
				'  svelte_block tag="if"',
				'    svelte_branch tag="if" "x"',
				'      line_break',
				'      paragraph',
				'        text "<n>"',
				'      line_break',
				'    svelte_branch tag="else"',
				'      line_break',
				'      paragraph',
				'        text "b"',
				'      line_break',
				'  line_break'
			)
		);
	});

	it('keeps the blocks after it in the branch', () => {
		expect(every_path('{#if x}\n<n>\ny\n{/if}\n')).toBe(
			lines(
				block(
					'line_break',
					'paragraph',
					'  text "<n>"',
					'line_break',
					'paragraph',
					'  text "y"',
					'line_break'
				),
				'  line_break'
			)
		);
		expect(every_path('{#if x}\n<n>\n# h\n- a\n{/if}\n')).toBe(
			lines(
				block(
					'line_break',
					'paragraph',
					'  text "<n>"',
					'line_break',
					'heading depth=1 "h"',
					'  text "h"',
					'line_break',
					'list ordered=false start=0 tight=true',
					'  list_item',
					'    text "a"',
					'line_break'
				),
				'  line_break'
			)
		);
	});

	it('with a second tag left open inside it', () => {
		expect(every_path('{#if x}\n<n>\n<m>\n{/if}\n')).toBe(
			lines(
				block(
					'line_break',
					'paragraph',
					'  text "<n>"',
					'line_break',
					'paragraph',
					'  text "<m>"',
					'line_break'
				),
				'  line_break'
			)
		);
	});

	it('around a block that closes', () => {
		expect(every_path('{#if x}\n<n>\n{#if y}\nb\n{/if}\n{/if}\n')).toBe(
			lines(
				block(
					'line_break',
					'paragraph',
					'  text "<n>"',
					'line_break',
					'svelte_block tag="if"',
					'  svelte_branch tag="if" "y"',
					'    line_break',
					'    paragraph',
					'      text "b"',
					'    line_break',
					'line_break'
				),
				'  line_break'
			)
		);
	});

	it('at the end of the input', () => {
		expect(every_path('{#if x}\n<n>\n')).toBe(
			block('line_break', 'paragraph', '  text "<n>"', 'line_break')
		);
	});

	it('an element that closes in the branch is still an element', () => {
		expect(every_path('{#if x}\n<n>\ny\n</n>\n{/if}\n')).toBe(
			lines(
				block(
					'line_break',
					'html tag="n"',
					'  line_break',
					'  paragraph',
					'    text "y"',
					'  line_break',
					'line_break'
				),
				'  line_break'
			)
		);
	});

	it('a block opened inside the element closes there', () => {
		expect(every_path('<n>\n{#if x}\ny\n{/if}\n</n>\n')).toBe(
			lines(
				'root',
				'  html tag="n"',
				'    line_break',
				'    svelte_block tag="if"',
				'      svelte_branch tag="if" "x"',
				'        line_break',
				'        paragraph',
				'          text "y"',
				'        line_break',
				'    line_break',
				'  line_break'
			)
		);
	});

	it('random blocks close and leave no text outside a paragraph', () => {
		const rand = random(983);
		for (let i = 0; i < 600; i++) {
			const inner = document(rand).replace(/\n*$/, '\n');
			const close = pick(rand, ['{/if}', '{/if}', '{:else}\nz\n{/if}']);
			const source = `{#if x}\n${inner}${close}\n\nafter\n`;
			const label = JSON.stringify(source);
			expect(fed_mismatch(source), label).toBe('');
			for (const [name, nodes] of every_tree(source)) {
				const root = nodes.get_node(0).children.map((c) => nodes.get_node(c));
				const last = root.filter((node) => node.kind !== 'line_break').pop()!;
				expect(last.kind, `${label} ${name}`).toBe('paragraph');
				const walk = (index: number): void => {
					const node = nodes.get_node(index);
					for (const child of node.children) {
						if (
							node.kind === 'svelte_branch' &&
							nodes.get_node(child).kind === 'text'
						) {
							expect.fail(`${label} ${name}: text right under a branch`);
						}
						walk(child);
					}
				};
				walk(0);
			}
		}
	}, 30_000);
});

describe('a container directive left open in a svelte block', () => {
	const block = (...rows: string[]) =>
		lines(
			'root',
			'  svelte_block tag="if"',
			'    svelte_branch tag="if" "x"',
			...rows.map((row) => `      ${row}`)
		);
	const after = [
		'  line_break',
		'  line_break',
		'  paragraph',
		'    text "after"',
		'  line_break',
	];
	const held = [
		'line_break',
		'directive_container name="y"',
		'  paragraph',
		'    text "a"',
		'  line_break',
	];

	it('ends where the block closes', () => {
		expect(every_path('{#if x}\n:::y[]\na\n{/if}\n\nafter\n')).toBe(
			lines(block(...held), ...after)
		);
		expect(every_path('{#if x}\n:::y\na\n{/if}\n\nafter\n')).toBe(
			lines(block(...held), ...after)
		);
	});

	it('ends at the next branch', () => {
		expect(every_path('{#if x}\n:::y[]\na\n{:else}\nb\n{/if}\n')).toBe(
			lines(
				block(...held),
				'    svelte_branch tag="else"',
				'      line_break',
				'      paragraph',
				'        text "b"',
				'      line_break',
				'  line_break'
			)
		);
	});

	it('with a second directive left open inside it', () => {
		expect(every_path('{#if x}\n::::y[]\n:::z[]\na\n{/if}\n\nafter\n')).toBe(
			lines(
				block(
					'line_break',
					'directive_container name="y"',
					'  directive_container name="z"',
					'    paragraph',
					'      text "a"',
					'    line_break'
				),
				...after
			)
		);
	});

	it('in an element left open, which is text', () => {
		expect(every_path('{#if x}\n<n>\n:::y[]\na\n{/if}\n\nafter\n')).toBe(
			lines(block('line_break', 'paragraph', '  text "<n>"', ...held), ...after)
		);
	});

	it('an expression in the directive is still an expression', () => {
		expect(every_path('{#if x}\n:::y[]\n{a}\n:::\n{/if}\n')).toBe(
			lines(
				block(
					'line_break',
					'directive_container name="y"',
					'  paragraph',
					'    mustache "a"',
					'  line_break'
				),
				'  line_break'
			)
		);
	});

	it('a directive that closes in the branch is not touched', () => {
		expect(every_path('{#if x}\n:::y[]\na\n:::\n{/if}\n\nafter\n')).toBe(
			lines(block(...held), ...after)
		);
	});

	it('a close token with no block around the directive is an expression', () => {
		expect(every_path(':::y[]\na\n{/if}\n:::\n')).toBe(
			lines(
				'root',
				'  directive_container name="y"',
				'    paragraph',
				'      text "a"',
				'      soft_break',
				'      mustache "/if"',
				'    line_break'
			)
		);
	});

	it('in a quoted block, the directive ends at the quoted close', () => {
		expect(every_path('{#if x}\n> :::y[]\n> a\n{/if}\n\nafter\n')).toBe(
			lines(
				block(
					'line_break',
					'block_quote',
					'  directive_container name="y"',
					'    paragraph',
					'      text "a"',
					'line_break'
				),
				...after
			)
		);
	});

	it('at the end of the input', () => {
		expect(every_path('{#if x}\n:::y[]\na\n')).toBe(block(...held));
	});

	it('random blocks close past the directives left open in them', () => {
		const rand = random(999);
		const rows = [
			':::y[]',
			':::y',
			'::::z[]',
			':::',
			'<n>',
			'<div>',
			'</n>',
			'a',
			'b *c*',
			'# h',
			'- i',
			'{a}',
			'',
		];
		for (let i = 0; i < 600; i++) {
			let inner = '';
			const count = 1 + Math.floor(rand() * 5);
			for (let k = 0; k < count; k++) inner += `${pick(rand, rows)}\n`;
			const close = pick(rand, ['{/if}', '{/if}', '{:else}\nz\n{/if}']);
			const source = `{#if x}\n${inner}${close}\n\nafter\n`;
			const label = JSON.stringify(source);
			expect(fed_mismatch(source), label).toBe('');
			expect(problems(source, 0), label).toEqual([]);
			expect(problems(source, 1), label).toEqual([]);
			for (const [name, nodes] of every_tree(source)) {
				const root = nodes.get_node(0).children.map((c) => nodes.get_node(c));
				const blocks = root.filter((node) => node.kind !== 'line_break');
				expect(
					blocks.map((node) => node.kind),
					`${label} ${name}`
				).toEqual(['svelte_block', 'paragraph']);
			}
		}
	}, 30_000);
});
