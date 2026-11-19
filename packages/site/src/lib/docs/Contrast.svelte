<script lang="ts">
	// a fence flagged `commonmark`: one source, read by CommonMark (micromark) and
	// by mdsvex (its compile, rendered), each set as a reader sees it with the
	// html under it, all real output from the build (build/examples.js). The
	// source shows as written or as its score; with a `cue`, the score rules the
	// characters that make the difference
	import type { Snippet } from 'svelte';
	import Score from '$lib/design/score/Score.svelte';
	import { ExampleReading, use_reading } from './reading.svelte';

	interface Props {
		source: string;
		/** CommonMark's html, as the build laid it out, and highlighted */
		commonmark: string;
		commonmark_code: string;
		/** mdsvex's html, and highlighted */
		mdsvex: string;
		mdsvex_code: string;
		/** `true`: the CommonMark side is GFM's, for its autolinks */
		gfm?: string;
		/** the ranges the cue ruled, as JSON */
		cue?: string;
		/** the fence as written, highlighted */
		children?: Snippet;
	}

	let { source, commonmark, commonmark_code, mdsvex, mdsvex_code, gfm, cue, children }: Props = $props();

	const reading = new ExampleReading(use_reading());
	const ranges = $derived(cue ? (JSON.parse(cue) as [number, number][]) : []);
	const them = $derived(gfm === 'true' ? 'GFM' : 'CommonMark');
</script>

{#snippet witness(who: string, html: string, code: string)}
	<section class="reading" aria-label="As {who} reads it">
		<p class="who">{who}</p>
		<!-- the reading as a reader sees it: the real html, set as a page would set it -->
		<div class="rendered">{@html html}</div>
		<div class="html">{@html code}</div>
	</section>
{/snippet}

<figure class="contrast wide">
	<div class="source-of">
		<div class="head">
			<span class="label">You write</span>
			<span class="pick" role="group" aria-label="Show the source as">
				<button type="button" aria-pressed={!reading.on} onclick={() => reading.set(false)}>Source</button>
				<button type="button" aria-pressed={reading.on} onclick={() => reading.set(true)}>Annotated source</button>
			</span>
		</div>
		{#if reading.on}
			<Score explore source={source.endsWith('\n') ? source : `${source}\n`} cue={ranges} label="The source as mdsvex reads it" />
		{:else}
			<div class="fence">{@render children?.()}</div>
		{/if}
	</div>
	{@render witness(them, commonmark, commonmark_code)}
	{@render witness('mdsvex', mdsvex, mdsvex_code)}
</figure>

<style>
	.contrast {
		container-type: inline-size;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem 2rem;
		margin: 1.75rem 0 2rem;
		min-width: 0;
	}

	/* the source and the two readings in a row when there is room, else the readings a pair under it */
	@container (min-width: 30rem) {
		.contrast {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.source-of {
			grid-column: 1 / -1;
		}
	}

	@container (min-width: 52rem) {
		.contrast {
			grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
		}

		.source-of {
			grid-column: auto;
		}
	}

	.source-of,
	.reading {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-content: start;
		gap: 0.5rem;
		min-width: 0;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.label,
	.who {
		font: 600 0.875rem / 1.4 var(--face-text);
		color: var(--ink);
	}

	.pick {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
	}

	.pick button {
		padding: 0.375rem 0.5rem;
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

	.fence :global(pre) {
		margin: 0;
	}

	.who {
		margin: 0;
	}

	.rendered {
		min-width: 0;
		font: 400 1.0625rem / 1.45 var(--face-text);
		overflow-wrap: anywhere;
	}

	.rendered :global(:is(p, h1, h2, blockquote, pre, ul, ol, hr)) {
		margin: 0 0 0.375rem;
		max-width: none;
	}

	.rendered :global(:last-child) {
		margin-bottom: 0;
	}

	.rendered :global(:is(h1, h2)) {
		font: 500 1.375rem / 1.15 var(--face-display);
	}

	.rendered :global(h2) {
		font-size: 1.1875rem;
	}

	.rendered :global(blockquote) {
		padding-left: 0.75rem;
		border-left: 1.5px solid var(--line-quote);
		color: var(--ink);
	}

	.rendered :global(hr) {
		border: 0;
		border-top: 1px solid var(--ink);
		margin-block: 0.625rem;
	}

	.rendered :global(pre) {
		margin: 0;
		padding: 0 0 0 0.75rem;
		font-size: 0.875rem;
	}

	.rendered :global(a) {
		color: var(--name-link);
	}

	/* the html wraps in its column rather than scrolling under the next */
	.html :global(pre) {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.5;
	}

	.html :global(pre),
	.html :global(pre > code) {
		width: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
