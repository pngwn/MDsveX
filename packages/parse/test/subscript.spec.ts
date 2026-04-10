import { describe, test, expect } from 'vitest';
import { parse_markdown_svelte } from '../src/main';
import type { NodeBuffer } from '../src/utils';
import { get_all_child_kinds } from './utils';

function non_breaks(nodes: NodeBuffer, parent: number = 0) {
	return nodes
		.get_node(parent)
		.children.map((i) => nodes.get_node(i))
		.filter((n) => n.kind !== 'line_break');
}

function get_value(nodes: NodeBuffer, index: number, source: string) {
	const node = nodes.get_node(index);
	return source.slice(node.value[0], node.value[1]);
}

describe('Subscript (~)', () => {
	test('basic subscript', () => {
		const input = '~sub~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes
			.get_node(children[0].index)
			.children.map((i) => nodes.get_node(i));
		expect(para_children.length).toBe(1);
		expect(para_children[0].kind).toBe('subscript');

		const sub_children = nodes
			.get_node(para_children[0].index)
			.children.map((i) => nodes.get_node(i));
		expect(sub_children.length).toBe(1);
		expect(sub_children[0].kind).toBe('text');
		expect(get_value(nodes, sub_children[0].index, input)).toBe('sub');
	});

	test('subscript in context: H~2~O', () => {
		const input = 'H~2~O\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).toContain('text');
		expect(kinds).toContain('subscript');
	});

	test('unclosed subscript becomes text', () => {
		const input = '~unclosed\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).not.toContain('subscript');
		expect(kinds).toContain('text');
	});

	test('subscript with number', () => {
		const input = 'x~1~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).toContain('subscript');

		const sub = nodes
			.get_node(para.index)
			.children.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'subscript')!;
		const sub_children = nodes
			.get_node(sub.index)
			.children.map((i) => nodes.get_node(i));
		expect(get_value(nodes, sub_children[0].index, input)).toBe('1');
	});

	test('double tilde is still strikethrough, not subscript', () => {
		const input = '~~deleted~~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).toContain('strikethrough');
		expect(kinds).not.toContain('subscript');
	});

	test('multiple subscripts', () => {
		const input = 'x~1~ + y~2~\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const sub_count = get_all_child_kinds(nodes, para.index).filter(
			(k) => k === 'subscript',
		).length;
		expect(sub_count).toBe(2);
	});

	test('subscript inside emphasis', () => {
		const input = '_H~2~O_\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const para_kinds = get_all_child_kinds(nodes, para.index);
		expect(para_kinds).toContain('emphasis');

		const emph = nodes
			.get_node(para.index)
			.children.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'emphasis')!;
		const emph_kinds = get_all_child_kinds(nodes, emph.index);
		expect(emph_kinds).toContain('subscript');
	});

	test('subscript and superscript together', () => {
		const input = 'x~i~^2^\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).toContain('subscript');
		expect(kinds).toContain('superscript');
	});
});
