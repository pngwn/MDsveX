import { describe, expect, test } from 'vitest';

import { get_all_child_kinds, get_content } from './utils';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { print_ast } from './print';

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

	test.each([
		['hi *{name}*', 'strong_emphasis'],
		['hi _{name}_', 'emphasis'],
		['hi ~{name}~', 'subscript'],
		['hi ^{name}^', 'superscript'],
		['hi ~~{name}~~', 'strikethrough'],
	])('expression wrapped in delimiters: %s', (input, kind) => {
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual(['text', kind]);

		const wrapper = nodes.get_node(paragraph.children[1]);
		expect(get_all_child_kinds(nodes, wrapper.index)).toEqual(['mustache']);
	});

	test('expression after text closes the delimiter', () => {
		const input = '*a {name}* b';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		expect(get_all_child_kinds(nodes, paragraph.index)).toEqual([
			'strong_emphasis',
			'text',
		]);
		const strong = nodes.get_node(paragraph.children[0]);
		expect(get_all_child_kinds(nodes, strong.index)).toEqual([
			'text',
			'mustache',
		]);
	});

	test('nested delimiters around an expression', () => {
		const input = '*_{name}_*';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const strong = nodes.get_node(paragraph.children[0]);
		expect(strong.kind).toBe('strong_emphasis');
		const emphasis = nodes.get_node(strong.children[0]);
		expect(emphasis.kind).toBe('emphasis');
		expect(get_all_child_kinds(nodes, emphasis.index)).toEqual(['mustache']);
	});

	test('svelte tag wrapped in delimiters', () => {
		const input = '*{@html x}*';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = nodes.get_node(root.children[0]);
		const strong = nodes.get_node(paragraph.children[0]);
		expect(strong.kind).toBe('strong_emphasis');
		expect(get_all_child_kinds(nodes, strong.index)).toEqual(['svelte_tag']);
	});

	test('delimiters around expressions match when fed in chunks', () => {
		const input = '*{name}* b ~~{a}~~ ^{b}^ ~{c}~ _{d}_';
		const expected = print_ast(parse_markdown_svelte(input).nodes, input);
		expect(expected).toBe(
			'root\n  paragraph\n    strong_emphasis\n      mustache "name"\n    text " b "\n    strikethrough\n      mustache "a"\n    text " "\n    superscript\n      mustache "b"\n    text " "\n    subscript\n      mustache "c"\n    text " "\n    emphasis\n      mustache "d"'
		);
		for (let size = 1; size <= 8; size++) {
			const tree = new TreeBuilder(input.length);
			const parser = new PFMParser(tree);
			parser.init();
			for (let i = 0; i < input.length; i += size) {
				parser.feed(input.slice(i, i + size));
			}
			parser.finish();
			expect(print_ast(tree.get_buffer(), input), `chunk size ${size}`).toBe(
				expected
			);
		}
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
		expect(html.metadata.attributes.class).toEqual({
			type: 'expression',
			value: 'styles',
		});
	});

	test('expression attribute with complex value', () => {
		const input = '<span class={active ? "on" : "off"}></span>';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const html = nodes.get_node(root.children[0]);
		expect(html.metadata.attributes.class).toEqual({
			type: 'expression',
			value: 'active ? "on" : "off"',
		});
	});

	test('shorthand expression attribute', () => {
		const input = '<div {class}></div>';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const html = nodes.get_node(root.children[0]);
		expect(html.metadata.tag).toBe('div');
		expect(html.metadata.attributes.class).toEqual({
			type: 'expression',
			value: 'class',
		});
	});
});
