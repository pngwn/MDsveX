<script>
	let { level, children, ...rest } = $props();
</script>

<svelte:element this={`h${level}`} {...rest} class="heading">
	# {@render children?.()}
</svelte:element>

<style>
	.heading {
		color: #00a862;
	}
</style>
