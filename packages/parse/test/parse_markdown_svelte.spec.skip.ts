import { describe, expect, test } from 'vitest';

import { node_kind, parse_markdown_svelte } from '../src/main';

const to_array = (view: Uint8Array | Uint16Array | Uint32Array): number[] =>
	Array.from(view);

const collect_children = (
	arena: ReturnType<typeof parse_markdown_svelte>['arena'],
	parent: number
): number[] => {
	const children: number[] = [];
	for (let index = 0; index < arena.size; index += 1) {
		if (arena.get_parent(index) === parent) {
			children.push(index);
		}
	}
	return children;
};

describe('parse_markdown_svelte', () => {
	test('emits text and line break tokens in order', () => {
		const input = 'Hello\nWorld';
		const result = parse_markdown_svelte(input);
		const { tokens, arena, root } = result;

		expect(tokens.size).toBe(3);
		expect(to_array(tokens.kinds_slice())).toEqual([
			node_kind.text,
			node_kind.line_break,
			node_kind.text,
		]);
		expect(to_array(tokens.starts_slice())).toEqual([0, 5, 6]);
		expect(to_array(tokens.ends_slice())).toEqual([5, 6, 11]);

		expect(arena.size).toBe(6);
		expect(arena.get_kind(root)).toBe(node_kind.root);
		expect(arena.get_start(root)).toBe(0);
		expect(arena.get_end(root)).toBe(input.length);

		const root_children = collect_children(arena, root);
		expect(root_children.map((index) => arena.get_kind(index))).toEqual([
			node_kind.paragraph,
			node_kind.line_break,
			node_kind.paragraph,
		]);

		for (const paragraph_index of root_children.filter(
			(index) => arena.get_kind(index) === node_kind.paragraph
		)) {
			const paragraph_children = collect_children(arena, paragraph_index);
			expect(paragraph_children).toHaveLength(1);

			const text_index = paragraph_children[0];
			expect(arena.get_kind(text_index)).toBe(node_kind.text);
			expect(arena.get_start(text_index)).toBe(
				arena.get_start(paragraph_index)
			);
			expect(arena.get_end(text_index)).toBe(arena.get_end(paragraph_index));
		}
	});

	test('tracks heading depth as payload metadata', () => {
		const input = '### Heading';
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(tokens.size).toBe(1);
		expect(tokens.kind_at(0)).toBe(node_kind.heading);
		expect(tokens.extra_at(0)).toBe(3);

		expect(arena.size).toBe(3);
		const heading_index = root + 1;
		expect(arena.get_kind(heading_index)).toBe(node_kind.heading);
		expect(arena.get_payload(heading_index)).toBe(3);

		const heading_children = collect_children(arena, heading_index);
		expect(heading_children).toHaveLength(1);

		const text_index = heading_children[0];
		expect(arena.get_kind(text_index)).toBe(node_kind.text);
		expect(arena.get_start(text_index)).toBe(tokens.value_start_at(0));
		expect(arena.get_end(text_index)).toBe(tokens.value_end_at(0));
	});

	test('collects errors for unterminated mustache blocks', () => {
		const input = '{{foo';
		const result = parse_markdown_svelte(input);
		const { errors, tokens, arena, root } = result;

		expect(errors.size).toBe(1);
		expect(errors.at(0)).toBe(0);

		expect(tokens.size).toBe(1);
		expect(tokens.kind_at(0)).toBe(node_kind.mustache);
		expect(tokens.start_at(0)).toBe(0);
		expect(tokens.end_at(0)).toBe(input.length);

		expect(arena.size).toBe(2);
		const mustache_index = root + 1;
		expect(arena.get_kind(mustache_index)).toBe(node_kind.mustache);
	});

	test('parses inline html tokens', () => {
		const input = '<strong>bold';
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(to_array(tokens.kinds_slice())).toEqual([
			node_kind.html,
			node_kind.text,
		]);

		const html_index = root + 1;
		expect(arena.get_kind(html_index)).toBe(node_kind.html);
		expect(arena.get_start(html_index)).toBe(0);
		expect(arena.get_end(html_index)).toBe('<strong>'.length);
	});

	test('handles code fences with matching closing fence', () => {
		const input = '````\ncode block\n````';
		const { tokens, errors, arena, root } = parse_markdown_svelte(input);

		expect(errors.size).toBe(0);
		expect(tokens.size).toBe(1);
		expect(tokens.kind_at(0)).toBe(node_kind.code_fence);
		expect(tokens.start_at(0)).toBe(0);
		expect(tokens.end_at(0)).toBe(input.length);

		const code_index = root + 1;
		expect(arena.get_kind(code_index)).toBe(node_kind.code_fence);
		expect(arena.get_start(code_index)).toBe(0);
		expect(arena.get_end(code_index)).toBe(input.length);
	});

	test('falls back to text for unmatched html-like spans', () => {
		const input = '<div';
		const { tokens } = parse_markdown_svelte(input);

		expect(tokens.size).toBe(2);
		expect(tokens.kind_at(0)).toBe(node_kind.text);
		expect(tokens.start_at(0)).toBe(0);
		expect(tokens.end_at(0)).toBe(1);
		expect(tokens.kind_at(1)).toBe(node_kind.text);
		expect(tokens.start_at(1)).toBe(1);
		expect(tokens.end_at(1)).toBe(input.length);
	});

	test('skips leading whitespace without emitting tokens', () => {
		const input = '  foo';
		const { tokens, arena, root } = parse_markdown_svelte(input);

		expect(tokens.size).toBe(1);
		expect(tokens.kind_at(0)).toBe(node_kind.text);
		expect(tokens.start_at(0)).toBe(2);
		expect(tokens.end_at(0)).toBe(input.length);

		const [paragraph_index] = collect_children(arena, root);
		expect(arena.get_kind(paragraph_index)).toBe(node_kind.paragraph);
		expect(arena.get_start(paragraph_index)).toBe(tokens.start_at(0));
		expect(arena.get_end(paragraph_index)).toBe(tokens.end_at(0));

		const [text_index] = collect_children(arena, paragraph_index);
		expect(arena.get_kind(text_index)).toBe(node_kind.text);
		expect(arena.get_start(text_index)).toBe(tokens.value_start_at(0));
		expect(arena.get_end(text_index)).toBe(tokens.value_end_at(0));
	});
});
