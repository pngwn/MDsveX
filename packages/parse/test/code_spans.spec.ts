import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import { node_kind } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, '../../pfm-tests/tests/code_spans');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, id, 'input.md'), 'utf8');

describe('fenced code blocks', () => {
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('code span with more than 2 backticks is a text node', () => {
		const input = 'hi ```foo```';
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const child = nodes.get_node(paragraph.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(child.kind).toBe('text');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input);
		expect(input.slice(child.start, child.end)).toBe(input);
		expect(input.slice(child.value[0], child.value[1])).toBe(input);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 334', () => {
		const input = load_fixture('334');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);
		const code_span_2 = nodes.get_node(paragraph.children[1]);

		expect(nodes.size).toBe(4);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});

	test('pfm example 338', () => {
		const input = load_fixture('338');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);
		const text = nodes.get_node(paragraph.children[1]);

		expect(nodes.size).toBe(4);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');
		expect(text.kind).toBe('text');

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

		expect(input.slice(text.start, text.end)).toBe('bar`');
		expect(text.start).toBe(6);
		expect(text.end).toBe(10);
		expect(input.slice(text.value[0], text.value[1])).toEqual('bar`');
		expect(text.value).toEqual([6, 10]);

		expect(nodes.get_kinds(node_kind.paragraph).length).toEqual(1);
		expect(nodes.get_kinds(node_kind.code_span).length).toEqual(1);
		expect(nodes.get_kinds(node_kind.text).length).toEqual(1);
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

		expect(nodes.get_kinds(node_kind.paragraph).length).toEqual(1);
		expect(nodes.get_kinds(node_kind.code_span).length).toEqual(1);
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

		expect(nodes.get_kinds(node_kind.paragraph).length).toEqual(1);
		expect(nodes.get_kinds(node_kind.code_span).length).toEqual(1);
	});

	// TODO: implement when we have emphasis support
	test.todo('pfm example 341', () => {
		const input = load_fixture('341');
		const { nodes } = parse_markdown_svelte(input);
	});

	// TODO: implement when we have link support
	test.todo('pfm example 342', () => {
		const input = load_fixture('342');
		const { nodes } = parse_markdown_svelte(input);
	});

	// TODO: implement when we have autolink support
	test.todo('pfm example 343', () => {
		const input = load_fixture('343');
		const { nodes } = parse_markdown_svelte(input);
	});

	// TODO: implement when we have html support
	test.todo('pfm example 344', () => {
		const input = load_fixture('344');
		const { nodes } = parse_markdown_svelte(input);
	});

	// TODO: implement when we have autolink support
	test.todo('pfm example 345', () => {
		const input = load_fixture('345');
		const { nodes } = parse_markdown_svelte(input);
	});

	// TODO: implement when we have autolink support
	test.todo('pfm example 346', () => {
		const input = load_fixture('346');
		const { nodes } = parse_markdown_svelte(input);
	});

	test('pfm example 347', () => {
		const input = load_fixture('347');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();

		const code_fence = nodes.get_node(root.children[0]);

		expect(nodes.size).toBe(2);
		expect(code_fence.kind).toBe('code_fence');
	});

	test('pfm example 348', () => {
		const input = load_fixture('348');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const text = nodes.get_node(paragraph.children[0]);
		const text_2 = nodes.get_node(text.children[0]);

		expect(nodes.size).toBe(3);
		expect(paragraph.kind).toBe('paragraph');
		expect(text.kind).toBe('text');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(4);

		expect(input.slice(text.start, text.end)).toBe('`foo');
		expect(text.start).toBe(0);
		expect(text.end).toBe(4);
	});

	// TODO: this is totally wrong but i'm not sure how
	test('pfm example 349', () => {
		const input = load_fixture('349');
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const code_span = nodes.get_node(paragraph.children[0]);
		const text = nodes.get_node(paragraph.children[1]);

		expect(nodes.size).toBe(4);
		expect(paragraph.kind).toBe('paragraph');
		expect(code_span.kind).toBe('code_span');
		expect(text.kind).toBe('text');

		expect(input.slice(paragraph.start, paragraph.end)).toBe(input.trim());
		expect(paragraph.start).toBe(0);
		expect(paragraph.end).toBe(11);

		expect(input.slice(code_span.start, code_span.end)).toBe('`foo``');
		expect(input.slice(code_span.value[0], code_span.value[1])).toEqual('foo`');
		expect(code_span.start).toBe(0);
		expect(code_span.end).toBe(6);

		expect(input.slice(text.start, text.end)).toBe('bar``');
		expect(text.start).toBe(6);
		expect(text.end).toBe(11);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
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

		const paragraph_kinds = nodes.get_kinds(node_kind.paragraph);
		const code_span_kinds = nodes.get_kinds(node_kind.code_span);
		expect(paragraph_kinds.length).toBe(1);
		expect(code_span_kinds.length).toBe(1);
	});
});
