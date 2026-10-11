<script>
	let { code, children } = $props();

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<figure class="equation">
	{@render children()}
	<button onclick={copy}>{copied ? 'copied' : 'copy LaTeX'}</button>
</figure>

<style>
	.equation {
		position: relative;
		margin: 1em 0;
		padding: 1em 0;
	}

	.equation :global(.math-display) {
		overflow-x: auto;
		font-size: 1.2em;
	}

	button {
		position: absolute;
		top: 0;
		right: 0;
		font-size: 0.75em;
		opacity: 0;
	}

	.equation:hover button,
	button:focus {
		opacity: 0.8;
	}
</style>
