<script lang="ts">
	// the home page: 01's v7 (lib/experiments/01-wordmark/v7 on
	// p/mdsvex-1.0-design), laid out like a title page, the opening, then the
	// lede, the install line and the contents. The paper is 01's dots, linen on
	// Playfair, riso on the Title's mono, the body plain
	import install from '$lib/docs/install-pnpm.sh?raw';
	import Title from '$lib/design/title/Title.svelte';

	const movements = [
		['Quick start', 'Install it, then add it to Vite or SvelteKit.', '/docs/learn/quick-start'],
		['Markdown', 'PFM, and where it parts from CommonMark.', '/docs/learn/markdown'],
		['Svelte in markdown', 'Expressions, components and blocks, anywhere.', '/docs/learn/markdown#svelte-in-markdown'],
		['Frontmatter', 'YAML, checked against the template’s props.', '/docs/guides/frontmatter'],
		['Templates', 'A component that wraps the document.', '/docs/guides/templates'],
		['Custom components', 'Replace any element with your own.', '/docs/guides/components'],
		['Directives', 'A name and its args, mapped to a component.', '/docs/guides/directives'],
		['Plugins', 'Act on the document as it is parsed.', '/docs/plugins'],
		['Formatting with Prettier', 'Format markdown and Svelte together.', '/docs/guides/prettier'],
	];
	const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
</script>

<svelte:head>
	<title>mdsvex, markdown with Svelte in it</title>
</svelte:head>

<div class="home">
	<section class="cover">
		<Title />
		<p class="sub linen">Markdown with Svelte in it.</p>
		<nav class="start" aria-label="Get started"><a href="/docs/learn/quick-start">Quick start</a><a href="/playground">Try an example</a></nav>
	</section>

	<section class="first">
		<p class="lede">
			Write documents in markdown, put Svelte components and expressions anywhere in them, and get a Svelte component
			out.
		</p>
		<!-- the command stands alone, with no rule under it, as v7 had it -->
		<p class="install"><span>Install</span><code>{install.trim()}</code></p>
	</section>

	<section class="contents" aria-labelledby="contents">
		<h2 id="contents">Contents</h2>
		<ol>
			{#each movements as [name, line, href], i (name)}
				<li><a class="movement" {href}>
					<span class="num linen">{ROMAN[i]}</span>
					<span class="mv linen">{name}</span>
					<span class="tempo">{line}</span>
				</a></li>
			{/each}
		</ol>
	</section>
</div>

<style>
	/* 01's paper, pngwn.at's light paper: two sets of fine rings from different
	   centres beat into soft round dots where they cross, with a little shade at
	   the top and the foot. Fixed, so the page scrolls over it. The rings take
	   either theme's ink; the shade always darkens */
	:global(.design-frame:has(.cover)) {
		background-image:
			repeating-radial-gradient(circle at 13% 27%, color-mix(in srgb, var(--ink) 1.2%, transparent) 0 1px, transparent 1px 3px),
			repeating-radial-gradient(circle at 71% 63%, color-mix(in srgb, var(--ink) 1%, transparent) 0 1px, transparent 1px 4px),
			radial-gradient(at 50% 0%, light-dark(rgb(18 19 24 / 0.04), rgb(0 0 0 / 0.2)), transparent 45%),
			radial-gradient(at 50% 100%, light-dark(rgb(18 19 24 / 0.05), rgb(0 0 0 / 0.25)), transparent 50%);
		background-attachment: fixed;
	}

	/* v7 set its page at 16px with the browser's line height */
	.home {
		font-size: 1rem;
		line-height: normal;
	}

	.cover {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: calc(100svh - 5rem);
		/* v7's header stood two of its gutters and a line of 14px mono tall, the
		   site nav (the frame's 1.25rem padding and 13px at 1.4) is shorter on a
		   desktop and taller on a phone; the difference puts the opening where v7's was */
		margin-top: calc(2 * clamp(1rem, 3vw, 2.5rem) + 1rem - (2.5rem + 0.8125rem * 1.4));
		padding: 0 0 4rem;
		text-align: center;
		--u: clamp(1.3rem, 3.4vw, 2.9rem);
		--track: 0.6em;
		--phrase-h: 1.55rem;
		--stave-gap: 0.2em;
		--title: min(22vw, 36svh);
	}

	.sub {
		margin: 1.5rem 0 0;
		font-family: var(--face-display);
		font-size: clamp(1.25rem, 2.6vw, 2rem);
		font-style: italic;
	}

	.first {
		display: grid;
		justify-items: center;
		gap: 1.75rem;
		padding: clamp(2rem, 6vw, 4rem) 0 0;
		text-align: center;
	}

	.lede {
		max-width: 34ch;
		margin: 0;
		font-size: clamp(1.1875rem, 2vw, 1.5rem);
		line-height: 1.45;
	}

	.install {
		margin: 0;
	}

	.install code {
		font-family: var(--face-mono);
		font-size: 1rem;
		letter-spacing: 0.08em;
	}

	.contents {
		max-width: 52rem;
		margin: 0 auto;
		padding: clamp(3rem, 8vw, 6rem) 0 0;
	}

	h2 {
		margin: 0 0 2rem;
		font-family: var(--face-display);
		font-size: clamp(1.75rem, 3.5vw, 2.75rem);
		font-weight: 500;
		line-height: normal;
		text-align: center;
	}

	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.movement {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 1fr) minmax(0, 1.4fr);
		align-items: baseline;
		gap: 0.25rem 1.5rem;
		padding: 0.85rem 0;
		border-top: 1px solid var(--staff);
	}

	.num {
		font-family: var(--face-display);
		font-size: 1rem;
		color: var(--quiet);
	}

	.mv {
		justify-self: start;
		font-family: var(--face-display);
		font-size: clamp(1.25rem, 2.2vw, 1.75rem);
		font-weight: 600;
		color: inherit;
		text-decoration: none;
	}

	.movement:hover .mv {
		text-decoration: underline 1px;
		text-underline-offset: 0.2em;
	}

	.tempo {
		font-size: 1rem;
		color: var(--quiet);
	}

	@media (max-width: 640px) {
		.cover {
			--track: 0.45em;
			--u: 1.2rem;
		}

		.movement {
			grid-template-columns: 1.75rem minmax(0, 1fr);
			column-gap: 0.75rem;
		}

		.tempo {
			grid-column: 2;
		}
	}
	.start {
		display: flex;
		gap: 1.5rem;
		margin-top: 1rem;
	}
	.start a {
		padding: 0.5rem 0;
		color: var(--ink);
		font: 400 0.875rem/1.5 var(--face-mono);
		text-underline-offset: 0.25em;
	}
	.start a + a { color: var(--quiet); }
	.install span {
		display: block;
		margin-bottom: 0.375rem;
		color: var(--quiet);
	}
	.movement {
		color: inherit;
		text-decoration: none;
	}
	.movement:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
</style>
