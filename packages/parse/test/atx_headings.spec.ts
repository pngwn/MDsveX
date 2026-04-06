import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';
import type { node_buffer } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, 'fixtures/pfm/atx_headings');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8');

function collect_headings(nodes: node_buffer, source: string) {
	const root = nodes.get_node();
	return root.children
		.map((i) => nodes.get_node(i))
		.filter((n) => n.kind === 'heading')
		.map((n) => ({
			depth: n.metadata.depth,
			text: source.slice(n.value[0], n.value[1]),
		}));
}

describe('ATX headings', () => {
	test('pfm example 62 recognises heading depths 1 through 6', () => {
		const input = load_fixture('62');
		const { nodes } = parse_markdown_svelte(input);

		const headings = collect_headings(nodes, input);
		expect(headings.length).toBe(6);
		expect(headings.map((h) => h.depth)).toEqual([1, 2, 3, 4, 5, 6]);
		expect(headings.map((h) => h.text)).toEqual([
			'foo',
			'foo',
			'foo',
			'foo',
			'foo',
			'foo',
		]);
	});

	test('pfm example 63 treats seven octothorpes as literal text', () => {
		const input = load_fixture('63');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([]);
		const root = nodes.get_node();
		const first = nodes.get_node(root.children[0]);
		expect(first.kind).toBe('paragraph');
	});

	test('pfm example 64 requires space or tab after the marker', () => {
		const input = load_fixture('64');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([]);
	});

	test('pfm example 65 ignores escaped markers', () => {
		const input = load_fixture('65');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([]);
	});

	test('pfm example 66 allows inline formatting within the heading', () => {
		const input = load_fixture('66');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings.map((h) => h.depth)).toEqual([1]);
		expect(headings.map((h) => h.text)).toEqual([
			String.raw`foo *bar* \*baz\*`,
		]);
	});

	test('pfm example 67 trims leading and trailing spaces in content', () => {
		const input = load_fixture('67');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings.map((h) => h.depth)).toEqual([1]);
		expect(headings.map((h) => h.text)).toEqual(['foo']);
	});

	test('pfm example 68 tolerates up to three leading spaces', () => {
		const input = load_fixture('68');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings.map((h) => h.depth)).toEqual([3, 2, 1]);
		expect(headings.map((h) => h.text)).toEqual(['foo', 'foo', 'foo']);
	});

	test('pfm example 69 treats four or more leading spaces as also tolerated', () => {
		const input = load_fixture('69');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings.map((h) => h.depth)).toEqual([1]);
		expect(headings.map((h) => h.text)).toEqual(['foo']);
	});

	test('pfm example 70 treats indented hashes following text as headings', () => {
		const input = load_fixture('70');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings.map((h) => h.depth)).toEqual([1]);
		expect(headings.map((h) => h.text)).toEqual(['bar']);
	});

	test('pfm example 71 keeps trailing number signs inside the heading text', () => {
		const input = load_fixture('71');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([
			{ depth: 2, text: 'foo ##' },
			{ depth: 3, text: 'bar    ###' },
		]);
	});

	test('pfm example 72 keeps trailing number signs in the content', () => {
		const input = load_fixture('72');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([
			{ depth: 1, text: 'foo ##################################' },
			{ depth: 5, text: 'foo ##' },
		]);
	});

	test('pfm example 73 preserves trailing number signs', () => {
		const input = load_fixture('73');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 3, text: 'foo ###' }]);
	});

	test('pfm example 74 preserves number signs followed by text', () => {
		const input = load_fixture('74');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 3, text: 'foo ### b' }]);
	});

	test('pfm example 75 keeps adjacent number signs inside the heading text', () => {
		const input = load_fixture('75');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 1, text: 'foo#' }]);
	});

	test('pfm example 76 keeps escaped number signs in the content', () => {
		const input = load_fixture('76');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([
			{ depth: 3, text: String.raw`foo \###` },
			{ depth: 2, text: String.raw`foo #\##` },
			{ depth: 1, text: String.raw`foo \#` },
		]);
	});

	test('pfm example 77 recognises headings between thematic breaks', () => {
		const input = load_fixture('77');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 2, text: 'foo' }]);
	});

	test('pfm example 78 recognises headings between paragraphs', () => {
		const input = load_fixture('78');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 1, text: 'baz' }]);
	});

	test('pfm example 79 supports empty heading content', () => {
		const input = load_fixture('79');
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([
			{ depth: 2, text: '' },
			{ depth: 1, text: '' },
			{ depth: 3, text: '###' },
		]);
	});

	test('heading at EOF without trailing newline', () => {
		const input = '# hello';
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 1, text: 'hello' }]);
	});

	test('multiple headings in sequence', () => {
		const input = '# one\n## two\n### three\n';
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([
			{ depth: 1, text: 'one' },
			{ depth: 2, text: 'two' },
			{ depth: 3, text: 'three' },
		]);
	});

	test('heading with only hashes and no content', () => {
		const input = '#\n';
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 1, text: '' }]);
	});

	test('heading followed by paragraph', () => {
		const input = '# title\n\nsome text\n';
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 1, text: 'title' }]);

		const root = nodes.get_node();
		// children: [heading, line_break, paragraph, line_break]
		const para = root.children
			.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'paragraph');
		expect(para!.kind).toBe('paragraph');
	});

	test('paragraph followed by heading', () => {
		const input = 'some text\n\n## title\n';
		const { nodes } = parse_markdown_svelte(input);
		const headings = collect_headings(nodes, input);

		expect(headings).toEqual([{ depth: 2, text: 'title' }]);

		const root = nodes.get_node();
		const para = nodes.get_node(root.children[0]);
		expect(para.kind).toBe('paragraph');
	});
});
