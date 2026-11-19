<script>
	/** @type {{ label?: import('svelte').Snippet, children?: import('svelte').Snippet }} */
	let { label, children } = $props();
</script>

{#if label}<p class="accordion-label">{@render label()}</p>{/if}<div class="accordion">
	{@render children?.()}
</div>
