import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { node_buffer } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, 'fixtures/pfm/lists');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8');

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

	test('pfm example 307: nested sub-lists', () => {
		const input = load_fixture('307');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single outer list (tight)
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(true);

		const outer_items = non_breaks(nodes, children[0].index);
		expect(outer_items.length).toBe(1);
		expect(outer_items[0].kind).toBe('list_item');

		// Outer item: text("foo") + nested list
		const outer_item_children = non_breaks(nodes, outer_items[0].index);
		expect(outer_item_children.length).toBe(2);
		expect(outer_item_children[0].kind).toBe('text');
		expect(get_value(nodes, outer_item_children[0].index, input)).toBe('foo');
		expect(outer_item_children[1].kind).toBe('list');
		expect(outer_item_children[1].metadata.tight).toBe(true);

		// Middle list: one item with text("bar") + nested list
		const mid_items = non_breaks(nodes, outer_item_children[1].index);
		expect(mid_items.length).toBe(1);
		const mid_item_children = non_breaks(nodes, mid_items[0].index);
		expect(mid_item_children.length).toBe(2);
		expect(mid_item_children[0].kind).toBe('text');
		expect(get_value(nodes, mid_item_children[0].index, input)).toBe('bar');
		expect(mid_item_children[1].kind).toBe('list');
		expect(mid_item_children[1].metadata.tight).toBe(false);

		// Inner list (loose): one item with paragraph("baz") + paragraph("bim")
		const inner_items = non_breaks(nodes, mid_item_children[1].index);
		expect(inner_items.length).toBe(1);
		const inner_item_children = non_breaks(nodes, inner_items[0].index);
		expect(inner_item_children.length).toBe(2);
		expect(inner_item_children[0].kind).toBe('paragraph');
		expect(inner_item_children[1].kind).toBe('paragraph');

		const baz_text = non_breaks(nodes, inner_item_children[0].index);
		expect(get_value(nodes, baz_text[0].index, input)).toBe('baz');
		const bim_text = non_breaks(nodes, inner_item_children[1].index);
		expect(get_value(nodes, bim_text[0].index, input)).toBe('bim');
	});

	test('pfm example 323: nested list (basic)', () => {
		const input = load_fixture('323');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(true);

		const outer_items = non_breaks(nodes, children[0].index);
		expect(outer_items.length).toBe(1);

		// Item: text("a") + nested list
		const item_children = non_breaks(nodes, outer_items[0].index);
		expect(item_children.length).toBe(2);
		expect(item_children[0].kind).toBe('text');
		expect(get_value(nodes, item_children[0].index, input)).toBe('a');
		expect(item_children[1].kind).toBe('list');
		expect(item_children[1].metadata.tight).toBe(true);

		const inner_items = non_breaks(nodes, item_children[1].index);
		expect(inner_items.length).toBe(1);
		const inner_item_children = non_breaks(nodes, inner_items[0].index);
		expect(inner_item_children[0].kind).toBe('text');
		expect(get_value(nodes, inner_item_children[0].index, input)).toBe('b');
	});

	test('pfm example 325: loose nested list', () => {
		const input = load_fixture('325');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(1);

		// Item: paragraph("foo") + nested list + paragraph("baz")
		const item_children = non_breaks(nodes, items[0].index);
		expect(item_children.length).toBe(3);
		expect(item_children[0].kind).toBe('paragraph');
		expect(item_children[1].kind).toBe('list');
		expect(item_children[1].metadata.tight).toBe(true);
		expect(item_children[2].kind).toBe('paragraph');

		// Nested list has one tight item: text("bar")
		const inner_items = non_breaks(nodes, item_children[1].index);
		expect(inner_items.length).toBe(1);
		const inner_children = non_breaks(nodes, inner_items[0].index);
		expect(inner_children[0].kind).toBe('text');
		expect(get_value(nodes, inner_children[0].index, input)).toBe('bar');
	});

	test('pfm example 326: two nested lists', () => {
		const input = load_fixture('326');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(2);

		// Item 1: paragraph("a") + nested list(b, c)
		const item1_children = non_breaks(nodes, items[0].index);
		expect(item1_children[0].kind).toBe('paragraph');
		expect(item1_children[1].kind).toBe('list');
		const nested1_items = non_breaks(nodes, item1_children[1].index);
		expect(nested1_items.length).toBe(2);

		// Item 2: paragraph("d") + nested list(e, f)
		const item2_children = non_breaks(nodes, items[1].index);
		expect(item2_children[0].kind).toBe('paragraph');
		expect(item2_children[1].kind).toBe('list');
		const nested2_items = non_breaks(nodes, item2_children[1].index);
		expect(nested2_items.length).toBe(2);
	});

	test('pfm example 310: inconsistent indentation (flat list)', () => {
		const input = load_fixture('310');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// All markers at indent 0-3 should be siblings in a single flat list
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(true);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(7);
		expect(items.every((i) => i.kind === 'list_item')).toBe(true);

		// Check values: a, b, c, d, e, f, g
		const values = items.map((i) => {
			const c = non_breaks(nodes, i.index);
			return get_value(nodes, c[0].index, input);
		});
		expect(values).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
	});

	test('pfm example 311: ordered list with varying indentation', () => {
		const input = load_fixture('311');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single ordered list with 3 loose items
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.ordered).toBe(true);
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);

		// Loose: items have paragraph wrappers
		for (const item of items) {
			const ic = non_breaks(nodes, item.index);
			expect(ic[0].kind).toBe('paragraph');
		}
	});

	test('pfm example 312: indentation limit for list continuation (PFM: no indented code)', () => {
		const input = load_fixture('312');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// PFM: no indented code blocks, so all items are in a flat list
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(true);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(5);
		expect(items.every((i) => i.kind === 'list_item')).toBe(true);
	});
	test('pfm example 319: nested list with paragraph continuation', () => {
		const input = load_fixture('319');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Outer list (tight, only the nested list is loose)
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(true);

		const outer_items = non_breaks(nodes, children[0].index);
		expect(outer_items.length).toBe(2);

		// Item 1: text("a") + nested list
		const item1_children = non_breaks(nodes, outer_items[0].index);
		expect(item1_children[0].kind).toBe('text');
		expect(get_value(nodes, item1_children[0].index, input)).toBe('a');
		expect(item1_children[1].kind).toBe('list');
		expect(item1_children[1].metadata.tight).toBe(false);

		// Nested list: one loose item with paragraph("b") + paragraph("c")
		const nested_items = non_breaks(nodes, item1_children[1].index);
		expect(nested_items.length).toBe(1);
		const nested_children = non_breaks(nodes, nested_items[0].index);
		expect(nested_children.length).toBe(2);
		expect(nested_children[0].kind).toBe('paragraph');
		expect(nested_children[1].kind).toBe('paragraph');
		const b_text = non_breaks(nodes, nested_children[0].index);
		expect(get_value(nodes, b_text[0].index, input)).toBe('b');
		const c_text = non_breaks(nodes, nested_children[1].index);
		expect(get_value(nodes, c_text[0].index, input)).toBe('c');

		// Item 2: text("d")
		const item2_children = non_breaks(nodes, outer_items[1].index);
		expect(item2_children[0].kind).toBe('text');
		expect(get_value(nodes, item2_children[0].index, input)).toBe('d');
	});

	test('pfm example 316: indented content continuation', () => {
		const input = load_fixture('316');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single loose list
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);

		// Item 1: paragraph("a")
		const item1_children = non_breaks(nodes, items[0].index);
		expect(item1_children.length).toBe(1);
		expect(item1_children[0].kind).toBe('paragraph');

		// Item 2: paragraph("b") + paragraph("c")
		const item2_children = non_breaks(nodes, items[1].index);
		expect(item2_children.length).toBe(2);
		expect(item2_children[0].kind).toBe('paragraph');
		expect(item2_children[1].kind).toBe('paragraph');
		const b_text = non_breaks(nodes, item2_children[0].index);
		expect(get_value(nodes, b_text[0].index, input)).toBe('b');
		const c_text = non_breaks(nodes, item2_children[1].index);
		expect(get_value(nodes, c_text[0].index, input)).toBe('c');

		// Item 3: paragraph("d")
		const item3_children = non_breaks(nodes, items[2].index);
		expect(item3_children.length).toBe(1);
		expect(item3_children[0].kind).toBe('paragraph');
	});
	test('pfm example 317: reference link definition in list item', () => {
		const input = load_fixture('317');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Loose list with 3 items (a, b, d), ref def is consumed
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);
	});

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

		// Item 1: two paragraphs (foo, notcode), continuation content
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

	// HTML comment interrupts list, creating two separate lists
	test('pfm example 308: HTML comment interrupts list', () => {
		const input = load_fixture('308');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Two separate lists with html_comment between them
		const lists = children.filter((n) => n.kind === 'list');
		expect(lists.length).toBe(2);

		const comment = children.find((n) => n.kind === 'html_comment');
		expect(comment).toBeDefined();

		// First list: foo, bar
		const items1 = non_breaks(nodes, lists[0].index);
		expect(items1.length).toBe(2);

		// Second list: baz, bim
		const items2 = non_breaks(nodes, lists[1].index);
		expect(items2.length).toBe(2);
	});
	test('pfm example 318: code fence in list item', () => {
		const input = load_fixture('318');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Expected: 3-item tight list (a, code_fence, c)
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);
		expect(items[0].kind).toBe('list_item');
		expect(items[1].kind).toBe('list_item');
		expect(items[2].kind).toBe('list_item');

		// Item 2 has a code fence
		const item2_children = non_breaks(nodes, items[1].index);
		expect(item2_children[0].kind).toBe('code_fence');
	});
	test('pfm example 320: block quote in list item', () => {
		const input = load_fixture('320');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single list with 2 items
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(2);

		// Item 1: text("a") + block_quote containing paragraph("b")
		const item1_children = non_breaks(nodes, items[0].index);
		expect(item1_children.length).toBe(2);
		expect(item1_children[0].kind).toBe('text');
		expect(item1_children[1].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, item1_children[1].index);
		expect(bq_children[0].kind).toBe('paragraph');

		// Item 2: text("c")
		const item2_children = non_breaks(nodes, items[1].index);
		expect(item2_children[0].kind).toBe('text');
		expect(get_value(nodes, item2_children[0].index, input)).toBe('c');
	});

	// TODO: block quote inside list item eats subsequent code fence, block quote/fence interaction bug
	test.todo('pfm example 321: block quote and code fence in list item');
	test('pfm example 324: ordered list with code fence', () => {
		const input = load_fixture('324');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.ordered).toBe(true);
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(1);

		// Item: code_fence + paragraph("bar")
		const item_children = non_breaks(nodes, items[0].index);
		expect(item_children.length).toBe(2);
		expect(item_children[0].kind).toBe('code_fence');
		expect(item_children[1].kind).toBe('paragraph');

		const bar_text = non_breaks(nodes, item_children[1].index);
		expect(get_value(nodes, bar_text[0].index, input)).toBe('bar');
	});

	test('pfm example 313: indentation limit (PFM: no indented code)', () => {
		const input = load_fixture('313');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// PFM: no indented code, so all 3 items in a single loose ordered list
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('list');
		expect(children[0].metadata.ordered).toBe(true);
		expect(children[0].metadata.tight).toBe(false);

		const items = non_breaks(nodes, children[0].index);
		expect(items.length).toBe(3);
	});
});
