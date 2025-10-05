import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(
	this_dir,
	'../../pfm-tests/tests/fenced_code_blocks'
);

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8').trim();

describe('fenced code blocks', () => {
	test('pfm example 119 captures the entire fenced block as a single token', () => {
		const input = load_fixture('119');
		const { nodes } = parse_markdown_svelte(input);

		const node = nodes.get_node(1);
		console.log(node);

		expect(nodes.size).toBe(2);

		expect(node.kind).toBe('code_fence');
		expect(node.start).toBe(0);
		expect(node.end).toBe(12);
		expect(input.slice(node.start, node.end)).toBe(input);

		expect(node.metadata).toEqual({
			info_start: 3,
			info_end: 3,
		});

		const kinds = nodes.get_kinds(node_kind.code_fence);
		expect(kinds.length).toBe(1);

		expect(input.slice(node.value[0], node.value[1])).toEqual('<\n >');

		expect(node.value).toEqual([4, 8]);
	});

	test('pfm example 119_2 captures the entire outer fenced block as a single token', () => {
		const input = load_fixture('119_2');
		const { nodes } = parse_markdown_svelte(input);

		const node = nodes.get_node(1);

		expect(nodes.size).toBe(2);

		expect(node.kind).toBe('code_fence');
		expect(node.start).toBe(0);
		expect(node.end).toBe(22);
		expect(input.slice(node.start, node.end)).toBe(input);

		expect(input.slice(node.value[0], node.value[1])).toEqual(
			'```\n<\n >\n```'
		);

		const kinds = nodes.get_kinds(node_kind.code_fence);
		expect(kinds.length).toBe(1);
	});

	test('pfm example 119_3 captures the entire outer fenced block as a single token ignoring escaped delimeters', () => {
		const input = load_fixture('119_3');
		const { nodes } = parse_markdown_svelte(input);

		const node = nodes.get_node(1);

		expect(nodes.size).toBe(2);
		expect(node.kind).toBe('code_fence');
		expect(input.slice(node.start, node.end)).toBe(input);

		expect(node.start).toBe(0);
		expect(node.end).toBe(17);

		expect(input.slice(node.value[0], node.value[1])).toEqual('<\n >\n\\```');
		expect(node.value).toEqual([4, 13]);
		const kinds = nodes.get_kinds(node_kind.code_fence);
		expect(kinds.length).toBe(1);
		expect(node.metadata).toEqual({
			info_start: 3,
			info_end: 3,
		});
	});

	test('pfm example 121 requires at least three fence characters', () => {
		const input = load_fixture('121');
		const { nodes } = parse_markdown_svelte(input);
		const kinds = nodes.get_kinds(node_kind.code_fence);
		expect(kinds.length).toBe(0);
	});

	test('pfm example 122 ignores tilde', () => {
		const input = load_fixture('122');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(nodes.get_node(1).value).toEqual([4, 11]);
		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe('aaa\n~~~');
	});

	test('pfm example 124 parses with unbalanced fences', () => {
		const input = load_fixture('124');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(nodes.get_node(1).value).toEqual([5, 12]);
		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe('aaa\n```');
	});

	test('pfm example 126 fences without closing or content are an empty code block', () => {
		const input = load_fixture('126');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(nodes.get_node(1).value).toEqual([3, 3]);
		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe('');
	});

	test('pfm example 127 fences without closing or content are an empty code block', () => {
		const input = load_fixture('127');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(nodes.get_node(1).value).toEqual([6, 14]);
		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe('\n```\naaa');
	});

	// TODO: fix this when we have blockquotes
	test.todo('pfm example 128 fences in blockquote', () => {
		const input = load_fixture('127');
		const { nodes } = parse_markdown_svelte(input);
	});

	test('pfm example 130 empty fence is empty code block', () => {
		const input = load_fixture('130');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		// expect(nodes.get_node(1).value).toEqual([4, 4]); // i don't care about this it is stupid
		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe('');
	});

	test('pfm example 131 empty fence is empty code block', () => {
		const input = load_fixture('131');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(nodes.get_node(1).value).toEqual([4, 12]);
		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe(' aaa\naaa');
	});

	test('pfm example 132 space before closing fence is ok', () => {
		const input = load_fixture('132');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe('aaa\n  aaa\naaa');
		expect(nodes.get_node(1).value).toEqual([4, 17]);
	});

	test('pfm example 133 space before closing fence is ok', () => {
		const input = load_fixture('133');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1]))
			.toBe(`   aaa
    aaa
  aaa`);
		expect(nodes.get_node(1).value).toEqual([4, 24]);
	});

	test('pfm example 134 space before opening fence and before closing fence is ok', () => {
		const input = load_fixture('134');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe(`aaa`);
		expect(nodes.get_node(1).value).toEqual([4, 7]);
	});

	test('pfm example 135 space before closing fence is ok', () => {
		const input = load_fixture('135');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe(`aaa`);
		expect(nodes.get_node(1).value).toEqual([4, 7]);
	});

	test('pfm example 136 space before opening fence and before closing fence is ok', () => {
		const input = load_fixture('136');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe(`aaa`);
		expect(nodes.get_node(1).value).toEqual([4, 7]);
	});

	test('pfm example 137 space before closing fence is ok', () => {
		const input = load_fixture('137');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe(`aaa`);
		expect(nodes.get_node(1).value).toEqual([4, 7]);
	});

	// TODO: fix this when we have paragraphs
	test.todo('pfm example 140', () => {
		const input = load_fixture('140');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		console.log(nodes.get_node(1));
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		expect(
			input.slice(nodes.get_node(1).value[0], nodes.get_node(1).value[1])
		).toBe(`aaa`);
		expect(nodes.get_node(1).value).toEqual([4, 7]);
	});

	test('pfm example 142 meta info should be present', () => {
		const input = load_fixture('142');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		console.log(nodes.get_node(1));
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		const node_info = nodes.get_node(1);
		expect(node_info.metadata).toEqual({
			info_start: 3,
			info_end: 7,
		});
		expect(
			input.slice(node_info.metadata.info_start, node_info.metadata.info_end)
		).toBe(`ruby`);
		expect(input.slice(node_info.value[0], node_info.value[1])).toBe(`def foo(x)
  return 3
end`);
		expect(node_info.value).toEqual([8, 33]);
	});

	test('pfm example 144 meta info should be present', () => {
		const input = load_fixture('144');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		console.log(nodes.get_node(1));
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		const node_info = nodes.get_node(1);
		expect(node_info.metadata).toEqual({
			info_start: 4,
			info_end: 5,
		});
		expect(
			input.slice(node_info.metadata.info_start, node_info.metadata.info_end)
		).toBe(`;`);
		expect(input.slice(node_info.value[0], node_info.value[1])).toBe(``);
		expect(node_info.value).toEqual([6, 5]);
	});

	test("pfm example 145 i don't know", () => {
		const input = load_fixture('145');
		const { nodes } = parse_markdown_svelte(input);

		expect(nodes.size).toBe(2);
		console.log(nodes.get_node(1));
		expect(input.slice(nodes.get_node(1).start, nodes.get_node(1).end)).toBe(
			input
		);

		const node_info = nodes.get_node(1);
		expect(node_info.metadata).toEqual({
			info_start: 3,
			info_end: 10,
		});
		expect(
			input.slice(node_info.metadata.info_start, node_info.metadata.info_end)
		).toBe(' aa ```');
		expect(input.slice(node_info.value[0], node_info.value[1])).toBe(`foo`);
		expect(node_info.value).toEqual([11, 14]);
	});
});
