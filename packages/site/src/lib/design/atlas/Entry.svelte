<script lang="ts">
	// one construct's plate, 02's round one plate in the score (v7): the mark and
	// the name over a hairline, the parser's reading of a real source beside what
	// mdsvex compiles it to, then the notes. The score and the output share one
	// focus, so pointing at either washes both
	import Perch from '../penguin/Perch.svelte';
	import Score, { type Focus } from '../score/Score.svelte';
	import { tone } from '../score/kinds';
	import { by_id, FAMILIES, type Construct } from './constructs';
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
	const family = $derived(FAMILIES.find((f) => f.id === c.family)!);
	const related = $derived((c.related ?? []).map((id) => by_id.get(id)!).filter(Boolean));
	// a source whose longest line would wrap beside the output takes the plate's width, its output under it
	const long = $derived(Math.max(...c.source.split('\n').map((line) => line.length)) > 24);
</script>

{#snippet score()}
	<Score source={c.source} {palette} bind:focus label="{c.name}, as the parser reads it" />
{/snippet}

<article class="plate" id={c.id} style:--own-line="var(--line-{own})" style:--own-name="var(--name-{own})" aria-labelledby="{c.id}-name">
	<header class="head">
		<div class="mark" aria-hidden="true">
			<span class="glyph">{c.glyph}</span>
		</div>
		<div class="title">
			<p class="kicker">
				<em class="family" data-family={c.family}>{family.name.toLowerCase()}</em>
				<span class="kinds">{c.kinds.join(' · ')}</span>
			</p>
			<h2 id="{c.id}-name"><a href="#{c.id}">{c.name}</a></h2>
			<p class="what">{@html notes.what}</p>
		</div>
	</header>

	<div class="figure" class:long>
		<div class="reading">
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

	.head {
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr);
		border-bottom: 1px solid var(--ink);
	}

	/* the mark, as its cell in round one's grid, with a short bar of its colour
	   under it where round one's header kept its swatch */
	.mark {
		position: relative;
		display: grid;
		place-items: center;
		border-right: 1px solid var(--ink);
		padding: 1.5rem 0.5rem 2rem;
	}

	.mark::after {
		content: '';
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		height: 0.375rem;
		background: var(--own-line);
	}

	.glyph {
		font: 400 2rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		white-space: nowrap;
	}

	.title {
		padding: 1.5rem clamp(1rem, 3cqi, 2.25rem) 1.5rem;
		min-width: 0;
	}

	.kicker {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		margin: 0 0 0.25rem;
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

	.kinds {
		font: 400 0.75rem / 1.3 var(--face-mono);
		color: var(--quiet);
		overflow-wrap: anywhere;
	}

	h2 {
		margin: 0;
		font: 400 clamp(2.25rem, 7cqi, 3.75rem) / 1.02 var(--face-display);
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
		margin: 0.625rem 0 0;
	}

	/* the score and its output side by side when the plate is wide, else one over the other */
	.figure {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.75rem;
		padding: 1.75rem clamp(1rem, 3cqi, 2.25rem) 2rem;
		border-bottom: 1px solid var(--ink);
	}

	@container (min-width: 46rem) {
		.figure:not(.long) {
			grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
			gap: 2.25rem;
		}
	}

	.reading {
		min-width: 0;
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

	@container (max-width: 30rem) {
		.head {
			grid-template-columns: 4.5rem minmax(0, 1fr);
		}

		.glyph {
			font-size: 1.375rem;
		}

		.mark {
			padding: 1rem 0.25rem 1.75rem;
		}

		.mark::after {
			left: 0.75rem;
			right: 0.75rem;
			bottom: 0.875rem;
		}
	}
</style>
