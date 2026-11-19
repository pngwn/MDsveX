<script>
	let { children } = $props();
</script>

<aside class="callout">{@render children()}</aside>

<style>
	.callout {
		border-left: 4px solid currentColor;
		padding-left: 1rem;
	}
</style>
