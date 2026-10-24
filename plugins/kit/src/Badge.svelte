<script>
	/** @type {{ children?: import('svelte').Snippet, tone?: string }} */
	let { children, tone } = $props();
</script>

<span class="badge" data-tone={tone}>{@render children?.()}</span>
