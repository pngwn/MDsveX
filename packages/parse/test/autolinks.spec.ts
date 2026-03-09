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
const fixtures_root = resolve(
	this_dir,
	'../../pfm-tests/tests/autolinks'
);

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

describe('autolinks', () => {
	// URI autolink: <http://foo.bar.baz>
	test('pfm example 594', () => {
		const input = load_fixture('594');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('http://foo.bar.baz');

		// Link should have a text child
		expect(link.children.length).toBe(1);
		const text = nodes.get_node(link.children[0]);
		expect(text.kind).toBe('text');
		const text_content = get_content(nodes, text.index, input);
		expect(text_content.value).toBe('http://foo.bar.baz');
	});

	// URI autolink: <https://foo.bar.baz/test?q=hello&id=22&boolean>
	test('pfm example 595', () => {
		const input = load_fixture('595');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('https://foo.bar.baz/test?q=hello&id=22&boolean');
	});

	// URI autolink: <irc://foo.bar:2233/baz>
	test('pfm example 596', () => {
		const input = load_fixture('596');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('irc://foo.bar:2233/baz');
	});

	// URI autolink with uppercase scheme: <MAILTO:FOO@BAR.BAZ>
	test('pfm example 597', () => {
		const input = load_fixture('597');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('MAILTO:FOO@BAR.BAZ');
	});

	// URI autolink with + and - in scheme: <a+b+c:d>
	test('pfm example 598', () => {
		const input = load_fixture('598');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('a+b+c:d');
	});

	// URI autolink with made-up scheme: <made-up-scheme://foo,bar>
	test('pfm example 599', () => {
		const input = load_fixture('599');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('made-up-scheme://foo,bar');
	});

	// URI autolink: <https://../>
	test('pfm example 600', () => {
		const input = load_fixture('600');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('https://../');
	});

	// URI autolink: <localhost:5001/foo>
	test('pfm example 601', () => {
		const input = load_fixture('601');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('localhost:5001/foo');
	});

	// Space in URI is NOT an autolink: <https://foo.bar/baz bim>
	test('pfm example 602', () => {
		const input = load_fixture('602');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		// Should be text, not link (space in URL)
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	// URI autolink with backslash escapes: <https://example.com/\[\>
	test('pfm example 603', () => {
		const input = load_fixture('603');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		// Backslashes within autolink URIs are preserved (not escape sequences)
		const { value } = get_content(nodes, link.index, input);
		expect(value).toBe('https://example.com/\\[\\');
	});

	// Email autolink: <foo@bar.example.com>
	test('pfm example 604', () => {
		const input = load_fixture('604');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const link = nodes.get_node(paragraph.children[0]);
		expect(link.kind).toBe('link');

		// Display text is the email
		const text = nodes.get_node(link.children[0]);
		expect(text.kind).toBe('text');
		const text_content = get_content(nodes, text.index, input);
		expect(text_content.value).toBe('foo@bar.example.com');

		// Metadata has mailto: href
		expect(link.metadata.href).toBe('mailto:foo@bar.example.com');
	});

	// HTML-like, not autolink: <foo+special@Bar.baz-bar0.com>
	// Needs html node support (Phase 5)
	test.todo('pfm example 605');

	// HTML-like: <foo\+@bar.example.com>
	// Needs html node support (Phase 5)
	test.todo('pfm example 606');

	// Empty angle brackets: <>
	test('pfm example 607', () => {
		const input = load_fixture('607');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should not produce a link
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	// Space after <: < https://foo.bar >
	test('pfm example 608', () => {
		const input = load_fixture('608');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		// Should not produce a link (leading space)
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	// HTML-like: <m:abc> — scheme too short (1 char)
	// Needs html node support (Phase 5)
	test.todo('pfm example 609');

	// HTML-like: <foo.bar.baz>
	// Needs html node support (Phase 5)
	test.todo('pfm example 610');

	// No angle brackets: https://example.com
	test('pfm example 611', () => {
		const input = load_fixture('611');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		// Should be text, not link (no angle brackets)
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});

	// No angle brackets: foo@bar.example.com
	test('pfm example 612', () => {
		const input = load_fixture('612');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		// Should be text, not link (no angle brackets)
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('link');
	});
});
