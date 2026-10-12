<script>
	let { children, note } = $props();

	// a note holds blocks, which html allows in no paragraph, so it is drawn on hover and never on the server
	let open = $state(false);
</script>

<span
	class="footnote"
	role="group"
	onpointerenter={() => (open = true)}
	onpointerleave={() => (open = false)}
	onfocusin={() => (open = true)}
	onfocusout={() => (open = false)}
>
	{@render children()}{#if open}<span class="card">{@render note?.()}</span>{/if}
</span>

<style>
	.footnote {
		position: relative;
	}

	.card {
		display: block;
		position: absolute;
		top: 1.5em;
		left: 0;
		z-index: 1;
		width: 18em;
		padding: 0 0.75em;
		border: 1px solid currentColor;
		border-radius: 4px;
		background: Canvas;
		font-size: 0.85em;
	}
</style>
