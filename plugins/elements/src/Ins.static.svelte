<script>
	/** @type {{ children?: import('svelte').Snippet, datetime?: string, cite?: string }} */
	let { children, datetime, cite } = $props();
</script>

<ins class="ins" {datetime} {cite}>{@render children?.()}</ins>
