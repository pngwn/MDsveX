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
const fixtures_root = resolve(this_dir, 'fixtures/pfm/links');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8');

describe('links', () => {
	// [link](/uri "title") — inline link with title
	test('pfm example 482 — inline link with title', () => {
		const input = load_fixture('482');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/uri');
		expect(link.metadata.title).toBe('title');

		const text = nodes.get_node(link.children[0]);
		expect(text.kind).toBe('text');
		const { value } = get_content(nodes, text.index, input);
		expect(value).toBe('link');
	});

	// [link](/uri)
	test('pfm example 483 — simple inline link', () => {
		const input = load_fixture('483');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/uri');

		const text = nodes.get_node(link.children[0]);
		expect(text.kind).toBe('text');
		const { value } = get_content(nodes, text.index, input);
		expect(value).toBe('link');
	});

	// [](./target.md) — empty text link
	test('pfm example 484 — empty text link', () => {
		const input = load_fixture('484');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('./target.md');
		// Empty text — no children
		expect(link.children.length).toBe(0);
	});

	// [link]()
	test('pfm example 485 — empty destination link', () => {
		const input = load_fixture('485');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('');
	});

	// []()
	test('pfm example 487 — empty link', () => {
		const input = load_fixture('487');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('');
		expect(link.children.length).toBe(0);
	});

	// [link](/my uri) — space in URL, not a valid link
	test('pfm example 488 — link with space is text', () => {
		const input = load_fixture('488');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	// [link](foo(and(bar))) — balanced nested parens
	test('pfm example 496 — link with nested parens', () => {
		const input = load_fixture('496');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('foo(and(bar))');
	});

	// [link](#fragment)
	test('pfm example 501 — link with fragment', () => {
		const input = '[link](#fragment)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('#fragment');
	});

	// [link](url "title") with various quote styles
	test('link with double-quoted title', () => {
		const input = '[link](/url "my title")\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
		expect(link.metadata.title).toBe('my title');
	});

	test('link with single-quoted title', () => {
		const input = "[link](/url 'my title')\n";
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
		expect(link.metadata.title).toBe('my title');
	});

	// [link](foo(and(bar)) — unbalanced parens, not a link
	test('pfm example 497 — unbalanced parens is text', () => {
		const input = load_fixture('497');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	// [link] (/uri) — space before (, not a link
	test('pfm example 511 — space between ] and ( is text', () => {
		const input = '[link] (/uri)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	// text before and after link
	test('link surrounded by text', () => {
		const input = 'before [link](/url) after\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toContain('text');
		expect(kinds).toContain('link');
	});

	// multiple links
	test('multiple links in one paragraph', () => {
		const input = '[a](url1) [b](url2)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		const links = kinds.filter((k: string) => k === 'link');
		expect(links.length).toBe(2);
	});

	// link inside emphasis
	test('link inside emphasis', () => {
		const input = '*[link](/url)*\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toContain('strong_emphasis');
	});
});
