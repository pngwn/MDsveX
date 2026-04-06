import { describe, expect, test } from 'vitest';

import { get_content, get_all_child_kinds } from './utils';
import { parse_markdown_svelte } from '../src/main';

/** Find first child of a given kind under a node. */
const find_child = (
	nodes: ReturnType<typeof parse_markdown_svelte>['nodes'],
	parent_idx: number,
	kind: string
) => {
	const parent = nodes.get_node(parent_idx);
	for (const idx of parent.children) {
		const child = nodes.get_node(idx);
		if (child.kind === kind) return child;
	}
	return null;
};

/** Find all children of a given kind under a node. */
const find_children = (
	nodes: ReturnType<typeof parse_markdown_svelte>['nodes'],
	parent_idx: number,
	kind: string
) => {
	const parent = nodes.get_node(parent_idx);
	const results: ReturnType<typeof nodes.get_node>[] = [];
	for (const idx of parent.children) {
		const child = nodes.get_node(idx);
		if (child.kind === kind) results.push(child);
	}
	return results;
};

// ===========================================================
// Inline directives: :name[content]
// ===========================================================

describe('inline directives', () => {
	test('basic inline directive', () => {
		const input = 'hello :name[content] world\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('name');
	});

	test('inline directive with empty content', () => {
		const input = ':tag[]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('tag');
	});

	test('inline directive with hyphenated name', () => {
		const input = ':my-directive[text]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('my-directive');
	});

	test('inline directive with underscored name', () => {
		const input = ':my_dir[stuff]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('my_dir');
	});

	test('inline directive with numeric name chars', () => {
		const input = ':h2o[water]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('h2o');
	});

	test('inline directive has text children', () => {
		const input = ':note[some content]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();

		const kinds = get_all_child_kinds(nodes, directive!.index);
		expect(kinds).toContain('text');
	});

	test('colon without name is text', () => {
		const input = 'hello: world\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).toBeNull();
	});

	test('colon with name but no bracket is text', () => {
		const input = 'see :thing here\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).toBeNull();
	});

	test('multiple inline directives in one paragraph', () => {
		const input = ':a[one] and :b[two]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directives = find_children(nodes, paragraph!.index, 'directive_inline');
		expect(directives.length).toBe(2);
		expect(directives[0].metadata.name).toBe('a');
		expect(directives[1].metadata.name).toBe('b');
	});

	test('inline directive name must start with letter', () => {
		const input = ':123[nope]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).toBeNull();
	});
});

// ===========================================================
// Leaf block directives: ::name[content]
// ===========================================================

describe('leaf block directives', () => {
	test('basic leaf directive', () => {
		const input = '::toc[Table of Contents]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('toc');

		const { value } = get_content(nodes, directive!.index, input);
		expect(value).toBe('Table of Contents');
	});

	test('leaf directive without content', () => {
		const input = '::toc\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('toc');
	});

	test('leaf directive with empty brackets', () => {
		const input = '::note[]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
	});

	test('leaf directive with trailing content is not a directive', () => {
		const input = '::name[content] extra stuff\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).toBeNull();
		// Should be a paragraph instead
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	test('leaf directive interrupts paragraph', () => {
		const input = 'hello\n::note[content]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).not.toBeNull();
	});

	test('single colon at block level is paragraph', () => {
		const input = ':notblock\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).toBeNull();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	test('leaf directive in block quote', () => {
		const input = '> ::note[inside quote]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const bq = find_child(nodes, root.index, 'block_quote');
		expect(bq).not.toBeNull();
		const directive = find_child(nodes, bq!.index, 'directive_leaf');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
	});
});

// ===========================================================
// Container block directives: :::name[content] ... :::
// ===========================================================

describe('container block directives', () => {
	test('basic container directive', () => {
		const input = ':::warning[Caution]\nBe careful here.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('warning');

		const { value } = get_content(nodes, directive!.index, input);
		expect(value).toBe('Caution');

		// Should contain a paragraph child
		const paragraph = find_child(nodes, directive!.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	test('container directive without content label', () => {
		const input = ':::note\nSome text.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
	});

	test('container directive with multiple block children', () => {
		const input = ':::section\n# Heading\n\nParagraph text.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();

		const heading = find_child(nodes, directive!.index, 'heading');
		expect(heading).not.toBeNull();

		const paragraph = find_child(nodes, directive!.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	test('container closes at EOF if no closing fence', () => {
		const input = ':::note\nSome text.\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
	});

	test('nested container directives', () => {
		const input = '::::outer\n:::inner\nContent.\n:::\n::::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const outer = find_child(nodes, root.index, 'directive_container');
		expect(outer).not.toBeNull();
		expect(outer!.metadata.name).toBe('outer');

		const inner = find_child(nodes, outer!.index, 'directive_container');
		expect(inner).not.toBeNull();
		expect(inner!.metadata.name).toBe('inner');
	});

	test('closing fence must have >= opening colons', () => {
		// ::: opens with 3, so ::: closes it
		const input = ':::note\nText.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
	});

	test('closing fence with more colons closes container', () => {
		const input = ':::note\nText.\n:::::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
	});

	test('closing fence with fewer colons does not close', () => {
		// :::: opens with 4, :: (2 colons) can't close it
		// but :: is a leaf directive opener... let me use a line with just 2 colons and no name
		// Actually 2 colons without a name won't parse as anything useful, it becomes paragraph
		// Let me test with 4-colon opener and 3-colon closer
		const input = '::::note\nText.\n:::\nMore text.\n::::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();

		// The ::: should NOT close the :::: container, so both text paragraphs should be inside
		const paragraphs = find_children(nodes, directive!.index, 'paragraph');
		expect(paragraphs.length).toBe(2);
	});

	test('container directive interrupts paragraph', () => {
		const input = 'hello\n:::note\nContent.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
	});

	test('container with code fence inside', () => {
		const input = ':::example\n```js\nconsole.log("hi")\n```\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();

		const code = find_child(nodes, directive!.index, 'code_fence');
		expect(code).not.toBeNull();
	});

	test('container with thematic break inside', () => {
		const input = ':::section\nBefore.\n\n---\n\nAfter.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();

		const tb = find_child(nodes, directive!.index, 'thematic_break');
		expect(tb).not.toBeNull();
	});

	test('empty container', () => {
		const input = ':::note\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
	});

	test('container in block quote', () => {
		const input = '> :::note\n> Content.\n> :::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const bq = find_child(nodes, root.index, 'block_quote');
		expect(bq).not.toBeNull();
		const directive = find_child(nodes, bq!.index, 'directive_container');
		expect(directive).not.toBeNull();
	});
});

// ===========================================================
// Interactions with other constructs
// ===========================================================

describe('directive interactions', () => {
	test('inline directive inside container directive', () => {
		const input = ':::note\nSee :ref[here] for details.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const container = find_child(nodes, root.index, 'directive_container');
		expect(container).not.toBeNull();

		const paragraph = find_child(nodes, container!.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const inline_dir = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(inline_dir).not.toBeNull();
		expect(inline_dir!.metadata.name).toBe('ref');
	});

	test('leaf directive inside container directive', () => {
		const input = ':::section\n::toc\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const container = find_child(nodes, root.index, 'directive_container');
		expect(container).not.toBeNull();

		const leaf = find_child(nodes, container!.index, 'directive_leaf');
		expect(leaf).not.toBeNull();
		expect(leaf!.metadata.name).toBe('toc');
	});

	test('inline directive in emphasis', () => {
		const input = '_:note[important] text_\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();

		const emphasis = find_child(nodes, paragraph!.index, 'emphasis');
		expect(emphasis).not.toBeNull();

		const directive = find_child(nodes, emphasis!.index, 'directive_inline');
		expect(directive).not.toBeNull();
	});
});
