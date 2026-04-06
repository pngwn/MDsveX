import { describe, test, expect } from 'vitest';
import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';
import type { node_buffer } from '../src/utils';
import { get_content, get_all_child_kinds } from './utils';

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

describe('Strikethrough (~~)', () => {
	test('basic strikethrough', () => {
		const input = '~~word~~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes
			.get_node(children[0].index)
			.children.map((i) => nodes.get_node(i));
		expect(para_children.length).toBe(1);
		expect(para_children[0].kind).toBe('strikethrough');

		const st_children = nodes
			.get_node(para_children[0].index)
			.children.map((i) => nodes.get_node(i));
		expect(st_children.length).toBe(1);
		expect(st_children[0].kind).toBe('text');
		expect(get_value(nodes, st_children[0].index, input)).toBe('word');
	});

	test('strikethrough in sentence', () => {
		const input = 'hello ~~world~~ end\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		const para = children[0];

		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).toContain('strikethrough');
		expect(kinds).toContain('text');
	});

	test('single tilde is not strikethrough', () => {
		const input = '~word~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single tilde should be text, not strikethrough
		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).not.toContain('strikethrough');
	});

	test('unclosed strikethrough becomes text', () => {
		const input = '~~unclosed\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).not.toContain('strikethrough');
		// Should be revoked to text
		expect(kinds).toContain('text');
	});

	test('strikethrough with emphasis inside', () => {
		const input = '~~_emphasized_ and *strong*~~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const para_kinds = get_all_child_kinds(nodes, para.index);
		expect(para_kinds).toContain('strikethrough');

		const st = nodes
			.get_node(para.index)
			.children.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'strikethrough')!;
		const st_kinds = get_all_child_kinds(nodes, st.index);
		expect(st_kinds).toContain('emphasis');
		expect(st_kinds).toContain('strong_emphasis');
	});

	test('strikethrough with multiple words', () => {
		const input = '~~multiple words here~~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const para_kinds = get_all_child_kinds(nodes, para.index);
		expect(para_kinds).toContain('strikethrough');
	});

	test('strikethrough must have left-flanking open', () => {
		// ~~ after a word char is not an opener
		const input = 'foo~~ bar~~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const para_kinds = get_all_child_kinds(nodes, para.index);
		expect(para_kinds).not.toContain('strikethrough');
	});
});
