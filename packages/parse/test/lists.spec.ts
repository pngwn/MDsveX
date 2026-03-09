import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { node_buffer } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/lists');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

function collect_children(nodes: node_buffer, parent: number = 0) {
	const root = nodes.get_node(parent);
	return root.children.map((i) => nodes.get_node(i));
}

function non_breaks(nodes: node_buffer, parent: number = 0) {
	return collect_children(nodes, parent).filter((n) => n.kind !== 'line_break');
}

function get_value(nodes: node_buffer, index: number, source: string) {
	const node = nodes.get_node(index);
	return source.slice(node.value[0], node.value[1]);
}

describe('Lists', () => {
	test('pfm example 322: minimal list (single item)', () => {
		const input = load_fixture('322');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.ordered).toBe(false);
		expect(children[0].metadata.tight).toBe(true);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(1);
		expect(items[0].kind).toBe('list_item');

		// Tight list: no paragraph wrapper, text directly in list_item
		const item_children = non_breaks(nodes, items[0].index);
		expect(item_children.length).toBe(1);
		expect(item_children[0].kind).toBe('text');
	});

	test('pfm example 301: different unordered markers create separate lists', () => {
		const input = load_fixture('301');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(true);
		expect(children[1].kind).toBe('list');
		expect(children[1].metadata.tight).toBe(true);

		// First list: - foo, - bar (tight: text directly in list_item)
		const items1 = non_breaks(nodes, children[0].index);
		expect(items1.length).toBe(2);
		expect(items1[0].kind).toBe('list_item');
		expect(items1[1].kind).toBe('list_item');

		const item1_children = non_breaks(nodes, items1[0].index);
		expect(item1_children[0].kind).toBe('text');

		// Second list: + baz
		const items2 = non_breaks(nodes, children[1].index);
		expect(items2.length).toBe(1);
		expect(items2[0].kind).toBe('list_item');
	});

	test('pfm example 302: different ordered markers create separate lists', () => {
		const input = load_fixture('302');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.ordered).toBe(true);
		expect(children[0].metadata.start).toBe(1);

		expect(children[1].kind).toBe('list');
		expect(children[1].metadata.ordered).toBe(true);
		expect(children[1].metadata.start).toBe(3);

		const items1 = non_breaks(nodes, children[0].index);
		expect(items1.length).toBe(2);

		const items2 = non_breaks(nodes, children[1].index);
		expect(items2.length).toBe(1);
	});

	test('pfm example 303: paragraph followed by unordered list', () => {
		const input = load_fixture('303');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('paragraph');
		expect(children[1].kind).toBe('list');

		const items = non_breaks(nodes, children[1].index);
		expect(items.length).toBe(2);
	});

	test('pfm example 304: "14." does not interrupt paragraph', () => {
		const input = load_fixture('304');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Should be a single paragraph (14. doesn't interrupt)
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');
	});

	test('pfm example 305: "1." interrupts paragraph', () => {
		const input = load_fixture('305');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('paragraph');
		expect(children[1].kind).toBe('list');
		expect(children[1].metadata.ordered).toBe(true);
	});

	test('pfm example 306: blank lines make list loose', () => {
		const input = load_fixture('306');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);

		// Loose list: items should have paragraph wrappers
		const item0_children = non_breaks(nodes, items[0].index);
		expect(item0_children[0].kind).toBe('paragraph');
	});

	test('pfm example 314: blank line between items makes list loose', () => {
		const input = load_fixture('314');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);

		// Loose list: items should have paragraph wrappers
		const item0_children = non_breaks(nodes, items[0].index);
		expect(item0_children[0].kind).toBe('paragraph');
	});

	test('pfm example 315: empty list item', () => {
		const input = load_fixture('315');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);
	});

	// Tests that need nesting support
	test.todo('pfm example 307: nested sub-lists');
	test.todo('pfm example 310: inconsistent indentation (flat list)');
	test.todo('pfm example 311: ordered list with varying indentation');
	test.todo('pfm example 312: indentation limit for list continuation');
	test.todo('pfm example 319: nested list with paragraph continuation');
	test.todo('pfm example 323: nested list (basic)');
	test.todo('pfm example 325: loose nested list');
	test.todo('pfm example 326: two nested lists');

	// Tests that need continuation content
	test.todo('pfm example 316: indented content continuation');
	test.todo('pfm example 317: reference link definition in list item');

	test('pfm example 309: continuation content and list structure', () => {
		const input = load_fixture('309');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// First child should be a single loose list
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(2);
		expect(items[0].kind).toBe('list_item');
		expect(items[1].kind).toBe('list_item');

		// Item 1: two paragraphs (foo, notcode) — continuation content
		const item1_children = non_breaks(nodes, items[0].index);
		expect(item1_children.length).toBe(2);
		expect(item1_children[0].kind).toBe('paragraph');
		expect(item1_children[1].kind).toBe('paragraph');

		const p1_text = non_breaks(nodes, item1_children[0].index);
		expect(get_value(nodes, p1_text[0].index, input)).toBe('foo');
		const p2_text = non_breaks(nodes, item1_children[1].index);
		expect(get_value(nodes, p2_text[0].index, input)).toBe('notcode');

		// Item 2: one paragraph (foo)
		const item2_children = non_breaks(nodes, items[1].index);
		expect(item2_children.length).toBe(1);
		expect(item2_children[0].kind).toBe('paragraph');
	});

	// Tests that need block-level content in items
	test.todo('pfm example 308: HTML comment interrupts list');
	test.todo('pfm example 318: code fence in list item');
	test.todo('pfm example 320: block quote in list item');
	test.todo('pfm example 321: block quote and code fence in list item');
	test.todo('pfm example 324: ordered list with code fence');

	// PFM adjustment needed (no indented code blocks)
	test.todo('pfm example 313: indentation limit (PFM: no indented code)');
});
