<script>
	let { children } = $props();
</script>

<p>{@render children?.()}</p>

<style>
	p {
		line-height: 1.7;
	}
</style>
