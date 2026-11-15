<script>
	/** @type {{ children?: import('svelte').Snippet, title?: string }} */
	let { children, title } = $props();
</script>

<abbr class="abbr" {title}>{@render children?.()}</abbr>
