<script lang="ts">
	// a plate, the atlas's sheet (lib/design/atlas/Entry.svelte) for the docs:
	// one hairline box, its mark in a cell with its colour under it, a kicker and
	// a title, the lede beside the mark, then its parts, each across the plate
	// under a hairline. Every docs plate is this one: a concept a page is cut
	// into, written `::::plate[Title](mark=…, tone=…)`, and a plugin's page
	// (plugins/PluginPage.svelte).
	//
	// The children are the plate's body, laid out by what they are:
	// - `.plate-lede`, the first prose, which the docs plugin wraps, sits in the
	//   head beside the mark
	// - `.plate-notes` beside `.plate-edges` split a part in two when there is room
	// - everything else is a part of its own across the plate: an example, a
	//   fence, a contrast, a plugin's setup
	import type { Snippet } from 'svelte';
	import type { Tone } from '$lib/design/score/kinds';

	interface Props {
		/** the plate's anchor; a docs plate gets one from its title */
		id?: string;
		/** the typed mark that stands for it, set in the cell at its left */
		mark?: string;
		/** the colour of the construct it is about, a tone of lib/design/score/kinds.ts */
		tone?: Tone | string;
		/** the title, a docs plate's bracket text */
		label?: Snippet;
		/** the title, as text */
		title?: string;
		/** over the title: the section a docs plate is in, and its place */
		section?: string;
		n?: string;
		/** over the title, in place of the section */
		kicker?: Snippet;
		/** a page's own plate takes the page's heading */
		level?: 'h1' | 'h2' | 'h3';
		/** `page`, a plugin's page: a larger mark and title */
		size?: 'concept' | 'page';
		children?: Snippet;
	}

	let { id, mark, tone = 'other', label, title, section, n, kicker, level = 'h3', size = 'concept', children }: Props = $props();

	const headed = $derived(!!(label || title));
	// a long mark is set smaller, so it sits in its cell
	const long = $derived((mark ?? '').length > (size === 'page' ? 7 : 5));
</script>

<article
	class="plate wide {size}"
	class:headed
	class:marked={mark !== undefined}
	{id}
	style:--own-line="var(--line-{tone})"
	style:--own-name="var(--name-{tone})"
	aria-labelledby={headed && id ? `${id}-title` : undefined}
>
	{#if mark !== undefined}
		<div class="plate-mark" class:long aria-hidden="true"><span class="glyph">{mark}</span></div>
	{/if}
	{#if headed}
		<div class="plate-title">
			{#if kicker || section}
				<p class="kicker">
					{#if kicker}{@render kicker()}{:else}<em>{section!.toLowerCase()}</em>{#if n}<span class="count">{n.padStart(2, '0')}</span>{/if}{/if}
				</p>
			{/if}
			<svelte:element this={level} class="name" id={id ? `${id}-title` : undefined}>
				{#if id && level !== 'h1'}<a href="#{id}">{#if label}{@render label()}{:else}{title}{/if}</a>{:else if label}{@render label()}{:else}{title}{/if}
			</svelte:element>
		</div>
	{/if}
	{@render children?.()}
</article>

<style>
	/* a grid of a mark column and two halves: the head takes the mark and the
	   rest, a part takes the whole width, and notes and edges a half each.
	   Every column is minmax(0, …): code.css sets a block's code to max-content,
	   and an auto column would grow to it, past the page */
	.plate {
		--mark-w: 7.5rem;
		--title-size: clamp(1.75rem, 5cqi, 2.75rem);
		--title-lh: 1.06;
		--glyph-size: 2rem;
		--title-top: 1.5rem;
		/* in vw, not cqi: a part that is a container itself, a pair, would read
		   cqi off its own width for its hairline, and miss the plate's edge */
		--pad: clamp(1rem, 2.4vw, 2.25rem);
		container-type: inline-size;
		display: grid;
		grid-template-columns: var(--mark-w) minmax(0, calc(50% - var(--mark-w))) minmax(0, 1fr);
		min-width: 0;
		margin: 2rem 0;
		border: 1px solid var(--ink);
		background: var(--paper);
		font-size: 1rem;
		line-height: 1.55;
		scroll-margin-top: 1.5rem;
	}

	.plate.page {
		--mark-w: 9rem;
		--title-size: clamp(2.25rem, 7cqi, 3.5rem);
		--title-lh: 1.02;
		--glyph-size: 1.75rem;
		margin: 0;
	}

	.plate:not(.marked) {
		grid-template-columns: 0 minmax(0, 50%) minmax(0, 1fr);
	}

	/* the mark, as its cell in the atlas's grid, with a short bar of its colour
	   under it. The head is three rows, the kicker, the title and the lede; the
	   cell spans them as a subgrid, so the mark sits in the title's row on its
	   baseline, and any room in the cell is left under it */
	.plate-mark {
		position: relative;
		grid-column: 1;
		grid-row: 1 / span 3;
		display: grid;
		grid-template-rows: subgrid;
		padding: 0 0.5rem 2rem;
		border-right: 1px solid var(--ink);
	}

	.plate-mark.long {
		--glyph-size: 1.25rem;
	}

	.plate-mark::after {
		content: '';
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		height: 0.375rem;
		background: var(--own-line);
	}

	.glyph {
		grid-row: 2;
		justify-self: center;
		align-self: baseline;
		font: 400 var(--glyph-size) / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		white-space: nowrap;
	}

	/* its kicker and title are rows of the plate's own grid */
	.plate-title {
		display: contents;
	}

	.kicker,
	.plate .name {
		grid-column: 2 / -1;
		min-width: 0;
		padding-inline: var(--pad);
	}

	.kicker {
		grid-row: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		margin: 0;
		padding-top: var(--title-top);
		padding-bottom: 0.25rem;
	}

	.plate .name {
		grid-row: 2;
		align-self: baseline;
		padding-bottom: 0.75rem;
	}

	.plate-title:not(:has(.kicker)) .name {
		padding-top: var(--title-top);
	}

	/* with no lede under it, the title closes the head */
	.plate:not(:has(> :global(.plate-lede))) .name {
		padding-bottom: 1.5rem;
	}

	.kicker em {
		font: italic 400 0.9375rem / 1 var(--face-display);
		color: var(--own-name);
	}

	.count {
		font: 400 0.75rem / 1.3 var(--face-mono);
		color: var(--quiet);
	}

	.plate .name {
		position: static;
		margin: 0;
		font: 400 var(--title-size) / var(--title-lh) var(--face-display);
		letter-spacing: -0.01em;
		text-wrap: balance;
	}

	.name a {
		color: inherit;
		text-decoration: none;
	}

	.name a:hover {
		text-decoration: underline 1.5px;
		text-decoration-color: var(--own-line);
		text-underline-offset: 0.12em;
	}

	.name :global(code) {
		font-size: 0.78em;
		color: var(--own-name);
	}

	/* the lede, in the head beside the mark, at a reading measure */
	.plate > :global(.plate-lede) {
		grid-column: 2 / -1;
		grid-row: 3;
		min-width: 0;
		padding: 0 var(--pad) 1.5rem;
	}

	.plate > :global(.plate-lede > *) {
		max-width: 56ch;
	}

	/* every other child is a part: across the plate, under a hairline */
	.plate > :global(:not(.plate-mark, .plate-title, .plate-lede)) {
		position: relative;
		grid-column: 1 / -1;
		min-width: 0;
		margin: 0 var(--pad);
		padding: 1.25rem 0 1.5rem;
	}

	.plate > :global(:not(.plate-mark, .plate-title, .plate-lede))::before {
		content: '';
		position: absolute;
		top: 0;
		left: calc(var(--pad) * -1);
		right: calc(var(--pad) * -1);
		border-top: 1px solid var(--ink);
	}

	.plate > :global(:first-child:not(.plate-mark, .plate-title, .plate-lede))::before {
		display: none;
	}

	/* a fence fills its part and wraps, a scroll box would clip its hairline,
	   these repeat the :not of the part rule above to outrank it */
	.plate > :global(:is(pre, .twinkleplop-block):not(.plate-lede)) {
		margin: 0;
		background: var(--well);
	}

	.plate > :global(pre:not(.plate-lede)),
	.plate > :global(.twinkleplop-block > pre) {
		padding: 1.25rem var(--pad);
		border: 0;
	}

	.plate > :global(.twinkleplop-block:not(.plate-lede)) {
		padding: 0;
	}

	.plate > :global(.twinkleplop-block > .twinkleplop-title) {
		padding: 0.75rem var(--pad) 0.375rem;
		border: 0;
		border-bottom: 1px solid var(--staff);
	}

	.plate > :global(pre),
	.plate > :global(.twinkleplop-block > pre) {
		overflow: visible;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.plate > :global(pre > code),
	.plate > :global(.twinkleplop-block > pre > code) {
		width: auto;
	}

	/* the part spans the plate, so its hairline is its own width */
	.plate > :global(:is(pre, .twinkleplop-block):not(.plate-lede))::before {
		left: 0;
		right: 0;
	}

	/* a table is a part that scrolls in its own box. prose.css caps it at 100%,
	   of the whole grid area, so here it is capped at the part's width, inside
	   the margins. Its scroll box would clip the hairline drawn outside it, so
	   the hairline is its top border, its image outset to the plate's edges */
	.plate > :global(table) {
		max-width: calc(100% - 2 * var(--pad));
		border-top: 1px solid var(--ink);
		border-image: linear-gradient(var(--ink), var(--ink)) 1 / 1px 0 0 / 0 var(--pad);
	}

	.plate > :global(table)::before {
		display: none;
	}

	.plate > :global(table:first-child) {
		border-top: 0;
	}

	/* a fence and the example compiled with it are one part, no hairline between */
	.plate > :global(:is(pre, .twinkleplop-block) + :is(.pair, .contrast))::before {
		display: none;
	}

	/* notes and edges, a half each when there is room */
	@container (min-width: 40rem) {
		.plate > :global(.plate-notes:has(+ .plate-edges)) {
			grid-column: 1 / 3;
		}

		.plate > :global(.plate-notes + .plate-edges) {
			grid-column: 3 / 4;
		}

		.plate > :global(.plate-notes + .plate-edges)::before {
			left: 0;
			right: auto;
			bottom: 0;
			border-top: 0;
			border-left: 1px solid var(--ink);
			translate: calc(var(--pad) * -1) 0;
		}

		/* the half's hairline over it, without the rule between the halves */
		.plate > :global(.plate-notes + .plate-edges)::after {
			content: '';
			position: absolute;
			top: 0;
			left: calc(var(--pad) * -1);
			right: calc(var(--pad) * -1);
			border-top: 1px solid var(--ink);
		}
	}

	/* a plate that is a contrast is small, as a row of the table it was: a
	   narrow mark and a title the size of a lede's line */
	.plate:has(> :global(.contrast)) {
		--mark-w: 5rem;
		--glyph-size: 1.375rem;
		--title-size: 1.375rem;
		--title-lh: 1.2;
		--title-top: 1rem;
	}

	.plate:has(> :global(.contrast)) .plate-mark.long {
		--glyph-size: 0.875rem;
	}

	.plate:has(> :global(.contrast)) .plate-mark {
		padding-inline: 0.25rem;
		padding-bottom: 1.75rem;
	}

	.plate:has(> :global(.contrast)) .plate-mark::after {
		left: 0.75rem;
		right: 0.75rem;
		bottom: 0.875rem;
		height: 0.3rem;
	}

	/* its notes are the one line of what to write instead, as the table's cell was */
	.plate:has(> :global(.contrast)) > :global(.plate-notes) {
		padding-block: 0.625rem 0.75rem;
	}

	.plate:has(> :global(.contrast)) > :global(.plate-notes h4) {
		display: none;
	}

	.plate:has(> :global(.contrast)) > :global(.plate-notes p:first-of-type)::before {
		content: '→ ';
		color: var(--own-name);
	}

	/* a phone: the mark's cell narrows. A media query, since a plate can't
	   query its own width for its own columns */
	@media (max-width: 600px) {
		.plate,
		.plate.page {
			--mark-w: 4.5rem;
			--glyph-size: 1.375rem;
		}

		.plate-mark.long {
			--glyph-size: 0.875rem;
		}

		.plate-mark {
			padding-inline: 0.25rem;
			padding-bottom: 1.75rem;
		}

		.plate-mark::after {
			left: 0.75rem;
			right: 0.75rem;
			bottom: 0.875rem;
		}
	}
</style>
