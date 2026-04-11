import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { NodeKind } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, 'fixtures/pfm/paragraphs');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8').trimEnd();

describe('paragraphs', () => {
	test('pfm example 219 two paragraphs', () => {
		const input = load_fixture('219');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_kinds = nodes.get_kinds(NodeKind.paragraph);
		const p_node_1 = nodes.get_node(p_kinds[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);
		const p_node_2 = nodes.get_node(p_kinds[1]);
		const t_node_2 = nodes.get_node(p_node_2.children[0]);

		// root(1) + paragraph(2) + text(2) + line_break(2) = 7
		expect(nodes.size).toBe(7);

		expect(p_node_1.kind).toBe('paragraph');
		expect(p_node_2.kind).toBe('paragraph');
		expect(t_node_1.kind).toBe('text');
		expect(t_node_2.kind).toBe('text');

		expect(input.slice(p_node_1.start, p_node_1.end)).toBe('aaa');
		expect(p_node_1.start).toBe(0);
		expect(t_node_1.end).toBe(3);
		expect(input.slice(p_node_2.start, p_node_2.end)).toBe('bbb');
		expect(p_node_2.start).toBe(5);
		expect(t_node_2.end).toBe(8);

		const t_kinds = nodes.get_kinds(NodeKind.text);
		expect(p_kinds.length).toBe(2);
		expect(t_kinds.length).toBe(2);

		expect(input.slice(t_node_1.value[0], t_node_1.value[1])).toEqual(`aaa`);
		expect(t_node_1.value).toEqual([0, 3]);

		expect(input.slice(t_node_2.value[0], t_node_2.value[1])).toEqual(`bbb`);

		expect(t_node_2.value).toEqual([5, 8]);
	});

	test('pfm example 220 two multiline paragraphs', () => {
		const input = load_fixture('220');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_kinds = nodes.get_kinds(NodeKind.paragraph);
		const p_node_1 = nodes.get_node(p_kinds[0]);
		const p_node_2 = nodes.get_node(p_kinds[1]);

		// Each multiline paragraph now has: text + soft_break + text
		// root(1) + paragraph(2) + text(4) + soft_break(2) + line_break(2) = 11
		expect(nodes.size).toBe(11);

		expect(p_node_1.kind).toBe('paragraph');
		expect(p_node_2.kind).toBe('paragraph');

		// Paragraph 1: text "aaa" + soft_break + text "bbb"
		const p1_children = p_node_1.children.map((i: number) => nodes.get_node(i));
		expect(p1_children[0].kind).toBe('text');
		expect(p1_children[1].kind).toBe('soft_break');
		expect(p1_children[2].kind).toBe('text');
		expect(input.slice(p1_children[0].value[0], p1_children[0].value[1])).toBe('aaa');
		expect(input.slice(p1_children[2].value[0], p1_children[2].value[1])).toBe('bbb');

		// Paragraph 2: text "ccc" + soft_break + text "ddd"
		const p2_children = p_node_2.children.map((i: number) => nodes.get_node(i));
		expect(p2_children[0].kind).toBe('text');
		expect(p2_children[1].kind).toBe('soft_break');
		expect(p2_children[2].kind).toBe('text');
		expect(input.slice(p2_children[0].value[0], p2_children[0].value[1])).toBe('ccc');
		expect(input.slice(p2_children[2].value[0], p2_children[2].value[1])).toBe('ddd');
	});

	test('pfm example 221 two paragraphs with space', () => {
		const input = load_fixture('221');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_kinds = nodes.get_kinds(NodeKind.paragraph);
		const p_node_1 = nodes.get_node(p_kinds[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);
		const p_node_2 = nodes.get_node(p_kinds[1]);
		const t_node_2 = nodes.get_node(p_node_2.children[0]);

		// root(1) + paragraph(2) + text(2) + line_break(3) = 8
		expect(nodes.size).toBe(8);

		expect(p_node_1.kind).toBe('paragraph');
		expect(p_node_2.kind).toBe('paragraph');
		expect(t_node_1.kind).toBe('text');
		expect(t_node_2.kind).toBe('text');

		expect(input.slice(p_node_1.start, p_node_1.end)).toBe('aaa');
		expect(p_node_1.start).toBe(0);
		expect(t_node_1.end).toBe(3);
		expect(input.slice(p_node_2.start, p_node_2.end)).toBe('bbb');
		expect(p_node_2.start).toBe(6);
		expect(t_node_2.end).toBe(9);

		const t_kinds = nodes.get_kinds(NodeKind.text);
		expect(p_kinds.length).toBe(2);
		expect(t_kinds.length).toBe(2);

		expect(input.slice(t_node_1.value[0], t_node_1.value[1])).toEqual(`aaa`);
		expect(t_node_1.value).toEqual([0, 3]);

		expect(input.slice(t_node_2.value[0], t_node_2.value[1])).toEqual(`bbb`);

		expect(t_node_2.value).toEqual([6, 9]);
	});

	test('pfm example 222 only one paragraph with spaces', () => {
		const input = load_fixture('222');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_node_1 = nodes.get_node(root.children[0]);

		// paragraph has: text "aaa" + soft_break + text "bbb"
		// root(1) + paragraph(1) + text(2) + soft_break(1) = 5
		expect(nodes.size).toBe(5);
		expect(p_node_1.kind).toBe('paragraph');

		const children = p_node_1.children.map((i: number) => nodes.get_node(i));
		expect(children[0].kind).toBe('text');
		expect(children[1].kind).toBe('soft_break');
		expect(children[2].kind).toBe('text');
		expect(input.slice(children[0].value[0], children[0].value[1])).toBe('aaa');
		expect(input.slice(children[2].value[0], children[2].value[1])).toBe('bbb');
	});

	test('pfm example 223 only one paragraph with spaces', () => {
		const input = load_fixture('223');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const p_node_1 = nodes.get_node(root.children[0]);

		// paragraph has: text "aaa" + soft_break + text "bbb..." + soft_break + text "ccc"
		// root(1) + paragraph(1) + text(3) + soft_break(2) = 7
		expect(nodes.size).toBe(7);
		expect(p_node_1.kind).toBe('paragraph');

		const children = p_node_1.children.map((i: number) => nodes.get_node(i));
		expect(children[0].kind).toBe('text');
		expect(children[1].kind).toBe('soft_break');
		expect(children[2].kind).toBe('text');
		expect(children[3].kind).toBe('soft_break');
		expect(children[4].kind).toBe('text');
	});

	test('pfm example 224 only one paragraph with leading spaces', () => {
		const input = load_fixture('224');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_node_1 = nodes.get_node(root.children[0]);

		// paragraph has: text "aaa" + soft_break + text "bbb"
		// root(1) + paragraph(1) + text(2) + soft_break(1) = 5
		expect(nodes.size).toBe(5);
		expect(p_node_1.kind).toBe('paragraph');

		const children = p_node_1.children.map((i: number) => nodes.get_node(i));
		expect(children[0].kind).toBe('text');
		expect(children[1].kind).toBe('soft_break');
		expect(children[2].kind).toBe('text');
		expect(input.slice(children[0].value[0], children[0].value[1])).toBe('aaa');
		expect(input.slice(children[2].value[0], children[2].value[1])).toBe('bbb');
	});

	test('pfm example 225 only one paragraph with leading spaces', () => {
		const input = load_fixture('225');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_node_1 = nodes.get_node(root.children[0]);

		// paragraph has: text "aaa" + soft_break + text "bbb"
		// root(1) + paragraph(1) + text(2) + soft_break(1) = 5
		expect(nodes.size).toBe(5);
		expect(p_node_1.kind).toBe('paragraph');

		const children = p_node_1.children.map((i: number) => nodes.get_node(i));
		expect(children[0].kind).toBe('text');
		expect(children[1].kind).toBe('soft_break');
		expect(children[2].kind).toBe('text');
		expect(input.slice(children[0].value[0], children[0].value[1])).toBe('aaa');
		expect(input.slice(children[2].value[0], children[2].value[1])).toBe('bbb');
	});
});
