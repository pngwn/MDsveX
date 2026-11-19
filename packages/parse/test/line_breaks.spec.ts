import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'vitest';
import { parse_markdown_svelte } from '../src/main';
import { NodeKind } from '../src/utils';
import type { NodeBuffer } from '../src/utils';
import { get_content, get_all_child_kinds } from './utils';
import { checked_tree, lines } from './stream_shape';

const this_dir = dirname(fileURLToPath(import.meta.url));
const hard_dir = resolve(this_dir, 'fixtures/pfm/hard_line_breaks');
const soft_dir = resolve(this_dir, 'fixtures/pfm/soft_line_breaks');

const load_hard = (id: string): string =>
	readFileSync(resolve(hard_dir, `${id}.md`), 'utf8');
const load_soft = (id: string): string =>
	readFileSync(resolve(soft_dir, `${id}.md`), 'utf8');

function non_breaks(nodes: NodeBuffer, parent: number = 0) {
	return nodes
		.get_node(parent)
		.children.map((i) => nodes.get_node(i))
		.filter((n) => n.kind !== 'line_break');
}

function get_value(nodes: NodeBuffer, index: number, source: string) {
	const node = nodes.get_node(index);
	return source.slice(node.value[0], node.value[1]);
}

describe('Hard line breaks (PFM: backslash only)', () => {
	test('634: backslash before newline creates hard_break', () => {
		// foo\<LF>baz
		const input = load_hard('634');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single paragraph with: text("foo") + hard_break + text("baz")
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).toContain('hard_break');

		// Check text content around the break
		const texts = para_children
			.map((i) => nodes.get_node(i))
			.filter((n) => n.kind === 'text');
		expect(get_value(nodes, texts[0].index, input)).toBe('foo');
		expect(get_value(nodes, texts[1].index, input)).toBe('baz');
	});

	test('633: PFM, trailing spaces do NOT create hard break', () => {
		// foo  <LF>baz (2 trailing spaces)
		const input = load_hard('633');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// In PFM, trailing spaces are just text, not a hard break
		// Single paragraph, no hard_break node
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).not.toContain('hard_break');
	});

	test('635: PFM, many trailing spaces do NOT create hard break', () => {
		// foo       <LF>baz
		const input = load_hard('635');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).not.toContain('hard_break');
	});

	test('637: backslash hard break strips leading spaces on next line', () => {
		// foo\<LF>   bar
		const input = load_hard('637');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		const para_children = nodes.get_node(children[0].index).children;
		const kinds = para_children.map((i) => nodes.get_node(i).kind);
		expect(kinds).toContain('hard_break');

		// "bar" text should not have leading spaces
		const texts = para_children
			.map((i) => nodes.get_node(i))
			.filter((n) => n.kind === 'text');
		const bar_text = get_value(nodes, texts[texts.length - 1].index, input);
		expect(bar_text).toBe('bar');
	});

	test('639: hard break inside emphasis (backslash)', () => {
		// *foo\<LF>bar*
		const input = load_hard('639');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		// The paragraph should contain a strong_emphasis with hard_break inside
		const para_children = nodes
			.get_node(children[0].index)
			.children.map((i) => nodes.get_node(i));

		// Find the strong_emphasis
		const emph = para_children.find((n) => n.kind === 'strong_emphasis');
		expect(emph).toBeDefined();

		if (emph) {
			const emph_children = nodes
				.get_node(emph.index)
				.children.map((i) => nodes.get_node(i));
			const emph_kinds = emph_children.map((n) => n.kind);
			expect(emph_kinds).toContain('hard_break');
		}
	});

	test('644: a backslash at the end of the paragraph is text', () => {
		// foo\<LF> (backslash at end, no continuation)
		expect(checked_tree(load_hard('644'))).toBe(
			lines('root', '  paragraph', '    text "foo\\\\"', '  line_break')
		);
	});
});

describe('a backslash before a line that ends the block', () => {
	const para = (...rest: string[]) =>
		lines('root', '  paragraph', '    text "x\\\\"', '  line_break', ...rest);

	test('a blank line', () => {
		expect(checked_tree('x\\\n\ny\n')).toBe(
			para('  line_break', '  paragraph', '    text "y"', '  line_break')
		);
	});

	test('a line of spaces', () => {
		expect(checked_tree('x\\\n   \ny\n')).toBe(
			para('  line_break', '  paragraph', '    text "y"', '  line_break')
		);
	});

	test('the end of the input', () => {
		expect(checked_tree('x\\\n')).toBe(para());
		expect(checked_tree('x\\')).toBe(
			lines('root', '  paragraph', '    text "x\\\\"')
		);
	});

	test('a heading', () => {
		expect(checked_tree('x\\\n# h\n')).toBe(
			para('  heading depth=1 "h"', '    text "h"', '  line_break')
		);
	});

	test('a thematic break', () => {
		expect(checked_tree('x\\\n---\n')).toBe(para('  thematic_break'));
	});

	test('a code fence', () => {
		expect(checked_tree('x\\\n```\ncode\n```\n')).toBe(
			para('  code_fence "code"')
		);
	});

	test('a block quote', () => {
		expect(checked_tree('x\\\n> q\n')).toBe(
			para('  block_quote', '    paragraph', '      text "q"', '  line_break')
		);
	});

	test('a list', () => {
		expect(checked_tree('x\\\n- a\n')).toBe(
			para(
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a"',
				'  line_break'
			)
		);
	});

	test('a block level tag', () => {
		expect(checked_tree('x\\\n<div>\ny\n</div>\n')).toBe(
			checked_tree('x\n<div>\ny\n</div>\n').replace('"x"', '"x\\\\"')
		);
	});

	test('a leaf directive', () => {
		expect(checked_tree('x\\\n::toc[]\n')).toBe(
			para('  directive_leaf name="toc"')
		);
	});

	test('a svelte block', () => {
		expect(checked_tree('x\\\n{#if a}\ny\n{/if}\n')).toBe(
			checked_tree('x\n{#if a}\ny\n{/if}\n').replace('"x"', '"x\\\\"')
		);
	});

	test('the close of a svelte block', () => {
		expect(checked_tree('{#if a}\nx\\\n{/if}\n')).toBe(
			checked_tree('{#if a}\nx\n{/if}\n').replace('"x"', '"x\\\\"')
		);
	});

	test('the close of a container directive', () => {
		expect(checked_tree(':::box\nx\\\n:::\n')).toBe(
			checked_tree(':::box\nx\n:::\n').replace('"x"', '"x\\\\"')
		);
	});

	test('the close tag of a block level element', () => {
		expect(checked_tree('<div>\nx\\\n</div>\n')).toBe(
			checked_tree('<div>\nx\n</div>\n').replace('"x"', '"x\\\\"')
		);
	});

	test('the next list item', () => {
		expect(checked_tree('- a\\\n- b\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      text "a\\\\"',
				'    list_item',
				'      text "b"',
				'  line_break'
			)
		);
	});

	test('a nested list', () => {
		expect(checked_tree('- a\\\n  - b\n')).toBe(
			checked_tree('- a\n  - b\n').replace('"a"', '"a\\\\"')
		);
	});

	test('a blank line in a list item', () => {
		expect(checked_tree('- a\\\n\n  b\n')).toBe(
			checked_tree('- a\n\n  b\n').replace('"a"', '"a\\\\"')
		);
	});

	test('a blank line inside strong emphasis', () => {
		expect(checked_tree('**x\\\n\ny**\n')).toBe(
			checked_tree('**x\n\ny**\n').replace('"*x"', '"*x\\\\"')
		);
		expect(checked_tree('**x\\\n\ny**\n')).not.toContain('strong_emphasis');
	});

	test('a blank line inside link text', () => {
		expect(checked_tree('[x\\\n\ny](z)\n')).toBe(
			checked_tree('[x\n\ny](z)\n').replace('"[x"', '"[x\\\\"')
		);
	});

	test('after a code span, where no text is open', () => {
		expect(checked_tree('`a`\\\n# h\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    code_span "a"',
				'    text "\\\\"',
				'  line_break',
				'  heading depth=1 "h"',
				'    text "h"',
				'  line_break'
			)
		);
	});

	test('a heading ends at its linefeed', () => {
		expect(checked_tree('# h\\\ny\n')).toBe(
			lines(
				'root',
				'  heading depth=1 "h\\\\"',
				'    text "h\\\\"',
				'  line_break',
				'  paragraph',
				'    text "y"',
				'  line_break'
			)
		);
	});

	test('a table row ends at its linefeed', () => {
		expect(checked_tree('| a |\n| - |\n| b\\\n| c |\n')).toBe(
			checked_tree('| a |\n| - |\n| b\n| c |\n').replace('"b"', '"b\\\\"')
		);
	});
});

describe('a backslash before a line that ends the block, in a block quote', () => {
	const quote = (...rest: string[]) =>
		lines(
			'root',
			'  block_quote',
			'    paragraph',
			'      text "a\\\\"',
			...rest
		);

	test('an unmarked line ends the quote', () => {
		expect(checked_tree('> a\\\n\nb\n')).toBe(
			quote(
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "b"',
				'  line_break'
			)
		);
		expect(checked_tree('> a\\\nb\n')).toBe(
			quote('  line_break', '  paragraph', '    text "b"', '  line_break')
		);
	});

	test('a blank marked line', () => {
		expect(checked_tree('> a\\\n>\n> b\n')).toBe(
			checked_tree('> a\n>\n> b\n').replace('"a"', '"a\\\\"')
		);
	});

	test('a heading', () => {
		expect(checked_tree('> a\\\n> # h\n')).toBe(
			quote('    heading depth=1 "h"', '      text "h"', '  line_break')
		);
	});

	test('a nested quote', () => {
		expect(checked_tree('> a\\\n> > b\n')).toBe(
			quote(
				'    block_quote',
				'      paragraph',
				'        text "b"',
				'  line_break'
			)
		);
	});

	test('the next list item', () => {
		expect(checked_tree('> - a\\\n> - b\n')).toBe(
			checked_tree('> - a\n> - b\n').replace('"a"', '"a\\\\"')
		);
	});

	test('the close of a container directive', () => {
		expect(checked_tree('> :::box\n> x\\\n> :::\n')).toBe(
			checked_tree('> :::box\n> x\n> :::\n').replace('"x"', '"x\\\\"')
		);
	});
});

describe('a backslash before a line that goes on with the block', () => {
	const broken_para = (...rest: string[]) =>
		lines('root', '  paragraph', '    text "x"', '    hard_break', ...rest);

	test('text', () => {
		expect(checked_tree('x\\\ny\n')).toBe(
			broken_para('    text "y"', '  line_break')
		);
		expect(checked_tree('x\\\ny')).toBe(broken_para('    text "y"'));
	});

	test('two breaks in a row', () => {
		expect(checked_tree('x\\\n\\\ny\n')).toBe(
			broken_para('    hard_break', '    text "y"', '  line_break')
		);
	});

	test('a break then a backslash that ends the paragraph', () => {
		expect(checked_tree('x\\\ny\\\n\nz\n')).toBe(
			broken_para(
				'    text "y\\\\"',
				'  line_break',
				'  line_break',
				'  paragraph',
				'    text "z"',
				'  line_break'
			)
		);
	});

	test('an inline tag', () => {
		expect(checked_tree('x\\\n<Chart />\n')).toBe(
			broken_para('    html tag="Chart" self_closing=true', '  line_break')
		);
	});

	test('a marked line of a block quote', () => {
		expect(checked_tree('> a\\\n> b\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    paragraph',
				'      text "a"',
				'      hard_break',
				'      text "b"',
				'  line_break'
			)
		);
	});

	test('a list item, indented or not', () => {
		const item = lines(
			'root',
			'  list ordered=false start=0 tight=true',
			'    list_item',
			'      text "a"',
			'      hard_break',
			'      text "b"',
			'  line_break'
		);
		expect(checked_tree('- a\\\n  b\n')).toBe(item);
		expect(checked_tree('- a\\\nb\n')).toBe(item);
	});

	test('the label of a block directive, which ends at its bracket', () => {
		expect(checked_tree('::toc[a\\\n# b]\n')).toBe(
			lines(
				'root',
				'  directive_leaf name="toc"',
				'    directive_label',
				'      text "a"',
				'      hard_break',
				'      text "# b"'
			)
		);
	});

	test('link text', () => {
		expect(checked_tree('[x\\\ny](z)\n')).toBe(
			lines(
				'root',
				'  paragraph',
				'    link href="z"',
				'      text "x"',
				'      hard_break',
				'      text "y"',
				'  line_break'
			)
		);
	});
});

describe('Soft line breaks', () => {
	test('648: plain newline within paragraph is soft break', () => {
		// foo<LF>baz
		const input = load_soft('648');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Single paragraph, newline preserved in text content
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');

		// The paragraph contains text that spans both lines
		// (the newline is within the text content, not a separate node)
	});

	test('649: trailing space + newline is soft break', () => {
		// foo <LF> baz (1 trailing space, leading space on next line)
		const input = load_soft('649');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('paragraph');
	});
});
