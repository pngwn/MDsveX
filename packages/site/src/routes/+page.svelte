<script lang="ts">
	// the home page: 01's Title (v7) on the one engine, then a short, quiet way
	// into the docs. The paper is 01's dots, linen on Playfair, riso on the mono,
	// the body plain, design/SCORE.md "Ink texture"
	import Title from '$lib/design/title/Title.svelte';
	import { config, install } from './quick-start';

	const sections = [
		['Learn', '/docs/learn/what-mdsvex-is', 'What mdsvex is, the quick start, and the markdown it reads.'],
		['Guides', '/docs/guides/frontmatter', 'Frontmatter, templates, components, directives, and moving from 0.x.'],
		['Plugins', '/docs/plugins', 'The first-party plugins, and writing your own.'],
		['Reference', '/docs/reference/options', 'Options, the compile API, and the details of every construct.'],
		['Atlas', '/atlas', 'Every construct, with the parser’s reading of it.'],
		['Playground', '/playground', 'Write mdsvex in the browser.'],
	];
	const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
</script>

<svelte:head>
	<title>mdsvex, svelte in markdown</title>
</svelte:head>

<div class="home">
	<section class="cover">
		<!-- a title page: the edition at the left, the dialect where a composer goes -->
		<p class="credits linen">
			<span>1.0</span>
			<span>Penguin-Flavoured Markdown</span>
		</p>
		<Title />
		<p class="sub linen">Svelte in markdown.</p>
	</section>

	<section class="start" aria-labelledby="start">
		<p class="lede">Use Svelte components in your markdown, or markdown in your Svelte components.</p>

		<h2 id="start">Quick start</h2>
		<p>Install it as a dev-dependency.</p>
		<pre class="riso"><code>{install}</code></pre>
		<p>mdsvex is a Vite plugin. In SvelteKit it goes in <code class="riso">vite.config.js</code>, beside <code class="riso">sveltekit()</code>:</p>
		<pre class="riso"><code>{config}</code></pre>
		<p>
			Any markdown file is now a component, and a <code class="riso">+page.svx</code> is a route. The
			<a href="/docs/learn/quick-start">quick start</a> covers Vite without SvelteKit, templates and components.
		</p>
	</section>

	<section class="contents" aria-labelledby="contents">
		<h2 id="contents">Contents</h2>
		<ol>
			{#each sections as [name, href, line], i (name)}
				<li>
					<span class="num linen" aria-hidden="true">{ROMAN[i]}</span>
					<a class="mv linen" {href}>{name}</a>
					<span class="tempo">{line}</span>
				</li>
			{/each}
		</ol>
	</section>
</div>

<style>
	/* 01's paper, pngwn.at's light paper: two sets of fine rings from different
	   centres beat into soft round dots where they cross, with a little shade at
	   the top and the foot. Fixed, so the page scrolls over it. The rings take
	   either theme's ink; the shade always darkens */
	:global(.design-frame:has(.home)) {
		background-image:
			repeating-radial-gradient(circle at 13% 27%, color-mix(in srgb, var(--ink) 1.2%, transparent) 0 1px, transparent 1px 3px),
			repeating-radial-gradient(circle at 71% 63%, color-mix(in srgb, var(--ink) 1%, transparent) 0 1px, transparent 1px 4px),
			radial-gradient(at 50% 0%, light-dark(rgb(18 19 24 / 0.04), rgb(0 0 0 / 0.2)), transparent 45%),
			radial-gradient(at 50% 100%, light-dark(rgb(18 19 24 / 0.05), rgb(0 0 0 / 0.25)), transparent 50%);
		background-attachment: fixed;
	}

	.cover {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-height: calc(100svh - 4.5rem);
		padding-bottom: 4rem;
		text-align: center;
	}

	.credits {
		display: flex;
		justify-content: space-between;
		margin: 0 0 clamp(2.5rem, 7svh, 4.5rem);
		font: 400 clamp(1rem, 1.4vw, 1.25rem) / 1.3 var(--face-display);
	}

	.sub {
		margin: 1.5rem 0 0;
		font: italic 400 clamp(1.25rem, 2.6vw, 2rem) / 1.3 var(--face-display);
	}

	.start {
		max-width: 40rem;
		margin: 0 auto;
		padding-top: clamp(1rem, 4vw, 3rem);
	}

	.lede {
		margin: 0 0 clamp(3rem, 7vw, 5rem);
		font-size: clamp(1.1875rem, 2vw, 1.5rem);
		line-height: 1.45;
		text-align: center;
	}

	h2 {
		margin: 0 0 1.25rem;
		color: var(--ink);
		font: 500 clamp(1.75rem, 3.5vw, 2.5rem) / 1.15 var(--face-display);
	}

	.start h2 {
		text-align: left;
	}

	.start p {
		margin: 0 0 1rem;
	}

	pre {
		margin: 0 0 1.5rem;
		padding: 1rem 0;
		overflow-x: auto;
		border-top: 1px solid var(--staff);
		border-bottom: 1px solid var(--staff);
		font: 400 0.875rem / 1.6 var(--face-mono);
		font-variant-ligatures: none;
		tab-size: 2;
	}

	code {
		font: 400 0.9em / 1 var(--face-mono);
		font-variant-ligatures: none;
	}

	pre code {
		font: inherit;
	}

	a {
		color: inherit;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.2em;
	}

	.contents {
		max-width: 52rem;
		margin: 0 auto;
		padding-top: clamp(4rem, 9vw, 7rem);
	}

	.contents h2 {
		margin-bottom: 2rem;
		text-align: center;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 1fr) minmax(0, 1.4fr);
		align-items: baseline;
		gap: 0.25rem 1.5rem;
		padding: 0.85rem 0;
		border-top: 1px solid var(--staff);
	}

	li:last-child {
		border-bottom: 1px solid var(--staff);
	}

	.num {
		font: 400 1rem / 1 var(--face-display);
		color: var(--quiet);
	}

	.mv {
		justify-self: start;
		font: 600 clamp(1.25rem, 2.2vw, 1.75rem) / 1.2 var(--face-display);
		text-decoration: none;
	}

	.mv:hover {
		text-decoration: underline;
	}

	.tempo {
		color: var(--quiet);
	}

	@media (max-width: 640px) {
		li {
			grid-template-columns: 2.5rem minmax(0, 1fr);
		}

		.tempo {
			grid-column: 2;
		}
	}
</style>
