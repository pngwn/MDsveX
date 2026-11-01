<script lang="ts">
	// stands the line bird at the right end of a line in whatever it wraps. One
	// per page, design/SCORE.md. The perch is found in the DOM: a rule named by
	// `on` (the Title's heading line), or else the double bar that ends the last
	// score, stood on like a post, or else the outermost phrase line of the first
	// score, at its right end
	import { onMount, type Snippet } from 'svelte';
	import Pngwn from './Pngwn.svelte';

	interface Props {
		children: Snippet;
		/** a selector for a rule to stand on, its top edge at its right end */
		on?: string;
		/** how far in from the end of a line the bird stands, a CSS length */
		inset?: string;
	}

	interface Spot {
		kind: 'on' | 'fine' | 'phrase';
		x: number;
		y: number;
	}

	let { children, on, inset = '1.5rem' }: Props = $props();

	let box: HTMLDivElement;
	let bird: HTMLSpanElement;
	let probe: HTMLSpanElement;
	let at = $state<Spot | null>(null);

	const visible = (el: Element) => {
		const style = getComputedStyle(el);
		return el.getBoundingClientRect().width > 0 && style.visibility !== 'hidden' && style.display !== 'none';
	};

	/** where a line's top edge is: a rule drawn as its own height, or as a border along its foot */
	function top_of(el: Element) {
		const r = el.getBoundingClientRect();
		const border = parseFloat(getComputedStyle(el).borderBottomWidth) || 0;
		return border ? r.bottom - border : r.top;
	}

	function find(): Spot | null {
		const root = box.getBoundingClientRect();
		const gap = probe.getBoundingClientRect().width;
		const width = bird.getBoundingClientRect().width;
		const end_of = (r: DOMRect) => r.right - root.left - gap - width;

		if (on) {
			const rule = [...box.querySelectorAll(on)].find(visible);
			if (rule) return { kind: 'on', x: end_of(rule.getBoundingClientRect()), y: top_of(rule) - root.top };
		}
		// the double bar that ends the last piece, the bird centred over it
		const fine = [...box.querySelectorAll('.fine .barline')].filter(visible).at(-1);
		if (fine) {
			const r = fine.getBoundingClientRect();
			return { kind: 'fine', x: r.left + r.width / 2 - root.left - width / 2, y: r.top - root.top };
		}
		// the highest line in the first system, and of those the one reaching furthest right
		const first = box.querySelector('.system');
		const lines = first ? [...first.querySelectorAll('.phrase .line')].filter(visible) : [];
		if (!lines.length) return null;
		const top = Math.min(...lines.map(top_of));
		const outer = lines
			.filter((l) => top_of(l) - top < 2)
			.reduce((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a));
		return { kind: 'phrase', x: end_of(outer.getBoundingClientRect()), y: top - root.top };
	}

	const place = () => (at = find());

	onMount(() => {
		place();
		// scores measure themselves once their fonts load and reflow on resize
		document.fonts?.ready.then(place);
		const watch = new ResizeObserver(place);
		watch.observe(box);
		return () => watch.disconnect();
	});

	$effect(() => {
		void on;
		void inset;
		queueMicrotask(place);
	});
</script>

<div class="perch" bind:this={box}>
	{@render children()}
	<span class="probe" style:width={inset} bind:this={probe} aria-hidden="true"></span>
	<span
		class="bird"
		class:placed={!!at}
		data-perch={at?.kind}
		bind:this={bird}
		style:left="{at?.x ?? 0}px"
		style:top="{at?.y ?? 0}px"
		aria-hidden="true"
	>
		<Pngwn />
	</span>
</div>

<style>
	.perch {
		position: relative;
	}

	.bird {
		position: absolute;
		z-index: 2;
		/* the feet stand on the line's top edge */
		translate: 0 -100%;
		visibility: hidden;
		pointer-events: none;
	}

	/* turns the inset into pixels */
	.probe {
		position: absolute;
		height: 0;
		visibility: hidden;
	}

	.bird.placed {
		visibility: visible;
	}
</style>
