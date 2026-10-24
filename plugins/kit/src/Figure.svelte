<script>
	import { getContext } from 'svelte';

	/**
	 * one numbered target, as a numbering plugin writes it with
	 * ctx.add('targets', ...) under its name in plugin data
	 *
	 * @typedef {{ id: string, number?: number | string, text?: string }} Target
	 */

	/**
	 * @typedef {{
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   id?: string,
	 *   number?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { label, children, id, number } = $props();

	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
	const data = getContext(Symbol.for('mdsvex.plugin_data'));

	// "Figure 3" once something numbers this figure, nothing otherwise
	const prefix = $derived.by(() => {
		if (number) return 'Figure ' + number;
		if (!id) return undefined;
		const numbering = /** @type {{ targets?: Target[] } | undefined} */ (
			data?.current?.numbering
		);
		const target = numbering?.targets?.find((entry) => entry.id === id);
		if (target === undefined) return undefined;
		return target.text ?? (target.number === undefined ? undefined : 'Figure ' + target.number);
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
