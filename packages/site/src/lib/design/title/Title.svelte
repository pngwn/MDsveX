<script lang="ts">
	// the Title, 01's v7 (lib/experiments/01-wordmark on p/mdsvex-1.0-design)
	// drawn by the one engine: a heading's source read by the real parser and
	// scored in the four voices, tracked wide at display size, and under it the
	// typeset form in Playfair. Each letter knows the source character it came
	// from, so a lit phrase washes its letters and pointing at a letter lights
	// the phrase it is in. The line bird perches on the heading's line
	import Perch from '../penguin/Perch.svelte';
	import Score, { type Focus } from '../score/Score.svelte';
	import { read, settled } from '../score/reading';
	import { tone } from '../score/kinds';

	interface Props {
		/** a heading's PFM source, the typeset form is what it renders to */
		source?: string;
	}

	let { source = '# md{"sv"}ex\n' }: Props = $props();

	let focus = $state<Focus | null>(null);
	let bar = $derived(settled(read(source)));

	/** the longest source line, the score's measure is cut to fit it */
	let n = $derived(Math.max(...source.split('\n').map((l) => l.length)));

	interface Letter {
		char: string;
		index: number;
		svelte: boolean;
	}

	/**
	 * the characters that reach the output: what no phrase marks, less spaces, and
	 * a string literal's contents. The reading marks all of `{"sv"}` as the
	 * expression's, but the string renders without its quotes and braces
	 */
	let letters = $derived.by((): Letter[] => {
		const said = new Set<number>();
		const svelte = new Set<number>();
		for (const p of bar.phrases) {
			if (p.voice !== 'svelte' || p.end === null) continue;
			for (let i = p.start; i < p.end; i++) svelte.add(i);
			if (p.kind === 'mustache' && /^(["'`])[^]*\1$/.test(source.slice(p.start + 1, p.end - 1)))
				for (let i = p.start + 2; i < p.end - 2; i++) said.add(i);
		}
		return [...source].flatMap((char, index) =>
			(bar.marks[index] && !said.has(index)) || /\s/.test(char) ? [] : [{ char, index, svelte: svelte.has(index) }],
		);
	});

	let spelled = $derived(letters.map((l) => l.char).join(''));

	/** the innermost phrase over a character, as the score lights it */
	function point(index: number) {
		const inner = bar.phrases
			.filter((p) => p.kind !== 'text' && p.start <= index && index < (p.end ?? source.length))
			.sort((a, b) => b.depth - a.depth)[0];
		focus = inner ? { start: inner.start, end: inner.end ?? source.length, kind: inner.kind } : null;
	}

	const lit = (index: number) => !!focus && index >= focus.start && index < focus.end;
</script>

<div class="title" data-palette="voice" style:--n={n} style:--wash-c={focus ? `var(--line-${tone(focus.kind)})` : undefined}>
	<Perch on=".phrase[data-kind='heading'] .line">
		<div class="measure">
			<Score {source} palette="voice" bind:focus label="The title’s source as the parser reads it" />
		</div>
	</Perch>

	<h1>
		<span class="said">{spelled}</span>
		<span class="typeset" aria-hidden="true" onpointerleave={() => (focus = null)}>
			{#each letters as l (l.index)}<span class="letter" class:svelte={l.svelte} class:lit={lit(l.index)} onpointerenter={() => point(l.index)}
					><span class="ink linen rag">{l.char}</span></span
				>{/each}
		</span>
	</h1>
</div>

<style>
	/* the underlay at display size, tracked wide, SCORE.md "Type": about 0.5em at
	   the Title's size, tighter as it comes down, never under 0.2em. The tracking
	   is a share of the size, so the measure can be worked out outside the mono */
	.title {
		--size: clamp(1.375rem, 3.4vw, 2.9rem);
		--k: 0.5;
		--track: calc(var(--size) * var(--k));
		--cell: calc(var(--size) * (0.6 + var(--k)));
		--row: clamp(1.5rem, 2.4vw, 2.25rem);
		--underlay-gap: calc(var(--size) * 0.3);
		/* nothing nests, so the margin is room to centre the underlay: a cell and a
		   half each side, the bar line and the slack the engine's measure takes */
		--margin: calc(var(--cell) * 1.5);
		--block-gap: 0px;

		display: grid;
		justify-items: center;
	}

	@media (max-width: 1100px) {
		.title {
			--k: 0.4;
		}
	}

	@media (max-width: 600px) {
		.title {
			--k: 0.3;
		}
	}

	.title > :global(.perch) {
		justify-self: stretch;
	}

	/* a Title is a heading, not the end of a piece: no double bar after it */
	.measure :global(.barline) {
		display: none;
	}

	.measure {
		width: min(100%, calc(var(--cell) * (var(--n) + 4)));
		margin: 0 auto;
	}

	.title h1 {
		margin: clamp(1.25rem, 3vw, 2.5rem) 0 0;
		font: 500 min(22vw, 36svh) / 0.9 var(--face-display);
		font-optical-sizing: auto;
		letter-spacing: -0.02em;
		color: var(--ink);
		/* the frame's headings take linen as a whole; here each letter does, so the wash under it stays whole */
		mask-image: none;
	}

	.said {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* at display size a letter's box runs far past its ink, so the wash is a band
	   from the baseline to the x-height */
	.letter {
		--band: transparent;
		display: inline-block;
		background: linear-gradient(transparent 33%, var(--band) 33%, var(--band) 84%, transparent 84%);
		transition: --band 160ms ease;
	}

	.ink {
		display: inline-block;
	}

	.svelte {
		color: var(--voice-orange);
	}

	.lit {
		--band: color-mix(in srgb, var(--wash-c) 13%, transparent);
	}

	@property --band {
		syntax: '<color>';
		inherits: false;
		initial-value: transparent;
	}

	@media (prefers-reduced-motion: reduce) {
		.letter {
			transition: none;
		}
	}
</style>
