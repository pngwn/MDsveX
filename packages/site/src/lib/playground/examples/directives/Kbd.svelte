<script>
	let { children } = $props();
</script>

<kbd>{@render children?.()}</kbd>

<style>
	kbd {
		padding: 0 0.4em;
		border: 1px solid #aaa;
		border-radius: 4px;
		font-size: 0.9em;
	}
</style>
