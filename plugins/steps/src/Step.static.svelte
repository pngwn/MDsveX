<script>
	/** @type {{ label?: import('svelte').Snippet, children?: import('svelte').Snippet }} */
	let { label, children } = $props();
</script>

<li class="step">
	<div class="step-title">{@render label?.()}</div>
	<div class="step-body">{@render children?.()}</div>
</li>
