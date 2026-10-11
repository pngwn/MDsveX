import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { NodeBuffer } from '../src/utils';
import { print_ast } from './print';
import { checked_tree, lines, pick, random } from './stream_shape';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, 'fixtures/pfm/block_quotes');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8');

function collect_children(nodes: NodeBuffer, parent: number = 0) {
	const root = nodes.get_node(parent);
	return root.children.map((i) => nodes.get_node(i));
}

function non_breaks(nodes: NodeBuffer, parent: number = 0) {
	return collect_children(nodes, parent).filter((n) => n.kind !== 'line_break');
}

function get_value(nodes: NodeBuffer, index: number, source: string) {
	const node = nodes.get_node(index);
	return source.slice(node.value[0], node.value[1]);
}

describe('Block quotes', () => {
	test('pfm example 228: basic block quote with heading and paragraph', () => {
		const input = load_fixture('228');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[0].metadata.depth).toBe(1);
		expect(get_value(nodes, bq_children[0].index, input)).toBe('Foo');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 229: block quote without space after >', () => {
		const input = load_fixture('229');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 230: leading spaces before >', () => {
		const input = load_fixture('230');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 231: four leading spaces before > (PFM: indentation insignificant)', () => {
		const input = load_fixture('231');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// PFM ignores indentation, so this is still a block quote
		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');
	});

	test('pfm example 232: no lazy continuation (baz is outside)', () => {
		// > # Foo
		// > bar
		// baz
		// PFM: line 3 has no `>` prefix, so it terminates the blockquote.
		// `baz` becomes a separate paragraph at root level.
		const input = load_fixture('232');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('heading');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 233: unmarked line splits adjacent blockquotes', () => {
		// > bar
		// baz
		// > foo
		// PFM: line 2 has no `>`, terminating the first blockquote. Line 3
		// starts a fresh blockquote. Result: [bq, paragraph, bq].
		const input = load_fixture('233');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(3);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');
		expect(children[2].kind).toBe('block_quote');

		const bq1_children = non_breaks(nodes, children[0].index);
		expect(bq1_children.length).toBe(1);
		expect(bq1_children[0].kind).toBe('paragraph');

		const bq2_children = non_breaks(nodes, children[2].index);
		expect(bq2_children.length).toBe(1);
		expect(bq2_children[0].kind).toBe('paragraph');
	});

	test('pfm example 234: thematic break ends block quote', () => {
		// > foo
		// ---
		const input = load_fixture('234');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('thematic_break');
	});

	test('pfm example 235: list item after block quote', () => {
		// > - foo
		// - bar
		// PFM: line 2 `- bar` has no `>`, so the blockquote (and its list)
		// close; `- bar` starts a new root-level list.
		const input = load_fixture('235');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('list');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('list');

		const inner_items = non_breaks(nodes, bq_children[0].index);
		expect(inner_items.length).toBe(1);
		expect(inner_items[0].kind).toBe('list_item');

		const outer_items = non_breaks(nodes, children[1].index);
		expect(outer_items.length).toBe(1);
		expect(outer_items[0].kind).toBe('list_item');
	});

	test('pfm example 236: lots of whitespace after > (no lazy continuation)', () => {
		// >     foo
		//     bar
		// PFM: line 2 has no `>` (just indentation), so it terminates the
		// blockquote. `    bar` becomes a sibling paragraph.
		const input = load_fixture('236');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');
	});

	test('pfm example 240: empty block quote lines', () => {
		// >
		// >
		// >
		const input = load_fixture('240');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');
	});

	test('pfm example 241: blank > lines around content', () => {
		// >
		// > foo
		// >
		const input = load_fixture('241');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');
	});

	test('pfm example 242: blank line separates block quotes', () => {
		// > foo
		//
		// > bar
		const input = load_fixture('242');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('block_quote');
	});

	test('pfm example 243: simple continuation', () => {
		// > foo
		// > bar
		const input = load_fixture('243');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');
	});

	test('pfm example 244: blank > line separates paragraphs inside quote', () => {
		// > foo
		// >
		// > bar
		const input = load_fixture('244');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(2);
		expect(bq_children[0].kind).toBe('paragraph');
		expect(bq_children[1].kind).toBe('paragraph');
	});

	test('pfm example 245: block quote interrupts paragraph', () => {
		// foo
		// > bar
		const input = load_fixture('245');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('paragraph');
		expect(children[1].kind).toBe('block_quote');
	});

	test('pfm example 246: thematic break between block quotes', () => {
		// > aaa
		// ***
		// > bbb
		const input = load_fixture('246');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(3);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('thematic_break');
		expect(children[2].kind).toBe('block_quote');
	});

	test('pfm example 247: unmarked line terminates blockquote', () => {
		// > bar
		// baz
		// PFM: line 2 has no `>`, so blockquote closes; `baz` is a sibling
		// paragraph.
		const input = load_fixture('247');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');
	});

	test('pfm example 248: blank line after block quote', () => {
		// > bar
		//
		// baz
		const input = load_fixture('248');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');
	});

	test('pfm example 249: > blank line then no > ends quote', () => {
		// > bar
		// >
		// baz
		const input = load_fixture('249');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');
	});

	test('pfm example 250: nested blockquotes (no lazy continuation)', () => {
		// > > > foo
		// bar
		// PFM: line 2 has no `>`, so ALL three nested blockquotes cascade-
		// close; `bar` becomes a root-level paragraph.
		const input = load_fixture('250');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(2);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');

		// Verify the cascade left the triple-nested blockquote intact with
		// "foo" as the innermost paragraph.
		const bq1_children = non_breaks(nodes, children[0].index);
		expect(bq1_children.length).toBe(1);
		expect(bq1_children[0].kind).toBe('block_quote');

		const bq2_children = non_breaks(nodes, bq1_children[0].index);
		expect(bq2_children.length).toBe(1);
		expect(bq2_children[0].kind).toBe('block_quote');

		const bq3_children = non_breaks(nodes, bq2_children[0].index);
		expect(bq3_children.length).toBe(1);
		expect(bq3_children[0].kind).toBe('paragraph');
	});

	test('pfm example 251: compact nested block quotes (>>>)', () => {
		// >>> foo
		// > bar
		// >>baz
		// no lazy continuation, bar closes the inner quotes and baz opens a new one
		const input = load_fixture('251');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq1_children = non_breaks(nodes, children[0].index);
		expect(bq1_children.map((n) => n.kind)).toEqual([
			'block_quote',
			'paragraph',
			'block_quote',
		]);

		const bq2_children = non_breaks(nodes, bq1_children[0].index);
		expect(bq2_children.length).toBe(1);
		expect(bq2_children[0].kind).toBe('block_quote');

		const baz = non_breaks(nodes, bq1_children[2].index);
		expect(baz.length).toBe(1);
		expect(baz[0].kind).toBe('paragraph');
	});

	test('pfm: leaf block inside nested quote keeps following line at depth', () => {
		const input = '> > # h\n> > x';
		const { nodes } = parse_markdown_svelte(input);
		const bq1 = non_breaks(nodes);
		expect(bq1.map((n) => n.kind)).toEqual(['block_quote']);
		const bq2 = non_breaks(nodes, bq1[0].index);
		expect(bq2.map((n) => n.kind)).toEqual(['block_quote']);
		const inner = non_breaks(nodes, bq2[0].index);
		expect(inner.map((n) => n.kind)).toEqual(['heading', 'paragraph']);
	});

	test('pfm: blank quoted line inside compact nested quote keeps depth', () => {
		const input = '>> b\n>>\n>> c';
		const { nodes } = parse_markdown_svelte(input);
		const bq1 = non_breaks(nodes);
		const bq2 = non_breaks(nodes, bq1[0].index);
		expect(bq2.map((n) => n.kind)).toEqual(['block_quote']);
		const inner = non_breaks(nodes, bq2[0].index);
		expect(inner.map((n) => n.kind)).toEqual(['paragraph', 'paragraph']);
	});

	test('pfm: fewer markers after a leaf block close the inner quote', () => {
		const input = '> > # h\n> c';
		const { nodes } = parse_markdown_svelte(input);
		const bq1 = non_breaks(nodes);
		const outer = non_breaks(nodes, bq1[0].index);
		expect(outer.map((n) => n.kind)).toEqual(['block_quote', 'paragraph']);
		const inner = non_breaks(nodes, outer[0].index);
		expect(inner.map((n) => n.kind)).toEqual(['heading']);
	});

	test('pfm: extra marker interrupts a paragraph inside a quote', () => {
		const input = '> bar\n>> baz';
		const { nodes } = parse_markdown_svelte(input);
		const bq1 = non_breaks(nodes);
		const outer = non_breaks(nodes, bq1[0].index);
		expect(outer.map((n) => n.kind)).toEqual(['paragraph', 'block_quote']);
	});

	test('pfm: code fence opener without > continuation is paragraph text', () => {
		// > ```
		// foo
		// ```
		// The fence cannot close inside the blockquote (line 2 has no `>`),
		// so the opening backticks are treated as paragraph text.
		const input = '> ```\nfoo\n```\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBeGreaterThanOrEqual(1);
		expect(children[0].kind).toBe('block_quote');

		// The blockquote should contain a paragraph (not a code_fence) with
		// the literal backticks as text.
		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('paragraph');

		const para_text_children = non_breaks(nodes, bq_children[0].index);
		expect(para_text_children.length).toBeGreaterThan(0);
		expect(para_text_children[0].kind).toBe('text');
		expect(get_value(nodes, para_text_children[0].index, input)).toBe('```');
	});

	test('pfm: code fence with proper > continuation inside blockquote', () => {
		// > ```
		// > foo
		// > ```
		// All lines have `>`, so the fence is valid and contains "foo".
		const input = '> ```\n> foo\n> ```\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.length).toBe(1);
		expect(bq_children[0].kind).toBe('code_fence');
	});

	test('pfm: code fence closes on a quoted closing line, its value keeps the markers', () => {
		const input = '> ```\n> code\n> ```\n> after\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);
		expect(children.length).toBe(1);

		const bq_children = non_breaks(nodes, children[0].index);
		expect(bq_children.map((n) => n.kind)).toEqual(['code_fence', 'paragraph']);
		expect(get_value(nodes, bq_children[0].index, input)).toBe('> code');
		const text = nodes.get_node(bq_children[1].children[0]);
		expect(get_value(nodes, text.index, input)).toBe('after');
	});

	test('pfm: code fence in a nested blockquote closes on its markers', () => {
		const input = '> > ```\n> > a\n> > ```\n';
		const { nodes } = parse_markdown_svelte(input);
		const outer = non_breaks(nodes)[0];
		const inner = non_breaks(nodes, outer.index)[0];
		expect(inner.kind).toBe('block_quote');

		const fence = non_breaks(nodes, inner.index);
		expect(fence.map((n) => n.kind)).toEqual(['code_fence']);
		expect(get_value(nodes, fence[0].index, input)).toBe('> > a');
	});

	test('pfm: cascade close through nested blockquotes then resume', () => {
		// > > foo
		// bar
		// > baz
		// Regression: an unmarked line must cascade-close BOTH nested
		// blockquote frames, then a subsequent `>` line must open a fresh
		// blockquote at root. Guards the multi-frame cascade path.
		const input = '> > foo\nbar\n> baz\n';
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(3);
		expect(children[0].kind).toBe('block_quote');
		expect(children[1].kind).toBe('paragraph');
		expect(children[2].kind).toBe('block_quote');

		// First blockquote: one nested blockquote containing "foo".
		const outer_children = non_breaks(nodes, children[0].index);
		expect(outer_children.length).toBe(1);
		expect(outer_children[0].kind).toBe('block_quote');

		const inner_children = non_breaks(nodes, outer_children[0].index);
		expect(inner_children.length).toBe(1);
		expect(inner_children[0].kind).toBe('paragraph');

		// Third child: fresh blockquote with "baz".
		const resume_children = non_breaks(nodes, children[2].index);
		expect(resume_children.length).toBe(1);
		expect(resume_children[0].kind).toBe('paragraph');
	});

	// PFM: no indented code, so extra spaces are just text in paragraphs
	test('pfm example 252: indented content in block quote (PFM: no indented code)', () => {
		const input = load_fixture('252');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		// Two block quotes, each with a paragraph
		const bqs = children.filter((n) => n.kind === 'block_quote');
		expect(bqs.length).toBe(2);

		const bq1_children = non_breaks(nodes, bqs[0].index);
		expect(bq1_children[0].kind).toBe('paragraph');

		const bq2_children = non_breaks(nodes, bqs[1].index);
		expect(bq2_children[0].kind).toBe('paragraph');
	});
});

describe('a line that ends a paragraph in a block quote, with something open', () => {
	const openers: [string, string][] = [
		['emphasis', '_'],
		['strong emphasis', '*'],
		['strikethrough', '~~'],
		['subscript', '~'],
		['superscript', '^'],
		['link text', '['],
		['image text', '!['],
		['inline directive text', ':d['],
		['an inline element', 'x <b>'],
	];
	const enders: [string, string][] = [
		['a marked blank line', '> %sa\n>\n> b\n'],
		['an unmarked line', '> %sa\nb\n'],
		['a nested quote', '> %sa\n> > b\n'],
		['a heading', '> %sa\n> # b\n'],
		['a thematic break', '> %sa\n> ---\n'],
		['a code fence', '> %sa\n> ```\n> b\n> ```\n'],
		['the close of a container directive', '> :::box\n> %sa\n> :::\n> b\n'],
		['the next item of a quoted list', '> - %sa\n> - b\n'],
		['a nested list in a quoted list', '> - %sa\n>   - b\n'],
	];
	const inline = /^ *(text|soft_break|hard_break)\b/;
	/** the tree without its text, the open marker is text in one and absent in the other */
	const blocks = (tree: string) =>
		tree
			.split('\n')
			.filter((row) => !inline.test(row))
			.join('\n');

	for (const [what, opener] of openers) {
		for (const [name, source] of enders) {
			test(`${what} before ${name}`, () => {
				const tree = checked_tree(source.replace('%s', opener));
				const plain = opener.startsWith('x') ? 'x ' : '';
				expect(blocks(tree)).toBe(
					blocks(checked_tree(source.replace('%s', plain)))
				);
			});
		}
	}

	const quote = (...rest: string[]) => lines('root', '  block_quote', ...rest);

	test('emphasis does not reach into a nested quote', () => {
		expect(checked_tree('> *a\n> > b*\n')).toBe(
			quote(
				'    paragraph',
				'      text "*a"',
				'    block_quote',
				'      paragraph',
				'        text "b"',
				'        text "*"',
				'  line_break'
			)
		);
	});

	test('a fence line is not text of the emphasis', () => {
		expect(checked_tree('> *a\n> ```\n> b*\n')).toBe(
			quote('    paragraph', '      text "*a"', '    code_fence "> b*\\n"')
		);
	});

	test('a link does not reach into a nested quote', () => {
		expect(checked_tree('> [a\n> > b](u)\n')).toBe(
			quote(
				'    paragraph',
				'      text "[a"',
				'    block_quote',
				'      paragraph',
				'        text "b"',
				'        text "](u)"',
				'  line_break'
			)
		);
	});

	test('a backslash before the nested quote is text outside the emphasis', () => {
		expect(checked_tree('> *a\\\n> > b*\n')).toBe(
			checked_tree('> *a\n> > b*\n').replace('"*a"', '"*a\\\\"')
		);
	});

	test('a continuation line stays in what is open', () => {
		for (const [open, close] of [
			['_', '_'],
			['*', '*'],
			['~~', '~~'],
			['~', '~'],
			['^', '^'],
			['[', '](u)'],
			['![', '](u)'],
			[':d[', ']'],
			['<b>', '</b>'],
		]) {
			const tree = checked_tree(`> x ${open}a\n> b${close}\n`).split('\n');
			expect(tree.slice(0, 4), open).toEqual([
				'root',
				'  block_quote',
				'    paragraph',
				'      text "x "',
			]);
			expect(tree.slice(5), open).toEqual([
				'        text "a"',
				'        soft_break',
				'        text "b"',
				'  line_break',
			]);
		}
	});

	test('a bracket at the start of a marked line closes the link text', () => {
		expect(checked_tree('> [a\n> ](u)\n')).toBe(
			quote(
				'    paragraph',
				'      link href="u"',
				'        text "a"',
				'        soft_break',
				'  line_break'
			)
		);
		expect(checked_tree('> ![a\n> ](u)\n')).toContain('image src="u"');
		expect(checked_tree('> :d[a\n> ]\n')).toBe(
			quote(
				'    paragraph',
				'      directive_inline name="d"',
				'        text "a"',
				'        soft_break',
				'  line_break'
			)
		);
	});

	test('an inline element spans a marked line as it does outside a quote', () => {
		expect(checked_tree('> x <b>a\n> b</b> c\n')).toBe(
			quote(
				'    paragraph',
				'      text "x "',
				'      html tag="b"',
				'        text "a"',
				'        soft_break',
				'        text "b"',
				'      text " c"',
				'  line_break'
			)
		);
	});

	// no backtick, a code span keeps the markers of the lines it spans in its value
	const PIECES = [
		' ',
		' ',
		'a',
		'*',
		'**',
		'_',
		'~~',
		'~',
		'^',
		'[',
		'](u)',
		'![',
		':d[',
		']',
		'{x}',
		'\\',
		'<b>',
		'</b>',
		'<span>',
		'</span>',
		'<a href="u">',
		'</a>',
		'<Chart />',
		'<br>',
	];

	test('random lines of one paragraph build the tree they build outside a quote', () => {
		const rand = random(7);
		const differ: string[] = [];
		for (let i = 0; i < 2000; i++) {
			const rows: string[] = [];
			const count = 2 + Math.floor(rand() * 2);
			for (let l = 0; l < count; l++) {
				let row = pick(rand, ['a', 'b c', 'x ']);
				const pieces = Math.floor(rand() * 5);
				for (let k = 0; k < pieces; k++) row += pick(rand, PIECES);
				rows.push(row + pick(rand, ['\n', '\n', ' \n', '\\\n']));
			}
			const plain = rows.join('');
			const quoted = rows.map((row) => '> ' + row).join('');
			const outside = print_ast(parse_markdown_svelte(plain).nodes, plain)
				.split('\n')
				.slice(1)
				.map((row) => '  ' + row);
			const inside = print_ast(parse_markdown_svelte(quoted).nodes, quoted)
				.split('\n')
				.slice(2);
			// the linefeed after the block is a child of the root in both
			outside[outside.length - 1] = inside[inside.length - 1];
			if (inside.join('\n') !== outside.join('\n'))
				differ.push(JSON.stringify(quoted));
		}
		expect(differ).toEqual([]);
	});

	test('an inline element ends at the same line after a hard break and a linefeed', () => {
		const hard = '> - ::toc[]<span>`a``\\\n> </div></b>|</span>\n';
		const soft = hard.replace('\\\n', '\n');
		expect(checked_tree(hard)).toBe(
			checked_tree(soft).replace('soft_break', 'hard_break')
		);
		expect(checked_tree('> x <b>a\\\n> > b</b>\n')).toBe(
			checked_tree('> x <b>a\n> > b</b>\n').replace('"a"', '"a\\\\"')
		);
	});
});
