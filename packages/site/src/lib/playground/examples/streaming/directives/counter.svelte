<script>
	// the component of :counter[text], the bracket text is children
	let { children } = $props();

	let count = $state(0);
</script>

<button onclick={() => count++}>{@render children?.()} + {count}</button>

<style>
	button {
		padding: 0 0.5em;
		border: 1px solid currentColor;
		border-radius: 0;
		color: inherit;
		background: none;
		font: inherit;
		cursor: pointer;
	}
</style>
