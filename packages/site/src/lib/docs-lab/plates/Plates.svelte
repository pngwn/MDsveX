<script lang="ts">
	// direction one, plates: a docs page as a run of atlas plates. Each concept
	// is a sheet with its mark, its title, the pair as the hero, and its notes
	// and edges; a section is a phrase head over its plates, and the page's
	// prose shrinks to the plates' ledes and notes. Learn's differences from
	// CommonMark are small plates of their own, two to a row
	import Shell from '../Shell.svelte';
	import ReadingSwitch from '../ReadingSwitch.svelte';
	import { provide_reading } from '../reading.svelte';
	import { marks_of } from '../strip';
	import type { BuiltPage } from '../types';
	import Contrast from './Contrast.svelte';
	import Marks from './Marks.svelte';
	import Plate from './Plate.svelte';

	let { page }: { page: BuiltPage } = $props();

	// a page is one section for its life
	// svelte-ignore state_referenced_locally
	provide_reading(page.kicker === 'Learn' ? 'learn' : 'guides');

	const units = $derived(page.sections.flatMap((s) => s.units));
	const marks = $derived(marks_of(page));
</script>

<svelte:head>
	<title>{page.title} · plates · docs lab</title>
</svelte:head>

<Shell current={page.href} direction="Plates">
	<header class="page-head">
		<p class="kicker riso">{page.kicker}</p>
		<h1 class="rag">{page.title}</h1>
		<div class="lede">
			{#each page.lede as p, i (i)}{@html p}{/each}
		</div>
		<div class="tools">
			<ReadingSwitch />
		</div>
	</header>

	{#if page.slug === 'markdown'}
		<div class="strip"><Marks {marks} /></div>
	{/if}

	{#each page.sections as s (s.id)}
		<section class="section" id={s.id} aria-labelledby="{s.id}-h">
			<h2 class="phrase" id="{s.id}-h"><a href="#{s.id}">{s.title}</a></h2>
			{#if s.lede}<div class="section-lede">{@html s.lede}</div>{/if}

			{#if s.contrasts?.length}
				<div class="contrasts">
					{#each s.contrasts as c (c.id)}<Contrast contrast={c} />{/each}
				</div>
			{/if}

			{#if s.added?.length}
				<div class="added">
					{#each s.added as a (a.id)}
						<div class="add" id={a.id} style:--own-line="var(--line-{a.tone})" style:--own-name="var(--name-{a.tone})">
							<span class="add-mark" aria-hidden="true">{a.mark}</span>
							<span class="add-write">{@html a.write}</span>
							<span class="add-get">{@html a.get}</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="plates">
				{#each s.units as u (u.id)}
					<Plate unit={u} section={s.title} n={units.indexOf(u) + 1} of={units.length} />
				{/each}
			</div>
		</section>
	{/each}
</Shell>

<style>
	.page-head {
		display: grid;
		gap: 0.75rem;
		padding-bottom: 2rem;
		border-bottom: 1.5px solid var(--ink);
	}

	.kicker {
		margin: 0;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	h1 {
		margin: 0;
		font: 400 clamp(3rem, 8vw, 6.5rem) / 0.95 var(--face-display);
		letter-spacing: -0.015em;
	}

	.lede {
		display: grid;
		gap: 0.75rem;
		max-width: 46rem;
		font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
		line-height: 1.5;
	}

	.lede :global(p) {
		margin: 0;
	}

	.lede :global(p + p) {
		font-size: 0.875em;
		color: var(--quiet);
	}

	.tools {
		margin-top: 0.5rem;
	}

	.strip {
		padding: 1.75rem 0 0.5rem;
	}

	.section {
		margin-top: clamp(2.5rem, 5vw, 4rem);
		scroll-margin-top: 1.5rem;
	}

	/* a section's head is a phrase, as the atlas's index heads its families */
	.phrase {
		position: relative;
		display: inline-block;
		min-width: min(100%, 18rem);
		margin: 0 0 1.5rem;
		padding: 0 1.5rem 0.4rem 0.5rem;
		border-bottom: 1.5px solid var(--ink);
		font: italic 400 clamp(1.5rem, 3vw, 2rem) / 1.1 var(--face-display);
	}

	.phrase::before,
	.phrase::after {
		content: '';
		position: absolute;
		bottom: -0.4rem;
		height: 0.8rem;
		border-left: 1.5px solid var(--ink);
	}

	.phrase::before {
		left: 0;
	}

	.phrase::after {
		right: 0;
	}

	.phrase a {
		color: inherit;
		text-decoration: none;
	}

	.section-lede {
		max-width: 46rem;
		margin: -0.25rem 0 1.5rem;
	}

	.section-lede :global(p) {
		margin: 0;
	}

	.contrasts {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	/* "Added to CommonMark", round one's grid of marks: a hairline cell each, the
	   mark, what you write and what you get */
	.added {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
		border-top: 1px solid var(--ink);
		border-left: 1px solid var(--ink);
	}

	.add {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 1fr);
		grid-template-rows: auto auto;
		column-gap: 0.875rem;
		padding: 0.875rem 1rem;
		border-right: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		scroll-margin-top: 1.5rem;
	}

	.add-mark {
		grid-row: 1 / 3;
		align-self: center;
		font: 400 1.375rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		border-bottom: 0.25rem solid var(--own-line);
		padding-bottom: 0.4rem;
		justify-self: start;
		white-space: nowrap;
	}

	.add-write {
		font-size: 0.9375rem;
	}

	.add-get {
		font: italic 400 0.9375rem / 1.4 var(--face-text);
		color: var(--quiet);
	}

	.plates {
		display: grid;
		gap: clamp(1.25rem, 2.5vw, 2rem);
	}
</style>
