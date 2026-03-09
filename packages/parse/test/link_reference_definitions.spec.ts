import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
	get_all_child_kinds,
	get_child_range,
	get_content,
} from './utils';

import { parse_markdown_svelte } from '../src/main';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(
	this_dir,
	'../../pfm-tests/tests/link_reference_definitions'
);

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

describe('link reference definitions', () => {
	// In PFM, [ref]: url definitions are treated as plain text.

	// [foo]: /url "title"
	test('pfm example 192 — reference definition is text in PFM', () => {
		const input = load_fixture('192');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// The content should be parsed as paragraphs with text
		let found_link = false;
		for (const child_idx of root.children) {
			const child = nodes.get_node(child_idx);
			if (child.kind === 'paragraph') {
				const kinds = get_all_child_kinds(nodes, child.index);
				if (kinds.includes('link')) found_link = true;
			}
		}
		expect(found_link).toBe(false);
	});

	// [foo]: /url
	test('pfm example 193 — simple reference is text', () => {
		const input = load_fixture('193');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		let found_link = false;
		for (const child_idx of root.children) {
			const child = nodes.get_node(child_idx);
			if (child.kind === 'paragraph') {
				const kinds = get_all_child_kinds(nodes, child.index);
				if (kinds.includes('link')) found_link = true;
			}
		}
		expect(found_link).toBe(false);
	});

	// [Foo bar]: /url
	test('pfm example 196 — multiword reference is text', () => {
		const input = load_fixture('196');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const first = nodes.get_node(root.children[0]);
		expect(first.kind).toBe('paragraph');
	});

	// [foo]: /url "title"  with following paragraph
	test('pfm example 200 — reference def followed by paragraph', () => {
		const input = load_fixture('200');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should have paragraphs, no links
		for (const child_idx of root.children) {
			const child = nodes.get_node(child_idx);
			if (child.kind === 'paragraph') {
				const kinds = get_all_child_kinds(nodes, child.index);
				expect(kinds).not.toContain('link');
			}
		}
	});
});
