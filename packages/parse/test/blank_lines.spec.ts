import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/blank_lines');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

describe('blank lines', () => {
	test('pfm example 227 blank lines between content produce line_break nodes', () => {
		const input = load_fixture('227');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const children = root.children.map((i) => nodes.get_node(i));
		const kinds = children.map((n) => n.kind);

		// Expected AST:
		// root
		//   line_break     ("  \n")
		//   line_break     ("\n")
		//   paragraph
		//     text(aaa)
		//   line_break     ("\n" after paragraph)
		//   line_break     ("  \n")
		//   line_break     ("\n")
		//   heading(1)
		//     text(aaa)
		//   line_break     ("\n")
		//   line_break     ("  \n")
		expect(kinds).toEqual([
			'line_break',
			'line_break',
			'paragraph',
			'line_break',
			'line_break',
			'line_break',
			'heading',
			'line_break',
			'line_break',
		]);

		// Verify paragraph content
		const paragraph = children.find((n) => n.kind === 'paragraph')!;
		const text = nodes.get_node(paragraph.children[0]);
		expect(text.kind).toBe('text');
		expect(input.slice(text.value[0], text.value[1])).toBe('aaa');

		// Verify heading
		const heading = children.find((n) => n.kind === 'heading')!;
		expect(heading.metadata.depth).toBe(1);
		expect(input.slice(heading.value[0], heading.value[1])).toBe('aaa');

		// Verify line_break count
		const line_breaks = nodes.get_kinds(node_kind.line_break);
		expect(line_breaks.length).toBe(7);
	});

	test('single blank line produces a line_break', () => {
		const input = '\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		expect(root.children.length).toBe(1);

		const lb = nodes.get_node(root.children[0]);
		expect(lb.kind).toBe('line_break');
		expect(lb.start).toBe(0);
		expect(lb.end).toBe(1);
	});

	test('whitespace-only line produces a line_break', () => {
		const input = '  \n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		expect(root.children.length).toBe(1);

		const lb = nodes.get_node(root.children[0]);
		expect(lb.kind).toBe('line_break');
		expect(lb.start).toBe(0);
		expect(lb.end).toBe(3);
	});

	test('multiple blank lines produce multiple line_breaks', () => {
		const input = '\n\n\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		expect(root.children.length).toBe(3);

		for (const child_idx of root.children) {
			expect(nodes.get_node(child_idx).kind).toBe('line_break');
		}
	});

	test('no line_breaks for empty input', () => {
		const input = '';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		expect(root.children.length).toBe(0);
	});
});
