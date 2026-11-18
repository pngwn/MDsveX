<script lang="ts">
	// one construct's plate, 02's v7 plate: its mark set big beside its name over
	// a hairline, the parser's reading of a real source on its staves and what
	// mdsvex compiles it to under it, then the notes. The score and the output
	// share one focus, so pointing at either washes both
	import Perch from '../penguin/Perch.svelte';
	import Score, { type Focus } from '../score/Score.svelte';
	import { tone } from '../score/kinds';
	import { by_id, FAMILIES, parts_of, type Construct } from './constructs';
	import Output from './Output.svelte';
	import type { Compiled, Notes } from './types';

	interface Props {
		construct: Construct;
		compiled: Compiled;
		notes: Notes;
		palette: 'riso' | 'cvd';
		/** the page's last score, where the line bird perches */
		perch?: boolean;
	}

	let { construct: c, compiled, notes, palette, perch = false }: Props = $props();

	let focus = $state<Focus | null>(null);

	const own = $derived(tone(c.kinds[0]));
	const parts = $derived(parts_of(c));
	const family = $derived(FAMILIES.find((f) => f.id === c.family)!);
	const related = $derived((c.related ?? []).map((id) => by_id.get(id)!).filter(Boolean));
	// the score is set as large as the plate holds its longest line, as v7 set its specimen
	const cols = $derived(Math.max(8, ...c.source.split('\n').map((line) => line.length + 1)));
</script>

{#snippet score()}
	<Score explore {compiled} source={c.source} {palette} staves riso {parts} bind:focus label="{c.name}, as the parser reads it" />
{/snippet}

<article class="plate" id={c.id} style:--own-line="var(--line-{own})" style:--own-name="var(--name-{own})" aria-labelledby="{c.id}-name">
	<header class="head">
		<span class="glyph" aria-hidden="true">{c.glyph}</span>
		<div class="title">
			<p class="kicker"><em class="family" data-family={c.family}>{family.name.toLowerCase()}</em></p>
			<h2 id="{c.id}-name"><a href="#{c.id}">{c.name}</a></h2>
			<p class="what">{@html notes.what}</p>
		</div>
	</header>

	<div class="figure">
		<div class="reading" style:--cols={cols}>
			<p class="label">As the parser reads it</p>
			{#if perch}
				<Perch>{@render score()}</Perch>
			{:else}
				{@render score()}
			{/if}
		</div>
		<Output source={c.source} {compiled} bind:focus name={c.name} />
	</div>

	<div class="notes">
		<section aria-label="Edges">
			<h3>Edges</h3>
			<ul>
				{#each notes.edges as edge, i (i)}
					<li>{@html edge}</li>
				{/each}
			</ul>
		</section>
		<section aria-label="Against CommonMark">
			<h3>Against CommonMark</h3>
			<p>{@html notes.commonmark}</p>
			{#if related.length}
				<p class="related">
					<span class="label">See also</span>
					{#each related as r (r.id)}
						<a href="#{r.id}"><span class="r-glyph" style:color="var(--name-{tone(r.kinds[0])})" aria-hidden="true">{r.glyph}</span> {r.name}</a>
					{/each}
				</p>
			{/if}
		</section>
	</div>
</article>

<style>
	/* round one's sheet: one hairline box, its parts parted by hairlines */
	.plate {
		container-type: inline-size;
		border: 1px solid var(--ink);
		background: var(--paper);
		scroll-margin-top: 1.5rem;
	}

	/* v7's head: the mark in its colour beside the name, on the name's baseline,
	   the kicker over the name and the lede under it. Every mark is set at one
	   size in a column four characters wide, so the names line up plate to plate
	   and a short mark leaves its room at the right, not over the name */
	.head {
		--head-size: clamp(2.5rem, 5.5vw, 4.5rem);
		display: grid;
		grid-template-columns: calc(var(--head-size) * 2.2) minmax(0, 1fr);
		grid-template-rows: auto auto auto;
		align-items: baseline;
		column-gap: clamp(1rem, 3vw, 2.5rem);
		padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3cqi, 2.25rem);
		border-bottom: 1px solid var(--ink);
	}

	.title {
		display: contents;
	}

	.glyph {
		grid-column: 1;
		grid-row: 2;
		font: 400 var(--head-size) / 0.95 var(--face-mono);
		font-variant-ligatures: none;
		letter-spacing: -0.06em;
		color: var(--own-name);
		white-space: nowrap;
	}

	.kicker,
	h2,
	.what {
		grid-column: 2;
	}

	.kicker {
		grid-row: 1;
		margin: 0 0 0.5rem;
	}

	h2 {
		grid-row: 2;
	}

	.what {
		grid-row: 3;
	}

	.family {
		font: italic 400 0.9375rem / 1 var(--face-display);
	}

	.family[data-family='block'] {
		color: var(--voice-blue);
	}
	.family[data-family='inline'] {
		color: var(--voice-rose);
	}
	.family[data-family='svelte'] {
		color: var(--voice-orange);
	}
	.family[data-family='directive'] {
		color: var(--voice-green);
	}
	.family[data-family='document'] {
		color: var(--ink);
	}

	h2 {
		margin: 0;
		font: 500 var(--head-size) / 0.95 var(--face-display);
		letter-spacing: -0.01em;
	}

	h2 a {
		color: inherit;
		text-decoration: none;
	}

	h2 a:hover {
		text-decoration: underline 1.5px;
		text-decoration-color: var(--own-line);
		text-underline-offset: 0.12em;
	}

	.what {
		max-width: 52ch;
		margin: 0.75rem 0 0;
		font-size: 1.125rem;
	}

	/* the score takes the plate's width, its output under it, as in v7 */
	.figure {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.75rem;
		padding: 1.75rem clamp(1rem, 3cqi, 2.25rem) 2rem;
		border-bottom: 1px solid var(--ink);
	}

	/* v7's specimen: the underlay as large as the longest line allows, up to 2.25rem,
	   tracked a little tighter as it gets smaller. The score's bracket margin and its
	   spare cell come off the width first. Its floor is 0.8125rem, not v7's 0.7rem:
	   a line too long for the plate wraps to the next system here rather than
	   scrolling, so a smaller floor would only shrink it */
	.reading {
		container-type: inline-size;
		min-width: 0;
		--size: clamp(0.8125rem, calc((100cqi - 2.5rem) / (var(--cols) + 2)), 2.25rem);
		--track: clamp(0.2em, calc(var(--size) * 0.5 - 0.3rem), 0.5em);
	}

	.label {
		margin: 0 0 0.75rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.02em;
		color: var(--quiet);
	}

	.notes {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}

	@container (min-width: 40rem) {
		.notes {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.notes section + section {
			border-left: 1px solid var(--ink);
		}
	}

	.notes section {
		padding: 1.25rem clamp(1rem, 3cqi, 2.25rem) 1.5rem;
		min-width: 0;
	}

	@container (max-width: 40rem) {
		.notes section + section {
			border-top: 1px solid var(--staff);
		}
	}

	h3 {
		margin: 0 0 0.5rem;
		font: italic 400 1rem / 1.2 var(--face-display);
	}

	.notes :is(ul, p:not(.related)) {
		font-size: 1.125rem;
	}

	.notes ul {
		margin: 0;
		padding-left: 1.1em;
		display: grid;
		gap: 0.375rem;
	}

	.notes li::marker {
		color: var(--own-line);
	}

	.notes p {
		margin: 0;
	}

	.notes :global(code),
	.what :global(code) {
		font: 400 0.875em / 1 var(--face-mono);
		font-variant-ligatures: none;
		background: none;
		padding: 0;
		color: var(--own-name);
		overflow-wrap: anywhere;
	}

	.related {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 1rem;
		margin-top: 1rem !important;
		font: 400 0.8125rem / 1.4 var(--face-mono);
	}

	.related .label {
		margin: 0;
		font-size: 0.75rem;
	}

	.related a {
		color: var(--ink);
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.2em;
	}

	.related a:hover {
		text-decoration-color: var(--ink);
	}

	/* v7 on a phone: the head is one row, the mark and the name, the line under both */
	@container (max-width: 36rem) {
		.head {
			--head-size: 2.25rem;
			gap: 0.25rem 1rem;
			padding: 1rem;
		}

		.kicker {
			display: none;
		}

		.what {
			grid-column: 1 / -1;
			margin-top: 0.25rem;
			font-size: 1.0625rem;
		}

		.figure {
			padding: 1.25rem 0.75rem 1.5rem;
		}

		.notes :is(ul, p:not(.related)) {
			font-size: 1.0625rem;
		}
	}
</style>
