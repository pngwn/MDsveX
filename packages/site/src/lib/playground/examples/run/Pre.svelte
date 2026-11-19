<script>
	let { lang, module, load, children } = $props();

	let loaded = $state();
	const ran = $derived(module ?? loaded);
	// a svelte block is a component, the default export of a script block is called
	const Demo = $derived(lang === 'svelte' ? ran?.default : undefined);
	const result = $derived(
		lang !== 'svelte' && typeof ran?.default === 'function'
			? ran.default()
			: undefined
	);
</script>

<div class="code">
	{#if Demo}
		<div class="demo"><Demo /></div>
	{:else if result !== undefined}
		<output class="demo">{String(result)}</output>
	{:else if load}
		<div class="demo">
			<button onclick={async () => (loaded = await load())}>run</button>
		</div>
	{/if}
	{@render children()}
</div>

<style>
	.code {
		margin: 1em 0;
		border-radius: 6px;
		background: var(--twp-background);
		overflow: hidden;
	}

	.demo {
		display: block;
		padding: 0.75em;
		border-bottom: 1px solid rgb(127 127 127 / 0.25);
	}

	.code :global(pre) {
		margin: 0;
		padding: 0.75em 0;
		overflow-x: auto;
	}
</style>
