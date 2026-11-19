<script>
	let { level, children } = $props();
</script>

<svelte:element this={`h${level}`} class="heading">
	{@render children?.()}
</svelte:element>

<style>
	.heading {
		color: #00a862;
	}
</style>
