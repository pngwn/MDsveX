<script lang="ts">
	// the construct atlas, a specimen book of every construct PFM has: 02's round
	// one atlas laid out as a page of plates, re-dressed in the score as its v7
	// was. Each plate is the real parser's reading of a source and mdsvex's real
	// compile of it (+page.server.ts). The PFM Reference links here by anchor,
	// /atlas#<construct>, listed in design/atlas-anchors.md.
	//
	// ?palette=cvd sets the colours; ?theme, read by the root layout, the theme
	import { onMount } from 'svelte';
	import Score from '$lib/design/score/Score.svelte';
	import { by_id, constructs, FAMILIES } from '$lib/design/atlas/constructs';
	import Entry from '$lib/design/atlas/Entry.svelte';
	import Index from '$lib/design/atlas/Index.svelte';

	let { data } = $props();

	const title = '# The _construct_ atlas';

	let palette = $state<'riso' | 'cvd'>('riso');
	let current = $state(constructs[0].id);

	function set_palette(next: 'riso' | 'cvd') {
		palette = next;
		const url = new URL(location.href);
		if (next === 'cvd') url.searchParams.set('palette', 'cvd');
		else url.searchParams.delete('palette');
		history.replaceState(history.state, '', url);
	}

	onMount(() => {
		const params = new URL(location.href).searchParams;
		if (params.get('palette') === 'cvd') palette = 'cvd';

		const id = location.hash.slice(1);
		if (by_id.has(id)) current = id;

		// the plate crossing a band a little above the middle of the screen is the one being read
		const watch = new IntersectionObserver(
			(seen) => {
				for (const entry of seen) if (entry.isIntersecting) current = entry.target.id;
			},
			{ rootMargin: '-35% 0px -60% 0px' },
		);
		for (const plate of document.querySelectorAll('.plates > article')) watch.observe(plate);
		return () => watch.disconnect();
	});
</script>

<svelte:head>
	<title>The construct atlas, mdsvex</title>
	<meta name="description" content="Every construct of Penguin-Flavoured Markdown, as the parser reads it and as mdsvex compiles it." />
</svelte:head>

<header class="hero">
	<div class="title-score">
		<Score source={title} {palette} label="The construct atlas, as a heading with emphasis" />
	</div>
	<h1 class="rag">The <em>construct</em> atlas</h1>
	<p class="sub">Penguin-Flavoured Markdown, one construct at a time.</p>
</header>

<section class="intro" aria-label="How to read the atlas">
	<p class="lede">
		Every mdsvex document is built from these {constructs.length} constructs, in {FAMILIES.length} families. Each plate takes a
		real source and shows what the parser reads in it and what mdsvex makes of it, with the edges where the syntax stops holding and
		where it parts from CommonMark.
	</p>
	<div class="key">
		<p>
			<strong>Reading a score.</strong> Each line over the source is one node, from its first character to its last, with a bar where
			it opens and one where it closes, and its name in the corner. Quiet unnamed lines are text. Each construct has its own colour.
		</p>
		<p>Point at a phrase, or at the output, to light the two together.</p>
		<div class="pick" role="group" aria-label="Colours">
			<button type="button" aria-pressed={palette === 'riso'} onclick={() => set_palette('riso')}>Riso inks</button>
			<button type="button" aria-pressed={palette === 'cvd'} onclick={() => set_palette('cvd')}>Colour blind safe</button>
		</div>
	</div>
</section>

<div class="atlas" data-palette={palette}>
	<div class="index-col">
		<Index {current} />
	</div>
	<div class="plates">
		{#each data.entries as entry, i (entry.id)}
			<Entry
				construct={by_id.get(entry.id)!}
				compiled={entry.compiled}
				notes={entry.notes}
				{palette}
				perch={i === data.entries.length - 1}
			/>
		{/each}
	</div>
</div>

<footer class="colophon riso">
	<p>
		Every score on this page is <code>@mdsvex/parse</code> reading its source, and every output is mdsvex’s
		<code>compile</code>, run when the site is built. Nothing is drawn by hand.
	</p>
	<p>Set in Playfair, Source Serif 4 and Berkeley Mono, with IBM Plex Mono where Berkeley is not installed.</p>
</footer>

<style>
	/* v7's hero: the title notated over its own typeset line */
	.hero {
		display: grid;
		justify-items: center;
		padding: clamp(3rem, 9vw, 7rem) 0 clamp(2.5rem, 6vw, 4.5rem);
		text-align: center;
	}

	.title-score {
		--size: clamp(1.0625rem, 2.4vw, 1.75rem);
		--track: 0.42em;
		--row: 1.6rem;
		--name-size: 1rem;
		/* as wide as the title's cells and their margin, so it sits centred */
		font: 400 var(--size) / 1 var(--face-mono);
		width: min(100%, calc(26 * (1ch + var(--track))));
		text-align: left;
	}

	@media (max-width: 600px) {
		.title-score {
			--size: 0.9375rem;
			--track: 0.2em;
			--name-size: 0.8125rem;
			--row: 1.25rem;
		}
	}

	h1 {
		margin: clamp(1rem, 3vw, 2rem) 0 0;
		font: 400 clamp(3rem, 11vw, 9.5rem) / 0.95 var(--face-display);
		letter-spacing: -0.015em;
	}

	h1 em {
		color: var(--name-emph);
	}

	.sub {
		margin: 1.25rem 0 0;
		font: italic 400 clamp(1.125rem, 2.2vw, 1.5rem) / 1.3 var(--face-text);
		color: var(--quiet);
	}

	.intro {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		gap: 1.5rem 4rem;
		padding: 2rem 0 clamp(2rem, 5vw, 3.5rem);
		border-top: 1.5px solid var(--ink);
	}

	.lede {
		max-width: 40ch;
		margin: 0;
		font-size: clamp(1.125rem, 1.8vw, 1.3125rem);
		line-height: 1.5;
	}

	.key {
		max-width: 52ch;
		font-size: 0.9375rem;
	}

	.key p {
		margin: 0 0 0.75rem;
	}

	.key strong {
		font-weight: 600;
	}

	.pick {
		display: inline-flex;
		margin-top: 0.5rem;
		border: 1px solid var(--ink);
		font: 400 0.75rem / 1 var(--face-mono);
	}

	.pick button {
		font: inherit;
		color: var(--ink);
		background: none;
		border: 0;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
	}

	.pick button + button {
		border-left: 1px solid var(--ink);
	}

	.pick button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--paper);
	}

	.pick button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	/* round one's atlas: the plates, with the grid of marks pinned beside them */
	.atlas {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(17rem, 23rem);
		gap: clamp(1.25rem, 3vw, 2.5rem);
		align-items: start;
	}

	.index-col {
		order: 2;
		position: sticky;
		top: 1.5rem;
		max-height: calc(100svh - 3rem);
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.plates {
		order: 1;
		min-width: 0;
		display: grid;
		gap: clamp(1.5rem, 3vw, 2.5rem);
	}

	/* a phone: the grid is one row pinned over the plates */
	@media (max-width: 60rem) {
		.atlas {
			grid-template-columns: minmax(0, 1fr);
		}

		.index-col {
			order: 0;
			top: 0;
			z-index: 3;
			max-height: none;
			overflow: visible;
			margin: 0 calc(var(--gutter) * -1);
			padding: 0.75rem var(--gutter) 0.25rem;
			background: var(--paper);
			border-bottom: 1px solid var(--staff);
		}

		.plates :global(.plate) {
			scroll-margin-top: 7rem;
		}
	}

	.colophon {
		margin-top: clamp(4rem, 9vw, 7rem);
		color: var(--quiet);
		font: 400 0.8125rem / 1.5 var(--face-mono);
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: 0.5rem 3rem;
	}

	.colophon p {
		margin: 0;
		max-width: 60ch;
	}

	.colophon code {
		color: var(--ink);
		font: inherit;
		background: none;
		padding: 0;
	}
</style>
