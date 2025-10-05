import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/paragraphs');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8').trimEnd();

describe('paragraphs', () => {
	test('pfm example 219 two paragraphs', () => {
		const input = load_fixture('219');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_node_1 = nodes.get_node(root.children[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);
		const p_node_2 = nodes.get_node(root.children[1]);
		const t_node_2 = nodes.get_node(p_node_2.children[0]);

		expect(nodes.size).toBe(5);

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

		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const t_kinds = nodes.get_kinds(node_kind.text);
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

		const p_node_1 = nodes.get_node(root.children[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);
		const p_node_2 = nodes.get_node(root.children[1]);
		const t_node_2 = nodes.get_node(p_node_2.children[0]);

		expect(nodes.size).toBe(5);

		expect(p_node_1.kind).toBe('paragraph');
		expect(p_node_2.kind).toBe('paragraph');
		expect(t_node_1.kind).toBe('text');
		expect(t_node_2.kind).toBe('text');

		expect(input.slice(p_node_1.start, p_node_1.end)).toBe('aaa\nbbb');
		expect(p_node_1.start).toBe(0);
		expect(t_node_1.end).toBe(7);
		expect(input.slice(p_node_2.start, p_node_2.end)).toBe('ccc\nddd');
		expect(p_node_2.start).toBe(9);
		expect(t_node_2.end).toBe(16);

		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const t_kinds = nodes.get_kinds(node_kind.text);
		expect(p_kinds.length).toBe(2);
		expect(t_kinds.length).toBe(2);

		expect(input.slice(t_node_1.value[0], t_node_1.value[1])).toEqual(
			`aaa\nbbb`
		);
		expect(t_node_1.value).toEqual([0, 7]);

		expect(input.slice(t_node_2.value[0], t_node_2.value[1])).toEqual(
			`ccc\nddd`
		);

		expect(t_node_2.value).toEqual([9, 16]);
	});

	test('pfm example 221 two paragraphs with space', () => {
		const input = load_fixture('221');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_node_1 = nodes.get_node(root.children[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);
		const p_node_2 = nodes.get_node(root.children[1]);
		const t_node_2 = nodes.get_node(p_node_2.children[0]);

		expect(nodes.size).toBe(5);

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

		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const t_kinds = nodes.get_kinds(node_kind.text);
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
		const t_node_1 = nodes.get_node(p_node_1.children[0]);

		expect(nodes.size).toBe(3);

		expect(p_node_1.kind).toBe('paragraph');
		expect(t_node_1.kind).toBe('text');

		expect(input.slice(p_node_1.start, p_node_1.end)).toBe('aaa\n bbb');
		expect(p_node_1.start).toBe(2);
		expect(t_node_1.end).toBe(10);

		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const t_kinds = nodes.get_kinds(node_kind.text);
		expect(p_kinds.length).toBe(1);
		expect(t_kinds.length).toBe(1);

		expect(input.slice(t_node_1.value[0], t_node_1.value[1])).toEqual(
			`aaa\n bbb`
		);
		expect(t_node_1.value).toEqual([2, 10]);
	});

	test('pfm example 223 only one paragraph with spaces', () => {
		const input = load_fixture('223');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const p_node_1 = nodes.get_node(root.children[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);
		expect(nodes.size).toBe(3);

		expect(p_node_1.kind).toBe('paragraph');
		expect(t_node_1.kind).toBe('text');

		expect(input.slice(p_node_1.start, p_node_1.end)).toBe(`aaa
             bbb
                                       ccc`);
		expect(p_node_1.start).toBe(0);
		expect(t_node_1.end).toBe(63);

		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const t_kinds = nodes.get_kinds(node_kind.text);
		expect(p_kinds.length).toBe(1);
		expect(t_kinds.length).toBe(1);

		expect(input.slice(t_node_1.value[0], t_node_1.value[1])).toEqual(
			`aaa
             bbb
                                       ccc`
		);
		expect(t_node_1.value).toEqual([0, 63]);
	});

	test('pfm example 224 only one paragraph with leading spaces', () => {
		const input = load_fixture('224');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_node_1 = nodes.get_node(root.children[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);

		expect(nodes.size).toBe(3);

		expect(p_node_1.kind).toBe('paragraph');
		expect(t_node_1.kind).toBe('text');

		expect(input.slice(p_node_1.start, p_node_1.end)).toBe(`aaa\nbbb`);
		expect(p_node_1.start).toBe(3);
		expect(t_node_1.end).toBe(10);

		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const t_kinds = nodes.get_kinds(node_kind.text);
		expect(p_kinds.length).toBe(1);
		expect(t_kinds.length).toBe(1);

		expect(input.slice(t_node_1.value[0], t_node_1.value[1])).toEqual(
			`aaa\nbbb`
		);
		expect(t_node_1.value).toEqual([3, 10]);
	});

	test('pfm example 225 only one paragraph with leading spaces', () => {
		const input = load_fixture('225');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const p_node_1 = nodes.get_node(root.children[0]);
		const t_node_1 = nodes.get_node(p_node_1.children[0]);

		expect(nodes.size).toBe(3);

		expect(p_node_1.kind).toBe('paragraph');
		expect(t_node_1.kind).toBe('text');

		expect(input.slice(p_node_1.start, p_node_1.end)).toBe(`aaa\nbbb`);
		expect(p_node_1.start).toBe(4);
		expect(t_node_1.end).toBe(11);

		const p_kinds = nodes.get_kinds(node_kind.paragraph);
		const t_kinds = nodes.get_kinds(node_kind.text);
		expect(p_kinds.length).toBe(1);
		expect(t_kinds.length).toBe(1);

		expect(input.slice(t_node_1.value[0], t_node_1.value[1])).toEqual(
			`aaa\nbbb`
		);
		expect(t_node_1.value).toEqual([4, 11]);
	});
});
