import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';
import { print_ast } from './print';

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

function expect_incremental_matches(input: string): void {
	const batch = print_ast(parse_markdown_svelte(input).nodes, input);
	for (const size of [1, 2, 3]) {
		expect(print_ast(parse_incremental(input, size), input)).toBe(batch);
	}
}

function kinds(nodes: NodeBuffer, parent: number = 0): string[] {
	return nodes
		.get_node(parent)
		.children.map((i) => nodes.get_node(i).kind)
		.filter((k) => k !== 'line_break');
}

let error_spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	error_spy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	error_spy.mockRestore();
});

describe('unclosed delimiter before a block interrupt', () => {
	test('ordered list: `1. ~1\\n2. *`', () => {
		const input = '1. ~1\n2. *';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=true start=1 tight=true',
				'    list_item',
				'      text "~1"',
				'    list_item',
				'      text "*"',
			].join('\n')
		);
	});

	test('nested list marker: `- *a\\n  - b`', () => {
		const input = '- *a\n  - b';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "*a"',
				'      list ordered=false start=0 tight=true',
				'        list_item',
				'          text "b"',
			].join('\n')
		);
	});

	const openers = ['*a', '_a', '~~a', '~a', '^a'];
	const interrupts: [string, string][] = [
		['- b', 'list'],
		['1. b', 'list'],
		['> b', 'block_quote'],
		['```\nb\n```', 'code_fence'],
		['<div>\n</div>', 'html'],
	];

	for (const opener of openers) {
		for (const [interrupt, kind] of interrupts) {
			const input = `${opener}\n${interrupt}`;
			test(JSON.stringify(input), () => {
				const { nodes } = parse_markdown_svelte(input);

				expect(error_spy).not.toHaveBeenCalled();
				expect(kinds(nodes)).toEqual(['paragraph', kind]);
				const para = nodes.get_node(0).children[0];
				expect(kinds(nodes, para).every((k) => k === 'text')).toBe(true);
			});
		}

		const input = `- ${opener}\n- b`;
		test(JSON.stringify(input), () => {
			const { nodes } = parse_markdown_svelte(input);

			expect(error_spy).not.toHaveBeenCalled();
			const list = nodes.get_node(0).children[0];
			expect(kinds(nodes)).toEqual(['list']);
			expect(kinds(nodes, list)).toEqual(['list_item', 'list_item']);
		});
	}
});

describe('unclosed delimiter in a heading', () => {
	const openers = ['*a', '_)', '**)', '~~a', '~a', '^a', '[a', ':x[a', '<b>a'];

	for (const opener of openers) {
		for (const [prefix, outer] of [
			['# ', ['heading', 'paragraph']],
			['## a ', ['heading', 'paragraph']],
			['- # ', ['list', 'paragraph']],
		] as const) {
			const input = `${prefix}${opener}\nfoo`;
			test(JSON.stringify(input), () => {
				const { nodes } = parse_markdown_svelte(input);
				expect(error_spy).not.toHaveBeenCalled();
				expect(kinds(nodes)).toEqual(outer);
				expect_incremental_matches(input);
			});
		}
	}

	test('heading in a block quote ends at the line end: `> # *a\\n> foo`', () => {
		const input = '> # *a\n> foo';
		const { nodes } = parse_markdown_svelte(input);

		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  block_quote',
				'    heading depth=1 "*a"',
				'      text "*a"',
				'    paragraph',
				'      text "foo"',
			].join('\n')
		);
		expect_incremental_matches(input);
	});
});

describe('unclosed link text at a linefeed', () => {
	for (const [input, outer] of [
		['[a\n# h', ['paragraph', 'heading']],
		['[a\n---', ['paragraph', 'thematic_break']],
		['[a\n> q', ['paragraph', 'block_quote']],
		['[a\n```\nx\n```', ['paragraph', 'code_fence']],
		[':x[a\n# h', ['paragraph', 'heading']],
		['> [a\nfoo', ['block_quote', 'paragraph']],
		['> :x[a\nfoo', ['block_quote', 'paragraph']],
	] as const) {
		test(JSON.stringify(input), () => {
			const { nodes } = parse_markdown_svelte(input);
			expect(error_spy).not.toHaveBeenCalled();
			expect(kinds(nodes)).toEqual(outer);
			expect_incremental_matches(input);
		});
	}

	test('list item marker ends the link text: `- [a\\n- b`', () => {
		const input = '- [a\n- b';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "[a"',
				'    list_item',
				'      text "b"',
			].join('\n')
		);
		expect_incremental_matches(input);
	});

	test('link spans block quote lines: `> a [b\\n> c](d) e`', () => {
		const input = '> a [b\n> c](d) e';
		const { nodes } = parse_markdown_svelte(input);

		expect(error_spy).not.toHaveBeenCalled();
		expect(print_ast(nodes, input)).toBe(
			[
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a "',
				'      link href="d"',
				'        text "b"',
				'        soft_break',
				'        text "c"',
				'      text " e"',
			].join('\n')
		);
		expect_incremental_matches(input);
	});
});
