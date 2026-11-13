<script lang="ts">
	// an example in the docs, made at build time from a flagged fence
	// (build/examples.js): you write, as written or as its score, beside you get,
	// what mdsvex compiles it to. The score and the output share one focus, so
	// pointing at either washes both, as on the atlas (its Output.svelte).
	//
	// The page's "Show the reading" picks source or score for every example on
	// it; an example's own toggle overrides that until the page's switch is next
	// flipped. A fence flagged `score` opens on its score whatever the page says
	import type { Snippet } from 'svelte';
	import Output from '$lib/design/atlas/Output.svelte';
	import Score, { type Focus } from '$lib/design/score/Score.svelte';
	import { ExampleReading, use_reading } from './reading.svelte';

	interface Props {
		/** the svx as written */
		source: string;
		/** the file it stands for, said over it */
		file?: string;
		/** `open`: it opens on its score */
		score?: string;
		/** what mdsvex compiles it to, and the compile's mappings as JSON, for `result` */
		code?: string;
		segments?: string;
		/** the compile's error, for `error` */
		error?: string;
		/** the fence as written, highlighted */
		children?: Snippet;
	}

	let { source, file, score, code, segments, error, children }: Props = $props();

	// svelte-ignore state_referenced_locally
	const reading = new ExampleReading(use_reading(), score === 'open');
	let focus = $state<Focus | null>(null);

	const read = $derived(source.endsWith('\n') ? source : `${source}\n`);
	const paired = $derived(code !== undefined || error !== undefined);
	const compiled = $derived({ code: code ?? '', segments: segments ? JSON.parse(segments) : [], with: [] as string[] });
	const name = $derived(file ? `the example ${file}` : 'the example');
</script>

<figure class="pair wide" class:paired class:scored={reading.on}>
	<div class="write">
		<div class="head riso">
			{#if paired}<span class="label">You write</span>{/if}
			{#if file}<span class="file">{file}</span>{/if}
			<span class="pick" role="group" aria-label="Show {name} as">
				<button type="button" aria-pressed={!reading.on} onclick={() => reading.set(false)}>source</button>
				<button type="button" aria-pressed={reading.on} onclick={() => reading.set(true)}>score</button>
			</span>
		</div>
		{#if reading.on}
			<div class="score">
				<Score source={read} bind:focus label="{name}, as the parser reads it" />
			</div>
		{:else}
			<div class="source">{@render children?.()}</div>
		{/if}
	</div>

	{#if paired}
		<div class="get">
			<div class="head riso"><span class="label">{error ? 'Its compile throws' : 'You get'}</span></div>
			{#if error}
				<p class="error riso"><span>Error</span> {error}</p>
			{:else}
				<Output source={read} {compiled} bind:focus {name} />
			{/if}
		</div>
	{/if}
</figure>

<style>
	.pair {
		container-type: inline-size;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem 2rem;
		margin: 1.75rem 0 2rem;
		min-width: 0;
	}

	.write,
	.get {
		min-width: 0;
	}

	/* side by side when there is room; you write, where a score wraps, gets more of it */
	@container (min-width: 40rem) {
		.paired {
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			column-gap: clamp(2rem, 3cqi, 3.5rem);
		}
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		padding-bottom: 0.5rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--quiet);
	}

	.label {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.file {
		color: var(--ink);
	}

	.pick {
		display: flex;
		gap: 0.75rem;
		margin-left: auto;
	}

	/* a score alone is a reading of the source over it: the pick sits with what it changes */
	.pair:not(.paired) .pick {
		margin-left: 0;
	}

	.pick button {
		padding: 0;
		border: 0;
		font: inherit;
		color: var(--quiet);
		background: none;
		cursor: pointer;
	}

	.pick button:hover {
		color: var(--ink);
	}

	.pick button[aria-pressed='true'] {
		color: var(--ink);
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	.source :global(pre) {
		margin: 0;
	}

	.score {
		padding-top: 0.5rem;
	}

	/* the atlas's output has its own caption; the pair's label says it */
	.get :global(figcaption) {
		display: none;
	}

	/* code.css sets a block's code to max-content, so a one-line compile would
	   scroll: here it wraps in its box */
	.get :global(pre),
	.get :global(pre > code) {
		width: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.error {
		margin: 0;
		padding: 0.875rem 1rem;
		border: 1px solid var(--line-item);
		font: 400 0.8125rem / 1.6 var(--face-mono);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}

	.error span {
		color: var(--name-item);
	}
</style>
