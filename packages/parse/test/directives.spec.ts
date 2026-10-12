import { describe, expect, test } from 'vitest';

import { get_content, get_all_child_kinds } from './utils';
import { expect_parity, run_batch, run_wire, shape } from './plugin_harness';
import { print_ast } from './print';
import {
	NodeKind,
	PFMParser,
	WireEmitter,
	parse_markdown_svelte,
} from '../src/main';
import type { Emitter } from '../src/opcodes';
import type { ParsePlugin } from '../src/plugin_types';
import { TreeBuilder } from '../src/tree_builder';
import { kind_to_string } from '../src/utils';
import { WireTreeBuilder } from '../src/wire_tree_builder';

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
// Leaf block directives: ::name[content], ::name
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

	test('leaf directive without brackets', () => {
		const input = '::toc\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_leaf');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('toc');
		expect(directive!.children).toEqual([]);
		expect(find_child(nodes, root.index, 'paragraph')).toBeNull();
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

	const MERGE = { merge_text: true };
	const leaf = (text?: string) =>
		text === undefined
			? 'directive_leaf'
			: ['directive_leaf', ['directive_label', 'text:' + text]];
	const para = (text: string) => ['paragraph', 'text:' + text];

	/** both builders fed the source as the two pieces around `at` */
	const split_trees = (source: string, at: number) => {
		const tree = new TreeBuilder(source.length);
		const batch = new PFMParser(tree);
		batch.init();
		batch.feed(source.slice(0, at));
		batch.feed(source.slice(at));
		batch.finish();

		const emitter = new WireEmitter();
		const wire = new PFMParser(emitter);
		const builder = new WireTreeBuilder(128);
		wire.init();
		emitter.set_source(source.slice(0, at));
		wire.feed(source.slice(0, at));
		builder.apply(emitter.flush());
		emitter.set_source(source);
		wire.feed(source.slice(at));
		wire.finish();
		builder.apply(emitter.flush());
		return [
			shape(tree.get_buffer(), source, 0, MERGE),
			shape(builder.get_buffer(), null, 0, MERGE),
		];
	};

	/** one tree in batch and over the wire, whole, fed 1, 2, 3 and 7, and split at every offset */
	const expect_all_paths = (input: string, tree: unknown) => {
		expect(expect_parity(input, () => [])).toEqual(tree);
		for (const chunk of [2, 3]) {
			const fed = run_batch(input, undefined, chunk);
			expect(shape(fed.nodes, input, 0, MERGE)).toEqual(tree);
			const wire = run_wire(input, undefined, chunk);
			expect(shape(wire.nodes, null, 0, MERGE)).toEqual(tree);
		}
		for (let at = 1; at < input.length; at++) {
			const [batch, wire] = split_trees(input, at);
			expect(batch, `batch split at ${at}`).toEqual(tree);
			expect(wire, `wire split at ${at}`).toEqual(tree);
		}
	};

	describe('the line after a leaf in a block quote', () => {
		const cases: [string, string, unknown][] = [
			[
				'a quoted line stays in the quote',
				'> ::toc[]\n> text\n',
				['root', ['block_quote', leaf(), para('text')]],
			],
			[
				'two leaves are siblings',
				'> ::toc[x]\n> ::toc[y]\n',
				['root', ['block_quote', leaf('x'), leaf('y')]],
			],
			[
				'two levels deep',
				'> > ::toc[]\n> > text\n',
				['root', ['block_quote', ['block_quote', leaf(), para('text')]]],
			],
			[
				'an unmarked line ends the quote',
				'> ::toc[]\ntext\n',
				['root', ['block_quote', leaf()], para('text')],
			],
			[
				'a blank quoted line opens nothing',
				'> ::toc[]\n>\n> text\n',
				['root', ['block_quote', leaf(), para('text')]],
			],
			[
				'one marker fewer ends the inner quote',
				'> > ::toc[]\n> text\n',
				['root', ['block_quote', ['block_quote', leaf()], para('text')]],
			],
			[
				'one marker more opens one quote',
				'> ::toc[]\n> > text\n',
				['root', ['block_quote', leaf(), ['block_quote', para('text')]]],
			],
			[
				'a marker with no space',
				'>::toc[]\n>text\n',
				['root', ['block_quote', leaf(), para('text')]],
			],
			[
				'args and trailing spaces',
				'> ::toc[x](a=1)  \n> text\n',
				['root', ['block_quote', leaf('x'), para('text')]],
			],
			[
				'other blocks follow',
				'> ::toc[]\n> # h\n> ::toc[]\n> ---\n> ::toc[]\n',
				[
					'root',
					[
						'block_quote',
						leaf(),
						['heading', 'text:h'],
						leaf(),
						'thematic_break',
						leaf(),
					],
				],
			],
			[
				'in a list item',
				'> - ::toc[]\n>   text\n> - b\n',
				[
					'root',
					[
						'block_quote',
						[
							'list',
							['list_item', leaf(), 'text:text'],
							['list_item', 'text:b'],
						],
					],
				],
			],
			[
				'a line at the list marker ends the list',
				'> - ::toc[]\n> text\n',
				[
					'root',
					['block_quote', ['list', ['list_item', leaf()]], para('text')],
				],
			],
			[
				'in a container',
				'> :::box[]\n> ::toc[]\n> text\n> :::\n> after\n',
				[
					'root',
					[
						'block_quote',
						['directive_container', leaf(), para('text')],
						para('after'),
					],
				],
			],
			[
				'an unmarked line ends a container too',
				'> :::box[]\n> ::toc[]\nout\n',
				['root', ['block_quote', ['directive_container', leaf()]], para('out')],
			],
			[
				'a quote inside a list item',
				'- > ::toc[]\n  > text\n',
				[
					'root',
					['list', ['list_item', ['block_quote', leaf(), para('text')]]],
				],
			],
			['ends at the marker', '> ::toc[]\n>', ['root', ['block_quote', leaf()]]],
		];

		for (const [name, input, tree] of cases) {
			test(`${name}: ${JSON.stringify(input)}`, () => {
				expect_all_paths(input, tree);
			});
		}

		test('the leaf ends before its linefeed, as its siblings in the quote do', () => {
			const input = '> ::toc[]\n> ---\n';
			const { nodes } = parse_markdown_svelte(input);
			const bq = find_child(nodes, nodes.get_node().index, 'block_quote')!;
			const leaf_node = find_child(nodes, bq.index, 'directive_leaf')!;
			const rule = find_child(nodes, bq.index, 'thematic_break')!;
			expect(input.slice(leaf_node.start, leaf_node.end)).toBe('::toc[]');
			expect(input.slice(rule.start, rule.end)).toBe('---');
		});
	});

	describe('the line after a leaf in a list item', () => {
		const list = (...items: unknown[]) => ['list', ...items];
		const item = (...kids: unknown[]) => ['list_item', ...kids];

		const cases: [string, string, unknown][] = [
			[
				'a line at the marker ends the list',
				'- ::toc[]\ntext\n',
				['root', list(item(leaf())), para('text')],
			],
			[
				'an indented line stays in the item',
				'- ::toc[]\n  text\n- b\n',
				['root', list(item(leaf(), 'text:text'), item('text:b'))],
			],
			[
				'the next marker opens a sibling item',
				'- ::toc[x]\n- ::toc[y]\n',
				['root', list(item(leaf('x')), item(leaf('y')))],
			],
			[
				'a heading at the marker ends the list',
				'- ::toc[]\n# h\n',
				['root', list(item(leaf())), ['heading', 'text:h']],
			],
			[
				'a quote at the marker ends the list',
				'- ::toc[]\n> q\n',
				['root', list(item(leaf())), ['block_quote', para('q')]],
			],
			[
				'a thematic break ends the list',
				'- ::toc[]\n---\n',
				['root', list(item(leaf())), 'thematic_break'],
			],
			[
				'a leaf at the marker ends the list',
				'- ::toc[]\n::toc[]\n',
				['root', list(item(leaf())), leaf()],
			],
			[
				'an indented leaf stays in the item',
				'- ::toc[]\n  ::toc[]\n',
				['root', list(item(leaf(), leaf()))],
			],
			[
				'a blank line then an indented line',
				'- ::toc[]\n\n  text\n',
				['root', list(item(leaf(), para('text')))],
			],
			[
				'a blank line then a line at the marker',
				'- ::toc[]\n\ntext\n',
				['root', list(item(leaf())), para('text')],
			],
			[
				'after a paragraph in a loose item',
				'- a\n\n  ::toc[]\nout\n',
				['root', list(item(para('a'), leaf())), para('out')],
			],
			[
				'ordered, with args',
				'1. ::toc[x](a=1)  \n   text\n2. b\n',
				['root', list(item(leaf('x'), 'text:text'), item('text:b'))],
			],
			[
				'a nested list follows',
				'- ::toc[]\n  - b\n- c\n',
				['root', list(item(leaf(), list(item('text:b'))), item('text:c'))],
			],
			[
				'a line at the outer indent ends the nested list',
				'- a\n  - ::toc[]\n  b\n- c\n',
				[
					'root',
					list(item('text:a', list(item(leaf())), 'text:b'), item('text:c')),
				],
			],
			[
				'the closing fence of a container ends the list',
				':::box[]\n- ::toc[]\n:::\nafter\n',
				['root', ['directive_container', list(item(leaf()))], para('after')],
			],
			[
				'a line at the marker in a container',
				':::box[]\n- ::toc[]\ntext\n:::\n',
				['root', ['directive_container', list(item(leaf())), para('text')]],
			],
			[
				'a container in the item',
				'- :::box[]\n  ::toc[]\n  text\n  :::\n',
				['root', list(item(['directive_container', leaf(), para('text')]))],
			],
			[
				'in a svelte block',
				'{#if x}\n- ::toc[]\ntext\n{/if}\n',
				[
					'root',
					['svelte_block', ['svelte_branch', list(item(leaf())), para('text')]],
				],
			],
			['no linefeed', '- ::toc[]', ['root', list(item(leaf()))]],
		];

		/** the same document with a heading where each leaf is, and its tree with the headings turned back */
		const as_heading = (input: string) => {
			const swapped = input.replace(/::toc\[(\w*)\](\(a=1\))?/g, '# h$1');
			const back = (node: unknown): unknown => {
				if (!Array.isArray(node)) return node;
				if (node[0] === 'heading') {
					const text = (node[1] as string).slice('text:h'.length);
					return leaf(text === '' ? undefined : text);
				}
				return node.map(back);
			};
			const { nodes, source } = parse_markdown_svelte(swapped);
			return back(shape(nodes, source, 0, MERGE));
		};

		for (const [name, input, tree] of cases) {
			test(`${name}: ${JSON.stringify(input)}`, () => {
				expect_all_paths(input, tree);
				// a document that holds a heading of its own has no twin to compare
				if (!input.includes('# h')) expect(as_heading(input)).toEqual(tree);
			});
		}

		test('the leaf ends before its linefeed', () => {
			const input = '- ::toc[]\n  text\n';
			const { nodes } = parse_markdown_svelte(input);
			const list_node = find_child(nodes, nodes.get_node().index, 'list')!;
			const li = find_child(nodes, list_node.index, 'list_item')!;
			const leaf_node = find_child(nodes, li.index, 'directive_leaf')!;
			expect(input.slice(leaf_node.start, leaf_node.end)).toBe('::toc[]');
		});
	});
});

// ===========================================================
// Container block directives: :::name[content] ... :::, :::name ... :::
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

	test('container directive without brackets', () => {
		const input = ':::note\nSome text.\n:::\n';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const directive = find_child(nodes, root.index, 'directive_container');
		expect(directive).not.toBeNull();
		expect(directive!.metadata.name).toBe('note');
		expect(find_child(nodes, directive!.index, 'directive_label')).toBeNull();
		const paragraph = find_child(nodes, directive!.index, 'paragraph');
		expect(paragraph).not.toBeNull();
		expect(find_child(nodes, root.index, 'paragraph')).toBeNull();
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

describe('unclosed inline directives', () => {
	const cases: [string, string, unknown][] = [
		[
			'at the end of a paragraph',
			'x :tabs[y z\n',
			['root', ['paragraph', 'text:x :tabs[y z']],
		],
		[
			'around a strong',
			'x :tabs[y *z* w\n\nnext\n',
			[
				'root',
				[
					'paragraph',
					'text:x :tabs[y ',
					['strong_emphasis', 'text:z'],
					'text: w',
				],
				['paragraph', 'text:next'],
			],
		],
		[
			'with nothing after the bracket',
			'x :tabs[\n',
			['root', ['paragraph', 'text:x :tabs[']],
		],
		[
			'at the end of the input',
			'x :tabs[y z',
			['root', ['paragraph', 'text:x :tabs[y z']],
		],
		[
			'with args text after it',
			'x :tabs[y (a=1) z\n',
			['root', ['paragraph', 'text:x :tabs[y (a=1) z']],
		],
		[
			'inside emphasis',
			'_a :tabs[y z_ b\n',
			['root', ['paragraph', 'text:_a :tabs[y z_ b']],
		],
		[
			'inside a strong across a line',
			'*a :tabs[y z\nb* c\n',
			['root', ['paragraph', 'text:*a :tabs[y z', 'soft_break', 'text:b* c']],
		],
		[
			'inside another one',
			'x :a[b :c[d e\n',
			['root', ['paragraph', 'text:x :a[b :c[d e']],
		],
		[
			'across a soft break',
			'x :tabs[y\nz w\n',
			['root', ['paragraph', 'text:x :tabs[y', 'soft_break', 'text:z w']],
		],
		[
			'in a heading',
			'# h :tabs[y z\n',
			['root', ['heading', 'text:h :tabs[y z']],
		],
		[
			'in a block quote',
			'> x :tabs[y z\n',
			['root', ['block_quote', ['paragraph', 'text:x :tabs[y z']]],
		],
		[
			'in a tight list',
			'- a :tabs[y z\n- b\n',
			[
				'root',
				['list', ['list_item', 'text:a :tabs[y z'], ['list_item', 'text:b']],
			],
		],
		[
			'in table cells',
			'| a :tabs[y z | b |\n| - | - |\n| c :t[d | e |\n',
			[
				'root',
				[
					'table',
					[
						'table_header',
						['table_cell', 'text:a :tabs[y z'],
						['table_cell', 'text:b'],
					],
					[
						'table_row',
						['table_cell', 'text:c :t[d'],
						['table_cell', 'text:e'],
					],
				],
			],
		],
	];
	for (const [name, input, expected] of cases) {
		test(`${name} every path keeps the source text`, () => {
			expect(expect_parity(input, () => [])).toEqual(expected);
		});
	}
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

describe('block directives without brackets', () => {
	const ATTRS = { attrs: ['name', 'args'] };
	const tree = (input: string) => {
		const { nodes, source } = parse_markdown_svelte(input);
		return shape(nodes, source, 0, ATTRS);
	};
	/** the same document with empty brackets after every opener name */
	const bracketed = (input: string) =>
		input.replace(
			/^([ >\t]*(?:(?:[-*+]|\d+[.)])[ \t]+)?:{2,}[a-zA-Z][\w-]*)/gm,
			'$1[]'
		);

	test('a leaf with args', () => {
		expect(tree('::toc(depth=2, title="On this page")\n')).toEqual([
			'root',
			'directive_leaf name="toc" args={"depth":"2","title":"On this page"}',
		]);
	});

	test('a container with args', () => {
		expect(tree(':::note(kind=warn)\nbody\n:::\n')).toEqual([
			'root',
			[
				'directive_container name="note" args={"kind":"warn"}',
				['paragraph', 'text:body'],
			],
		]);
	});

	test('empty args are allowed but ignored', () => {
		expect(tree('::toc()\n')).toEqual(['root', 'directive_leaf name="toc"']);
		expect(tree(':::note()\n:::\n')).toEqual([
			'root',
			'directive_container name="note"',
		]);
	});

	test('trailing spaces and tabs are allowed', () => {
		for (const tail of [' ', '\t', '  \t ']) {
			expect(tree(`::toc${tail}\n`), JSON.stringify(tail)).toEqual([
				'root',
				'directive_leaf name="toc"',
			]);
			expect(
				tree(`:::note(k=v)${tail}\nx\n:::\n`),
				JSON.stringify(tail)
			).toEqual([
				'root',
				[
					'directive_container name="note" args={"k":"v"}',
					['paragraph', 'text:x'],
				],
			]);
		}
	});

	test('the end of the input ends the opener line', () => {
		expect(tree('::toc')).toEqual(['root', 'directive_leaf name="toc"']);
		expect(tree('::toc(a=1)')).toEqual([
			'root',
			'directive_leaf name="toc" args={"a":"1"}',
		]);
		expect(tree(':::note')).toEqual([
			'root',
			'directive_container name="note"',
		]);
		expect(tree(':::note  ')).toEqual([
			'root',
			'directive_container name="note"',
		]);
	});

	test('the node spans the line, with no value range and no label', () => {
		const input = '::toc\n:::note(k=v)\nx\n:::\n';
		const { nodes } = parse_markdown_svelte(input);
		const leaf = find_child(nodes, 0, 'directive_leaf')!;
		expect(input.slice(leaf.start, leaf.end)).toBe('::toc\n');
		expect(leaf.children).toEqual([]);
		const box = find_child(nodes, 0, 'directive_container')!;
		expect(input.slice(box.start, box.end)).toBe(':::note(k=v)\nx\n:::\n');
		expect(find_child(nodes, box.index, 'directive_label')).toBeNull();
	});

	describe('empty brackets and no brackets make the same tree', () => {
		const pairs: [string, string][] = [
			['::toc\n', '::toc[]\n'],
			['::toc', '::toc[]'],
			['::toc(a=1)\n', '::toc[](a=1)\n'],
			['::toc \t\n', '::toc[] \t\n'],
			[':::note\nbody\n:::\n', ':::note[]\nbody\n:::\n'],
			[
				':::note(k=v, w="x y")\nbody\n:::\n',
				':::note[](k=v, w="x y")\nbody\n:::\n',
			],
			[':::note', ':::note[]'],
			[
				':::note\n\n# h\n\n- a\n- b\n\n:::\nafter\n',
				':::note[]\n\n# h\n\n- a\n- b\n\n:::\nafter\n',
			],
		];
		for (const [bare, with_brackets] of pairs) {
			test(JSON.stringify(bare), () => {
				expect(bracketed(bare)).toBe(with_brackets);
				const a = parse_markdown_svelte(bare);
				const b = parse_markdown_svelte(with_brackets);
				expect(shape(a.nodes, a.source, 0, ATTRS)).toEqual(
					shape(b.nodes, b.source, 0, ATTRS)
				);
				const kind = bare.startsWith(':::')
					? 'directive_container'
					: 'directive_leaf';
				const x = find_child(a.nodes, 0, kind)!;
				const y = find_child(b.nodes, 0, kind)!;
				expect(x.metadata).toEqual(y.metadata);
				expect(Object.keys(x.metadata)).toEqual(Object.keys(y.metadata));
				expect(find_child(a.nodes, x.index, 'directive_label')).toBeNull();
				expect(find_child(b.nodes, y.index, 'directive_label')).toBeNull();
				expect(x.value[1] - x.value[0]).toBe(0);
				expect(y.value[1] - y.value[0]).toBe(0);
			});
		}
	});

	describe('anything else after the name keeps the line a paragraph', () => {
		const lines = [
			'::name some text',
			'::before is a pseudo-element',
			'::name:',
			'::name::',
			'::name.',
			'::name,',
			'::name!',
			'::name/',
			'::name{x}',
			'::name<b>',
			'::name*',
			'::name\\',
			'::name [x]',
			':::name [x]',
			':::name []',
			':::name (k=v)',
			// the brackets come first when both are written
			'::name(k=v)[x]',
			':::name(k=v)[]',
			'::name(k=v) x',
			':::name(k=v) [x]',
			'::name(k)',
			'::name(k=)',
			'::name(k=v,)',
			'::name(k=v, k=w)',
			'::name(k=v',
			'::name(k="v)',
			':::name(k=v))',
			':::name(k=v)(l=w)',
			':: name',
			'::: name',
			'::1name',
			'::_name',
			'::-name',
			'::',
			':::',
		];
		for (const line of lines) {
			test(JSON.stringify(line), () => {
				for (const input of [line + '\n', line, line + '\nnext\n']) {
					const { nodes } = parse_markdown_svelte(input);
					expect(get_all_child_kinds(nodes, 0)).not.toContain('directive_leaf');
					expect(get_all_child_kinds(nodes, 0)).not.toContain(
						'directive_container'
					);
					const para = find_child(nodes, 0, 'paragraph')!;
					expect(input.slice(para.start, para.start + line.length)).toBe(line);
				}
			});
		}
	});

	test('a backslash before the colons keeps the line text', () => {
		for (const input of [
			'\\::toc\n',
			'\\:::note\nbody\n:::\n',
			'text\n\\::toc\n',
		]) {
			const printed = print_ast(parse_markdown_svelte(input).nodes, input);
			expect(printed, JSON.stringify(input)).not.toContain('directive');
		}
	});

	describe('the inline form still needs its brackets', () => {
		const cases: [string, string][] = [
			['one colon at the line start', ':name\n'],
			['one colon with args', ':name(k=v)\n'],
			['in running text', 'a :name b\n'],
			['an emoji shortcode', 'ship it :tada:\n'],
			['a time', 'at 10:30 sharp\n'],
			['a scope operator', 'std::vector is a type\n'],
			['two colons after text', 'see ::toc\n'],
			['three colons after text', 'see :::note\n'],
			['in a heading', '# ::toc\n'],
			['in a table cell', '| ::toc |\n|---|\n'],
		];
		for (const [name, input] of cases) {
			test(name, () => {
				const printed = print_ast(parse_markdown_svelte(input).nodes, input);
				expect(printed).not.toContain('directive');
			});
		}
	});

	describe('closing lines and nesting are unchanged', () => {
		test('a line of colons is never an opener', () => {
			for (const input of [':::\n', '::\n', '::::\n', ':::  \n', ':::']) {
				const printed = print_ast(parse_markdown_svelte(input).nodes, input);
				expect(printed, JSON.stringify(input)).not.toContain('directive');
			}
		});

		test('a closing line closes, the opener after it is a sibling', () => {
			expect(tree(':::a\n:::\n:::b\n:::\n')).toEqual([
				'root',
				'directive_container name="a"',
				'directive_container name="b"',
			]);
		});

		test('a named line inside an open container nests', () => {
			expect(tree(':::a\n:::b\nx\n:::\ny\n:::\n')).toEqual([
				'root',
				[
					'directive_container name="a"',
					['directive_container name="b"', ['paragraph', 'text:x']],
					['paragraph', 'text:y'],
				],
			]);
		});

		test('a leaf inside a container does not close it', () => {
			expect(tree(':::a\n::toc\n::toc(k=v)\nx\n:::\n')).toEqual([
				'root',
				[
					'directive_container name="a"',
					'directive_leaf name="toc"',
					'directive_leaf name="toc" args={"k":"v"}',
					['paragraph', 'text:x'],
				],
			]);
		});

		test('a longer fence closes the innermost container only', () => {
			expect(tree('::::a\n:::b\nx\n::::\nafter\n')).toEqual([
				'root',
				[
					'directive_container name="a"',
					['directive_container name="b"', ['paragraph', 'text:x']],
					['paragraph', 'text:after'],
				],
			]);
		});

		test('a shorter fence does not close a longer inner container', () => {
			expect(tree(':::a\n::::b\nx\n:::\n::::\ny\n:::\n')).toEqual([
				'root',
				[
					'directive_container name="a"',
					[
						'directive_container name="b"',
						['paragraph', 'text:x'],
						['paragraph', 'text::::'],
					],
					['paragraph', 'text:y'],
				],
			]);
		});

		const docs = [
			':::a\n:::b\nx\n:::\ny\n:::\n',
			'::::a\n:::b\nx\n:::\ny\n::::\n',
			':::a\n::::b\nx\n:::\ny\n::::\nz\n:::\n',
			':::a\n:::b\n:::c\n:::\n:::\n:::\nafter\n',
			':::a\n:::b\nx\n',
			':::a\n::leaf\n:::\n::leaf\n',
			':::a\n```\n:::b\n:::\n```\n:::\n',
			':::::a\nx\n:::\n:::::\n',
		];
		for (const doc of docs) {
			test(`nests and closes as with brackets: ${JSON.stringify(doc)}`, () => {
				expect(bracketed(doc)).not.toBe(doc);
				expect(tree(doc)).toEqual(tree(bracketed(doc)));
			});
		}
	});

	describe('every block start takes the bare forms', () => {
		const sites: [string, string, string[]][] = [
			['root', '::toc\n\n:::note(k=v)\nx\n:::\n', ['root']],
			[
				'after a paragraph line',
				'text\n::toc\ntext\n:::note\nx\n:::\n',
				['root'],
			],
			[
				'block quote',
				'> ::toc\n>\n> :::note(k=v)\n> x\n> :::\n',
				['block_quote'],
			],
			[
				'nested block quote',
				'> > ::toc\n> >\n> > :::note\n> > x\n> > :::\n',
				['block_quote', 'block_quote'],
			],
			[
				'list item',
				'- ::toc\n- :::note(k=v)\n  x\n  :::\n',
				['list', 'list_item'],
			],
			[
				'ordered list item',
				'1. ::toc(a=1)\n2. :::note\n   x\n   :::\n',
				['list', 'list_item'],
			],
			[
				'container',
				':::outer\n::toc\n:::note(k=v)\nx\n:::\n:::\n',
				['directive_container'],
			],
			[
				'svelte block',
				'{#if a}\n::toc\n:::note(k=v)\nx\n:::\n{:else}\n::toc(a=1)\n{/if}\n',
				['svelte_block', 'svelte_branch'],
			],
			[
				'each block',
				'{#each xs as x}\n:::note\n{x}\n:::\n::toc\n{/each}\n',
				['svelte_block', 'svelte_branch'],
			],
		];
		for (const [name, input, path] of sites) {
			test(name, () => {
				const { nodes } = parse_markdown_svelte(input);
				let at = 0;
				for (const kind of path) {
					if (kind === 'root') continue;
					at = find_child(nodes, at, kind)!.index;
				}
				const leaf = find_children(nodes, at, 'directive_leaf');
				const box = find_children(nodes, at, 'directive_container');
				// a list holds one directive an item
				const count =
					path[0] === 'list'
						? print_ast(nodes, input).match(/directive_(leaf|container)/g)!
								.length
						: leaf.length + box.length;
				expect(count).toBeGreaterThanOrEqual(2);
				expect(print_ast(nodes, input)).not.toMatch(/text ":+(toc|note)/);
				const all = expect_parity(input, () => [], ATTRS);
				expect(all).toEqual(tree(bracketed(input)));
				expect(bracketed(input)).not.toBe(input);
			});
		}
	});
});

describe('a container directive holds the blocks the document does', () => {
	const cases: [string, string, unknown][] = [
		[
			'a svelte block',
			':::box\n{#if a}\nb\n{/if}\n:::\n',
			[
				'directive_container',
				['svelte_block', ['svelte_branch', ['paragraph', 'text:b']]],
			],
		],
		[
			'a comment on its line',
			':::box\n<!-- a -->\n:::\n',
			['directive_container', 'html_comment'],
		],
		[
			'a comment over lines',
			':::box\n<!-- a\nb -->\nc\n:::\n',
			['directive_container', 'html_comment', ['paragraph', 'text:c']],
		],
		[
			'a svelte tag on its line',
			':::box\n{@html a}\n:::\n',
			['directive_container', 'svelte_tag'],
		],
		[
			'an autolink that could start a tag',
			':::box\n<MAILTO:a@b.c>\n:::\n',
			['directive_container', ['paragraph', ['link', 'text:MAILTO:a@b.c']]],
		],
		[
			'a svelte tag before text',
			':::box\n{@html a} b\n:::\n',
			['directive_container', ['paragraph', 'svelte_tag', 'text: b']],
		],
	];
	for (const [name, input, tree] of cases) {
		test(`${name}: ${JSON.stringify(input)}`, () => {
			const whole = expect_parity(input, () => []);
			expect(whole).toEqual(['root', tree]);
			for (const chunk of [1, 2, 3, 7]) {
				const fed = run_batch(input, undefined, chunk);
				expect(shape(fed.nodes, input, 0, { merge_text: true })).toEqual(whole);
			}
		});
	}
});
