<script lang="ts">
	// phase 0's demo: lib/design on one plain page. A few scores from source
	// strings, one streamed, the faces, the texture, the palette and the perched
	// penguin, in the site's frame. ?palette=cvd and ?theme=dark|light set the switches
	import { onMount } from 'svelte';
	import Perch from '$lib/design/penguin/Perch.svelte';
	import { use_theme } from '$lib/design/theme.svelte';
	import Score from '$lib/design/score/Score.svelte';
	import { Player } from '$lib/design/score/player.svelte';
	import type { Tone } from '$lib/design/score/kinds';

	const title = '# md{"sv"}ex\n';

	const pieces = [
		{
			id: 'list',
			title: 'A list with nested items',
			source:
				'- Install `mdsvex` with your package manager\n- Add it to your preprocessors\n  - in `svelte.config.js` for an app\n  - in `vite.config.js` for a library\n- Write `.svx` files beside your routes\n',
		},
		{
			id: 'quote',
			title: 'A blockquote',
			source: "> A score is the parser's reading of a source,\n> drawn over the source.\n>\n> It is _settled_ unless the piece is played.\n",
		},
		{
			id: 'fence',
			title: 'A fenced block',
			source: "```js\nimport { compile } from 'mdsvex';\n\nconst out = await compile(source);\n```\n",
		},
		{
			id: 'wrap',
			title: 'A paragraph that wraps',
			source:
				'Every character keeps its own cell, so a phrase lines up with the source it covers, and a line that runs past the measure breaks into systems the way a long passage does, {count} bars at a time, with _emphasis_ and [a link](/guide) on the way.\n',
		},
		{
			id: 'component',
			title: 'A component with children',
			source: '<Callout type="tip">\n\nMarkdown inside a component is still *markdown*, and {count} is still Svelte.\n\n</Callout>\n',
		},
	];

	const nested = {
		id: 'nested',
		title: 'Constructs inside constructs',
		source: '> Before you _start_:\n>\n> - Install the plugin.\n>\n>   It reads every *.svx* file.\n>\n>   - in a route\n>   - in [a library](/lib)\n',
	};

	// a guess the parser takes back, a guess it keeps, and characters it holds
	const streamed = 'A *guess that never closes\n\n- an item, **strong**, and {count}\n';
	const player = new Player(() => streamed);

	let palette = $state<'riso' | 'cvd'>('riso');
	// the root layout's frame; ?theme is read there
	const theme = use_theme()!;

	onMount(() => {
		const params = new URL(location.href).searchParams;
		if (params.get('palette') === 'cvd') palette = 'cvd';
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) player.pos = player.last;
		else player.play();
		return () => player.stop();
	});

	const swatches: [Tone, string][] = [
		['list', 'list'],
		['item', 'item'],
		['para', 'paragraph'],
		['quote', 'quote'],
		['heading', 'heading'],
		['fence', 'code block, table'],
		['emph', 'emphasis'],
		['strong', 'strong'],
		['code', 'code'],
		['link', 'link'],
		['expr', 'expression, tag'],
		['comp', 'component, element'],
		['logic', 'logic block, branch'],
		['directive', 'directive'],
		['text', 'text, frontmatter'],
	];
</script>

<svelte:head>
	<title>mdsvex 1.0, the design foundation</title>
</svelte:head>

	<header class="intro">
		<h1 class="rag">The score</h1>
		<p class="lede">
			The parser’s reading of a source, drawn over the source. Each phrase is one node, from its first character to its last, named in
			the corner of its opening bar. Everything on this page is <code>lib/design</code>, and every score is the real parser’s output.
		</p>

		<div class="switches">
			<div class="pick" role="group" aria-label="Colours">
				<button type="button" aria-pressed={palette === 'riso'} onclick={() => (palette = 'riso')}>Riso inks</button>
				<button type="button" aria-pressed={palette === 'cvd'} onclick={() => (palette = 'cvd')}>Colour blind safe</button>
			</div>
			<div class="pick" role="group" aria-label="Theme, dark is a proposal">
				<button type="button" aria-pressed={theme.value === 'auto'} onclick={() => (theme.value = 'auto')}>Auto</button>
				<button type="button" aria-pressed={theme.value === 'light'} onclick={() => (theme.value = 'light')}>Light</button>
				<button type="button" aria-pressed={theme.value === 'dark'} onclick={() => (theme.value = 'dark')}>Dark</button>
			</div>
		</div>
	</header>

	<section class="piece" aria-labelledby="title-score">
		<h2 id="title-score">The name, as written</h2>
		<div class="title-score">
			<Score source={title} {palette} label="md, an expression, ex, as a heading" />
		</div>
	</section>

	<section class="piece" aria-labelledby="streamed">
		<h2 id="streamed">Streamed</h2>
		<p class="note">
			Fed a character at a time. A guess is raised and dashed until the parser keeps or revokes it, and the bird’s eye watches
			characters it holds.
		</p>
		<div class="score">
			<Score source={streamed} {palette} stream={player.pos} label="A source streamed into the parser" />
		</div>
		<div class="transport">
			<button type="button" onclick={() => player.toggle()}>{player.playing ? 'Pause' : 'Play'}</button>
			<input
				type="range"
				min="0"
				max={player.last}
				bind:value={player.pos}
				oninput={() => player.stop()}
				aria-label="Characters fed"
			/>
			<span class="fed">{Math.min(player.pos + 1, streamed.length)} / {streamed.length}</span>
		</div>
	</section>

	{#each pieces as piece (piece.id)}
		<section class="piece" aria-labelledby="piece-{piece.id}">
			<h2 id="piece-{piece.id}">{piece.title}</h2>
			<div class="score">
				<Score source={piece.source} {palette} label={piece.title} />
			</div>
		</section>
	{/each}

	<section class="type" aria-labelledby="type">
		<h2 id="type">Type and texture</h2>
		<div class="faces">
			<div>
				<p class="face-name">Playfair, linen, ragged at display sizes</p>
				<p class="display linen rag">mdsvex</p>
			</div>
			<div>
				<p class="face-name">Playfair italic, 14px, the phrase names</p>
				<p class="names linen">list item paragraph quote heading <span>expression</span></p>
			</div>
			<div>
				<p class="face-name">Source Serif 4, plain, for reading</p>
				<p class="body">
					Markdown with Svelte in it. Write prose the way you always have, and drop a component or an expression in wherever the page
					needs one.
				</p>
			</div>
			<div>
				<p class="face-name">Berkeley Mono, riso, for source, code and meta</p>
				<pre class="code riso">const out = await compile(source);
// 0O 1lI |/ -- => {'{{ }}'} ...</pre>
			</div>
		</div>
	</section>

	<section class="palette" aria-labelledby="palette" data-palette={palette}>
		<h2 id="palette">Colour</h2>
		<p class="note">Each construct’s line tone (3:1 on the paper) and name tone (4.5:1).</p>
		<ul>
			{#each swatches as [tone, name] (tone)}
				<li style:--c="var(--line-{tone})" style:--n="var(--name-{tone})">
					<i></i><span>{name}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="piece last" aria-labelledby="piece-nested">
		<h2 id="piece-nested">{nested.title}</h2>
		<Perch>
			<div class="score">
				<Score source={nested.source} {palette} label={nested.title} />
			</div>
		</Perch>
	</section>

<style>
	.intro h1 {
		margin: clamp(2.5rem, 7vw, 5rem) 0 0;
		font: 700 clamp(2.75rem, 7vw, 5.5rem) / 0.95 var(--face-display);
		letter-spacing: -0.015em;
		color: var(--ink);
	}

	.lede {
		margin: 1.25rem 0 0;
		max-width: 40rem;
		font: 400 1.125rem / 1.55 var(--face-text);
		color: var(--quiet);
	}

	.lede code {
		font-size: 0.9em;
	}

	.switches {
		margin-top: 1.75rem;
	}

	.pick {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.pick + .pick {
		margin-top: 0.75rem;
	}

	.pick button,
	.transport button {
		font: 400 0.8125rem / 1 var(--face-mono);
		color: var(--ink);
		background: var(--paper);
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		padding: 0.55rem 0.95rem;
		cursor: pointer;
	}

	.pick button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--paper);
	}

	button:focus-visible,
	input:focus-visible {
		outline: 3px solid var(--line-list);
		outline-offset: 3px;
	}

	section {
		margin-top: clamp(3.5rem, 7vw, 5.5rem);
	}

	h2 {
		margin: 0 0 1.5rem;
		font: 700 clamp(1.375rem, 2.2vw, 1.75rem) / 1.15 var(--face-display);
		color: var(--ink);
	}

	.note {
		max-width: 40rem;
		margin: -0.75rem 0 1.5rem;
		color: var(--quiet);
	}

	/* v12's score column at 1440px, beside its output */
	.score {
		max-width: 61.5rem;
	}

	/* the Title's size and wide tracking, SCORE.md; a phone holds ten of its cells at 1.5rem */
	.title-score {
		--size: 2.5rem;
		--track: 0.4em;
		--row: 1.6rem;
		max-width: 40rem;
	}

	@media (max-width: 600px) {
		.title-score {
			--size: 1.5rem;
			--track: 0.3em;
		}
	}

	.transport {
		display: flex;
		align-items: center;
		gap: 1rem;
		max-width: 30rem;
		margin-top: 1.25rem;
		font: 400 0.8125rem / 1 var(--face-mono);
		color: var(--quiet);
	}

	.transport input {
		flex: 1;
		min-width: 0;
		accent-color: var(--ink);
	}

	.fed {
		font-variant-numeric: tabular-nums;
	}

	.faces {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: 2rem 3rem;
	}

	.faces p {
		margin: 0;
	}

	.face-name {
		margin-bottom: 0.75rem !important;
		font: 400 0.8125rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.display {
		font: 500 clamp(4rem, 12vw, 8rem) / 0.9 var(--face-display);
		letter-spacing: -0.02em;
	}

	.names {
		font: italic 400 0.875rem / 1.6 var(--face-display);
		color: var(--name-para);
	}

	.names span {
		color: var(--voice-orange);
	}

	.body {
		max-width: 34rem;
		font: 400 1.0625rem / 1.55 var(--face-text);
	}

	.code {
		margin: 0;
		font: 400 1rem / 1.5 var(--face-mono);
		font-variant-ligatures: none;
		white-space: pre-wrap;
	}

	.palette ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: 0.9rem 2rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.palette li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.palette i {
		width: 2.5rem;
		height: 0.7rem;
		border-left: 1.5px solid var(--c);
		border-bottom: 1.5px solid var(--c);
		translate: 0 -0.3rem;
	}

	.palette span {
		font: italic 400 0.875rem / 1 var(--face-display);
		color: var(--n);
	}
</style>
