<script>
	let { children } = $props();
</script>

<div class="warning">
	{@render children?.()}
</div>

<style>
	.warning {
		padding: 0.5em 1em;
		border-left: 4px solid orange;
		background: rgba(255, 165, 0, 0.12);
	}
</style>
