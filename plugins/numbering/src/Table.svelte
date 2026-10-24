<script>
	import { getContext } from 'svelte';

	/**
	 * @typedef {{
	 *   id?: string,
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   class?: import('svelte/elements').ClassValue,
	 *   [attribute: string]: unknown,
	 * }} Props
	 */

	/** @type {Props} */
	let { id, label, children, class: class_name, ...rest } = $props();

	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
	const plugin_data = getContext(Symbol.for('mdsvex.plugin_data'));

	// undefined until the caption closes in a stream, and for a table with no tbl: id
	const target = $derived(
		id === undefined
			? undefined
			: /** @type {import('./words.js').Target | undefined} */ (
					plugin_data?.current?.numbering?.['target:' + id]
				)
	);
</script>

<figure {...rest} {id} class={['table', class_name]}>
	{#if label || target}<figcaption
			>{#if target}<span class="table-number">{target.text}</span
				>{#if label}{': '}{/if}{/if}{#if label}{@render label()}{/if}</figcaption
		>{/if}
	{@render children?.()}
</figure>
