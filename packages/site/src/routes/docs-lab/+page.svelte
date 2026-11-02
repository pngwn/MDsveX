<script lang="ts">
	// the docs lab: three directions for the docs, each drawn over the same two
	// pages, Learn's markdown tour and the templates guide, with their real
	// prose and real output. design/docs/LAB.md says what each costs
	const directions = [
		{
			slug: 'plates',
			name: 'Plates',
			line: 'Each concept a sheet in the atlas’s plate language: a mark, a title, you write and you get as the hero, then notes and edges.',
		},
		{
			slug: 'margins',
			name: 'Margins',
			line: 'A critical edition: the example runs large, the prose sits narrower beside it, and edges, CommonMark notes and see-alsos go in the margin.',
		},
		{
			slug: 'workbook',
			name: 'Workbook',
			line: 'Short lessons around one editable example each, compiled in your browser by real mdsvex once you touch it, with a “now try” under it.',
		},
	];

	const pages = [
		{ slug: 'markdown', title: 'Markdown', section: 'Learn' },
		{ slug: 'templates', title: 'Templates', section: 'Guides' },
	];
</script>

<svelte:head>
	<title>Docs lab · mdsvex</title>
</svelte:head>

<header class="head">
	<p class="kicker riso">Docs lab</p>
	<h1 class="rag">Three ways to draw a docs page</h1>
	<p class="lede">
		The same two pages three times: <a href="/docs/learn/markdown">Learn / Markdown</a>, the language tour, and
		<a href="/docs/guides/templates">Guides / Templates</a>, a typical guide. Every example is the real compile, every score the
		real parser, and every CommonMark reading is micromark’s. Each page has a switch to show the reading, off here and remembered per
		section.
	</p>
</header>

<ol class="directions">
	{#each directions as d, i (d.slug)}
		<li class="direction">
			<p class="n riso">{i + 1}</p>
			<div class="what">
				<h2>{d.name}</h2>
				<p>{d.line}</p>
			</div>
			<ul class="links riso">
				{#each pages as p (p.slug)}
					<li>
						<a href="/docs-lab/{d.slug}/{p.slug}"><span class="sec">{p.section}</span> {p.title}</a>
					</li>
				{/each}
			</ul>
		</li>
	{/each}
</ol>

<p class="compare riso">To compare with: <a href="/atlas">the construct atlas</a>, and the real <a href="/docs/learn/markdown">Markdown</a> and <a href="/docs/guides/templates">Templates</a> pages.</p>

<style>
	.head {
		max-width: 52rem;
		padding: clamp(2rem, 6vw, 4.5rem) 0 clamp(1.5rem, 4vw, 2.5rem);
	}

	.kicker {
		margin: 0 0 0.75rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	h1 {
		margin: 0 0 1.25rem;
		font: 400 clamp(2.5rem, 6.5vw, 5rem) / 1 var(--face-display);
		letter-spacing: -0.01em;
	}

	.lede {
		max-width: 44rem;
		margin: 0;
		font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
		line-height: 1.5;
	}

	a {
		color: inherit;
		text-decoration: underline 1px var(--quiet-line);
		text-underline-offset: 0.18em;
	}

	a:hover {
		text-decoration-color: var(--ink);
	}

	.directions {
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1.5px solid var(--ink);
	}

	.direction {
		display: grid;
		grid-template-columns: 3rem minmax(0, 1fr) auto;
		gap: 0.5rem 2rem;
		align-items: baseline;
		padding: 1.5rem 0;
		border-bottom: 1px solid var(--ink);
	}

	.n {
		margin: 0;
		font: 400 0.875rem / 1 var(--face-mono);
		color: var(--quiet);
	}

	h2 {
		margin: 0 0 0.375rem;
		font: 400 clamp(1.75rem, 3vw, 2.5rem) / 1.05 var(--face-display);
	}

	.what p {
		max-width: 46rem;
		margin: 0;
	}

	.links {
		display: grid;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
		font: 400 0.875rem / 1.4 var(--face-mono);
		white-space: nowrap;
	}

	.sec {
		color: var(--quiet);
	}

	.compare {
		margin: 1.5rem 0 0;
		font: 400 0.8125rem / 1.5 var(--face-mono);
		color: var(--quiet);
	}

	@media (max-width: 700px) {
		.direction {
			grid-template-columns: 2rem minmax(0, 1fr);
		}

		.links {
			grid-column: 2;
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem 1.5rem;
		}
	}
</style>
