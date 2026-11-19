import { describe, expect, test } from 'vitest';

import { every_path, lines } from './stream_shape';

describe('the close token of a svelte block', () => {
	test('one of another name does not close the block and stays as written', () => {
		expect(every_path('{#if a}\nx\n{/each}\n{/if}\n')).toBe(
			lines(
				'root',
				'  svelte_block tag="if"',
				'    svelte_branch tag="if" "a"',
				'      line_break',
				'      paragraph',
				'        text "x"',
				'        soft_break',
				'        mustache "/each"',
				'      line_break',
				'  line_break'
			)
		);
	});

	test('one of another name after a blank line is a paragraph of its own', () => {
		expect(every_path('{#if a}\n\nx\n\n{/each}\n\n{/if}\n')).toBe(
			lines(
				'root',
				'  svelte_block tag="if"',
				'    svelte_branch tag="if" "a"',
				'      line_break',
				'      line_break',
				'      paragraph',
				'        text "x"',
				'      line_break',
				'      line_break',
				'      paragraph',
				'        mustache "/each"',
				'      line_break',
				'      line_break',
				'  line_break'
			)
		);
	});

	test('two blocks closed in the wrong order keep the first close token', () => {
		expect(
			every_path('{#if ready}\n{#each items as item}\n{item}\n{/if}\n{/each}\n')
		).toBe(
			lines(
				'root',
				'  svelte_block tag="if"',
				'    svelte_branch tag="if" "ready"',
				'      line_break',
				'      svelte_block tag="each"',
				'        svelte_branch tag="each" "items as item"',
				'          line_break',
				'          paragraph',
				'            mustache "item"',
				'            soft_break',
				'            mustache "/if"',
				'          line_break',
				'      line_break'
			)
		);
	});

	test('two blocks closed in order close', () => {
		expect(
			every_path('{#if ready}\n{#each items as item}\n{item}\n{/each}\n{/if}\n')
		).toBe(
			lines(
				'root',
				'  svelte_block tag="if"',
				'    svelte_branch tag="if" "ready"',
				'      line_break',
				'      svelte_block tag="each"',
				'        svelte_branch tag="each" "items as item"',
				'          line_break',
				'          paragraph',
				'            mustache "item"',
				'          line_break',
				'      line_break',
				'  line_break'
			)
		);
	});

	test('one of another name right after the open token', () => {
		expect(every_path('{#e}{/q}')).toBe(
			lines(
				'root',
				'  svelte_block tag="e"',
				'    svelte_branch tag="e"',
				'      paragraph',
				'        mustache "/q"'
			)
		);
	});

	test('a name that only starts with the name of the block does not close it', () => {
		expect(every_path('{#if a}\n{/iffy}\n{/if}\n')).toBe(
			lines(
				'root',
				'  svelte_block tag="if"',
				'    svelte_branch tag="if" "a"',
				'      line_break',
				'      paragraph',
				'        mustache "/iffy"',
				'      line_break',
				'  line_break'
			)
		);
	});

	test('in a list item and in a block quote', () => {
		expect(every_path('- {#if a}\n  x\n  {/each}\n  {/if}\n')).toBe(
			lines(
				'root',
				'  list ordered=false start=0 tight=true',
				'    list_item',
				'      svelte_block tag="if"',
				'        svelte_branch tag="if" "a"',
				'          line_break',
				'          paragraph',
				'            text "x"',
				'            soft_break',
				'            mustache "/each"',
				'          line_break',
				'  line_break'
			)
		);
		expect(every_path('> {#if a}\n> {/each}\n> {/if}\n')).toBe(
			lines(
				'root',
				'  block_quote',
				'    svelte_block tag="if"',
				'      svelte_branch tag="if" "a"',
				'        line_break',
				'        paragraph',
				'          mustache "/each"',
				'        line_break',
				'  line_break'
			)
		);
	});
});
