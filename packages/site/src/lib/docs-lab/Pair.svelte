<script lang="ts">
	// you write, you get: an example as written, or as its score, beside what
	// mdsvex compiles it to. The score and the output share one focus, so
	// pointing at either washes both, as on the atlas (its Output.svelte). The
	// page's reading switch picks source or score; the pair's own toggle
	// overrides it until the page's switch is next flipped
	import Output from '$lib/design/atlas/Output.svelte';
	import Perch from '$lib/design/penguin/Perch.svelte';
	import Score, { type Focus } from '$lib/design/score/Score.svelte';
	import { ExampleReading, use_reading } from './reading.svelte';
	import type { BuiltExample } from './types';

	interface Props {
		example: BuiltExample;
		/** side by side when there is room, or always one over the other */
		layout?: 'side' | 'stack';
		palette?: 'riso' | 'cvd';
		/** the labels over each half */
		write?: string;
		get?: string;
		/** the page's last score, where the line bird perches */
		perch?: boolean;
		name?: string;
	}

	let {
		example,
		layout = 'side',
		palette = 'riso',
		write = 'You write',
		get = 'You get',
		perch = false,
		name = 'the example',
	}: Props = $props();

	// an example flagged `score` opens on its score, as the docs' ```svx score does
	// svelte-ignore state_referenced_locally
	const reading = new ExampleReading(use_reading(), example.scored);
	let focus = $state<Focus | null>(null);

	const source = $derived(example.source.endsWith('\n') ? example.source : `${example.source}\n`);
	const compiled = $derived({ code: example.code, segments: example.segments, with: [] as string[] });
</script>

{#snippet score()}
	<Score {source} {palette} bind:focus label="{name}, as the parser reads it" />
{/snippet}

<figure class="pair {layout}" class:scored={reading.on}>
	<div class="write">
		<div class="head riso">
			<span class="label">{write}</span>
			{#if example.file}<span class="file">{example.file}</span>{/if}
			<span class="pick" role="group" aria-label="Show {name} as">
				<button type="button" aria-pressed={!reading.on} onclick={() => reading.set(false)}>source</button>
				<button type="button" aria-pressed={reading.on} onclick={() => reading.set(true)}>score</button>
			</span>
		</div>
		{#if reading.on}
			<div class="score">
				{#if perch}<Perch>{@render score()}</Perch>{:else}{@render score()}{/if}
			</div>
		{:else}
			<div class="source">{@html example.source_html}</div>
		{/if}
	</div>

	<div class="get wrap">
		{#if example.error}
			<div class="head riso"><span class="label">{get}</span></div>
			<p class="error riso"><span class="kind">Error</span> {example.error}</p>
		{:else}
			<div class="head riso"><span class="label">{get}</span></div>
			<Output {source} {compiled} bind:focus {name} />
		{/if}
	</div>
</figure>

<style>
	.pair {
		container-type: inline-size;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem 2rem;
		margin: 0;
		min-width: 0;
	}

	.write,
	.get {
		min-width: 0;
	}

	.side {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
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

	/* Output's own caption is the atlas's; the pair's label says it */
	.get :global(figcaption) {
		display: none;
	}

	.error {
		margin: 0;
		padding: 0.875rem 1rem;
		border: 1px solid var(--line-item);
		font: 400 0.8125rem / 1.6 var(--face-mono);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}

	.kind {
		color: var(--name-item);
	}
</style>
