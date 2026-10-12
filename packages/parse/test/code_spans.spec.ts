import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { NodeKind } from '../src/utils';
import { print_ast } from './print';
import {
	both,
	checked_tree,
	every_path,
	fed_mismatch,
	lines,
	pick,
	problems,
	random,
} from './stream_shape';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, 'fixtures/pfm/code_spans');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8').trimEnd();

describe('code spans', () => {
	test('pfm example 328', () => {
		const input = load_fixture('328');
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input);
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(5);

		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(5);
		expect(input.slice(code_span.start, code_span.end)).toBe(input);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual('foo');
		expect(code_span.value).toEqual([1, 4]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 329', () => {
		const input = load_fixture('329');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(15);
		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());

		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(15);
		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'foo ` bar'
		);
		expect(code_span.value).toEqual([3, 12]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 330', () => {
		const input = load_fixture('330');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(6);
		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(6);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual('``');
		expect(code_span.value).toEqual([2, 4]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('code span with more than 2 backticks is a text node', () => {
		const input = 'hi ```foo```';
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);

		expect(paragraph.kind).toBe('paragraph');
		// "hi " is one text node, "```foo```" becomes another after
		// code_span_start fails (extra > 2)
		const children = paragraph.children.map((i: number) => nodes.get_node(i));
		expect(children.every((c: any) => c.kind === 'text')).toBe(true);
	});

	test('pfm example 331', () => {
		const input = load_fixture('331');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(8);
		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(8);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(' `` ');
		expect(code_span.value).toEqual([2, 6]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 332', () => {
		const input = load_fixture('332');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(4);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(4);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(' a');
		expect(code_span.value).toEqual([1, 3]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 333', () => {
		const input = load_fixture('333');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(5);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(5);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(' b ');
		expect(code_span.value).toEqual([1, 4]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 334', () => {
		const input = load_fixture('334');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);
		// children[1] is soft_break, children[2] is second code_span
		const code_span_2 = nodes.get_node(paragraph.children[2]);

		// root(1) + paragraph(1) + code_span(2) + soft_break(1) = 5
		expect(nodes.size).toBe(5);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');
		expect(nodes.get_node(paragraph.children[1]).kind).toBe('soft_break');
		expect(code_span_2.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(8);

		expect(input.slice(code_span.start, code_span.end)).toBe('` `');
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(3);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(' ');
		expect(code_span.value).toEqual([1, 2]);

		expect(input.slice(code_span_2.start, code_span_2.end)).toBe('`  `');
		expect(code_span_2.start).toBe(4);
		expect(code_span_2.end).toBe(8);

		expect(code_span_2.value).toEqual([5, 7]);

		expect(input.slice(code_span_2.value[0], code_span_2.value[1])).toEqual(
			'  '
		);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(2);
	});

	test('pfm example 335', () => {
		const input = load_fixture('335');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(19);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(19);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'\nfoo\nbar  \nbaz\n'
		);
		expect(code_span.value).toEqual([2, 17]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 336', () => {
		const input = load_fixture('336');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(10);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(10);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'\nfoo \n'
		);
		expect(code_span.value).toEqual([2, 8]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 337', () => {
		const input = load_fixture('337');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(16);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(16);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'foo   bar \nbaz'
		);
		expect(code_span.value).toEqual([1, 15]);

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 338', () => {
		const input = load_fixture('338');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(10);

		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(6);
		expect(input.slice(code_span.start, code_span.end)).toBe('`foo\\`');

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'foo\\'
		);
		expect(code_span.value).toEqual([1, 5]);

		// Remaining "bar`" is text (may be split by backtick detection)
		const rest = paragraph.children
			.slice(1)
			.map((i: number) => nodes.get_node(i));
		expect(rest.every((c: any) => c.kind === 'text')).toBe(true);
	});

	test('pfm example 339', () => {
		const input = load_fixture('339');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(11);

		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(11);
		expect(input.slice(code_span.start, code_span.end)).toBe('``foo`bar``');

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'foo`bar'
		);
		expect(code_span.value).toEqual([2, 9]);

		expect(nodes.get_kinds(NodeKind.paragraph).length).toEqual(1);
		expect(nodes.get_kinds(NodeKind.code_span).length).toEqual(1);
	});

	test('pfm example 340', () => {
		const input = load_fixture('340');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(14);

		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(14);
		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'foo `` bar'
		);
		expect(code_span.value).toEqual([2, 12]);

		expect(nodes.get_kinds(NodeKind.paragraph).length).toEqual(1);
		expect(nodes.get_kinds(NodeKind.code_span).length).toEqual(1);
	});

	// Code span takes precedence over emphasis
	test('pfm example 341', () => {
		const input = load_fixture('341');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
		const kinds = paragraph.children.map((i) => nodes.get_node(i).kind);
		expect(kinds).toContain('code_span');
	});

	// Code span takes precedence over link
	test('pfm example 342', () => {
		const input = load_fixture('342');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
		const kinds = paragraph.children.map((i) => nodes.get_node(i).kind);
		expect(kinds).toContain('code_span');
		expect(kinds).not.toContain('link');
	});

	// Code span with HTML-like content
	test('pfm example 343', () => {
		const input = load_fixture('343');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
	});

	// HTML tag containing backtick: <a href="`" />`, rendered as html
	test('pfm example 344', () => {
		const input = load_fixture('344');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const children = root.children
			.map((i: number) => nodes.get_node(i))
			.filter((n: any) => n.kind !== 'line_break');

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');
		expect(
			children[0].children.map((i: number) => nodes.get_node(i).kind)
		).toEqual(['html', 'text']);
	});

	// Autolink with backtick
	test('pfm example 345', () => {
		const input = load_fixture('345');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
	});

	// Autolink without code span delimiters, containing backtick
	test('pfm example 346', () => {
		const input = load_fixture('346');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');
	});

	test('pfm example 347', () => {
		// Load raw (no trimEnd), this is a code fence test that needs the trailing newline
		const input = readFileSync(resolve(fixtures_root, '347.md'), 'utf8');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const code_fence = nodes.get_node(root.children[0]);

		expect(nodes.size).toBe(2);
		expect(code_fence.kind).toBe('code_fence');
		expect(code_fence.value).toEqual([input.length, input.length]);
	});

	test('pfm example 348', () => {
		const input = load_fixture('348');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		// All children should be text (backtick revoked to text)
		const children = paragraph.children.map((i: number) => nodes.get_node(i));
		expect(children.every((n: any) => n.kind === 'text')).toBe(true);

		// Combined text content should be `foo
		const combined = children
			.map((n: any) => input.slice(n.value[0], n.value[1]))
			.join('');
		expect(combined).toContain('`foo');
	});

	// TODO: this is totally wrong but i'm not sure how
	test('pfm example 349', () => {
		const input = load_fixture('349');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);

		expect(paragraph.kind).toBe('paragraph');

		// Single backtick can't match double-backtick runs, so it becomes text.
		// ``bar`` matches as a code span with content "bar".
		const children = paragraph.children.map((i: number) => nodes.get_node(i));
		const kinds = children.map((c: any) => c.kind);

		// First children are text (revoked backtick + "foo"), then code_span
		const code_idx = kinds.indexOf('code_span');
		expect(code_idx).toBeGreaterThan(0);

		const code_span = children[code_idx];
		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual('bar');
	});

	test('pfm example pfm_328_1', () => {
		const input = load_fixture('pfm_328_1');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(9);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(9);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual('hi');
		expect(code_span.value).toEqual([6, 8]);

		expect(code_span.metadata).toEqual({
			info_start: 3,
			info_end: 5,
		});

		expect(
			input.slice(code_span.metadata.info_start, code_span.metadata.info_end)
		).toBe('js');

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example pfm_328_2', () => {
		const input = load_fixture('pfm_328_2');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(11);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(11);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual('hi');
		expect(code_span.value).toEqual([7, 9]);

		expect(code_span.metadata).toEqual({
			info_start: 3,
			info_end: 5,
		});

		expect(
			input.slice(code_span.metadata.info_start, code_span.metadata.info_end)
		).toBe('js');

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example pfm_328_3', () => {
		const input = load_fixture('pfm_328_3');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(11);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(11);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual('  hi');
		expect(code_span.value).toEqual([6, 10]);

		expect(code_span.metadata).toEqual({
			info_start: 3,
			info_end: 5,
		});

		expect(
			input.slice(code_span.metadata.info_start, code_span.metadata.info_end)
		).toBe('js');

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example pfm_328_4', () => {
		const input = load_fixture('pfm_328_4');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(28);

		expect(input.slice(code_span.start, code_span.end)).toBe(input.trim());
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(28);

		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual(
			'console.log(`hi`)'
		);
		expect(code_span.value).toEqual([8, 25]);

		expect(code_span.metadata).toEqual({
			info_start: 4,
			info_end: 6,
		});

		expect(
			input.slice(code_span.metadata.info_start, code_span.metadata.info_end)
		).toBe('js');

		const paragraph_kinds = nodes.get_kinds(NodeKind.paragraph);
		const code_span_kinds = nodes.get_kinds(NodeKind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	const hint_cases: [string, [string, string | undefined][]][] = [
		['pfm_328_5', [['#!ts', undefined]]],
		['pfm_328_6', [['#!', undefined]]],
		['pfm_328_7', [['#!ts ', undefined]]],
		[
			'pfm_328_8',
			[
				['#!ts', undefined],
				['c', 'js'],
			],
		],
		[
			'pfm_328_9',
			[
				['#!', undefined],
				['d', undefined],
			],
		],
	];

	for (const [id, expected] of hint_cases) {
		test(`pfm example ${id} keeps a bare #! as code`, () => {
			const input = load_fixture(id);
			const { nodes } = parse_markdown_svelte(input);
			const spans = nodes
				.get_kinds(NodeKind.code_span)
				.map((i) => nodes.get_node(i));

			expect(
				spans.map((s) => {
					const { info_start, info_end } = s.metadata ?? {};
					return [
						input.slice(s.value[0], s.value[1]),
						info_start === undefined
							? undefined
							: input.slice(info_start, info_end),
					];
				})
			).toEqual(expected);
			for (const s of spans) {
				const text = input.slice(s.start, s.end);
				expect(text.startsWith('`') && text.endsWith('`')).toBe(true);
			}
		});
	}
});

describe('unmatched code spans', () => {
	const print_batch = (input: string): string =>
		print_ast(parse_markdown_svelte(input).nodes, input);

	const print_incremental = (input: string, chunk_size: number): string => {
		const tree = new TreeBuilder(input.length);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < input.length; i += chunk_size) {
			parser.feed(input.slice(i, i + chunk_size));
		}
		parser.finish();
		return print_ast(tree.get_buffer(), input);
	};

	const cases: [string, string][] = [
		[
			'a``\n\nx',
			'root\n  paragraph\n    text "a"\n    text "``"\n  line_break\n  line_break\n  paragraph\n    text "x"',
		],
		[
			'a``\nx',
			'root\n  paragraph\n    text "a"\n    text "``"\n    soft_break\n    text "x"',
		],
		['a``', 'root\n  paragraph\n    text "a"\n    text "``"'],
		['a```', 'root\n  paragraph\n    text "a"\n    text "```"'],
		[
			'a`` b\n\nx',
			'root\n  paragraph\n    text "a"\n    text "``"\n    text " b"\n  line_break\n  line_break\n  paragraph\n    text "x"',
		],
		['x ` c', 'root\n  paragraph\n    text "x "\n    text "`"\n    text " c"'],
		[
			'a ` \n\nb `',
			'root\n  paragraph\n    text "a "\n    text "`"\n    text " "\n  line_break\n  line_break\n  paragraph\n    text "b "\n    text "`"',
		],
		[
			'a ``b` c',
			'root\n  paragraph\n    text "a "\n    text "``"\n    text "b"\n    text "`"\n    text " c"',
		],
		[
			'a `#!ts',
			'root\n  paragraph\n    text "a "\n    text "`"\n    text "#"\n    text "!ts"',
		],
		[
			'a `#!',
			'root\n  paragraph\n    text "a "\n    text "`"\n    text "#"\n    text "!"',
		],
		[
			'a `#!ts\n\nx',
			'root\n  paragraph\n    text "a "\n    text "`"\n    text "#"\n    text "!ts"\n  line_break\n  line_break\n  paragraph\n    text "x"',
		],
	];

	for (const [input, expected] of cases) {
		test(`keeps backticks literal: ${JSON.stringify(input)}`, () => {
			expect(print_batch(input)).toBe(expected);
		});

		test(`incremental matches batch: ${JSON.stringify(input)}`, () => {
			for (let size = 1; size <= 8; size++) {
				expect(print_incremental(input, size), `chunk size ${size}`).toBe(
					expected
				);
			}
		});
	}
});

describe('code spans wrapped in delimiters', () => {
	const print_incremental = (input: string, chunk_size: number): string => {
		const tree = new TreeBuilder(input.length);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < input.length; i += chunk_size) {
			parser.feed(input.slice(i, i + chunk_size));
		}
		parser.finish();
		return print_ast(tree.get_buffer(), input);
	};

	const cases: [string, string][] = [
		[
			'*`x`* b',
			'root\n  paragraph\n    strong_emphasis\n      code_span "x"\n    text " b"',
		],
		['_`` x ``_', 'root\n  paragraph\n    emphasis\n      code_span "x"'],
	];

	for (const [input, expected] of cases) {
		test(`closes after the code span: ${JSON.stringify(input)}`, () => {
			expect(print_ast(parse_markdown_svelte(input).nodes, input)).toBe(
				expected
			);
			for (let size = 1; size <= 8; size++) {
				expect(print_incremental(input, size), `chunk size ${size}`).toBe(
					expected
				);
			}
		});
	}
});

describe('a lone backtick in a padded two backtick span', () => {
	test('the blank line after it fails the span', () => {
		expect(checked_tree('`` a `\n\nb ``\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "``"',
				'    text " a "',
				'    text "`"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b "',
				'    text "``"',
				'  line_break'
			)
		);
		expect(checked_tree('> `` a `\n\nb ``\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "``"',
				'      text " a "',
				'      text "`"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b "',
				'    text "``"',
				'  line_break'
			)
		);
	});

	test('so does the end of the input', () => {
		expect(checked_tree('`` a `')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "``"',
				'    text " a "',
				'    text "`"'
			)
		);
		expect(checked_tree('``  #!js `')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "``"',
				'    text "  #"',
				'    text "!js "',
				'    text "`"'
			)
		);
	});

	test('a single line end after it stays in the span', () => {
		expect(checked_tree('`` a `\nb ``\n')).toBe(
			lines('root', '  paragraph', '    code_span "a `\\nb"', '  line_break')
		);
	});

	test('a padded closer after it still strips the padding', () => {
		expect(checked_tree('`` a ` ``\n')).toBe(
			lines('root', '  paragraph', '    code_span "a `"', '  line_break')
		);
		expect(checked_tree('`` a ` b ``\n')).toBe(
			lines('root', '  paragraph', '    code_span "a ` b"', '  line_break')
		);
	});
});

describe('a padded code span that runs over a line', () => {
	const span = (code: string, ...after: string[]) =>
		lines('root', '  paragraph', `    code_span ${code}`, ...after);

	test('loses the space on each side, as on one line', () => {
		expect(every_path('` a b `\n')).toBe(span('"a b"', '  line_break'));
		expect(every_path('` a\nb `\n')).toBe(span('"a\\nb"', '  line_break'));
		expect(every_path('`` a\nb ``\n')).toBe(span('"a\\nb"', '  line_break'));
		expect(every_path('` a\nb\nc `\n')).toBe(
			span('"a\\nb\\nc"', '  line_break')
		);
		expect(every_path('` a\nb `')).toBe(span('"a\\nb"'));
	});

	test('loses one space of several', () => {
		expect(every_path('`  a  `\n')).toBe(span('" a "', '  line_break'));
		expect(every_path('`  a\nb  `\n')).toBe(span('" a\\nb "', '  line_break'));
	});

	test('keeps a space that has none on the other side', () => {
		expect(every_path('` a b`\n')).toBe(span('" a b"', '  line_break'));
		expect(every_path('` a\nb`\n')).toBe(span('" a\\nb"', '  line_break'));
		expect(every_path('`a b `\n')).toBe(span('"a b "', '  line_break'));
		expect(every_path('`a\nb `\n')).toBe(span('"a\\nb "', '  line_break'));
	});

	test('with the space next to the line end', () => {
		expect(every_path('` \nb `\n')).toBe(span('"\\nb"', '  line_break'));
		expect(every_path('` a\n `\n')).toBe(span('"a\\n"', '  line_break'));
		expect(every_path('` a\n`\n')).toBe(span('" a\\n"', '  line_break'));
	});

	test('after a language hint', () => {
		expect(every_path('`#!js  a b `\n')).toBe(
			span('info="js" "a b"', '  line_break')
		);
		expect(every_path('`#!js  a\nb `\n')).toBe(
			span('info="js" "a\\nb"', '  line_break')
		);
	});

	test('in a block quote, where the space after a marker is no padding', () => {
		const quoted = (code: string) =>
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				`      code_span ${code}`,
				'  line_break'
			);
		expect(every_path('> ` a b `\n')).toBe(quoted('"a b"'));
		expect(every_path('> ` a\n> b `\n')).toBe(quoted('"a\\nb"'));
		expect(every_path('> ` a\n>  `\n')).toBe(quoted('"a\\n"'));
		expect(every_path('> ` a\n> `\n')).toBe(quoted('" a\\n"'));
		expect(every_path('> ` a\n>` b\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      code_span " a\\n"',
				'      text " b"',
				'  line_break'
			)
		);
	});

	test('in a list item', () => {
		expect(every_path('- ` a\n  b `\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      code_span "a\\nb"',
				'  line_break'
			)
		);
	});

	test('a span that fails at a blank line keeps every space', () => {
		expect(every_path('` a\n\nb `\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "`"',
				'    text " a"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b "',
				'    text "`"',
				'  line_break'
			)
		);
	});

	function codes(source: string): string[] {
		const { nodes } = parse_markdown_svelte(source);
		return nodes.get_kinds(NodeKind.code_span).map((index) => {
			const [start, end] = nodes.get_node(index).value;
			return nodes._strings[index] ?? source.slice(start, end);
		});
	}

	test('random spans hold the code they hold on one line', () => {
		const rand = random(984);
		const pieces = ['`', '`', '``', 'a', 'b c', ' ', ' ', '*', '\\'];
		// stands for the line end on the one line, plain to every state
		const JOIN = 'z';
		for (let i = 0; i < 500; i++) {
			const rows: string[] = [];
			const count = 2 + Math.floor(rand() * 2);
			for (let l = 0; l < count; l++) {
				// a letter first, a backtick run at a line start may be a fence
				let row = pick(rand, ['a', 'b c', 'x ']);
				const length = Math.floor(rand() * 5);
				for (let k = 0; k < length; k++) row += pick(rand, pieces);
				// a line that ends in a backslash is a hard break outside a span
				rows.push(row.replace(/\\+$/, '') + pick(rand, ['', '', ' ', 'a']));
			}
			const over = rows.join('\n') + '\n';
			const one = rows.join(JOIN) + '\n';
			const label = JSON.stringify(over);
			expect(codes(over), label).toEqual(
				codes(one).map((code) => code.replaceAll(JOIN, '\n'))
			);
			expect(problems(over, 0), label).toEqual([]);
			expect(problems(over, 1), label).toEqual([]);
		}
	});
});

describe('a code span ends where its paragraph ends', () => {
	test('at a heading line', () => {
		expect(every_path('x `a\n# b`\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    text "`"',
				'    text "a"',
				'  line_break',
				'  heading depth=1 "b`"',
				'    text "b"',
				'    text "`"',
				'  line_break'
			)
		);
	});

	test('at the end of a heading', () => {
		expect(every_path('# `a\nb`\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "`a"',
				'    text "`"',
				'    text "a"',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'    text "`"',
				'  line_break'
			)
		);
		expect(every_path('# ` a\nb `\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "` a"',
				'    text "`"',
				'    text " a"',
				'  line_break',
				'  paragraph',
				'    text "b "',
				'    text "`"',
				'  line_break'
			)
		);
	});

	test('at a list item', () => {
		expect(every_path('- x `a\n- b`\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "x "',
				'      text "`"',
				'      text "a"',
				'    list_item',
				'      text "b"',
				'      text "`"',
				'  line_break'
			)
		);
		expect(every_path('x `a\n- b`\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    text "`"',
				'    text "a"',
				'  line_break',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "b"',
				'      text "`"',
				'  line_break'
			)
		);
	});

	test('at a thematic break', () => {
		expect(every_path('x `a\n---\nb`\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    text "`"',
				'    text "a"',
				'  line_break',
				'  thematic_break',
				'  paragraph',
				'    text "b"',
				'    text "`"',
				'  line_break'
			)
		);
	});

	test('at a fence', () => {
		expect(every_path('x `a\n```\nb`\n```\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    text "`"',
				'    text "a"',
				'  line_break',
				'  code_fence "b`"'
			)
		);
	});

	test('at the close of a container directive', () => {
		expect(every_path(':::x[]\n`a\n:::\nb`\n')).toBe(
			lines(
				'root',
				'  directive_container name="x"',
				'    paragraph',
				'      text "`"',
				'      text "a"',
				'    line_break',
				'  paragraph',
				'    text "b"',
				'    text "`"',
				'  line_break'
			)
		);
	});

	test('with a language hint or padding', () => {
		expect(every_path('x `#!js a\n# b`\n')).toContain('heading depth=1 "b`"');
		expect(every_path('x ` a\n# b `\n')).toContain('heading depth=1 "b `"');
		expect(every_path('x ``a\n# b``\n')).toContain('heading depth=1 "b``"');
	});

	test('inside another inline node', () => {
		expect(every_path('*x `a\n# b`*\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "*"',
				'    text "x "',
				'    text "`"',
				'    text "a"',
				'  line_break',
				'  heading depth=1 "b`*"',
				'    text "b"',
				'    text "`"',
				'    text "*"',
				'  line_break'
			)
		);
	});

	test('a line that goes on with the paragraph stays in the span', () => {
		expect(every_path('x `a\nb` c\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    code_span "a\\nb"',
				'    text " c"',
				'  line_break'
			)
		);
		expect(every_path('x `a\n#b\n-c\n1.d` e\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    text "x "',
				'    code_span "a\\n#b\\n-c\\n1.d"',
				'    text " e"',
				'  line_break'
			)
		);
		expect(every_path('- x `a\n  b` c\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "x "',
				'      code_span "a\\nb"',
				'      text " c"',
				'  line_break'
			)
		);
	});

	/** the blocks of a tree, a line per node with its depth */
	function blocks(source: string): string {
		const inline =
			/^ *(text|code_span|soft_break|hard_break|line_break|emphasis|strong_emphasis)\b/;
		return print_ast(parse_markdown_svelte(source).nodes, source)
			.split('\n')
			.filter((row) => !inline.test(row))
			.map((row) => row.replace(/ ".*$/, ''))
			.join('\n');
	}

	test('random lines build the blocks they build with a letter for each backtick', () => {
		const rand = random(979);
		const starts = ['a', 'b c', 'x `', '# ', '- ', '1. ', '> ', '---', '  '];
		const pieces = ['`', '`', '``', 'a', 'b c', ' ', '*', '-', '#'];
		const differ: string[] = [];
		for (let i = 0; i < 1500; i++) {
			let source = '';
			const count = 2 + Math.floor(rand() * 3);
			for (let l = 0; l < count; l++) {
				let row = pick(rand, starts);
				const length = Math.floor(rand() * 4);
				for (let k = 0; k < length; k++) row += pick(rand, pieces);
				source += row + '\n';
			}
			// three backticks may be a fence, which no letters are
			if (source.includes('```')) continue;
			if (blocks(source) !== blocks(source.replaceAll('`', 'q')))
				differ.push(JSON.stringify(source));
			if (i % 5 === 0) {
				expect(problems(source, 0), JSON.stringify(source)).toEqual([]);
				expect(problems(source, 1), JSON.stringify(source)).toEqual([]);
				expect(fed_mismatch(source), JSON.stringify(source)).toBe('');
			}
		}
		expect(differ).toEqual([]);
	});
});

describe('a code span of one space', () => {
	const span = (...rows: string[]) => lines('root', '  paragraph', ...rows);

	test('closes at the backtick after the space', () => {
		expect(every_path('a ` ` b\n')).toBe(
			span(
				'    text "a "',
				'    code_span " "',
				'    text " b"',
				'  line_break'
			)
		);
		expect(every_path('` `\n')).toBe(span('    code_span " "', '  line_break'));
		expect(every_path('` `')).toBe(span('    code_span " "'));
		expect(every_path('`` ``\n')).toBe(
			span('    code_span " "', '  line_break')
		);
		expect(every_path('`` ``')).toBe(span('    code_span " "'));
	});

	test('leaves a later backtick to open a span of its own', () => {
		expect(every_path('` `x`\n')).toBe(
			span('    code_span " "', '    text "x"', '    text "`"', '  line_break')
		);
		expect(every_path('` `x` `\n')).toBe(
			span(
				'    code_span " "',
				'    text "x"',
				'    code_span " "',
				'  line_break'
			)
		);
	});

	test('does not close at a run of another length', () => {
		expect(every_path('` `` `\n')).toBe(
			span('    code_span "``"', '  line_break')
		);
		expect(every_path('`` ` ``\n')).toBe(
			span('    code_span "`"', '  line_break')
		);
		expect(every_path('` ``\n')).toBe(
			span('    text "`"', '    text " "', '    text "``"', '  line_break')
		);
		expect(every_path('`` `\n')).toBe(
			span('    text "``"', '    text " "', '    text "`"', '  line_break')
		);
	});

	test('in a heading, a list item, a block quote and a strong emphasis', () => {
		expect(every_path('# ` `\n')).toContain('    code_span " "');
		expect(every_path('- ` `\n')).toContain('      code_span " "');
		expect(every_path('> ` `\n')).toContain('      code_span " "');
		expect(every_path('*` `*\n')).toContain('      code_span " "');
	});

	test('in a table cell', () => {
		both(' ` ` ', ['code_span " "']);
		both('` `', ['code_span " "']);
		both(' `` `` ', ['code_span " "']);
		both(' a ` ` b ', ['text "a "', 'code_span " "', 'text " b"']);
	});

	function codes(source: string): string[] {
		const { nodes } = parse_markdown_svelte(source);
		return nodes.get_kinds(NodeKind.code_span).map((index) => {
			const [start, end] = nodes.get_node(index).value;
			return nodes._strings[index] ?? source.slice(start, end);
		});
	}

	function run_at(row: string, at: number): number {
		let length = 0;
		while (row[at + length] === '`') length++;
		return length;
	}

	/** the code of each span of a line, a run closes at the next run of its length */
	function scanned(row: string): string[] | null {
		const out: string[] = [];
		let at = 0;
		while (at < row.length) {
			const run = run_at(row, at);
			if (run === 0) {
				at++;
				continue;
			}
			let close = at + run;
			while (close < row.length) {
				const next = run_at(row, close);
				if (next === run) break;
				close += next === 0 ? 1 : next;
			}
			if (close >= row.length) {
				at += run;
				continue;
			}
			let code = row.slice(at + run, close);
			// what three or more spaces alone hold is not pinned here
			if (code.length > 2 && code.trim() === '') return null;
			if (code.length > 2 && code.startsWith(' ') && code.endsWith(' '))
				code = code.slice(1, -1);
			out.push(code);
			at = close + run;
		}
		return out;
	}

	test('random lines of backticks and spaces hold the spans a scan finds', () => {
		const rand = random(1003);
		const pieces = ['`', '`', '``', 'a', ' ', ' ', 'b c'];
		for (let i = 0; i < 3000; i++) {
			// a letter first, a backtick run at a line start may be a fence
			let row = pick(rand, ['a', 'x ', 'a ']);
			const length = 1 + Math.floor(rand() * 7);
			for (let k = 0; k < length; k++) row += pick(rand, pieces);
			if (row.includes('```')) continue;
			const want = scanned(row);
			if (want === null) continue;
			const source = row + '\n';
			const label = JSON.stringify(source);
			expect(codes(source), label).toEqual(want);
			if (i % 5 === 0) {
				expect(problems(source, 0), label).toEqual([]);
				expect(problems(source, 1), label).toEqual([]);
				expect(fed_mismatch(source), label).toBe('');
			}
		}
	});
});
