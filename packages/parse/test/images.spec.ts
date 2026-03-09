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
	'../../pfm-tests/tests/images'
);

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

describe('images', () => {
	// ![foo](/url "title")
	test('pfm example 572 — inline image with title', () => {
		const input = load_fixture('572');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const image = nodes.get_node(paragraph.children[0]);
		expect(image.kind).toBe('image');
		expect(image.metadata.src).toBe('/url');
		expect(image.metadata.title).toBe('title');

		const text = nodes.get_node(image.children[0]);
		expect(text.kind).toBe('text');
		const { value } = get_content(nodes, text.index, input);
		expect(value).toBe('foo');
	});

	// ![foo](train.jpg) — simple image
	test('pfm example 578 — simple image', () => {
		const input = load_fixture('578');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const image = nodes.get_node(paragraph.children[0]);
		expect(image.kind).toBe('image');
		expect(image.metadata.src).toBe('train.jpg');
	});

	// ![](/url) — empty alt
	test('pfm example 581 — image with empty alt', () => {
		const input = load_fixture('581');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const image = nodes.get_node(paragraph.children[0]);
		expect(image.kind).toBe('image');
		expect(image.metadata.src).toBe('/url');
		expect(image.children.length).toBe(0);
	});

	// My ![foo bar](/path/to/train.jpg  "title"   )
	test('pfm example 579 — image with surrounding text', () => {
		const input = load_fixture('579');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toContain('text');
		expect(kinds).toContain('image');
	});

	// !\[foo] — escaped !, not an image
	test('pfm example 592 — escaped exclamation is text', () => {
		const input = load_fixture('592');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('image');
	});

	// \![foo] — backslash before !
	test('pfm example 593 — backslash before ! is text', () => {
		const input = load_fixture('593');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('image');
	});
});
