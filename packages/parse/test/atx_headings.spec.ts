import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { node_kind, parse_markdown_svelte, token_kind } from '../src/main';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/atx_headings');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

type HeadingSummary = { depth: number; text: string };

const collect_headings = (
	input: string,
	tokens: ReturnType<typeof parse_markdown_svelte>['tokens']
): HeadingSummary[] => {
	const headings: HeadingSummary[] = [];
	for (let index = 0; index < tokens.size; index += 1) {
		if (tokens.kind_at(index) === token_kind.heading) {
			headings.push({
				depth: tokens.extra_at(index),
				text: input.slice(
					tokens.value_start_at(index),
					tokens.value_end_at(index)
				),
			});
		}
	}
	return headings;
};

const collect_children = (
	arena: ReturnType<typeof parse_markdown_svelte>['arena'],
	parent: number
): number[] => {
	const children: number[] = [];
	for (let index = 0; index < arena.size; index += 1) {
		if (arena.get_parent(index) === parent) {
			children.push(index);
		}
	}
	return children;
};

const expect_heading_nodes = (
	tokens: ReturnType<typeof parse_markdown_svelte>['tokens'],
	arena: ReturnType<typeof parse_markdown_svelte>['arena'],
	root: number
): void => {
	const heading_tokens: number[] = [];
	for (let index = 0; index < tokens.size; index += 1) {
		if (tokens.kind_at(index) === token_kind.heading) {
			heading_tokens.push(index);
		}
	}

	const root_children = collect_children(arena, root);
	const heading_nodes = root_children.filter(
		(index) => arena.get_kind(index) === node_kind.heading
	);
	
	expect(heading_nodes.length).toBe(heading_tokens.length);

	const remaining = new Set(heading_nodes);
	for (const token_index of heading_tokens) {
		const start = tokens.start_at(token_index);
		const end = tokens.end_at(token_index);
		let matched_node = -1;
		for (const node_index of remaining) {
			if (
				arena.get_start(node_index) === start &&
				arena.get_end(node_index) === end
			) {
				matched_node = node_index;
				break;
			}
		}

		expect(matched_node).not.toBe(-1);
		remaining.delete(matched_node);

		const children = collect_children(arena, matched_node);
		const value_start = tokens.value_start_at(token_index);
		const value_end = tokens.value_end_at(token_index);
		if (value_end > value_start) {
			expect(children.length).toBe(1);
			const text_index = children[0];
			expect(arena.get_kind(text_index)).toBe(node_kind.text);
			expect(arena.get_start(text_index)).toBe(value_start);
			expect(arena.get_end(text_index)).toBe(value_end);
		} else {
			expect(children.length).toBe(0);
		}
	}

	expect(remaining.size).toBe(0);
};

describe('ATX headings', () => {
	test('pfm example 62 recognises heading depths 1 through 6', () => {
		const input = load_fixture('62');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(tokens.size).toBe(6);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([
			1, 2, 3, 4, 5, 6,
		]);
		expect(headings.map((heading) => heading.text)).toEqual([
			'foo',
			'foo',
			'foo',
			'foo',
			'foo',
			'foo',
		]);

		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 63 treats seven octothorpes as literal text', () => {
		const input = load_fixture('63');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 64 requires space or tab after the marker', () => {
		const input = load_fixture('64');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 65 ignores escaped markers', () => {
		const input = load_fixture('65');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 66 allows inline formatting within the heading', () => {
		const input = load_fixture('66');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual([
			String.raw`foo *bar* \*baz\*`,
		]);

		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 67 trims trailing spaces after the heading content', () => {
		const input = load_fixture('67');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual(['foo']);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 68 tolerates up to three leading spaces', () => {
		const input = load_fixture('68');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([3, 2, 1]);
		expect(headings.map((heading) => heading.text)).toEqual([
			'foo',
			'foo',
			'foo',
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 69 treats four or more leading spaces are also toleratedt', () => {
		const input = load_fixture('69');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.length).toBe(tokens.size);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual(['foo']);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 70 treats indented hashes following text as headings', () => {
		const input = load_fixture('70');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings.map((heading) => heading.depth)).toEqual([1]);
		expect(headings.map((heading) => heading.text)).toEqual(['bar']);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 71 keeps trailing number signs inside the heading text', () => {
		const input = load_fixture('71');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 2, text: 'foo ##' },
			{ depth: 3, text: 'bar    ###' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 72 ignores trailing number signs in the content', () => {
		const input = load_fixture('72');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		const headings = collect_headings(input, tokens);
		expect(headings).toEqual([
			{ depth: 1, text: 'foo ##################################' },
			{ depth: 5, text: 'foo ##' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 73 allows trailing spaces after the optional closing sequence', () => {
		const input = load_fixture('73');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 3, text: 'foo ###' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 74 requires the closing sequence to be followed only by spaces', () => {
		const input = load_fixture('74');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 3, text: 'foo ### b' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 75 keeps adjacent number signs inside the heading text', () => {
		const input = load_fixture('75');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 1, text: 'foo#' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 76 keeps escaped number signs in the content', () => {
		const input = load_fixture('76');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 3, text: String.raw`foo \###` },
			{ depth: 2, text: String.raw`foo #\##` },
			{ depth: 1, text: String.raw`foo \#` },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 77 recognises headings between thematic breaks', () => {
		const input = load_fixture('77');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 2, text: 'foo' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 78 recognises headings between paragraphs', () => {
		const input = load_fixture('78');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 1, text: 'baz' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});

	test('pfm example 79 supports empty heading content', () => {
		const input = load_fixture('79');
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(collect_headings(input, tokens)).toEqual([
			{ depth: 2, text: '' },
			{ depth: 1, text: '' },
			{ depth: 3, text: '###' },
		]);
		expect_heading_nodes(tokens, arena, root);
	});
});
