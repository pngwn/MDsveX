<script lang="ts">
	// the index, round one's grid of marks in the score (v7): each family under a
	// phrase of its own, a hairline cell per construct in its colour, and a
	// readout of the one under the pointer or on screen. Every cell is a link to
	// its plate, so the grid is the page's contents. On a phone it is one row
	// pinned over the plates
	import { tone } from '../score/kinds';
	import { by_id, constructs, FAMILIES } from './constructs';

	interface Props {
		/** the plate on screen */
		current: string;
	}

	let { current }: Props = $props();

	let hovered = $state<string | null>(null);
	let strip: HTMLElement | undefined = $state();

	const groups = FAMILIES.map((f) => ({ ...f, items: constructs.filter((c) => c.family === f.id) }));
	const shown = $derived(by_id.get(hovered ?? current) ?? constructs[0]);

	// on a phone the row scrolls, so the current cell is kept in view
	$effect(() => {
		const cell = strip?.querySelector<HTMLElement>(`[data-id="${current}"]`);
		if (!strip || !cell || strip.scrollWidth <= strip.clientWidth) return;
		const left = cell.offsetLeft - strip.clientWidth / 2 + cell.offsetWidth / 2;
		const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		strip.scrollTo({ left, behavior: still ? 'auto' : 'smooth' });
	});
</script>

<nav class="index" aria-label="Constructs">
	<div class="groups" bind:this={strip}>
		{#each groups as group (group.id)}
			<div class="group" data-family={group.id}>
				<p class="group-head">
					<em class="group-name">{group.name.toLowerCase()}</em>
					<span class="count">{group.items.length}</span>
				</p>
				<ul class="cells">
					{#each group.items as c (c.id)}
						<li>
							<a
								class="cell"
								href="#{c.id}"
								data-id={c.id}
								aria-current={c.id === current ? 'location' : undefined}
								style:--c-line="var(--line-{tone(c.kinds[0])})"
								style:--c-name="var(--name-{tone(c.kinds[0])})"
								onpointerenter={() => (hovered = c.id)}
								onpointerleave={() => (hovered = null)}
								onfocus={() => (hovered = c.id)}
								onblur={() => (hovered = null)}
							>
								<span class="glyph" aria-hidden="true">{c.glyph}</span>
								<span class="sr">{c.name}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>

	<dl class="readout" aria-hidden="true" style:--c-name="var(--name-{tone(shown.kinds[0])})">
		<div><dt>Construct</dt><dd class="readout-name">{shown.name}</dd></div>
		<div><dt>Family</dt><dd>{shown.family}</dd></div>
		<div><dt>Parses to</dt><dd class="mono">{shown.kinds.join(', ')}</dd></div>
	</dl>
</nav>

<style>
	.index {
		display: grid;
		gap: 1.5rem;
		font: 400 0.8125rem / 1.4 var(--face-mono);
	}

	.groups {
		display: grid;
		gap: 1.125rem;
	}

	/* a family's head is a phrase: its name over its line, a bar at each end */
	.group-head {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0 0 0.5rem;
		padding: 0 0 0.3rem 0.4rem;
		border-bottom: 1.5px solid var(--v);
	}

	.group-head::before,
	.group-head::after {
		content: '';
		position: absolute;
		bottom: -0.35rem;
		height: 0.7rem;
		border-left: 1.5px solid var(--v);
	}

	.group-head::before {
		left: 0;
	}

	.group-head::after {
		right: 0;
	}

	.group[data-family='block'] {
		--v: var(--voice-blue);
	}
	.group[data-family='inline'] {
		--v: var(--voice-rose);
	}
	.group[data-family='svelte'] {
		--v: var(--voice-orange);
	}
	.group[data-family='directive'] {
		--v: var(--voice-green);
	}
	.group[data-family='document'] {
		--v: var(--ink);
	}

	.group-name {
		font: italic 400 0.875rem / 1 var(--face-display);
		color: var(--v);
	}

	.count {
		color: var(--quiet);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	.cells {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(3.75rem, 1fr));
		margin: 0;
		padding: 0 1px 1px 0;
		list-style: none;
	}

	/* each cell draws its top and left inside and its right and bottom outside,
	   so neighbours share one hairline and short rows end clean */
	.cell {
		position: relative;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		box-shadow:
			inset 1px 1px 0 var(--ink),
			1px 1px 0 var(--ink);
		color: var(--c-name);
		text-decoration: none;
	}

	.cell:hover {
		background: color-mix(in srgb, var(--c-line) 13%, transparent);
	}

	/* the plate on screen: its cell washed, and a phrase under its mark */
	.cell[aria-current] {
		background: color-mix(in srgb, var(--c-line) 13%, transparent);
	}

	.cell[aria-current]::after {
		content: '';
		position: absolute;
		left: 18%;
		right: 18%;
		bottom: 22%;
		height: 0.55rem;
		border-left: 1.5px solid var(--c-line);
		border-right: 1.5px solid var(--c-line);
		background: linear-gradient(var(--c-line), var(--c-line)) center / 100% 1.5px no-repeat;
	}

	.cell:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: -5px;
		z-index: 1;
	}

	.glyph {
		font: 400 1.0625rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		white-space: nowrap;
	}

	.readout {
		display: grid;
		gap: 0.25rem;
		margin: 0;
	}

	.readout div {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
	}

	.readout dt {
		color: var(--quiet);
	}

	.readout dd {
		margin: 0;
	}

	.readout-name {
		font: italic 400 1rem / 1.2 var(--face-display);
		color: var(--c-name);
	}

	.mono {
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* a phone: one row of every mark, pinned over the plates, the families still headed */
	@media (max-width: 60rem) {
		.groups {
			display: flex;
			gap: 0.75rem;
			overflow-x: auto;
			scrollbar-width: none;
			padding-bottom: 0.5rem;
		}

		.group {
			flex: none;
		}

		.cells {
			display: flex;
		}

		.cell {
			width: 2.75rem;
		}

		.glyph {
			font-size: 0.875rem;
		}

		.readout {
			display: none;
		}
	}
</style>
