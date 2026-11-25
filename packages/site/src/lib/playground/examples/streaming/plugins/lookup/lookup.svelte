<script>
	// the label of the directive is the children, its args are the props
	let { definition, children } = $props();
</script>

<strong>{@render children?.()}</strong>
<small class:pending={definition === undefined}>
	{definition === undefined ? 'looking up…' : `(${definition})`}
</small>

<style>
	small {
		color: var(--quiet);
	}

	.pending {
		font-style: italic;
	}
</style>
