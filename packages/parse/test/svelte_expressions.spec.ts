import { describe, expect, test } from 'vitest';

import { get_all_child_kinds, get_content } from './utils';

import { parse_markdown_svelte } from '../src/main';

describe('svelte expressions - inline', () => {
	test('simple expression in paragraph', () => {
		const input = 'hello {name} world';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(paragraph.kind).toBe('paragraph');

		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toEqual(['text', 'mustache', 'text']);

		const mustache = nodes.get_node(paragraph.children[1]);
		expect(mustache.kind).toBe('mustache');
		const { content, value } = get_content(nodes, mustache.index, input);
		expect(content).toBe('{name}');
		expect(value).toBe('name');
	});

	test('expression at start of paragraph', () => {
		const input = '{greeting} world';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toEqual(['mustache', 'text']);

		const mustache = nodes.get_node(paragraph.children[0]);
		const { value } = get_content(nodes, mustache.index, input);
		expect(value).toBe('greeting');
	});

	test('expression at end of paragraph', () => {
		const input = 'hello {name}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toEqual(['text', 'mustache']);
	});

	test('expression with nested braces (object literal)', () => {
		const input = 'value: {({ key: "val" })}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toContain('mustache');

		const mustache = nodes.get_node(paragraph.children[1]);
		const { value } = get_content(nodes, mustache.index, input);
		expect(value).toBe('({ key: "val" })');
	});

	test('expression with template literal', () => {
		const input = 'say {`hello ${name}`}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toContain('mustache');

		const mustache = nodes.get_node(paragraph.children[1]);
		const { value } = get_content(nodes, mustache.index, input);
		expect(value).toBe('`hello ${name}`');
	});

	test('expression with string containing braces', () => {
		const input = 'test {"{braces}"}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toContain('mustache');

		const mustache = nodes.get_node(paragraph.children[1]);
		const { value } = get_content(nodes, mustache.index, input);
		expect(value).toBe('"{braces}"');
	});

	test('multiple expressions in one paragraph', () => {
		const input = '{first} and {second}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toEqual(['mustache', 'text', 'mustache']);
	});

	test('expression not parsed inside code span', () => {
		const input = '`{notExpression}`';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).toEqual(['code_span']);
		// No mustache node, braces are just text inside code
	});

	test('expression not parsed inside code fence', () => {
		const input = '```\n{notExpression}\n```';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const kinds = get_all_child_kinds(nodes, root.index);
		expect(kinds).toEqual(['code_fence']);
		// No mustache node inside code fences
	});

	test('expression with function call', () => {
		const input = '{formatDate(new Date())}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const mustache = nodes.get_node(paragraph.children[0]);
		const { value } = get_content(nodes, mustache.index, input);
		expect(value).toBe('formatDate(new Date())');
	});

	test('unmatched open brace treated as text', () => {
		const input = 'a { b';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const kinds = get_all_child_kinds(nodes, paragraph.index);
		expect(kinds).not.toContain('mustache');
	});
});

describe('svelte expressions - HTML attributes', () => {
	test('expression as attribute value', () => {
		const input = '<div class={styles}></div>';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const html = nodes.get_node(root.children[0]);
		expect(html.kind).toBe('html');
		expect(html.metadata.tag).toBe('div');
		expect(html.metadata.attributes.class).toBe('styles');
	});

	test('expression attribute with complex value', () => {
		const input = '<span class={active ? "on" : "off"}></span>';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const html = nodes.get_node(root.children[0]);
		expect(html.metadata.attributes.class).toBe('active ? "on" : "off"');
	});

	test('shorthand expression attribute', () => {
		const input = '<div {class}></div>';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const html = nodes.get_node(root.children[0]);
		expect(html.metadata.tag).toBe('div');
		expect(html.metadata.attributes.class).toBe('class');
	});
});
