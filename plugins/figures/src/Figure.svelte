<script>
	import { getContext } from 'svelte';

	/**
	 * a numbered target, as the numbering plugin writes it with
	 * ctx.set('target:' + id, ...)
	 *
	 * @typedef {{ kind?: string, number?: string, text?: string }} Target
	 */

	/**
	 * @typedef {{
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   id?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { label, children, id } = $props();

	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
	const data = getContext(Symbol.for('mdsvex.plugin_data'));

	// current changes while a document streams, the number arrives when the figure closes
	const prefix = $derived.by(() => {
		if (!id) return undefined;
		const numbering = /** @type {Record<string, Target | undefined> | undefined} */ (
			data?.current?.numbering
		);
		return numbering?.['target:' + id]?.text || undefined;
	});
</script>

<figure class="figure" {id}>
	{@render children?.()}
	{#if label || prefix}
		<figcaption class="figure-caption">
			{#if prefix}<span class="figure-number">{prefix}</span>{label ? ': ' : ''}{/if}{@render label?.()}
		</figcaption>
	{/if}
</figure>
