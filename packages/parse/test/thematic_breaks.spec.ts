import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { node_buffer } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/thematic_breaks');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

function collect_breaks(nodes: node_buffer) {
	const root = nodes.get_node();
	return root.children
		.map((i) => nodes.get_node(i))
		.filter((n) => n.kind === 'thematic_break');
}

function collect_children(nodes: node_buffer) {
	const root = nodes.get_node();
	return root.children
		.map((i) => nodes.get_node(i))
		.filter((n) => n.kind !== 'line_break');
}

describe('Thematic breaks', () => {
	test('pfm example 43 recognises ***, ---, and ___', () => {
		const input = load_fixture('43');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(3);
	});

	test('pfm example 44 treats +++ as paragraph', () => {
		const input = load_fixture('44');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);
		const children = collect_children(nodes);

		expect(breaks.length).toBe(0);
		expect(children[0].kind).toBe('paragraph');
	});

	test('pfm example 45 treats === as paragraph', () => {
		const input = load_fixture('45');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);
		const children = collect_children(nodes);

		expect(breaks.length).toBe(0);
		expect(children[0].kind).toBe('paragraph');
	});

	test('pfm example 46 requires at least three markers', () => {
		const input = load_fixture('46');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(0);
	});

	test('pfm example 47 allows 1-3 leading spaces', () => {
		const input = load_fixture('47');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(3);
	});

	test.todo('pfm example 48 treats four leading spaces as indented code block');

	test.todo('pfm example 49 treats indented markers inside paragraph as continuation');

	test('pfm example 50 accepts many markers', () => {
		const input = load_fixture('50');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(1);
	});

	test('pfm example 51 allows spaces between markers', () => {
		const input = load_fixture('51');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(1);
	});

	test('pfm example 52 allows spaces within same marker type', () => {
		const input = load_fixture('52');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(1);
	});

	test('pfm example 53 allows multiple spaces between markers', () => {
		const input = load_fixture('53');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(1);
	});

	test('pfm example 54 allows trailing spaces', () => {
		const input = load_fixture('54');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(1);
	});

	test('pfm example 55 rejects lines with non-marker characters', () => {
		const input = load_fixture('55');
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(0);
	});

	test.todo('pfm example 56 treats *-* as emphasis (depends on _ emphasis)');

	test.todo('pfm example 57 thematic break between list items (depends on lists)');

	test('pfm example 58 thematic break interrupts paragraph (non-dash marker)', () => {
		const input = load_fixture('58');
		const { nodes } = parse_markdown_svelte(input);
		const children = collect_children(nodes);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(1);
		expect(children.length).toBe(3);
		expect(children[0].kind).toBe('paragraph');
		expect(children[1].kind).toBe('thematic_break');
		expect(children[2].kind).toBe('paragraph');
	});

	test.todo('pfm example 59 dash after paragraph is setext heading (depends on setext headings)');

	test.todo('pfm example 60 thematic break between list items (depends on lists)');

	test.todo('pfm example 61 thematic break inside list item (depends on lists)');

	test('thematic break at EOF without trailing newline', () => {
		const input = '---';
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(1);
	});

	test('thematic break followed by heading', () => {
		const input = '***\n# hello\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = collect_children(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('thematic_break');
		expect(children[1].kind).toBe('heading');
	});

	test('heading followed by thematic break', () => {
		const input = '# hello\n***\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = collect_children(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('heading');
		expect(children[1].kind).toBe('thematic_break');
	});

	test('multiple thematic breaks in sequence', () => {
		const input = '---\n***\n___\n';
		const { nodes } = parse_markdown_svelte(input);
		const breaks = collect_breaks(nodes);

		expect(breaks.length).toBe(3);
	});

	test('thematic break between paragraphs', () => {
		const input = 'foo\n\n---\n\nbar\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = collect_children(nodes);

		expect(children.length).toBe(3);
		expect(children[0].kind).toBe('paragraph');
		expect(children[1].kind).toBe('thematic_break');
		expect(children[2].kind).toBe('paragraph');
	});
});
