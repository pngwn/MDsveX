<script>
	let { kind = 'note', label, children } = $props();
</script>

<aside class={kind}>
	{#if label}<strong>{@render label()}</strong>{/if}
	{@render children?.()}
</aside>

<style>
	aside {
		padding: 0.5em 1em;
		border-left: 4px solid cadetblue;
		background: rgba(95, 158, 160, 0.12);
	}

	.warn {
		border-color: tomato;
		background: rgba(255, 99, 71, 0.12);
	}
</style>
