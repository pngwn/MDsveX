import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/atx_headings');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

describe('ATX headings', () => {
	test.only('pfm example 62 recognises heading depths 1 through 6', () => {
		const input = load_fixture('62');
		const { nodes, errors } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(6);

		const children = nodes.get_node().children;
		const headings = children.map((child) => nodes.get_node(child));
		console.log(headings);
		// expect(headings.map((heading) => heading.depth)).toEqual([
		// 	1, 2, 3, 4, 5, 6,
		// ]);
		// expect(headings.map((heading) => heading.text)).toEqual([
		// 	'foo',
		// 	'foo',
		// 	'foo',
		// 	'foo',
		// 	'foo',
		// 	'foo',
		// ]);

		// expect_heading_nodes(tokens, arena, root);
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
