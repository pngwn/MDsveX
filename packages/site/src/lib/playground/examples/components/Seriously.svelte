<script>
	let { children } = $props();
</script>

<div class="seriously">
	{@render children?.()}
</div>

<style>
	.seriously {
		padding: 1em;
		border-left: 4px solid tomato;
		background: rgba(255, 99, 71, 0.12);
	}
</style>
