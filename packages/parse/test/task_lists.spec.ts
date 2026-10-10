import { describe, expect, test } from 'vitest';

import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import type { NodeBuffer } from '../src/utils';
import { print_ast } from './print';

function ast(input: string): string {
	return print_ast(parse_markdown_svelte(input).nodes, input);
}

function fed(input: string, size: number): string {
	const tree = new TreeBuilder(input.length || 16);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < input.length; i += size) {
		parser.feed(input.slice(i, i + size));
	}
	parser.finish();
	return print_ast(tree.get_buffer(), input);
}

/** every list item in document order, as its checked attr and its text */
function items(input: string): [unknown, string][] {
	const { nodes } = parse_markdown_svelte(input);
	const out: [unknown, string][] = [];
	walk(nodes, 0, input, out);
	return out;
}

function text_of(nodes: NodeBuffer, index: number, source: string): string {
	const node = nodes.get_node(index);
	if (node.kind === 'text') return source.slice(node.value[0], node.value[1]);
	if (node.kind === 'list') return '';
	return node.children.map((c) => text_of(nodes, c, source)).join('');
}

function walk(
	nodes: NodeBuffer,
	index: number,
	source: string,
	out: [unknown, string][]
): void {
	const node = nodes.get_node(index);
	if (node.kind === 'list_item') {
		out.push([node.metadata?.checked, text_of(nodes, index, source)]);
	}
	for (const child of node.children) walk(nodes, child, source, out);
}

describe('task lists', () => {
	test('a marker sets checked and is not kept as text', () => {
		expect(items('- [ ] todo\n- [x] done\n- [X] also done\n- plain\n')).toEqual(
			[
				[false, 'todo'],
				[true, 'done'],
				[true, 'also done'],
				[undefined, 'plain'],
			]
		);
	});

	test('checked is a boolean attr on the list item', () => {
		expect(ast('- [x] done\n- [ ] todo')).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item checked=true',
				'      text "done"',
				'    list_item checked=false',
				'      text "todo"',
			].join('\n')
		);
	});

	test('every bullet and both ordered delimiters', () => {
		for (const marker of ['-', '*', '+', '1.', '1)', '12.']) {
			expect(items(`${marker} [x] a`), marker).toEqual([[true, 'a']]);
			expect(items(`${marker} [ ] a`), marker).toEqual([[false, 'a']]);
		}
	});

	test('nested lists', () => {
		expect(
			items('1. [x] one\n2. [ ] two\n   - [x] in\n   - plain\n3. three\n')
		).toEqual([
			[true, 'one'],
			[false, 'two'],
			[true, 'in'],
			[undefined, 'plain'],
			[undefined, 'three'],
		]);
	});

	test('inside a block quote', () => {
		expect(ast('> - [x] a\n> - [ ] b')).toBe(
			[
				'root',
				'  block_quote',
				'    list ordered=false start=0 tight=true',
				'      list_item checked=true',
				'        text "a"',
				'      list_item checked=false',
				'        text "b"',
			].join('\n')
		);
	});

	test('inside a container directive', () => {
		expect(items(':::note[]\n- [x] a\n- [ ] b\n:::\n')).toEqual([
			[true, 'a'],
			[false, 'b'],
		]);
	});

	test('a loose list keeps the marker out of the paragraph', () => {
		expect(ast('- [ ] a\n\n- [x] b\n\n  c')).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=false',
				'    list_item checked=false',
				'      paragraph',
				'        text "a"',
				'    list_item checked=true',
				'      paragraph',
				'        text "b"',
				'      paragraph',
				'        text "c"',
			].join('\n')
		);
	});

	test('a sibling item after a blank line and after a fence', () => {
		expect(items('- [ ] a\n\n- [x] b')).toEqual([
			[false, 'a'],
			[true, 'b'],
		]);
		expect(items('- [ ] a\n  ```\n  code\n  ```\n- [x] b')).toEqual([
			[false, 'a'],
			[true, 'b'],
		]);
	});

	test('spaces and tabs around the marker', () => {
		expect(
			items('-   [x] a\n- [ ]   b\n- [x]\tc\n-\t[ ] d\n   - [x] e')
		).toEqual([
			[true, 'a'],
			[false, 'b'],
			[true, 'c'],
			[false, 'd'],
			[true, 'e'],
		]);
	});

	test('inline content after the marker', () => {
		expect(ast('- [x] *a* [b](/c)\n- [ ] `d`')).toBe(
			[
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item checked=true',
				'      strong_emphasis',
				'        text "a"',
				'      text " "',
				'      link href="/c"',
				'        text "b"',
				'    list_item checked=false',
				'      code_span "d"',
			].join('\n')
		);
	});

	test('what follows the marker is paragraph text, never a block', () => {
		expect(
			items('- [ ] - a\n- [x] # b\n- [ ] > c\n- [x] 1. d\n- [ ] ```\n')
		).toEqual([
			[false, '- a'],
			[true, '# b'],
			[false, '> c'],
			[true, '1. d'],
			[false, '```'],
		]);
	});

	test('the item interrupts a paragraph as any list item does', () => {
		expect(items('para\n- [x] a')).toEqual([[true, 'a']]);
	});

	test('positions skip the marker', () => {
		const input = '- [x] done';
		const { nodes } = parse_markdown_svelte(input);
		const list = nodes.get_node(nodes.get_node(0).children[0]);
		const item = nodes.get_node(list.children[0]);
		const text = nodes.get_node(item.children[0]);
		expect(item.start).toBe(0);
		expect(text.value).toEqual([6, 10]);
	});

	describe('not a task item', () => {
		test.each([
			['no space after the marker', '- [x]no', '[x]no'],
			['not at the start of the item', '- a [ ] b', 'a [ ] b'],
			['another letter', '- [y] a', '[y] a'],
			['two spaces inside', '- [  ] a', '[  ] a'],
			['nothing inside', '- [] a', '[] a'],
			['an escaped bracket', '- \\[x] a', '[x] a'],
			['a colon after the marker', '- [x]: /url', '[x]: /url'],
		])('%s', (_name, input, text) => {
			expect(items(input)).toEqual([[undefined, text]]);
		});

		test('a second marker is text of the task item', () => {
			expect(items('- [x] [ ] a')).toEqual([[true, '[ ] a']]);
		});

		test.each([
			['alone', '- [ ]', '[ ]'],
			['alone before a newline', '- [x]\n', '[x]'],
			['with only trailing spaces', '- [ ]  \n', '[ ]  '],
			['with only a trailing tab', '- [x]\t', '[x]\t'],
			['before a continuation line', '- [ ]\n  a', '[ ]\n  a'],
		])('a marker with no content on its line, %s', (_name, input, text) => {
			const { nodes } = parse_markdown_svelte(input);
			const list = nodes.get_node(nodes.get_node(0).children[0]);
			const item = nodes.get_node(list.children[0]);
			expect(item.metadata?.checked).toBeUndefined();
			expect(input.slice(item.start + 2, item.end)).toBe(text);
		});

		test('a continuation line or a later paragraph that starts with one', () => {
			expect(items('- a\n  [x] b\n- c\n\n  [ ] d')).toEqual([
				[undefined, 'a  [x] b'],
				[undefined, 'c[ ] d'],
			]);
		});

		test('outside a list', () => {
			expect(ast('[x] a\n\n> [ ] b')).not.toContain('checked');
		});
	});

	describe('feed matches batch', () => {
		const cases = [
			'- [ ] todo\n- [x] done\n- [X] also\n- plain\n',
			'1. [x] one\n2. [ ] two\n   - [x] in\n   - [ ] out\n',
			'- [ ] a\n\n- [x] b\n\n  c\n',
			'> - [x] a\n> - [ ] b\n',
			':::note[]\n- [x] a\n- [ ] b\n:::\n',
			'-   [x] a\n- [ ]   b\n- [x]\tc\n',
			'- [ ]\n- [x] \n- [x]no\n- [y] a\n- [ ',
			'- [x] - a\n- [ ] # b\n- [x] [ ] c\n',
			'- [ ]',
			'- [x] ',
			'- [x] a',
			'- [x',
		];
		for (const input of cases) {
			for (const size of [1, 2, 3]) {
				test(`${JSON.stringify(input)} in chunks of ${size}`, () => {
					expect(fed(input, size)).toBe(ast(input));
				});
			}
		}

		test('checked is set before any text of the item arrives', () => {
			const tree = new TreeBuilder(64);
			const parser = new PFMParser(tree);
			parser.init();
			parser.feed('- [x] d');
			expect(print_ast(tree.get_buffer(), '- [x] d')).toContain(
				'list_item checked=true'
			);
			parser.feed('one');
			parser.finish();
			expect(print_ast(tree.get_buffer(), '- [x] done')).toBe(
				ast('- [x] done')
			);
		});

		test('an unfinished marker emits no text', () => {
			const tree = new TreeBuilder(64);
			const parser = new PFMParser(tree);
			parser.init();
			parser.feed('- [x]');
			expect(print_ast(tree.get_buffer(), '- [x]')).not.toContain('text');
			parser.feed(' ');
			expect(print_ast(tree.get_buffer(), '- [x] ')).not.toContain('text');
			parser.finish();
			expect(print_ast(tree.get_buffer(), '- [x] ')).toBe(ast('- [x] '));
		});
	});
});
