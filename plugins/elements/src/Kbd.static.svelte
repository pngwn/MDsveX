<script>
	/** @type {{ children?: import('svelte').Snippet }} */
	let { children } = $props();
</script>

<kbd class="kbd">{@render children?.()}</kbd>
