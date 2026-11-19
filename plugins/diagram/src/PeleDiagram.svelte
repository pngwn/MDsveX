<script>
	/**
	 * @typedef {{
	 *   children?: import('svelte').Snippet,
	 *   svg?: string,
	 *   title?: string,
	 *   caption?: string,
	 *   error?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { children, svg, title, caption, error } = $props();
</script>

<figure class="diagram diagram-pele">
	{#if title}<figcaption class="diagram-title">{title}</figcaption>{/if}
	{#if svg}
		<!-- drawn by pele at build time from the source of the page, which escapes the text in it -->
		<div class="diagram-svg">{@html svg}</div>
		<details class="diagram-source">
			<summary>Diagram source</summary>
			{@render children?.()}
		</details>
	{:else}
		{#if error}<p class="diagram-error">The diagram could not be drawn: {error}</p>{/if}
		{@render children?.()}
	{/if}
	{#if caption}<div class="diagram-caption">{caption}</div>{/if}
</figure>
