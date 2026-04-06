import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import {
	get_all_child_kinds,
	get_child_range,
	get_content,
	print_all_nodes,
} from './utils';

import { parse_markdown_svelte } from '../src/main';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, 'fixtures/pfm/backslash_escapes');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8');

describe('backslash escapes', () => {
	// All ASCII punctuation escaped: \!\"\#\$\%...
	test('pfm example 12, all escaped ASCII punctuation is text', () => {
		const input = load_fixture('12');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should have a paragraph (not heading, not emphasis, etc.)
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// All children should be text (no emphasis, code_span, link, etc.)
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		for (const kind of kinds) {
			expect(kind).toBe('text');
		}

		// Escaped punctuation should appear without backslashes in text values
		const text_values = paragraph.children
			.map((i: number) => nodes.get_node(i))
			.filter((n: any) => n.kind === 'text')
			.map((n: any) => input.slice(n.value[0], n.value[1]));
		const combined = text_values.join('');
		// All ASCII punctuation should be present, backslashes removed
		expect(combined).toContain('!');
		expect(combined).toContain('*');
		expect(combined).toContain('<');
		expect(combined).toContain('_');
		// Backslashes should only appear for the \\ escape (producing a single \)
		expect(combined.match(/\\/g)?.length ?? 0).toBe(1);
	});

	// Backslash before non-ASCII-punctuation: \->\A\a\ \3\φ\«
	test('pfm example 13, non-punctuation escapes are regular text', () => {
		const input = load_fixture('13');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// All children should be text
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		for (const kind of kinds) {
			expect(kind).toBe('text');
		}
	});

	// Specific escaped characters preventing special behavior
	test('pfm example 14, \\* prevents emphasis', () => {
		// \*not emphasized*
		const input = '\\*not emphasized*\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// Should NOT have emphasis, all children should be text
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('strong_emphasis');
		expect(kinds).not.toContain('emphasis');
	});

	test('pfm example 14, \\< prevents autolink', () => {
		// \<br/> not a tag
		const input = '\\<br/> not a tag\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// Should NOT have link or html nodes
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
		// Content should include < as text (backslash removed by escape)
		const text_values = paragraph.children
			.map((i: number) => nodes.get_node(i))
			.filter((n: any) => n.kind === 'text')
			.map((n: any) => input.slice(n.value[0], n.value[1]));
		const combined = text_values.join('');
		expect(combined).toBe('<br/> not a tag');
	});

	test('pfm example 14, \\[ prevents link syntax', () => {
		const input = '\\[not a link](/foo)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	test('pfm example 14, \\` prevents code span', () => {
		const input = '\\`not code`\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// Should NOT have code_span
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('code_span');
	});

	test('pfm example 14, \\# prevents heading', () => {
		const input = '\\# not a heading\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should be a paragraph, not a heading
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
	});

	test('pfm example 14, \\* prevents thematic break', () => {
		const input = '\\* not a list\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should be a paragraph, not a thematic break
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
	});

	// Double backslash: \\*emphasis*
	test('pfm example 15, double backslash', () => {
		const input = load_fixture('15');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// \\ escapes the backslash, producing literal "\".
		// Then *emphasis* follows, \ is punctuation so * is left-flanking.
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toContain('strong_emphasis');
	});

	// Backslash before newline: foo\<newline>bar
	test('pfm example 16, backslash before newline', () => {
		const input = load_fixture('16');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should have paragraph(s) with text
		const first_child = nodes.get_node(root.children[0]);
		expect(first_child.kind).toBe('paragraph');
	});

	// Backtick code spans with escapes inside: `` \[\` ``
	test('pfm example 17', () => {
		const input = load_fixture('17');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// Inside code span, backslashes are literal, not escapes
		const code = paragraph.children
			.map((i) => nodes.get_node(i))
			.find((n) => n.kind === 'code_span');
		expect(code).toBeDefined();
	});

	// Indented line with escapes: "    \[\]"
	test('pfm example 18, indented escaped brackets', () => {
		const input = load_fixture('18');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
	});

	// Autolink with backslash: <https://example.com?find=\*>
	test('pfm example 20', () => {
		const input = load_fixture('20');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
	});

	// HTML tag with backslash: <a href="/bar\/)">, block-level HTML
	test('pfm example 21', () => {
		const input = load_fixture('21');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const children = root.children.map((i) => nodes.get_node(i));
		const found = children.find(
			(n) => n.kind === 'text' || n.kind === 'html' || n.kind === 'paragraph'
		);
		expect(found).toBeDefined();
	});

	// Link syntax with backslash: [foo](/bar\* "ti\*tle")
	// Backslashes in link URL/title are preserved
	test('pfm example 22, escaped chars in link syntax', () => {
		const input = load_fixture('22');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');
		expect(link.metadata.href).toBe('/bar\\*');
		expect(link.metadata.title).toBe('ti\\*tle');
	});

	// Reference definition with backslash: [foo]\n\n[foo]: /bar\* "ti\*tle"
	test('pfm example 23, escaped chars in reference definition (text in PFM)', () => {
		const input = load_fixture('23');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const first_child = nodes.get_node(root.children[0]);
		expect(first_child.kind).toBe('paragraph');
	});

	// Code fence with backslash in info string: ``` foo\+bar
	test('pfm example 24, backslash in code fence info string', () => {
		const input = load_fixture('24');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const code_fence = nodes.get_node(root.children[0]);
		expect(code_fence.kind).toBe('code_fence');

		// Code fence should contain the code content
		const { value } = get_content(nodes, code_fence.index, input);
		expect(value).toBe('foo');
	});
});
