<script>
	let { code, title, lines, children } = $props();

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="code" class:lines>
	<div class="bar">
		<span>{title ?? ''}</span>
		<button onclick={copy}>{copied ? 'copied' : 'copy'}</button>
	</div>
	{@render children()}
</div>

<style>
	.code {
		margin: 1em 0;
		border-radius: 6px;
		background: var(--twp-background);
		overflow: hidden;
	}

	.bar {
		display: flex;
		justify-content: space-between;
		padding: 0.25em 0.75em;
		font-size: 0.8em;
		opacity: 0.8;
	}

	.code :global(pre) {
		margin: 0;
		padding: 0 0 0.75em;
		overflow-x: auto;
	}

	/* the classes fence meta and code directives add */
	.code :global(.highlight) {
		background: rgb(127 127 127 / 0.25);
	}

	.code :global(.diff-add) {
		background: rgb(0 200 0 / 0.15);
	}

	.code :global(.diff-del) {
		background: rgb(200 0 0 / 0.15);
	}

	.lines :global(code) {
		counter-reset: line;
	}

	.lines :global(.l) {
		counter-increment: line;
	}

	.lines :global(.l)::before {
		content: counter(line);
		display: inline-block;
		width: 2em;
		opacity: 0.4;
	}
</style>
