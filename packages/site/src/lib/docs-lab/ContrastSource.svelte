<script lang="ts">
	// a contrast's source, as written or as its score with the characters that
	// make the difference ruled under, by the page's reading switch and its own
	// toggle. The score is mdsvex's reading: CommonMark's is the output beside it
	import Score from '$lib/design/score/Score.svelte';
	import { ExampleReading, use_reading } from './reading.svelte';
	import type { BuiltContrast } from './types';

	interface Props {
		contrast: BuiltContrast;
		palette?: 'riso' | 'cvd';
		/** draw the source as plain large type rather than a highlighted fence */
		plain?: boolean;
	}

	let { contrast: c, palette = 'riso', plain = false }: Props = $props();

	const reading = new ExampleReading(use_reading());
</script>

<div class="source-of" class:scored={reading.on}>
	<span class="pick riso" role="group" aria-label="Show the source as">
		<button type="button" aria-pressed={!reading.on} onclick={() => reading.set(false)}>source</button>
		<button type="button" aria-pressed={reading.on} onclick={() => reading.set(true)}>score</button>
	</span>
	{#if reading.on}
		<Score source={`${c.source}\n`} {palette} cue={c.ranges} label="The source as mdsvex reads it" />
	{:else if plain}
		<pre class="plain"><code>{c.source}</code></pre>
	{:else}
		<div class="fence">{@html c.source_html}</div>
	{/if}
</div>

<style>
	.source-of {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.5rem;
		min-width: 0;
	}

	.pick {
		display: flex;
		gap: 0.75rem;
		justify-self: end;
		font: 400 0.75rem / 1.4 var(--face-mono);
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

	.fence :global(pre),
	.plain {
		margin: 0;
	}

	.plain {
		padding: 0;
		border: 0;
		font-size: 1.125rem;
		line-height: 1.5;
		white-space: pre-wrap;
	}
</style>
