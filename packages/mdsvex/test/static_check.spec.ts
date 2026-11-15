import { describe, expect, test } from 'vitest';

import { check_static, static_problems } from '../src/static_check';

const FILE = '/site/Callout.static.svelte';

async function whats(code: string, file = FILE): Promise<string[]> {
	return (await static_problems(file, code)).map((p) => p.what);
}

describe('the check of a static component', () => {
	test('reports each construct that never runs, in source order', async () => {
		const code = [
			'<script>',
			"  import { getContext, setContext as set } from 'svelte';",
			"  const theme = getContext('theme');",
			"  set('x', 1);",
			'</script>',
			'<button onclick={go} on:keydown={go} bind:this={el} use:tip {@attach grow}></button>',
			'<div transition:fade in:fly out:slide animate:flip></div>',
			'<svelte:window onresize={fit} />',
			'<svelte:element this="p" onclick={go} />',
		].join('\n');
		expect(await whats(code)).toEqual([
			'getContext()',
			'set() (setContext)',
			'onclick',
			'on:keydown',
			'bind:this',
			'use:tip',
			'{@attach}',
			'transition:fade',
			'in:fly',
			'out:slide',
			'animate:flip',
			'onresize',
			'onclick',
		]);
	});

	test('gives the line and column of each in the file', async () => {
		const code =
			'<script>\n</script>\n<p>\n  <button onclick={go}>x</button>\n</p>';
		expect(await static_problems(FILE, code)).toEqual([
			{ what: 'onclick', line: 4, column: 10 },
		]);
	});

	test('a calculation made once and props of a child are fine', async () => {
		const code = [
			'<script lang="ts">',
			"  import Icon from './Icon.svelte';",
			"  import { untrack } from 'svelte';",
			'  let { items }: { items: string } = $props();',
			'  let count = $state(0);',
			"  const list = $derived(items.split(','));",
			'  function getContext() { return 1; }',
			'  getContext();',
			'</script>',
			'<Icon onclick={() => count++} name="info" />',
			'<ul>{#each list as item}<li>{item}</li>{/each}</ul>',
		].join('\n');
		expect(await whats(code)).toEqual([]);
	});

	test('a component with a bind: or an attachment is reported, its event prop is not', async () => {
		expect(
			await whats('<Child bind:open onclick={go} {@attach grow} />')
		).toEqual(['bind:open', '{@attach}']);
	});

	test('a preprocessed style does not stop the check', async () => {
		const code =
			'<button onclick={go}>x</button>\n<style lang="scss">$c: red; .a { color: $c; }</style>';
		expect(await static_problems(FILE, code)).toEqual([
			{ what: 'onclick', line: 1, column: 8 },
		]);
	});

	test('code svelte can not parse and a file that is no svelte component pass', async () => {
		expect(await whats('<p onclick={>')).toEqual([]);
		expect(
			await whats('<p onclick={go}>x</p>', '/site/Note.static.svx')
		).toEqual([]);
	});

	test('the error names the component and lists what never runs', async () => {
		expect(await check_static(FILE, '<p>{x}</p>')).toBe(null);
		const error = await check_static(
			FILE,
			'<button onclick={go}>x</button>\n<input bind:value />'
		);
		expect(error?.name).toBe('StaticComponentError');
		expect(error?.message).toBe(
			'[mdsvex] the static component /site/Callout.static.svelte uses what never runs in static output:\n' +
				'  onclick at /site/Callout.static.svelte:1:9\n' +
				'  bind:value at /site/Callout.static.svelte:2:8\n' +
				'a static directive renders once at build time and ships no code, ' +
				'rename the file without .static to render it live'
		);
	});
});
