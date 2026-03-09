import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { node_buffer } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/block_quotes');

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

describe('Block quotes', () => {
	test('pfm example 228: basic block quote with heading and paragraph', () => {
		const input = load_fixture('228');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[0].metadata.depth).toBe(1);
		expect(get_value(nodes, bq_children[0].index, input)).toBe('Foo');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 229: block quote without space after >', () => {
		const input = load_fixture('229');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 230: leading spaces before >', () => {
		const input = load_fixture('230');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 231: four leading spaces before > (PFM: indentation insignificant)', () => {
		const input = load_fixture('231');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// PFM ignores indentation, so this is still a block quote
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');
	});

	test('pfm example 232: lazy continuation', () => {
		// > # Foo
		// > bar
		// baz
		const input = load_fixture('232');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[1].kind).toBe('paragraph');
		// 'bar' and 'baz' should both be in the paragraph (lazy continuation)
	});

	test('pfm example 233: lazy continuation with > resuming', () => {
		// > bar
		// baz
		// > foo
		const input = load_fixture('233');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');
	});

	test('pfm example 234: thematic break ends block quote', () => {
		// > foo
		// ---
		const input = load_fixture('234');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('thematic_break');
	});

	test.todo('pfm example 235: list item after block quote (depends on lists)');

	test('pfm example 236: lots of whitespace after >', () => {
		// >     foo
		//     bar
		const input = load_fixture('236');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');
	});

	test('pfm example 240: empty block quote lines', () => {
		// >
		// >
		// >
		const input = load_fixture('240');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');
	});

	test('pfm example 241: blank > lines around content', () => {
		// >
		// > foo
		// >
		const input = load_fixture('241');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');
	});

	test('pfm example 242: blank line separates block quotes', () => {
		// > foo
		//
		// > bar
		const input = load_fixture('242');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('block_quote');
	});

	test('pfm example 243: simple continuation', () => {
		// > foo
		// > bar
		const input = load_fixture('243');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');
	});

	test('pfm example 244: blank > line separates paragraphs inside quote', () => {
		// > foo
		// >
		// > bar
		const input = load_fixture('244');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('paragraph');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 245: block quote interrupts paragraph', () => {
		// foo
		// > bar
		const input = load_fixture('245');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('paragraph');
		expect(children[1].kind).toBe('block_quote');
	});

	test('pfm example 246: thematic break between block quotes', () => {
		// > aaa
		// ***
		// > bbb
		const input = load_fixture('246');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(3);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('thematic_break');
		expect(children[2].kind).toBe('block_quote');
	});

	test('pfm example 247: lazy continuation without blank', () => {
		// > bar
		// baz
		const input = load_fixture('247');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');
	});

	test('pfm example 248: blank line after block quote', () => {
		// > bar
		//
		// baz
		const input = load_fixture('248');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');
	});

	test('pfm example 249: > blank line then no > ends quote', () => {
		// > bar
		// >
		// baz
		const input = load_fixture('249');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');
	});

	test('pfm example 250: nested block quotes', () => {
		// > > > foo
		// bar
		const input = load_fixture('250');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		// Should have nested block_quote children
		const bq1_children = non_breaks(nodes, children[0].index);
		expect(bq1_children.length).toBe(1);
		expect(bq1_children[0].kind).toBe('block_quote');

		const bq2_children = non_breaks(nodes, bq1_children[0].index);
		expect(bq2_children.length).toBe(1);
		expect(bq2_children[0].kind).toBe('block_quote');

		const bq3_children = non_breaks(nodes, bq2_children[0].index);
		expect(bq3_children.length).toBe(1);
		expect(bq3_children[0].kind).toBe('paragraph');
	});

	test('pfm example 251: compact nested block quotes (>>>)', () => {
		// >>> foo
		// > bar
		// >>baz
		const input = load_fixture('251');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq1_children = non_breaks(nodes, children[0].index);
		expect(bq1_children.length).toBe(1);
		expect(bq1_children[0].kind).toBe('block_quote');
	});

	test.todo('pfm example 252: indented code inside block quote (depends on indented code)');
});
