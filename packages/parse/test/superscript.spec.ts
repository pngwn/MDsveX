import { describe, test, expect } from 'vitest';
import { parse_markdown_svelte } from '../src/main';
import { NodeKind } from '../src/utils';
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

describe('Superscript (^)', () => {
	test('basic superscript', () => {
		const input = '^TM^\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes
			.get_node(children[0].index)
			.children.map((i) => nodes.get_node(i));
		expect(para_children.length).toBe(1);
		expect(para_children[0].kind).toBe('superscript');

		const sup_children = nodes
			.get_node(para_children[0].index)
			.children.map((i) => nodes.get_node(i));
		expect(sup_children.length).toBe(1);
		expect(sup_children[0].kind).toBe('text');
		expect(get_value(nodes, sup_children[0].index, input)).toBe('TM');
	});

	test('superscript in context: Coming Soon ^TM^', () => {
		const input = 'Coming Soon ^TM^\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).toContain('text');
		expect(kinds).toContain('superscript');
	});

	test('unclosed superscript becomes text', () => {
		const input = '^unclosed\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).not.toContain('superscript');
		expect(kinds).toContain('text');
	});

	test('superscript with number', () => {
		const input = 'x^2^\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).toContain('superscript');

		const sup = nodes
			.get_node(para.index)
			.children.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'superscript')!;
		const sup_children = nodes
			.get_node(sup.index)
			.children.map((i) => nodes.get_node(i));
		expect(get_value(nodes, sup_children[0].index, input)).toBe('2');
	});

	test('caret must have left-flanking open', () => {
		// ^ after a word char is not an opener
		const input = 'foo^ bar^\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const kinds = get_all_child_kinds(nodes, para.index);
		expect(kinds).not.toContain('superscript');
	});

	test('multiple superscripts', () => {
		const input = 'x^2^ + y^3^\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const sup_count = get_all_child_kinds(nodes, para.index).filter(
			(k) => k === 'superscript',
		).length;
		expect(sup_count).toBe(2);
	});

	test('superscript inside emphasis', () => {
		const input = '*x^2^*\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const para_kinds = get_all_child_kinds(nodes, para.index);
		expect(para_kinds).toContain('strong_emphasis');

		const emph = nodes
			.get_node(para.index)
			.children.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'strong_emphasis')!;
		const emph_kinds = get_all_child_kinds(nodes, emph.index);
		expect(emph_kinds).toContain('superscript');
	});

	test('superscript inside emphasis (with space)', () => {
		const input = '*x ^2^*\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		const para = children[0];
		const para_kinds = get_all_child_kinds(nodes, para.index);
		expect(para_kinds).toContain('strong_emphasis');

		const emph = nodes
			.get_node(para.index)
			.children.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'strong_emphasis')!;
		const emph_kinds = get_all_child_kinds(nodes, emph.index);
		expect(emph_kinds).toContain('superscript');
	});
});
