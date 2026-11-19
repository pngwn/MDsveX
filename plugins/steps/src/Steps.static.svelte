<script>
	// safari drops the list role of a list without markers, which the stylesheet removes
	/** @type {{ label?: import('svelte').Snippet, children?: import('svelte').Snippet }} */
	let { label, children } = $props();
</script>

{#if label}<p class="steps-label">{@render label()}</p>{/if}<ol class="steps" role="list">{@render children?.()}</ol>
