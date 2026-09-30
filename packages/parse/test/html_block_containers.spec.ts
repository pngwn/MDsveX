import { describe, expect, test, vi } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';

type Shape = string | [string, ...Shape[]];

function shape(nodes: NodeBuffer, source: string, id = 0): Shape {
	const n = nodes.get_node(id);
	if (n.kind === 'text') return `text:${source.slice(n.value[0], n.value[1])}`;
	if (n.children.length === 0) return n.kind;
	return [n.kind, ...n.children.map((c: number) => shape(nodes, source, c))];
}

function root_shape(input: string): Shape[] {
	const { nodes, source } = parse_markdown_svelte(input);
	const root = shape(nodes, source);
	return Array.isArray(root) ? root.slice(1) : [];
}

function strip_line_breaks(s: Shape[]): Shape[] {
	return s.filter((c) => c !== 'line_break');
}

function parse_incremental(source: string, chunk_size: number): NodeBuffer {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk_size) {
		parser.feed(source.slice(i, i + chunk_size));
	}
	parser.finish();
	return tree.get_buffer();
}

const after = '\n\none\n\ntwo\n';
const after_shape: Shape[] = [
	['paragraph', 'text:one'],
	['paragraph', 'text:two'],
];

describe('html block closing containers opened inside it', () => {
	test('list on the opener line keeps later paragraphs', () => {
		expect(strip_line_breaks(root_shape(`<div>- a</div>${after}`))).toEqual([
			['html', ['list', ['list_item', 'text:a']]],
			...after_shape,
		]);
	});

	test('list on its own line keeps later paragraphs', () => {
		expect(
			strip_line_breaks(
				root_shape('<div>\n- item</div>\n\npara one\n\npara two\n')
			)
		).toEqual([
			['html', 'line_break', ['list', ['list_item', 'text:item']]],
			['paragraph', 'text:para one'],
			['paragraph', 'text:para two'],
		]);
	});

	test('list inside an html list element', () => {
		expect(strip_line_breaks(root_shape(`<ul>\n- a</ul>${after}`))).toEqual([
			['html', 'line_break', ['list', ['list_item', 'text:a']]],
			...after_shape,
		]);
	});

	test('empty list item followed by a stray angle bracket', () => {
		expect(root_shape('<p>- </p><\n')).toEqual([
			['html', ['list', 'list_item']],
			['paragraph', 'text:<'],
			'line_break',
		]);
	});

	test('list closed by the html tag is marked tight', () => {
		const { nodes } = parse_markdown_svelte(`<div>- a</div>${after}`);
		const html = nodes.get_node(nodes.get_node().children[0]);
		const list = nodes.get_node(html.children[0]);
		expect(list.kind).toBe('list');
		expect(list.metadata.tight).toBe(true);
	});

	test('loose list closed by the html tag keeps its paragraphs', () => {
		expect(
			strip_line_breaks(root_shape(`<div>\n- a\n\n- b</div>${after}`))
		).toEqual([
			[
				'html',
				'line_break',
				[
					'list',
					['list_item', ['paragraph', 'text:a']],
					['list_item', ['paragraph', 'text:b']],
				],
			],
			...after_shape,
		]);
	});

	test('nested lists', () => {
		expect(
			strip_line_breaks(root_shape(`<div>\n- a\n  - b</div>${after}`))
		).toEqual([
			[
				'html',
				'line_break',
				['list', ['list_item', 'text:a', ['list', ['list_item', 'text:b']]]],
			],
			...after_shape,
		]);
	});

	test('blockquote inside a list item', () => {
		expect(strip_line_breaks(root_shape(`<div>\n- > a</div>${after}`))).toEqual(
			[
				[
					'html',
					'line_break',
					['list', ['list_item', ['block_quote', ['paragraph', 'text:a']]]],
				],
				...after_shape,
			]
		);
	});

	test('svelte block keeps its branch expression short of the close tag', () => {
		const input = `<div>\n{#if x}\n- a</div>${after}`;
		expect(strip_line_breaks(root_shape(input))).toEqual([
			[
				'html',
				'line_break',
				[
					'svelte_block',
					['svelte_branch', 'line_break', ['list', ['list_item', 'text:a']]],
				],
			],
			...after_shape,
		]);
		const { nodes, source } = parse_markdown_svelte(input);
		const html = nodes.get_node(nodes.get_node().children[0]);
		const block = nodes.get_node(html.children[1]);
		const branch = nodes.get_node(block.children[0]);
		expect(source.slice(branch.value[0], branch.value[1])).toBe('x');
	});

	test('blockquote inside a svelte block', () => {
		expect(
			strip_line_breaks(root_shape(`<div>\n{#if x}\n> a</div>${after}`))
		).toEqual([
			[
				'html',
				'line_break',
				[
					'svelte_block',
					[
						'svelte_branch',
						'line_break',
						['block_quote', ['paragraph', 'text:a']],
					],
				],
			],
			...after_shape,
		]);
	});

	test('directive container inside a svelte block', () => {
		const input = `<div>\n{#if x}\n:::note[hi]\nfoo</div>${after}`;
		expect(strip_line_breaks(root_shape(input))).toEqual([
			[
				'html',
				'line_break',
				[
					'svelte_block',
					[
						'svelte_branch',
						'line_break',
						['directive_container', ['paragraph', 'text:foo']],
					],
				],
			],
			...after_shape,
		]);
		const { nodes, source } = parse_markdown_svelte(input);
		const html = nodes.get_node(nodes.get_node().children[0]);
		const block = nodes.get_node(html.children[1]);
		const branch = nodes.get_node(block.children[0]);
		const dir = nodes.get_node(branch.children[1]);
		expect(dir.kind).toBe('directive_container');
		expect(source.slice(dir.value[0], dir.value[1])).toBe('hi');
	});

	test('table', () => {
		expect(
			strip_line_breaks(
				root_shape(`<div>\n| a | b |\n|---|---|\n| c</div>\n\none | x\n`)
			)
		).toEqual(
			strip_line_breaks([
				[
					'html',
					'line_break',
					[
						'table',
						[
							'table_header',
							['table_cell', 'text:a'],
							['table_cell', 'text:b'],
						],
						['table_row', ['table_cell', 'text:c'], 'table_cell'],
					],
				],
				...root_shape('one | x\n'),
			])
		);
	});

	test('heading', () => {
		expect(
			strip_line_breaks(root_shape('<div>\n# h</div>\n\n*one\ntwo*\n'))
		).toEqual([
			['html', 'line_break', ['heading', 'text:h']],
			['paragraph', ['strong_emphasis', 'text:one', 'soft_break', 'text:two']],
		]);
	});

	test('unclosed delimiter in a tight list item stays literal', () => {
		expect(strip_line_breaks(root_shape(`<div>\n- *a</div>${after}`))).toEqual([
			['html', 'line_break', ['list', ['list_item', 'text:*a']]],
			...after_shape,
		]);
	});
});

describe('every later block stays a root child', () => {
	const inners = [
		'- a',
		'- a\n- b',
		'- a\n\n- b',
		'- a\n  - b',
		'- a\n  - b\n    - c',
		'1. a',
		'- > a',
		'- > - a',
		'{#if x}\na',
		'{#if x}\n- a',
		'{#if x}\n> a',
		'{#if x}\n{#each y as z}\n- a',
		'{#if x}\n:::note[]\na',
		'{#if x}\n:::note[]\n- a',
		'- {#if x}\n- a',
		'| a |\n|---|\n| b',
		'# h',
		'# *h',
		'- *a',
		'- :x[a',
		'<section>\n- a',
	];
	const tail =
		'\n\none\n\n- two\n\n> three\n\n{#if y}\nfour\n{/if}\n\n:::note[]\nfive\n:::\n\n*six\nseven*\n';
	const tail_shape = strip_line_breaks(root_shape(tail.slice(2)));

	for (const inner of inners) {
		for (const [open, close] of [
			['<div>', '</div>'],
			['<div>\n', '</div>'],
		]) {
			const input = `${open}${inner}${close}${tail}`;
			test(JSON.stringify(input), () => {
				const kids = strip_line_breaks(root_shape(input));
				expect(kids[0][0]).toBe('html');
				expect(kids.slice(1)).toEqual(tail_shape);

				const batch = parse_markdown_svelte(input);
				for (const size of [1, 2, 7]) {
					const inc = parse_incremental(input, size);
					expect(shape(inc, batch.source)).toEqual(
						shape(batch.nodes, batch.source)
					);
				}
			});
		}
	}
});

describe('unclosed inline html at the end of a block quote', () => {
	const cases: [string, Shape[]][] = [
		['> <l>\nfoo', [['block_quote', ['paragraph', 'text:<l>']]]],
		['><div>\nfoo', [['block_quote', ['paragraph', 'text:<div>']]]],
		['> <span>\nfoo', [['block_quote', ['paragraph', 'text:<span>']]]],
		[
			'> > <l>\nfoo',
			[['block_quote', ['block_quote', ['paragraph', 'text:<l>']]]],
		],
		[
			'- > <l>\nfoo',
			[['list', ['list_item', ['block_quote', ['paragraph', 'text:<l>']]]]],
		],
		[
			'> <l>\n> bar\nfoo',
			[['block_quote', ['paragraph', 'text:<l>', 'soft_break', 'text:bar']]],
		],
	];

	for (const [input, quote] of cases) {
		test(JSON.stringify(input), () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			try {
				expect(strip_line_breaks(root_shape(input))).toEqual([
					...quote,
					['paragraph', 'text:foo'],
				]);

				const batch = parse_markdown_svelte(input);
				for (const size of [1, 2, 3]) {
					const inc = parse_incremental(input, size);
					expect(shape(inc, batch.source)).toEqual(
						shape(batch.nodes, batch.source)
					);
				}
				expect(error).not.toHaveBeenCalled();
			} finally {
				error.mockRestore();
			}
		});
	}
});
