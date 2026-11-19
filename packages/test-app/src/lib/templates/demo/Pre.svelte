<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	type Module = Record<string, unknown>;

	interface Props {
		lang?: string;
		/** the module of a block marked run */
		module?: Module;
		/** imports the module of a block marked run=client */
		load?: () => Promise<Module>;
		/** the file of a block with src= */
		src?: string;
		children: Snippet;
	}

	let { lang, module, load, src, children }: Props = $props();

	let loaded = $state<Module>();
	const ran = $derived(module ?? loaded);
	// a svelte block is a component, the default export of a script block is called
	const Demo = $derived(
		lang === 'svelte' ? (ran?.default as Component | undefined) : undefined
	);
	const result = $derived(
		lang !== 'svelte' && typeof ran?.default === 'function'
			? ran.default()
			: undefined
	);
</script>

<figure class="code" data-src={src}>
	{#if Demo}
		<div class="demo"><Demo /></div>
	{:else if result !== undefined}
		<output class="demo">{String(result)}</output>
	{:else if load}
		<button class="demo" onclick={async () => (loaded = await load())}>
			run
		</button>
	{/if}
	{@render children()}
</figure>

<style>
	.code {
		margin: 1rem 0;
	}

	.demo {
		display: block;
		padding: 0.5rem 0;
	}
</style>
