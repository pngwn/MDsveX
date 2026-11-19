<script>
	/**
	 * @typedef {{
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   open?: string,
	 *   name?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { label, children, open, name } = $props();
</script>

<!-- with no summary the browser shows its own in the language of the reader -->
<details class="details" open={open !== undefined && open !== 'false'} {name}>
	{#if label}<summary class="details-summary">{@render label()}</summary>{/if}
	<div class="details-body">{@render children?.()}</div>
</details>
