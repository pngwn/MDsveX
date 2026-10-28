<script>
	/** @type {{ children?: import('svelte').Snippet }} */
	let { children } = $props();
</script>

<mark class="mark">{@render children?.()}</mark>
