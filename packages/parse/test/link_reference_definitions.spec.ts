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
const fixtures_root = resolve(this_dir, 'fixtures/pfm/link_reference_definitions');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8');

/** Find first child of a given kind under a node. */
const find_child = (
	nodes: ReturnType<typeof parse_markdown_svelte>['nodes'],
	parent_idx: number,
	kind: string
) => {
	const parent = nodes.get_node(parent_idx);
	for (const idx of parent.children) {
		const child = nodes.get_node(idx);
		if (child.kind === kind) return child;
	}
	return null;
};

describe('link reference definitions', () => {
	// -----------------------------------------------------------
	// Basic definition + collapsed reference [ref][]
	// -----------------------------------------------------------

	// [foo]: /url "title" + [foo][]
	test('192 — basic definition with title and collapsed reference', () => {
		const input = load_fixture('192');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
		expect(link.metadata.title).toBe('title');
	});

	// [foo]: /url 'the title' (whitespace variations)
	test('193 — definition with leading whitespace and single-quoted title', () => {
		const input = load_fixture('193');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
		expect(link.metadata.title).toBe('the title');
	});

	// [foo]: /url with destination on next line
	test('198 — definition with destination on next line', () => {
		const input = load_fixture('198');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
	});

	// [foo]: <> — empty angle-bracket URL
	test('200 — empty angle-bracket URL', () => {
		const input = load_fixture('200');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('');
	});

	// -----------------------------------------------------------
	// Case insensitivity
	// -----------------------------------------------------------

	// [FOO]: /url + [Foo][]
	test('205 — case-insensitive matching', () => {
		const input = load_fixture('205');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
	});

	// -----------------------------------------------------------
	// Definitions produce no output
	// -----------------------------------------------------------

	// [foo]: /url — definition only, no reference
	test('207 — definition without reference produces no visible output', () => {
		const input = load_fixture('207');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Root should have no paragraph children (only line_break possibly)
		for (const child_idx of root.children) {
			const child = nodes.get_node(child_idx);
			expect(child.kind).not.toBe('paragraph');
		}
	});

	// -----------------------------------------------------------
	// Invalid definitions
	// -----------------------------------------------------------

	// [foo]: /url 'title\n\nwith blank line' — blank line in title
	test('197 — blank line inside title invalidates definition', () => {
		const input = load_fixture('197');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should produce paragraphs, not links
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

	// [foo]: — no destination
	test('199 — missing destination invalidates definition', () => {
		const input = load_fixture('199');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	// [foo]: /url "title" ok — trailing content after title
	test('209 — trailing content after title invalidates definition', () => {
		const input = load_fixture('209');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	// [\\nfoo\\n]: /url — label with line breaks
	test('208 — line breaks inside label invalidate definition', () => {
		const input = load_fixture('208');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	// [foo]: <bar>(baz) — content after angle-bracket URL
	test('201 — content after angle-bracket URL invalidates definition', () => {
		const input = load_fixture('201');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	// -----------------------------------------------------------
	// PFM-specific: no forward references
	// -----------------------------------------------------------

	// [foo]: url before [foo][] — definition-first, should resolve
	test('203 — definition before reference resolves', () => {
		const input = load_fixture('203');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		const kinds = get_all_child_kinds(nodes, paragraph!.index);
		expect(kinds).toContain('link');
	});

	// [foo][] before two definitions — still forward, no link
	test('204 — forward reference with duplicates does not resolve (PFM)', () => {
		const input = load_fixture('204');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		const kinds = get_all_child_kinds(nodes, paragraph!.index);
		expect(kinds).not.toContain('link');
	});

	// [foo][] in blockquote before definition — forward, no link
	test('218 — forward reference across blockquote does not resolve (PFM)', () => {
		const input = load_fixture('218');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		const kinds = get_all_child_kinds(nodes, paragraph!.index);
		expect(kinds).not.toContain('link');
	});

	// -----------------------------------------------------------
	// PFM-specific: no setext headings, no indented code blocks
	// -----------------------------------------------------------

	// 4-space indented definition is valid in PFM (no indented code blocks)
	test('211 — indented definition is valid in PFM', () => {
		const input = load_fixture('211');
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
		expect(found_link).toBe(true);
	});

	// Definition inside code block is not a definition
	test('212 — definition inside code block does not register', () => {
		const input = load_fixture('212');
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

	// Definition not at block start — becomes paragraph text
	test('213 — definition after text content is not a definition', () => {
		const input = load_fixture('213');
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

	// -----------------------------------------------------------
	// Full reference [text][ref]
	// -----------------------------------------------------------

	test('full reference [text][ref] resolves', () => {
		const input = '[foo]: /url "title"\n\n[click here][foo]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
		expect(link.metadata.title).toBe('title');

		// Link text should be "click here"
		const text = nodes.get_node(link.children[0]);
		expect(text.kind).toBe('text');
		const { value } = get_content(nodes, text.index, input);
		expect(value).toBe('click here');
	});

	test('full reference with different text and label', () => {
		const input = '[bar]: /url\n\n[display text][bar]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/url');
	});

	// -----------------------------------------------------------
	// PFM-specific: shortcut [ref] alone is NOT a link
	// -----------------------------------------------------------

	test('shortcut reference [ref] alone is NOT a link in PFM', () => {
		const input = '[foo]: /url\n\n[foo]\n';
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

	// -----------------------------------------------------------
	// First definition wins
	// -----------------------------------------------------------

	test('first definition wins for duplicate labels', () => {
		const input = '[foo]: /first\n[foo]: /second\n\n[foo][]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		const link = nodes.get_node(paragraph!.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/first');
	});

	// -----------------------------------------------------------
	// Image references
	// -----------------------------------------------------------

	test('image collapsed reference ![alt][]', () => {
		const input = '[img]: /image.png "alt text"\n\n![img][]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		const image = nodes.get_node(paragraph!.children[0]);
		expect(image.kind).toBe('image');
		expect(image.metadata.src).toBe('/image.png');
		expect(image.metadata.title).toBe('alt text');
	});

	test('image full reference ![alt][ref]', () => {
		const input = '[logo]: /logo.svg\n\n![My Logo][logo]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		const image = nodes.get_node(paragraph!.children[0]);
		expect(image.kind).toBe('image');
		expect(image.metadata.src).toBe('/logo.svg');
	});

	// -----------------------------------------------------------
	// Multiple definitions
	// -----------------------------------------------------------

	test('217 — multiple definitions with references', () => {
		const input = load_fixture('217');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const kinds = get_all_child_kinds(nodes, paragraph!.index);
		const link_count = kinds.filter((k) => k === 'link').length;
		expect(link_count).toBe(3);
	});

	// -----------------------------------------------------------
	// Definition in heading context
	// -----------------------------------------------------------

	// Headings don't parse inline children at the parser level
	// (they store content as a value range). Reference resolution
	// in heading text is handled at the rendering layer.
	test('214 — definition before heading is consumed', () => {
		const input = load_fixture('214');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const heading = find_child(nodes, root.index, 'heading');
		expect(heading).not.toBeNull();
	});

	// -----------------------------------------------------------
	// Setext headings removed in PFM
	// -----------------------------------------------------------

	test('215 — === after text is paragraph in PFM (no setext)', () => {
		const input = load_fixture('215');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// No headings — PFM has no setext headings
		for (const child_idx of root.children) {
			const child = nodes.get_node(child_idx);
			expect(child.kind).not.toBe('heading');
		}
		// Should have a link from the collapsed reference [foo][]
		let found_link = false;
		for (const child_idx of root.children) {
			const child = nodes.get_node(child_idx);
			if (child.kind === 'paragraph') {
				const kinds = get_all_child_kinds(nodes, child.index);
				if (kinds.includes('link')) found_link = true;
			}
		}
		expect(found_link).toBe(true);
	});
});
