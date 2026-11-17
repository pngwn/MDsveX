<script lang="ts">
	// 01's v7 score of one source (lib/experiments/01-wordmark/Score.svelte on
	// p/mdsvex-1.0-design, with `names="full" ruled`): a stave per depth with its
	// phrases, over the source as underlay. The staves run out to the edges of
	// the page, as on ruled paper, and text phrases are named. A phrase opens
	// and closes on a bar, v12's marks in place of v7's dot and tick. A source
	// too long for its measure wraps by systems, a phrase that runs on loses a
	// bar at the break. Pointing at or focusing a phrase lights its range, a
	// click pins it, so touch has the wash too
	import type { Lit, Phrase, Reading } from './reading';
	import { covers } from './reading';

	let {
		reading,
		lit = $bindable(null),
		label,
	}: {
		reading: Reading;
		lit?: Lit | null;
		label: string;
	} = $props();

	let pinned = $state<Phrase | null>(null);
	let measure = $state(0);
	let cell = $state(0);

	const as_lit = (p: Phrase | null): Lit | null => (p ? { start: p.start, end: p.end, voice: p.voice } : null);
	const enter = (p: Phrase) => (lit = as_lit(p));
	const leave = () => (lit = as_lit(pinned));
	const toggle = (p: Phrase) => {
		pinned = pinned?.key === p.key ? null : p;
		lit = as_lit(pinned ?? p);
	};

	// break after a space where the measure runs out, as text wraps
	const lines = $derived.by(() => {
		const n = reading.cells.length;
		const fit = cell && measure ? Math.max(4, Math.floor(measure / cell)) : n;
		const out: [number, number][] = [];
		let from = 0;
		while (n - from > fit) {
			let to = reading.source.lastIndexOf(' ', from + fit - 1) + 1;
			if (to <= from) to = from + fit;
			out.push([from, to]);
			from = to;
		}
		out.push([from, n]);
		return out;
	});

	// a phrase is named on the first system that gives it room for the name
	const named_on = $derived.by(() => {
		const at = new Map<string, number>();
		for (const p of reading.phrases) {
			const room = Math.min(3, p.end - p.start);
			const line = lines.find(([from, to]) => Math.min(p.end, to) - Math.max(p.start, from) >= room);
			at.set(p.key, line?.[0] ?? p.start);
		}
		return at;
	});

	const staves = $derived(Array.from({ length: reading.depth }, (_, d) => d));
</script>

<div class="score" role="group" aria-label={label} bind:clientWidth={measure}>
	<span class="probe" bind:clientWidth={cell} aria-hidden="true"></span>
	{#each lines as [from, to] (from)}
		<div class="system" style:--n={to - from}>
			{#each staves.filter((d) => reading.phrases.some((p) => p.depth === d && p.start < to && p.end > from)) as d (d)}
				<span class="stave" style:grid-row={d + 1} aria-hidden="true"></span>
			{/each}
			{#each reading.phrases.filter((p) => p.start < to && p.end > from) as p (p.key)}
				{@const opens = p.start >= from}
				<button
					type="button"
					class="phrase {p.voice}"
					class:runs-in={!opens}
					class:runs-on={p.end > to}
					data-kind={p.type}
					tabindex={opens ? 0 : -1}
					style:grid-row={p.depth + 1}
					style:grid-column="{Math.max(p.start, from) - from + 1} / {Math.min(p.end, to) - from + 1}"
					aria-label="{p.full}, {reading.source.slice(p.start, p.end)}"
					aria-pressed={pinned?.key === p.key}
					onpointerenter={() => enter(p)}
					onpointerleave={leave}
					onfocus={() => enter(p)}
					onblur={leave}
					onclick={() => toggle(p)}
					>{#if named_on.get(p.key) === from}<em class="linen">{p.full}</em>{/if}</button
				>
			{/each}
			{#each reading.cells.slice(from, to) as c (c.index)}
				<span
					class="char riso {c.voice}"
					class:syntax={c.syntax}
					class:lit={covers(lit, c.index)}
					style:--wash-voice="var(--{lit?.voice ?? 'block'})"
					style:grid-row={reading.depth + 1}
					style:grid-column={c.index - from + 1}
					aria-hidden="true">{c.char}</span
				>
			{/each}
		</div>
	{/each}
</div>

<style>
	/* the cell is a mono advance plus the tracking, so every phrase lines up */
	.score {
		--cell: calc(0.6em + var(--track, 0.5em));
		--block: var(--voice-blue);
		--inline: var(--voice-rose);
		--svelte: var(--voice-orange);
		--directive: var(--voice-green);
		position: relative;
		align-self: stretch;
		justify-self: stretch;
		display: grid;
		row-gap: var(--system-gap, 1.4em);
		justify-items: var(--align, center);
		font: 400 var(--u, 2rem) / 1 var(--face-mono);
		font-variant-ligatures: none;
		font-feature-settings: 'calt' 0;
	}

	.probe {
		position: absolute;
		width: var(--cell);
		height: 0;
		visibility: hidden;
	}

	.system {
		display: grid;
		grid-template-columns: repeat(var(--n), var(--cell));
		row-gap: var(--stave-gap, 0.15em);
	}

	/* ruled paper: each stave runs out to the edges of the page */
	.stave {
		grid-column: 1 / -1;
		align-self: end;
		height: 1px;
		background: var(--staff);
		position: relative;
	}

	.stave::before {
		content: '';
		position: absolute;
		inset: 0 -100vw;
		background: var(--staff);
	}

	.phrase {
		all: unset;
		position: relative;
		z-index: 1;
		box-sizing: border-box;
		height: var(--phrase-h, 1.6rem);
		margin: 0 0.12em;
		align-self: end;
		border-bottom: 1.5px solid var(--voice);
		color: var(--voice);
		font: italic 400 14px / 1 var(--face-display);
		cursor: default;
	}

	.phrase.block {
		--voice: var(--block);
	}
	.phrase.inline {
		--voice: var(--inline);
	}
	.phrase.svelte {
		--voice: var(--svelte);
	}
	.phrase.directive {
		--voice: var(--directive);
	}

	/* text completes the reading without competing with the structure */
	.phrase.text {
		--voice: var(--quiet);
		border-bottom-width: 1px;
		border-bottom-color: var(--staff);
	}

	/* a bar where the node opens and one where it closes, v12's marks (pngwn's
	   pick over v7's dot and tick), 1.5px like the line and centred on it. One
	   height for structure and text, so the rows above and below match */
	.phrase::before,
	.phrase::after {
		content: '';
		position: absolute;
		bottom: calc(0.75px - 0.275rem);
		width: 1.5px;
		height: 0.55rem;
		background: var(--voice);
	}

	.phrase::before {
		left: 0;
	}

	.phrase::after {
		right: 0;
	}

	.phrase.text::before,
	.phrase.text::after {
		bottom: calc(0.5px - 0.275rem);
		width: 1px;
	}

	/* a phrase carried across a break runs to the edge of the system */
	.phrase.runs-in {
		margin-left: 0;
	}
	.phrase.runs-in::before,
	.phrase.runs-on::after {
		display: none;
	}
	.phrase.runs-on {
		margin-right: 0;
	}

	.phrase em {
		position: absolute;
		left: 0.28rem;
		bottom: 0.3rem;
		white-space: nowrap;
	}

	.phrase:focus-visible {
		outline: 1.5px solid var(--voice);
		outline-offset: 3px;
	}

	.char {
		padding-top: var(--underlay-gap, 0.45em);
		text-align: center;
		white-space: pre;
		color: var(--ink);
		transition: background-color 160ms ease;
	}

	.char.syntax.block {
		color: var(--block);
	}
	.char.syntax.inline {
		color: var(--inline);
	}
	.char.syntax.svelte {
		color: var(--svelte);
	}
	.char.syntax.directive {
		color: var(--directive);
	}

	.char.lit {
		background-color: color-mix(in srgb, var(--wash-voice) 13%, transparent);
	}

	@media (prefers-reduced-motion: reduce) {
		.char {
			transition: none;
		}
	}
</style>
