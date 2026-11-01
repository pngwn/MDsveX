<script lang="ts">
	// pngwn's blog penguin as a line, design/SCORE.md "The perched bird": 17px
	// tall, a 1px stroke that doesn't scale with it, plain ink, facing left, back
	// into the page. Of the blog's idle loop only two things stay, and rarely: a
	// blink about every twenty seconds and a glance up about once a minute, in
	// CSS, never under reduced motion
	import { centre, ground, post_drop, view_box } from './pngwn';
</script>

<svg class="pngwn" viewBox={view_box} aria-hidden="true" style:--ground={ground} style:--post-drop="{post_drop * 100}%">
	<g class="glance">
		<path d={centre.body} />
		<path d={centre.chest} />
		<path d={centre.wing} />
		<path class="eye" d={centre.eye} />
	</g>
</svg>

<style>
	.pngwn {
		display: block;
		height: var(--perch-size, 17px);
		width: auto;
		aspect-ratio: 71 / 72.31;
		overflow: visible;
		/* the drawing faces right; mirrored, it looks back along the line */
		scale: -1 1;
	}

	path {
		fill: none;
		stroke: var(--ink, #121318);
		stroke-width: 1px;
		stroke-linejoin: miter;
		stroke-miterlimit: 8;
		vector-effect: non-scaling-stroke;
	}

	/* a dot of no height can't be squashed, so the eye blinks by going out */
	.eye {
		stroke-linecap: square;
		animation: wink 23s 6s infinite;
	}

	/* the blog's blink, 170ms once in twenty three seconds */
	@keyframes wink {
		0%,
		99.26% {
			opacity: 1;
		}
		99.63% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}

	/* on a bar line it sits on its belly, the tail hanging past the post */
	:global(.bird[data-perch='fine']) .pngwn {
		translate: 0 var(--post-drop);
	}

	.glance {
		transform-box: view-box;
		transform-origin: var(--ground);
		animation: glance 61s 19s infinite ease-in-out;
	}

	/* the blog's glance up, three degrees back and held, 1.8s once a minute */
	@keyframes glance {
		0%,
		97.05% {
			rotate: 0deg;
		}
		97.79%,
		99.26% {
			rotate: -3deg;
		}
		100% {
			rotate: 0deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.glance,
		.eye {
			animation: none;
		}
	}
</style>
