<script lang="ts">
	// the Title, 01's v7 as it was drawn (lib/experiments/01-wordmark/v7 on
	// p/mdsvex-1.0-design): a heading's source read by the real parser and
	// scored on ruled staves, then its typeset form in Playfair. Each letter
	// knows the source character it came from, so a lit phrase washes the
	// letters it becomes. Printed as v7's `?ink=mix&plate=linen`: the black
	// letters take the frame's linen knock, the Svelte letters the linen plate,
	// both with a ragged edge. The line bird perches on the heading's stave, at
	// the right margin (lib/experiments/penguin/perch/title)
	import Perch from '../penguin/Perch.svelte';
	import Staves from './Staves.svelte';
	import { covers, read, type Lit } from './reading';
	import { linen } from './plate';

	interface Props {
		/** a heading's PFM source, the typeset form is what it renders to */
		source?: string;
	}

	let { source = '# md{"sv"}ex' }: Props = $props();

	const reading = $derived(read(source));
	let lit = $state<Lit | null>(null);

	// the characters that reach the output, a string literal's quotes are markup
	const letters = $derived(reading.cells.filter((c) => !c.syntax));
</script>

<div class="staves">
	<!-- on the top stave out at the page's margin, past the heading's closing
	     bar and clear of it, as the penguin's perch page tested it -->
	<Perch on=".stave" edge="box" inset="0px">
		<Staves {reading} bind:lit label="The source of the title" />
	</Perch>
</div>

<h1 class="title" style:--plate={linen}>
	{#each letters as letter (letter.index)}<span
			class:svelte={letter.voice === 'svelte'}
			class:lit={covers(lit, letter.index)}
			style:--wash-voice="var(--{lit?.voice ?? 'block'})"
			><span class="ink rag">{letter.char}</span></span
		>{/each}
</h1>

<style>
	/* the staves are as wide as the page, the title centred under them */
	.staves {
		align-self: stretch;
		margin-bottom: clamp(1.5rem, 4vw, 3rem);
	}

	.title {
		--block: var(--voice-blue);
		--inline: var(--voice-rose);
		--svelte: var(--voice-orange);
		--directive: var(--voice-green);
		margin: 0;
		font: 500 var(--title, min(25vw, 42svh)) / 0.9 var(--face-display);
		font-optical-sizing: auto;
		letter-spacing: -0.02em;
		color: var(--ink);
		/* the frame gives its headings linen as a whole, here each letter takes
		   it, so the wash under a letter stays whole */
		mask-image: none;
	}

	/* at display size a letter's inline box runs far past its ink, so the wash
	   is a band from the baseline to the x-height on a box the size of the line */
	span {
		--band: transparent;
		display: inline-block;
		background: linear-gradient(transparent 33%, var(--band) 33%, var(--band) 84%, transparent 84%);
		transition: --band 160ms ease;
	}

	.ink {
		position: relative;
		background: none;
	}

	.lit {
		--band: color-mix(in srgb, var(--wash-voice) 12%, transparent);
	}

	/* the black letters with the linen's threads cut out of them */
	span:not(.svelte) > .ink {
		mask-image: var(--linen-image, none);
		mask-size: var(--linen-size, auto);
		mask-composite: var(--linen-composite, add);
	}

	/* the Svelte plate, orange ink on linen, the weave showing through it */
	.svelte > .ink {
		color: transparent;
		background-image: var(--plate), linear-gradient(var(--svelte), var(--svelte));
		background-size: 96px 96px, auto;
		-webkit-background-clip: text;
		background-clip: text;
	}

	@property --band {
		syntax: '<color>';
		inherits: false;
		initial-value: transparent;
	}

	@media (prefers-reduced-motion: reduce) {
		span {
			transition: none;
		}
	}
</style>
