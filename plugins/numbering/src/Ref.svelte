<script>
	import { getContext } from 'svelte';
	import { ref_parts, WORDS } from './words.js';

	/**
	 * @typedef {{
	 *   ids?: string[] | string,
	 *   words?: Partial<import('./words.js').Words> | string,
	 *   children?: import('svelte').Snippet,
	 *   class?: import('svelte/elements').ClassValue,
	 *   [attribute: string]: unknown,
	 * }} Props
	 */

	/** @type {Props} */
	let { ids, words, children: _children, class: class_name, ...rest } = $props();

	// what the plugins wrote, from a compiled document or a stream, current changes as targets arrive
	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
	const plugin_data = getContext(Symbol.for('mdsvex.plugin_data'));

	// the directive gives its ids and words as json, an arg is always a string
	const parts = $derived.by(() => {
		/** @type {string[]} */
		const list = typeof ids === 'string' ? JSON.parse(ids) : (ids ?? []);
		const given = typeof words === 'string' ? JSON.parse(words) : (words ?? {});
		const data = /** @type {Record<string, import('./words.js').Target> | undefined} */ (
			plugin_data?.current?.numbering
		);
		return ref_parts(list, { ...WORDS, ...given }, (id) => data?.['target:' + id]);
	});
</script>

{#if parts.length > 0}
	<span {...rest} class={['ref', class_name]}
		>{#each parts as part, i (i)}{#if part.href}<a href={part.href}>{part.text}</a
				>{:else}{part.text}{/if}{/each}</span
	>
{/if}
