import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { parse_markdown_svelte } from '../src/main';
import type { node_buffer } from '../src/utils';

const this_dir = dirname(fileURLToPath(import.meta.url));
const fixtures_root = resolve(this_dir, 'fixtures/pfm/block_quotes');

const load_fixture = (id: string): string =>
	readFileSync(resolve(fixtures_root, `${id}.md`), 'utf8');

function collect_children(nodes: node_buffer, parent: number = 0) {
	const root = nodes.get_node(parent);
	return root.children.map((i) => nodes.get_node(i));
}

function non_breaks(nodes: node_buffer, parent: number = 0) {
	return collect_children(nodes, parent).filter((n) => n.kind !== 'line_break');
}

function get_value(nodes: node_buffer, index: number, source: string) {
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
		// PFM: each block_quote state frame only checks its own marker, so
		// a shorter marker count on a continuation line does NOT close outer
		// frames, it just opens a new paragraph inside the innermost. A
		// future revision may change this, but it is out of scope for the
		// no-lazy-continuation change.
		const input = load_fixture('251');
		const { nodes } = parse_markdown_svelte(input);
		const children = non_breaks(nodes);

		expect(children.length).toBe(1);
		expect(children[0].kind).toBe('block_quote');

		const bq1_children = non_breaks(nodes, children[0].index);
		expect(bq1_children.length).toBe(1);
		expect(bq1_children[0].kind).toBe('block_quote');
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
