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
	import Strip from '$lib/design/atlas/Strip.svelte';

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

<!-- v7's first screen: the title notated over the line it sets, in the four
     voices on its staves, and at its foot the strip of every mark beside the lede -->
<header class="hero">
	<div class="title">
		<div class="title-score">
			<Score source={title} palette="voice" staves text bars riso label="The construct atlas, as a heading with emphasis" />
		</div>
		<h1 class="rag">The <em>construct</em> atlas</h1>
		<p class="sub">Penguin-Flavoured Markdown, one construct at a time.</p>
	</div>
	<div class="foot">
		<Strip />
		<div class="lede">
			<p>
				Every mdsvex document is built from these {constructs.length} constructs, in {FAMILIES.length} families. Each plate takes a
				real source and shows what the parser reads in it and what mdsvex makes of it, with the edges where the syntax stops
				holding and where it parts from CommonMark.
			</p>
			<a href="#reading">Open the atlas</a>
		</div>
	</div>
</header>

<section class="intro" id="reading" aria-label="How to read the atlas">
	<p class="key-lead">
		<strong>Reading a score.</strong> Each line over the source is one node, from its first character to its last, with a bar where it
		opens and one where it closes, and its name in the corner. Each row of lines sits on a stave. Quiet unnamed lines are text. Each
		construct has its own colour.
	</p>
	<div class="key">
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

<footer class="colophon">
	<p>
		Every score on this page is <code>@mdsvex/parse</code> reading its source, and every output is mdsvex’s
		<code>compile</code>, run when the site is built. Nothing is drawn by hand.
	</p>
	<p>Set in Playfair, Source Serif 4 and Berkeley Mono, with IBM Plex Mono where Berkeley is not installed.</p>
</footer>

<style>
	/* v7's hero: the title notated over its own typeset line */
	/* v7's first screen: the title in the middle of it, the strip and the lede at its foot */
	.hero {
		display: grid;
		grid-template-rows: 1fr auto;
		gap: clamp(2rem, 5vh, 3.5rem);
		min-height: calc(100svh - 4.5rem);
		padding-bottom: clamp(1.5rem, 4vh, 3rem);
	}

	.title {
		align-self: center;
		display: grid;
		justify-items: center;
		padding-top: clamp(2rem, 6vh, 4rem);
		text-align: center;
		min-width: 0;
	}

	/* v7's title score: as large as the viewport holds its 24 cells, up to 2rem,
	   tracked a little tighter as it gets smaller, on staves 1.35rem apart */
	.title-score {
		--size: clamp(0.95rem, calc((100vw - 2.5rem) / 24), 2rem);
		--track: clamp(0.2em, calc(var(--size) * 0.5 - 0.3rem), 0.5em);
		--row: 1.35rem;
		--name-size: 0.875rem;
		/* as wide as the title's cells and their margin, so it sits centred */
		font: 400 var(--size) / 1 var(--face-mono);
		width: min(100%, calc(26 * (1ch + var(--track))));
		text-align: left;
	}

	h1 {
		margin: clamp(1rem, 3vh, 2rem) 0 0;
		font: 400 clamp(3rem, 11vw, 9.5rem) / 0.95 var(--face-display);
		letter-spacing: -0.015em;
	}

	/* the emphasis in the score's inline voice, as the phrase over it */
	h1 em {
		color: var(--voice-rose);
	}

	.sub {
		margin: 1.25rem 0 0;
		font: italic 400 clamp(1.125rem, 2.2vw, 1.5rem) / 1.3 var(--face-text);
		color: var(--quiet);
	}

	.foot {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 1rem 3rem;
		align-items: end;
		padding-top: 1rem;
		border-top: 1px solid var(--ink);
	}

	@media (max-width: 48rem) {
		.foot {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.lede p {
		max-width: 46ch;
		margin: 0 0 0.75rem;
		font-size: clamp(1.0625rem, 1.3vw, 1.1875rem);
		line-height: 1.5;
	}

	.lede a {
		font-weight: 600;
		color: var(--ink);
		text-decoration-thickness: 1px;
		text-underline-offset: 0.2em;
	}

	.intro {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr));
		gap: 0.75rem 4rem;
		align-items: start;
		padding: 2rem 0 clamp(2rem, 5vw, 3.5rem);
		border-top: 1.5px solid var(--ink);
		scroll-margin-top: 1rem;
	}

	.key-lead {
		max-width: 52ch;
		margin: 0;
		font-size: 0.9375rem;
	}

	.key-lead strong {
		font-weight: 600;
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
