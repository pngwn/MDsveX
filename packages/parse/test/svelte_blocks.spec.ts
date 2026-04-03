import { describe, expect, test } from 'vitest';

import {
	get_all_child_kinds,
	get_content,
} from './utils';

import { parse_markdown_svelte } from '../src/main';

describe('svelte blocks - {#if}', () => {
	test('simple if block', () => {
		const input = '{#if a}\ndo things\n{/if}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		expect(block.kind).toBe('svelte_block');
		expect(block.metadata.tag).toBe('if');

		const branches = block.children.map((i: number) => nodes.get_node(i));
		expect(branches).toHaveLength(1);
		expect(branches[0].kind).toBe('svelte_branch');
		expect(branches[0].metadata.tag).toBe('if');

		const { value } = get_content(nodes, branches[0].index, input);
		expect(value).toBe('a');

		// Branch should contain a paragraph with "do things"
		const branch_kids = get_all_child_kinds(nodes, branches[0].index);
		expect(branch_kids).toContain('paragraph');
	});

	test('if/else block', () => {
		const input = '{#if a}\nfirst\n{:else}\nsecond\n{/if}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		expect(block.kind).toBe('svelte_block');

		const branches = block.children.map((i: number) => nodes.get_node(i));
		expect(branches).toHaveLength(2);

		expect(branches[0].kind).toBe('svelte_branch');
		expect(branches[0].metadata.tag).toBe('if');
		expect(get_content(nodes, branches[0].index, input).value).toBe('a');

		expect(branches[1].kind).toBe('svelte_branch');
		expect(branches[1].metadata.tag).toBe('else');
	});

	test('if/elseif/else block', () => {
		const input =
			'{#if a}\ndo things\n{:else if b}\ndo things\n{:else if c}\ndo things\n{:else}\ndo things\n{/if}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		expect(block.kind).toBe('svelte_block');
		expect(block.metadata.tag).toBe('if');

		const branches = block.children.map((i: number) => nodes.get_node(i));
		expect(branches).toHaveLength(4);

		expect(branches[0].metadata.tag).toBe('if');
		expect(get_content(nodes, branches[0].index, input).value).toBe('a');

		expect(branches[1].metadata.tag).toBe('else if');
		expect(get_content(nodes, branches[1].index, input).value).toBe('b');

		expect(branches[2].metadata.tag).toBe('else if');
		expect(get_content(nodes, branches[2].index, input).value).toBe('c');

		expect(branches[3].metadata.tag).toBe('else');
	});

	test('branch content is parsed as markdown', () => {
		const input = '{#if show}\n# Hello\n\nA paragraph with *emphasis*.\n{/if}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		const branch = nodes.get_node(block.children[0]);
		const kinds = get_all_child_kinds(nodes, branch.index);
		expect(kinds).toContain('heading');
		expect(kinds).toContain('paragraph');
	});
});

describe('svelte blocks - {#each}', () => {
	test('simple each block', () => {
		const input = '{#each items as item}\n{item}\n{/each}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		expect(block.kind).toBe('svelte_block');
		expect(block.metadata.tag).toBe('each');

		const branch = nodes.get_node(block.children[0]);
		expect(branch.metadata.tag).toBe('each');
		expect(get_content(nodes, branch.index, input).value).toBe('items as item');
	});

	test('each with else', () => {
		const input = '{#each items as item}\nhas items\n{:else}\nno items\n{/each}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		const branches = block.children.map((i: number) => nodes.get_node(i));
		expect(branches).toHaveLength(2);
		expect(branches[0].metadata.tag).toBe('each');
		expect(branches[1].metadata.tag).toBe('else');
	});
});

describe('svelte blocks - {#await}', () => {
	test('await/then/catch', () => {
		const input =
			'{#await promise}\nloading\n{:then value}\nresolved\n{:catch error}\nfailed\n{/await}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		expect(block.kind).toBe('svelte_block');
		expect(block.metadata.tag).toBe('await');

		const branches = block.children.map((i: number) => nodes.get_node(i));
		expect(branches).toHaveLength(3);
		expect(branches[0].metadata.tag).toBe('await');
		expect(get_content(nodes, branches[0].index, input).value).toBe('promise');
		expect(branches[1].metadata.tag).toBe('then');
		expect(get_content(nodes, branches[1].index, input).value).toBe('value');
		expect(branches[2].metadata.tag).toBe('catch');
		expect(get_content(nodes, branches[2].index, input).value).toBe('error');
	});
});

describe('svelte blocks - {#snippet}', () => {
	test('snippet block', () => {
		const input = '{#snippet header()}\n# Title\n{/snippet}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const block = nodes.get_node(root.children[0]);
		expect(block.kind).toBe('svelte_block');
		expect(block.metadata.tag).toBe('snippet');

		const branch = nodes.get_node(block.children[0]);
		expect(get_content(nodes, branch.index, input).value).toBe('header()');
	});
});

describe('svelte blocks - nesting', () => {
	test('nested if blocks', () => {
		const input =
			'{#if a}\n{#if b}\ninner\n{/if}\n{/if}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const outer = nodes.get_node(root.children[0]);
		expect(outer.kind).toBe('svelte_block');
		expect(outer.metadata.tag).toBe('if');

		const outer_branch = nodes.get_node(outer.children[0]);
		const inner_kinds = get_all_child_kinds(nodes, outer_branch.index);
		expect(inner_kinds).toContain('svelte_block');

		const inner = nodes.get_node(
			outer_branch.children.find(
				(i: number) => nodes.get_node(i).kind === 'svelte_block'
			)!
		);
		expect(inner.metadata.tag).toBe('if');
	});
});

describe('svelte blocks - mixed with markdown', () => {
	test('block after paragraph', () => {
		const input = 'some text\n\n{#if x}\ncontent\n{/if}';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const kinds = get_all_child_kinds(nodes, root.index);
		expect(kinds).toContain('paragraph');
		expect(kinds).toContain('svelte_block');
	});

	test('block before paragraph', () => {
		const input = '{#if x}\ncontent\n{/if}\n\nsome text';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const kinds = get_all_child_kinds(nodes, root.index);
		expect(kinds).toContain('svelte_block');
		expect(kinds).toContain('paragraph');
	});

	test('not parsed inside code fence', () => {
		const input = '```\n{#if x}\ncontent\n{/if}\n```';
		const { nodes } = parse_markdown_svelte(input);

		const root = nodes.get_node();
		const kinds = get_all_child_kinds(nodes, root.index);
		expect(kinds).toEqual(['code_fence']);
	});
});
