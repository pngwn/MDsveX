import { describe, expect, test } from 'vitest';

import { get_all_child_kinds, get_content } from './utils';

import { parse_markdown_svelte } from '../src/main';

describe('svelte void tags - {@tag ...}', () => {
	test('{@html content}', () => {
		const input = '{@html "<b>bold</b>"}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const tag = nodes.get_node(paragraph.children[0]);
		expect(tag.kind).toBe('svelte_tag');
		expect(tag.metadata.tag).toBe('html');
		const { content, value } = get_content(nodes, tag.index, input);
		expect(content).toBe('{@html "<b>bold</b>"}');
		expect(value).toBe('"<b>bold</b>"');
	});

	test('{@debug var}', () => {
		const input = '{@debug myVar}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const tag = nodes.get_node(paragraph.children[0]);
		expect(tag.kind).toBe('svelte_tag');
		expect(tag.metadata.tag).toBe('debug');
		const { value } = get_content(nodes, tag.index, input);
		expect(value).toBe('myVar');
	});

	test('{@const assignment}', () => {
		const input = '{@const x = 1 + 2}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const tag = nodes.get_node(paragraph.children[0]);
		expect(tag.kind).toBe('svelte_tag');
		expect(tag.metadata.tag).toBe('const');
		const { value } = get_content(nodes, tag.index, input);
		expect(value).toBe('x = 1 + 2');
	});

	test('{@render snippet()}', () => {
		const input = '{@render header()}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const tag = nodes.get_node(paragraph.children[0]);
		expect(tag.kind).toBe('svelte_tag');
		expect(tag.metadata.tag).toBe('render');
		const { value } = get_content(nodes, tag.index, input);
		expect(value).toBe('header()');
	});

	test('void tag mixed with text', () => {
		const input = 'before {@html raw} after';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toEqual(['text', 'svelte_tag', 'text']);

		const tag = nodes.get_node(paragraph.children[1]);
		expect(tag.metadata.tag).toBe('html');
		const { value } = get_content(nodes, tag.index, input);
		expect(value).toBe('raw');
	});

	test('void tag with no expression', () => {
		const input = '{@debug}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const tag = nodes.get_node(paragraph.children[0]);
		expect(tag.kind).toBe('svelte_tag');
		expect(tag.metadata.tag).toBe('debug');
		// No value, tag has no expression content
		const { value } = get_content(nodes, tag.index, input);
		expect(value).toBe('');
	});

	test('void tag with complex expression', () => {
		const input = '{@html items.map(i => `<li>${i}</li>`).join("")}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const tag = nodes.get_node(paragraph.children[0]);
		expect(tag.kind).toBe('svelte_tag');
		expect(tag.metadata.tag).toBe('html');
		const { value } = get_content(nodes, tag.index, input);
		expect(value).toBe('items.map(i => `<li>${i}</li>`).join("")');
	});

	test('not parsed inside code span', () => {
		const input = '`{@html raw}`';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toEqual(['code_span']);
	});

	test('{@ with no tag name is a regular expression', () => {
		const input = '{@}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const tag = nodes.get_node(paragraph.children[0]);
		// @ alone with no name, still detected as tag with name "@" or falls through
		// Actually: the scan starts at cursor+2, and the next char is }, so tag_name is ""
		// which means tag_name.length === 0, so it falls through to mustache
		expect(tag.kind).toBe('mustache');
	});
});
