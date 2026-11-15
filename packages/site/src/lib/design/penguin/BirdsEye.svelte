<script lang="ts">
	// the fermata the score sets over held characters while streaming. A fermata
	// is also called a bird's eye, and this one is: an engraved arch with its dot,
	// and a small orange beak. It peeks up from behind the source while the parser
	// holds those characters, blinks if the hold goes on, and ducks back down when
	// the parser decides. Under reduced motion it is simply there or not
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { MediaQuery } from 'svelte/reactivity';

	interface Props {
		/** how long the parser has held, in bars; it blinks once a hold is long */
		held?: number;
	}

	let { held = 0 }: Props = $props();

	const reduced = new MediaQuery('prefers-reduced-motion: reduce');

	function peek(_node: Element, { out = false }: { out?: boolean } = {}) {
		return {
			duration: reduced.current ? 0 : out ? 180 : 260,
			easing: out ? cubicIn : cubicOut,
			css: (t: number) => `transform: translateY(${(1 - t) * 105}%)`,
		};
	}
</script>

<span class="birds-eye" aria-hidden="true">
	<svg viewBox="0 0 28 16" in:peek out:peek={{ out: true }}>
		<path class="arch" d="M2 15.4A11 11 0 0 1 24 15.4L22.7 15.4A9.7 8.4 0 0 0 3.3 15.4Z" />
		<!-- the eye is a fermata's dot, the beak is the only thing a fermata does not have -->
		<ellipse class="eye" class:blink={!reduced.current && held > 9} cx="13" cy="12.4" rx="1.75" ry="1.75" />
		<path class="beak" d="M22.9 10.2L23.2 12.6L27.6 11.5Z" />
	</svg>
</span>

<style>
	.birds-eye {
		display: block;
		width: var(--bird-width, 1.6rem);
		aspect-ratio: 28 / 16;
		/* it rises from behind the line it sits on */
		overflow: hidden;
		pointer-events: none;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.arch,
	.eye {
		fill: var(--ink, #121318);
	}

	.beak {
		fill: var(--voice-orange, #c93300);
	}

	.eye {
		transform-box: fill-box;
		transform-origin: center;
	}

	/* once, a moment into a long hold */
	.blink {
		animation: blink 220ms 1 ease-in-out;
	}

	@keyframes blink {
		50% {
			transform: scaleY(0.12);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.blink {
			animation: none;
		}
	}
</style>
