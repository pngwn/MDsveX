import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';
import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';
import type { node_buffer } from '../src/utils';
import { get_content, get_all_child_kinds } from './utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const hard_dir = resolve(this_dir, '../../pfm-tests/tests/hard_line_breaks');
const soft_dir = resolve(this_dir, '../../pfm-tests/tests/soft_line_breaks');

const load_hard = (id: string): string =>
	readFileSync(resolve(hard_dir, id, 'input.md'), 'utf8');
const load_soft = (id: string): string =>
	readFileSync(resolve(soft_dir, id, 'input.md'), 'utf8');

function non_breaks(nodes: node_buffer, parent: number = 0) {
	return nodes
		.get_node(parent)
		.children.map((i) => nodes.get_node(i))
		.filter((n) => n.kind !== 'line_break');
}

function get_value(nodes: node_buffer, index: number, source: string) {
	const node = nodes.get_node(index);
	return source.slice(node.value[0], node.value[1]);
}

describe('Hard line breaks (PFM: backslash only)', () => {
	test('634: backslash before newline creates hard_break', () => {
		// foo\<LF>baz
		const input = load_hard('634');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single paragraph with: text("foo") + hard_break + text("baz")
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).toContain('hard_break');

		// Check text content around the break
		const texts = para_children
			.map((i) => nodes.get_node(i))
			.filter((n) => n.kind === 'text');
		expect(get_value(nodes, texts[0].index, input)).toBe('foo');
		expect(get_value(nodes, texts[1].index, input)).toBe('baz');
	});

	test('633: PFM — trailing spaces do NOT create hard break', () => {
		// foo  <LF>baz (2 trailing spaces)
		const input = load_hard('633');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// In PFM, trailing spaces are just text, not a hard break
		// Single paragraph, no hard_break node
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).not.toContain('hard_break');
	});

	test('635: PFM — many trailing spaces do NOT create hard break', () => {
		// foo       <LF>baz
		const input = load_hard('635');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).not.toContain('hard_break');
	});

	test('637: backslash hard break strips leading spaces on next line', () => {
		// foo\<LF>   bar
		const input = load_hard('637');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).toContain('hard_break');

		// "bar" text should not have leading spaces
		const texts = para_children
			.map((i) => nodes.get_node(i))
			.filter((n) => n.kind === 'text');
		const bar_text = get_value(nodes, texts[texts.length - 1].index, input);
		expect(bar_text).toBe('bar');
	});

	test('639: hard break inside emphasis (backslash)', () => {
		// *foo\<LF>bar*
		const input = load_hard('639');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		// The paragraph should contain a strong_emphasis with hard_break inside
		const para_children = nodes
			.get_node(children[0].index)
			.children.map((i) => nodes.get_node(i));

		// Find the strong_emphasis
		const emph = para_children.find((n) => n.kind === 'strong_emphasis');
		expect(emph).toBeDefined();

		if (emph) {
			const emph_children = nodes
				.get_node(emph.index)
				.children.map((i) => nodes.get_node(i));
			const emph_kinds = emph_children.map((n) => n.kind);
			expect(emph_kinds).toContain('hard_break');
		}
	});

	test('644: hard break at end of paragraph is ignored', () => {
		// foo\<LF> (backslash at end, no continuation)
		const input = load_hard('644');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Should still be a paragraph with "foo\" or just "foo"
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');
	});
});

describe('Soft line breaks', () => {
	test('648: plain newline within paragraph is soft break', () => {
		// foo<LF>baz
		const input = load_soft('648');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single paragraph — newline preserved in text content
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		// The paragraph contains text that spans both lines
		// (the newline is within the text content, not a separate node)
	});

	test('649: trailing space + newline is soft break', () => {
		// foo <LF> baz (1 trailing space, leading space on next line)
		const input = load_soft('649');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');
	});
});
