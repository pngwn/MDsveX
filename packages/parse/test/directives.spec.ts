import { describe, expect, test } from 'vitest';

import { get_content, get_all_child_kinds } from './utils';
import { run_batch, run_wire, shape } from './plugin_harness';
import { print_ast } from './print';
import {
	NodeKind,
	PFMParser,
	WireEmitter,
	parse_markdown_svelte,
} from '../src/main';
import type { Emitter } from '../src/opcodes';
import type { ParsePlugin } from '../src/plugin_types';
import { kind_to_string } from '../src/utils';

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
		const directives = find_children(
			nodes,
			paragraph!.index,
			'directive_inline'
		);
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

	test('leaf directive without brackets is not a directive', () => {
		const input = '::toc\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).toBeNull();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
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

	test('container directive without brackets is not a directive', () => {
		const input = ':::note\nSome text.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).toBeNull();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	test('container directive with multiple block children', () => {
		const input = ':::section[]\n# Heading\n\nParagraph text.\n:::\n';
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
		const input = ':::note[]\nSome text.\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
	});

	test('nested container directives', () => {
		const input = '::::outer[]\n:::inner[]\nContent.\n:::\n::::\n';
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
		const input = ':::note[]\nText.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
	});

	test('closing fence with more colons closes container', () => {
		const input = ':::note[]\nText.\n:::::\n';
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
		const input = '::::note[]\nText.\n:::\nMore text.\n::::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();

		// The ::: should NOT close the :::: container, so both text paragraphs should be inside
		const paragraphs = find_children(nodes, directive!.index, 'paragraph');
		expect(paragraphs.length).toBe(2);
	});

	test('container directive interrupts paragraph', () => {
		const input = 'hello\n:::note[]\nContent.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
	});

	test('container with code fence inside', () => {
		const input = ':::example[]\n```js\nconsole.log("hi")\n```\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();

		const code = find_child(nodes, directive!.index, 'code_fence');
		expect(code).not.toBeNull();
	});

	test('container with thematic break inside', () => {
		const input = ':::section[]\nBefore.\n\n---\n\nAfter.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();

		const tb = find_child(nodes, directive!.index, 'thematic_break');
		expect(tb).not.toBeNull();
	});

	test('empty container', () => {
		const input = ':::note[]\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
	});

	test('container in block quote', () => {
		const input = '> :::note[]\n> Content.\n> :::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const bq = find_child(nodes, root.index, 'block_quote');
		expect(bq).not.toBeNull();
		const directive = find_child(nodes, bq!.index, 'directive_container');
		expect(directive).not.toBeNull();
	});

	describe('fence ending at eof keeps the container label', () => {
		for (const input of [
			':::q[lab]\n```\ncode',
			':::q[lab]\n```\ncode\n',
			':::q[lab]\n```\ncode\n```',
			':::q[lab]\n```js',
			':::q[lab]\n```js\n',
		]) {
			test(JSON.stringify(input), () => {
				for (const nodes of [
					parse_markdown_svelte(input).nodes,
					parse_fed(input, 1),
				]) {
					const directive = find_child(nodes, 0, 'directive_container')!;
					expect(get_content(nodes, directive.index, input).value).toBe('lab');
					expect(directive.end).toBe(input.length);
					const code = find_child(nodes, directive.index, 'code_fence')!;
					expect(code.children).toEqual([]);
				}
			});
		}
	});
});

const shape_without_positions = (
	nodes: ReturnType<typeof parse_markdown_svelte>['nodes'],
	idx: number,
	input: string
): unknown => {
	const node = nodes.get_node(idx);
	return {
		kind: node.kind,
		metadata: node.metadata,
		text: node.kind === 'text' ? input.slice(node.value[0], node.value[1]) : '',
		children: node.children.map((c) =>
			shape_without_positions(nodes, c, input)
		),
	};
};

/** parses body at the root and inside a note container */
const root_and_container_lists = (body: string) => {
	const at_root = parse_markdown_svelte(body);
	const root_list = find_child(
		at_root.nodes,
		at_root.nodes.get_node().index,
		'list'
	);
	expect(root_list).not.toBeNull();

	const input = `:::note[]\n${body}:::\n`;
	const { nodes } = parse_markdown_svelte(input);
	const container = find_child(
		nodes,
		nodes.get_node().index,
		'directive_container'
	);
	expect(container).not.toBeNull();
	expect(find_children(nodes, container!.index, 'paragraph')).toEqual([]);
	const list = find_child(nodes, container!.index, 'list');
	expect(list).not.toBeNull();

	return {
		root: shape_without_positions(at_root.nodes, root_list!.index, body),
		container: shape_without_positions(nodes, list!.index, input),
		list: list!,
		nodes,
	};
};

describe('lists in container directives', () => {
	test('bullet list', () => {
		const { root, container, list, nodes } =
			root_and_container_lists('- a\n- b\n');
		expect(container).toEqual(root);
		expect(list.metadata.ordered).toBe(false);
		expect(find_children(nodes, list.index, 'list_item').length).toBe(2);
	});

	test('bullet list with * and + markers', () => {
		for (const body of ['* a\n* b\n', '+ a\n+ b\n']) {
			const { root, container } = root_and_container_lists(body);
			expect(container).toEqual(root);
		}
	});

	test('ordered list', () => {
		const { root, container, list } = root_and_container_lists('3. a\n4. b\n');
		expect(container).toEqual(root);
		expect(list.metadata.ordered).toBe(true);
		expect(list.metadata.start).toBe(3);
	});

	test('ordered list with ) delimiter', () => {
		const { root, container } = root_and_container_lists('1) a\n2) b\n');
		expect(container).toEqual(root);
	});

	test('task list items', () => {
		const { root, container, list, nodes } =
			root_and_container_lists('- [ ] a\n- [x] b\n');
		expect(container).toEqual(root);
		expect(find_children(nodes, list.index, 'list_item').length).toBe(2);
	});

	test('nested list', () => {
		const { root, container } = root_and_container_lists(
			'- a\n  - b\n  - c\n- d\n'
		);
		expect(container).toEqual(root);
	});

	test('loose list', () => {
		const { root, container, list } = root_and_container_lists('- a\n\n- b\n');
		expect(container).toEqual(root);
		expect(list.metadata.tight).toBe(false);
	});

	test('list after a paragraph', () => {
		const input = ':::note[]\nintro\n- a\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const container = find_child(
			nodes,
			nodes.get_node().index,
			'directive_container'
		);
		const kinds = get_all_child_kinds(nodes, container!.index).filter(
			(k) => k !== 'line_break'
		);
		expect(kinds).toEqual(['paragraph', 'list']);
	});

	test('closing fence ends the list and the container', () => {
		const input = ':::note[]\n- a\n- b\n:::\nafter\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const root_kinds = get_all_child_kinds(nodes, root.index).filter(
			(k) => k !== 'line_break'
		);
		expect(root_kinds).toEqual(['directive_container', 'paragraph']);

		const container = find_child(nodes, root.index, 'directive_container');
		const list = find_child(nodes, container!.index, 'list');
		const items = find_children(nodes, list!.index, 'list_item');
		expect(items.length).toBe(2);
		const text = find_child(nodes, items[1].index, 'text');
		expect(get_content(nodes, text!.index, input).value).toBe('b');
	});

	test('list closes at eof without a closing fence', () => {
		const input = ':::note[]\n- a\n- b';
		const { nodes } = parse_markdown_svelte(input);

		const container = find_child(
			nodes,
			nodes.get_node().index,
			'directive_container'
		);
		const list = find_child(nodes, container!.index, 'list');
		expect(find_children(nodes, list!.index, 'list_item').length).toBe(2);
	});

	test('list in a nested container, then in the outer one', () => {
		const input = '::::outer[]\n:::inner[]\n- a\n:::\n1. b\n::::\n';
		const { nodes } = parse_markdown_svelte(input);

		const outer = find_child(
			nodes,
			nodes.get_node().index,
			'directive_container'
		);
		const inner = find_child(nodes, outer!.index, 'directive_container');
		expect(find_child(nodes, inner!.index, 'list')!.metadata.ordered).toBe(
			false
		);
		expect(find_child(nodes, outer!.index, 'list')!.metadata.ordered).toBe(
			true
		);
	});

	test('thematic break is still a thematic break', () => {
		const input = ':::note[]\n- - -\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const container = find_child(
			nodes,
			nodes.get_node().index,
			'directive_container'
		);
		expect(
			find_child(nodes, container!.index, 'thematic_break')
		).not.toBeNull();
		expect(find_child(nodes, container!.index, 'list')).toBeNull();
	});

	test('number without a list delimiter is a paragraph', () => {
		const input = ':::note[]\n2026 was a year\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const container = find_child(
			nodes,
			nodes.get_node().index,
			'directive_container'
		);
		expect(find_child(nodes, container!.index, 'paragraph')).not.toBeNull();
		expect(find_child(nodes, container!.index, 'list')).toBeNull();
	});
});

// ===========================================================
// Interactions with other constructs
// ===========================================================

describe('directive interactions', () => {
	test('inline directive inside container directive', () => {
		const input = ':::note[]\nSee :ref[here] for details.\n:::\n';
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
		const input = ':::section[]\n::toc[]\n:::\n';
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

// ===========================================================
// Directive arguments: :name[text](key=val, key2=val2)
// ===========================================================

describe('directive arguments', () => {
	test('inline directive with args', () => {
		const input = ':hello[text](arg_one=val_one, arg_two=val_two)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toEqual({
			arg_one: 'val_one',
			arg_two: 'val_two',
		});
	});

	test('inline directive with empty text and args', () => {
		const input = ':hello[](a=1)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toEqual({ a: '1' });
	});

	test('empty args are allowed but ignored', () => {
		const input = ':hello[text]()\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toBeUndefined();
		// the () is consumed, not left as text
		const kinds = get_all_child_kinds(nodes, paragraph!.index);
		expect(kinds).toEqual(['directive_inline']);
	});

	test('leaf directive with args', () => {
		const input = '::leaf[text](a=1, b=2)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toEqual({ a: '1', b: '2' });
	});

	test('container directive with args', () => {
		const input = ':::box[Label](variant=warning)\nBody.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toEqual({ variant: 'warning' });

		const paragraph = find_child(nodes, directive!.index, 'paragraph');
		expect(paragraph).not.toBeNull();
	});

	test('quoted values may contain spaces, commas, and parens', () => {
		const input = ':d[x](a="hello world", b=\'one, two\', c="(parens)")\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive!.metadata.args).toEqual({
			a: 'hello world',
			b: 'one, two',
			c: '(parens)',
		});
	});

	test('quoted values keep backslash escapes raw', () => {
		const input = ':d[x](msg="say \\"hi\\"")\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive!.metadata.args).toEqual({ msg: 'say \\"hi\\"' });
	});

	test('whitespace around = and , is tolerated', () => {
		const input = ':d[x]( a = 1 , b = 2 )\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive!.metadata.args).toEqual({ a: '1', b: '2' });
	});

	test('bare values may contain = and url characters', () => {
		const input = ':d[x](url=https://e.com/a?b=c&d=e, eq=a=b)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive!.metadata.args).toEqual({
			url: 'https://e.com/a?b=c&d=e',
			eq: 'a=b',
		});
	});

	test('args on directive nested in link text', () => {
		const input = '[see :d[x](k=v) here](https://example.com)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const link = find_child(nodes, paragraph!.index, 'link');
		expect(link).not.toBeNull();
		const directive = find_child(nodes, link!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toEqual({ k: 'v' });
	});
});

describe('malformed directive arguments', () => {
	/** Expect the directive to close at ] with the raw paren text following. */
	const expect_args_as_text = (input: string, trailing: string) => {
		const { nodes, source } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toBeUndefined();
		const text = nodes
			.get_node(paragraph!.index)
			.children.map((c) => {
				const n = nodes.get_node(c);
				return n.kind === 'text' ? source.slice(n.value[0], n.value[1]) : '';
			})
			.join('');
		expect(text).toBe(trailing);
	};

	test('positional args are not allowed', () => {
		expect_args_as_text(':d[x](positional)\n', '(positional)');
	});

	test('trailing comma is malformed', () => {
		expect_args_as_text(':d[x](a=1,)\n', '(a=1,)');
	});

	test('duplicate keys are malformed', () => {
		expect_args_as_text(':d[x](a=1, a=2)\n', '(a=1, a=2)');
	});

	test('empty value is malformed', () => {
		expect_args_as_text(':d[x](a=)\n', '(a=)');
	});

	test('args must follow ] immediately', () => {
		expect_args_as_text(':d[x] (a=1)\n', ' (a=1)');
	});

	test('unterminated quote is malformed', () => {
		expect_args_as_text(':d[x](a="unclosed)\n', '(a="unclosed)');
	});

	test('newline inside args is malformed', () => {
		const input = ':d[x](a=1,\nb=2)\n';
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.args).toBeUndefined();
	});

	test('only the first args list is consumed', () => {
		const input = ':d[x](a=1)(b=2)\n';
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive!.metadata.args).toEqual({ a: '1' });
	});

	test('malformed args on a leaf directive make it a paragraph', () => {
		const input = '::leaf[x](positional)\n';
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		expect(find_child(nodes, root.index, 'directive_leaf')).toBeNull();
		expect(find_child(nodes, root.index, 'paragraph')).not.toBeNull();
	});

	test('trailing content after container args makes it a paragraph', () => {
		const input = ':::box[x](a=1) junk\n';
		const { nodes } = parse_markdown_svelte(input);
		const root = nodes.get_node();
		expect(find_child(nodes, root.index, 'directive_container')).toBeNull();
		expect(find_child(nodes, root.index, 'paragraph')).not.toBeNull();
	});
});

// ===========================================================
// Directive text content rules
// ===========================================================

describe('directive text content', () => {
	test('emphasis and code spans are allowed', () => {
		const input = ':d[_italic_ and `code`]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		const kinds = get_all_child_kinds(nodes, directive!.index);
		expect(kinds).toContain('emphasis');
		expect(kinds).toContain('code_span');
	});

	test('links are not allowed and stay literal', () => {
		const input = ':d[not a [link](url) here]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		const kinds = get_all_child_kinds(nodes, directive!.index);
		expect(kinds).not.toContain('link');
		// the directive closes at the final ], not at the link's ]
		expect(get_all_child_kinds(nodes, paragraph!.index)).toEqual([
			'directive_inline',
		]);
	});

	test('images are not allowed and stay literal', () => {
		const input = ':d[not an ![image](src) here]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		const kinds = get_all_child_kinds(nodes, directive!.index);
		expect(kinds).not.toContain('image');
	});

	test('autolinks are not allowed and stay literal', () => {
		const input = ':d[no <https://auto.link> here]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		const kinds = get_all_child_kinds(nodes, directive!.index);
		expect(kinds).not.toContain('link');
	});

	test('balanced literal brackets stay inside the text', () => {
		const input = ':d[a [b] c]\n';
		const { nodes, source } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		// the directive spans through the final ]
		const { content } = get_content(nodes, directive!.index, source);
		expect(content).toBe(':d[a [b] c]');
		expect(get_all_child_kinds(nodes, paragraph!.index)).toEqual([
			'directive_inline',
		]);
	});

	test('nested inline directives are allowed', () => {
		const input = ':outer[has :inner[x](k=v) inside]\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const outer = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(outer!.metadata.name).toBe('outer');
		const inner = find_child(nodes, outer!.index, 'directive_inline');
		expect(inner).not.toBeNull();
		expect(inner!.metadata.name).toBe('inner');
		expect(inner!.metadata.args).toEqual({ k: 'v' });
	});

	test('escaped brackets do not affect balancing', () => {
		const input = ':d[escaped \\] close]\n';
		const { nodes, source } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const directive = find_child(nodes, paragraph!.index, 'directive_inline');
		expect(directive).not.toBeNull();
		const { content } = get_content(nodes, directive!.index, source);
		expect(content).toBe(':d[escaped \\] close]');
	});

	test('links work again after the directive closes', () => {
		const input = ':d[x] then [a link](url)\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const paragraph = find_child(nodes, root.index, 'paragraph');
		const kinds = get_all_child_kinds(nodes, paragraph!.index);
		expect(kinds).toContain('directive_inline');
		expect(kinds).toContain('link');
	});
});

/** the tree under the root, as print_ast prints it */
const ast = (input: string) => {
	const { nodes, source } = parse_markdown_svelte(input);
	return print_ast(nodes, source).split('\n').slice(1).join('\n');
};

const parse_fed = (source: string, chunk: number) =>
	run_batch(source, undefined, chunk).nodes;

const parse_over_wire = (source: string, chunk: number) =>
	run_wire(source, undefined, chunk).nodes;

describe('block directive labels', () => {
	test('a leaf label is a directive_label child holding inline nodes', () => {
		expect(ast('::note[Heads *up* and _soft_]\n')).toBe(
			[
				'  directive_leaf name="note"',
				'    directive_label',
				'      text "Heads "',
				'      strong_emphasis',
				'        text "up"',
				'      text " and "',
				'      emphasis',
				'        text "soft"',
			].join('\n')
		);
	});

	test('a container label comes first, the body blocks follow it', () => {
		const input = ':::Callout[Heads *up*](kind=warn)\nbody\n\n> quote\n:::\n';
		const { nodes, source } = parse_markdown_svelte(input);
		const box = find_child(nodes, 0, 'directive_container')!;
		expect(box.metadata.args).toEqual({ kind: 'warn' });
		expect(shape(nodes, source, box.index)).toEqual([
			'directive_container',
			['directive_label', 'text:Heads ', ['strong_emphasis', 'text:up']],
			['paragraph', 'text:body'],
			['block_quote', ['paragraph', 'text:quote']],
		]);
		const kinds = get_all_child_kinds(nodes, box.index);
		expect(kinds.filter((k) => k === 'directive_label')).toHaveLength(1);
	});

	test('the label spans its brackets, its value is the text between', () => {
		const input = '::x[a *b*](k=v)\n';
		const { nodes, source } = parse_markdown_svelte(input);
		const leaf = find_child(nodes, 0, 'directive_leaf')!;
		const label = find_child(nodes, leaf.index, 'directive_label')!;
		expect(get_content(nodes, label.index, source)).toEqual({
			content: '[a *b*]',
			value: 'a *b*',
		});
		expect(get_content(nodes, leaf.index, source).value).toBe('a *b*');
		const strong = find_child(nodes, label.index, 'strong_emphasis')!;
		expect(get_content(nodes, strong.index, source)).toEqual({
			content: '*b*',
			value: 'b',
		});
	});

	test('empty brackets make no label', () => {
		expect(ast('::x[]\n')).toBe('  directive_leaf name="x"');
		expect(
			get_all_child_kinds(parse_markdown_svelte(':::x[]\na\n:::\n').nodes, 1)
		).toEqual(['paragraph', 'line_break']);
	});

	test('whitespace only text is still a label', () => {
		expect(ast('::x[ ]\n')).toBe(
			[
				'  directive_leaf name="x"',
				'    directive_label',
				'      text " "',
			].join('\n')
		);
	});

	test('an unclosed delimiter stays literal and never reaches the args', () => {
		expect(ast('::x[*open](k=*)\n')).toBe(
			[
				'  directive_leaf name="x" args.k="*"',
				'    directive_label',
				'      text "*open"',
			].join('\n')
		);
	});

	test('a delimiter cannot close past the ], the line stays a directive', () => {
		const { nodes } = parse_markdown_svelte('::x[a _b](c=d_)\n');
		const leaf = find_child(nodes, 0, 'directive_leaf')!;
		expect(leaf.metadata.args).toEqual({ c: 'd_' });
		const label = find_child(nodes, leaf.index, 'directive_label')!;
		expect(get_all_child_kinds(nodes, label.index)).not.toContain('emphasis');
	});

	test('a code span keeps its brackets', () => {
		expect(ast('::x[`a]b` code]\n')).toBe(
			[
				'  directive_leaf name="x"',
				'    directive_label',
				'      code_span "a]b"',
				'      text " code"',
			].join('\n')
		);
		const { nodes } = parse_markdown_svelte('::x[a `b] c\n');
		expect(get_all_child_kinds(nodes, 0)).toEqual(['paragraph', 'line_break']);
	});

	test('links, images and autolinks stay literal text', () => {
		const { nodes } = parse_markdown_svelte(
			'::x[see [docs](/d) <https://x.y> ![i](s)]\n'
		);
		const leaf = find_child(nodes, 0, 'directive_leaf')!;
		const label = find_child(nodes, leaf.index, 'directive_label')!;
		const kinds = get_all_child_kinds(nodes, label.index);
		expect(kinds.every((k) => k === 'text')).toBe(true);
	});

	test('an inline directive nests in a label', () => {
		expect(ast(':::x[a :y[b](k=v) c]\n:::\n')).toBe(
			[
				'  directive_container name="x"',
				'    directive_label',
				'      text "a "',
				'      directive_inline name="y" args.k="v"',
				'        text "b"',
				'      text " c"',
			].join('\n')
		);
	});

	test('links parse again in the body after a label', () => {
		const { nodes } = parse_markdown_svelte(':::x[a]\n[l](u)\n:::\n');
		const box = find_child(nodes, 0, 'directive_container')!;
		const para = find_child(nodes, box.index, 'paragraph')!;
		expect(get_all_child_kinds(nodes, para.index)).toEqual(['link']);
	});

	test('labels in a block quote and a list', () => {
		const quoted = parse_markdown_svelte('> ::q[*a*]\n');
		expect(shape(quoted.nodes, quoted.source)).toEqual([
			'root',
			[
				'block_quote',
				['directive_leaf', ['directive_label', ['strong_emphasis', 'text:a']]],
			],
		]);
		const { nodes, source } = parse_markdown_svelte(
			'- ::x[a *b*]\n- ::y[`c`]\n'
		);
		expect(shape(nodes, source)).toEqual([
			'root',
			[
				'list',
				[
					'list_item',
					[
						'directive_leaf',
						['directive_label', 'text:a ', ['strong_emphasis', 'text:b']],
					],
				],
				['list_item', ['directive_leaf', ['directive_label', 'code_span']]],
			],
		]);
	});

	describe('incremental', () => {
		const cases = [
			'::note[Heads *up* and _soft_]\n',
			':::Callout[Heads *up*](kind=warn)\nbody *x*\n:::\n',
			'::x[*open](k=*)\n',
			'::x[`a]b` and :y[c](k=v)]\nafter\n',
			'text\n::x[~~s~~ ^up^ ~down~ \\*l\\* {e} <b>h</b>]\n',
			'> ::q[*a*]\n\n- ::x[a *b*]\n',
			':::a[*o*]\n:::b[_i_]\nx\n:::\n:::\n',
			'::x[a',
			'::x[*a*]',
		];
		for (const input of cases) {
			test(`fed in chunks matches the batch tree: ${JSON.stringify(input)}`, () => {
				const { nodes, source } = parse_markdown_svelte(input);
				const batch = print_ast(nodes, source);
				for (const chunk of [1, 2, 3, 5, 8, 64]) {
					expect(print_ast(parse_fed(input, chunk), source)).toBe(batch);
				}
			});
		}

		test('the label opens and closes at the end of its line, before the body', () => {
			const ops: string[] = [];
			const rec: Emitter = {
				open: (_id, kind) => ops.push('open ' + kind_to_string(kind)),
				close: (id) => ops.push('close ' + id),
				text() {},
				attr() {},
				set_value_start() {},
				set_value_end() {},
				revoke: (id) => ops.push('revoke ' + id),
				commit() {},
				cursor() {},
			};
			const p = new PFMParser(rec);
			p.init();
			p.feed(':::box[*L*](k=v)');
			expect(ops).toEqual(['open root']);
			p.feed('\n');
			expect(ops).toEqual([
				'open root',
				'open directive_container',
				'open directive_label',
				'open strong_emphasis',
				'open text',
				'close 4',
				'close 3',
				'close 2',
			]);
			p.feed('body\n:::\n');
			p.finish();
			expect(ops.slice(8, 10)).toEqual(['open paragraph', 'open text']);
		});
	});

	describe('wire', () => {
		test('the schema names the label kind', () => {
			const emitter = new WireEmitter();
			emitter.set_source('::x[a]\n');
			new PFMParser(emitter).parse('::x[a]\n');
			const schema = emitter.flush()[0];
			expect(schema[0]).toBe('S');
			expect((schema[1] as string[])[NodeKind.directive_label]).toBe(
				'directive_label'
			);
		});

		const cases = [
			':::Callout[Heads *up* `c`](kind=warn)\nbody\n:::\n',
			'::x[a :y[b] c]\n',
			'> ::q[_a_ b]\n',
		];
		for (const input of cases) {
			test(`the wire tree matches the batch tree: ${JSON.stringify(input)}`, () => {
				const { nodes, source } = parse_markdown_svelte(input);
				const expected = shape(nodes, source);
				for (const chunk of [1, 4, input.length]) {
					expect(shape(parse_over_wire(input, chunk), null)).toEqual(expected);
				}
			});
		}
	});

	test('a parse plugin can address the label', () => {
		const seen: string[] = [];
		const plugin: ParsePlugin = {
			directive_label: {
				parse(node) {
					seen.push(node.type);
					node.attrs.role = 'caption';
				},
			},
		};
		const { nodes } = parse_markdown_svelte(':::x[*a*]\nb\n:::\n', {
			plugins: [plugin],
		});
		expect(seen).toEqual(['directive_label']);
		const box = find_child(nodes, 0, 'directive_container')!;
		const label = find_child(nodes, box.index, 'directive_label')!;
		expect(label.metadata).toEqual({ role: 'caption' });
	});
});
