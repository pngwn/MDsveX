<script lang="ts">
	// what a construct compiles to, set beside its score. It shares the score's
	// focus: a lit phrase washes what it became here in its own colour and steps
	// the rest back, and pointing here lights the phrase it came from
	import type { Focus } from '../score/Score.svelte';
	import { tone } from '../score/kinds';
	import type { Compiled } from './types';
	import { cuts, output_of, phrase_at } from './wash';

	interface Props {
		source: string;
		compiled: Compiled;
		focus?: Focus | null;
		/** the construct's name, for the figure's accessible name */
		name: string;
	}

	let { source, compiled, focus = $bindable(null), name }: Props = $props();

	const id = $props.id();
	let expanded = $state(false);

	let long = $state(false);
	function measure(node: HTMLElement) {
		const pre = node.parentElement!;
		const observer = new ResizeObserver(() => {
			const style = getComputedStyle(pre);
			const height = node.offsetHeight + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
			long = height > parseFloat(getComputedStyle(document.documentElement).fontSize) * 22;
		});
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	let pieces = $derived(cuts(compiled.code, compiled.segments));
	let lit = $derived(focus ? output_of(compiled.segments, focus.start, focus.end) : null);

	function over(e: PointerEvent) {
		const el = (e.target as HTMLElement).closest<HTMLElement>('[data-at]');
		focus = el ? phrase_at(source, compiled.segments, Number(el.dataset.at)) : null;
	}
</script>

<figure class="output" aria-label="{name}, compiled">
	<figcaption>
		<span>Compiles to</span>
		{#if compiled.with.length}<span class="with">with {compiled.with.join(', ')}</span>{/if}
	</figcaption>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<pre
		class="code"
		{id}
		class:expanded
		class:dimmed={!!lit}
		style:--wash-c={focus ? `var(--line-${tone(focus.kind)})` : undefined}
		tabindex="0"
		onpointerover={over}
		onpointerleave={() => (focus = null)}><code use:measure
			>{#each pieces as [a, b] (a)}<span class:lit={!!lit && a >= lit[0] && b <= lit[1]} data-at={a}
					>{compiled.code.slice(a, b)}</span
				>{/each}</code
		></pre>
	{#if long}
		<button type="button" aria-controls={id} aria-expanded={expanded} onclick={() => expanded = !expanded}>
			{expanded ? 'Collapse output' : 'Expand output'}
		</button>
	{/if}
</figure>

<style>
	.output {
		margin: 0;
		min-width: 0;
		display: grid;
		gap: 0.5rem;
		align-content: start;
	}

	figcaption {
		display: flex;
		margin: 0;
		padding: 0;
		flex-wrap: wrap;
		gap: 0 0.75rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		color: var(--quiet);
		letter-spacing: 0.02em;
	}

	.with {
		font-style: italic;
	}

	pre {
		margin: 0;
		padding: 0.875rem 1rem;
		max-height: 22rem;
		overflow: auto;
		border: 1px solid var(--staff);
		background: var(--paper);
		color: var(--ink);
		font: 400 0.8125rem / 1.6 var(--face-mono);
		font-variant-ligatures: none;
		/* laid out a block a line (indent.ts), so it scrolls rather than wraps,
		   which would break the indents */
		white-space: pre;
		tab-size: 2;
	}

	pre:focus-visible {
		outline: 1.5px solid var(--ink);
		outline-offset: 2px;
	}

	code {
		font: inherit;
		background: none;
		padding: 0;
		color: inherit;
	}

	/* the score's wash, its line tone at 13% over the paper, and everything else stepped back */
	.lit {
		text-decoration: underline 1px var(--wash-c);
		text-underline-offset: 0.18em;
		background-color: color-mix(in srgb, var(--wash-c, var(--line-list)) 13%, transparent);
	}

	.dimmed span:not(.lit) {
		opacity: 0.85;
	}

	@media (prefers-reduced-motion: no-preference) {
		span {
			transition:
				opacity 160ms ease,
				background-color 160ms ease;
		}
	}
	pre.expanded { max-height: none; }
	button {
		justify-self: start;
		font: 400 0.8125rem/1.4 var(--face-mono);
		background: var(--paper);
		color: var(--ink);
		border: 1px solid var(--staff);
		padding: 0.375rem 0.625rem;
		cursor: pointer;
	}
</style>
