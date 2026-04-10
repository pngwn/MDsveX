import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { NodeKind } from '../src/utils';

describe('frontmatter', () => {
	test('basic frontmatter with content after', () => {
		const input = '---\ntitle: hello\n---\n\n# Hello';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(fm.start).toBe(0);
		expect(fm.end).toBe(21); // includes trailing \n after closing ---
		expect(input.slice(fm.value[0], fm.value[1])).toBe('title: hello\n');
	});

	test('frontmatter value excludes fences', () => {
		const input = '---\nfoo: bar\nbaz: qux\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(input.slice(fm.value[0], fm.value[1])).toBe('foo: bar\nbaz: qux\n');
	});

	test('frontmatter with empty content', () => {
		const input = '---\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(fm.start).toBe(0);
		expect(fm.end).toBe(8);
		expect(input.slice(fm.value[0], fm.value[1])).toBe('');
	});

	test('frontmatter must start on first line', () => {
		const input = '\n---\ntitle: hello\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		// Should NOT be parsed as frontmatter, the first node should be
		// a line_break or thematic_break, not frontmatter
		const first = nodes.get_node(1);
		expect(first.kind).not.toBe('frontmatter');
	});

	test('--- in middle of document is thematic break', () => {
		const input = '# Title\n\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const kinds: string[] = [];
		for (let i = 1; i < nodes.size; i++) {
			kinds.push(nodes.get_node(i).kind);
		}
		expect(kinds).not.toContain('frontmatter');
		expect(kinds).toContain('thematic_break');
	});

	test('frontmatter closes on \\n--- regardless of yaml content', () => {
		const input = '---\nblock: |\n  line1\n  line2\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(input.slice(fm.value[0], fm.value[1])).toBe(
			'block: |\n  line1\n  line2\n'
		);
	});

	test('frontmatter followed by markdown content', () => {
		const input = '---\ntitle: test\n---\n\nSome paragraph.';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');

		// Find the paragraph
		const kinds: string[] = [];
		for (let i = 1; i < nodes.size; i++) {
			kinds.push(nodes.get_node(i).kind);
		}
		expect(kinds).toContain('paragraph');
	});

	test('frontmatter at EOF without closing fence is not frontmatter', () => {
		const input = '---\ntitle: hello\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const children = root.children.map((i) => nodes.get_node(i));
		const kinds = children.map((n) => n.kind);
		expect(kinds).not.toContain('frontmatter');
	});

	test('--- followed by non-newline is not frontmatter', () => {
		const input = '---foo\n';
		const { nodes } = parse_markdown_svelte(input);

		const first = nodes.get_node(1);
		expect(first.kind).not.toBe('frontmatter');
	});

	test('closing --- with trailing content is not a valid close', () => {
		const input = '---\ntitle: hello\n---extra\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		// The value should include everything up to the real closing ---
		expect(input.slice(fm.value[0], fm.value[1])).toBe(
			'title: hello\n---extra\n'
		);
	});

	test('frontmatter NodeKind is findable', () => {
		const input = '---\nk: v\n---\n';
		const { nodes } = parse_markdown_svelte(input);

		const fms = nodes.get_kinds(NodeKind.frontmatter);
		expect(fms.length).toBe(1);
	});

	test('frontmatter at EOF (no trailing newline after closing fence)', () => {
		const input = '---\nk: v\n---';
		const { nodes } = parse_markdown_svelte(input);

		const fm = nodes.get_node(1);
		expect(fm.kind).toBe('frontmatter');
		expect(fm.end).toBe(12);
		expect(input.slice(fm.value[0], fm.value[1])).toBe('k: v\n');
	});
});
