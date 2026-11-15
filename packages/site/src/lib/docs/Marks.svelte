<script lang="ts">
	// `::marks`, the strip of a page's marks, drawn as the atlas's index
	// (atlas/Index.svelte): each section a phrase head, a hairline cell per plate
	// in its colour, and a readout of the one under the pointer. Every cell jumps
	// to its plate. The plates are the page's own: the docs plugin leaves each
	// one's mark and title as plugin data (build/examples.js), which the compiled
	// page puts in context for its components
	import { getContext } from 'svelte';

	interface Mark {
		id: string;
		mark: string;
		tone: string;
		title: string;
		section: string;
	}

	const data = getContext<{ current?: { docs?: { plates?: Mark[] } } } | undefined>(Symbol.for('mdsvex.plugin_data'));
	const marks = (data?.current?.docs?.plates ?? []).map((m) => ({ ...m, name: m.title }));

	let hovered = $state<(typeof marks)[number] | null>(null);

	// the marks under the section each is in, in the page's order
	const groups = marks.reduce<{ section: string; items: typeof marks }[]>((out, m) => {
		const last = out[out.length - 1];
		if (last?.section === m.section) last.items.push(m);
		else out.push({ section: m.section, items: [m] });
		return out;
	}, []);
</script>

{#if marks.length}
<nav class="marks wide" aria-label="On this page">
	<div class="groups">
		{#each groups as g (g.section)}
			<div class="group">
				<p class="group-head"><em>{g.section.toLowerCase()}</em> <span class="count">{g.items.length}</span></p>
				<ul class="cells">
					{#each g.items as m (m.id)}
						<li>
							<a
								class="cell"
								href="#{m.id}"
								style:--c-line="var(--line-{m.tone})"
								style:--c-name="var(--name-{m.tone})"
								onpointerenter={() => (hovered = m)}
								onpointerleave={() => (hovered = null)}
								onfocus={() => (hovered = m)}
								onblur={() => (hovered = null)}
							>
								<span class="glyph" class:long={m.mark.length > 3} aria-hidden="true">{m.mark}</span>
								<span class="sr">{m.name}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
	<p class="readout riso" aria-hidden="true">
		{#if hovered}<span class="r-mark" style:color="var(--name-{hovered.tone})">{hovered.mark}</span> {hovered.name}{:else}&nbsp;{/if}
	</p>
</nav>
{/if}

<style>
	.marks {
		display: grid;
		gap: 0.5rem;
		margin: 2rem 0 2.5rem;
		font: 400 0.8125rem / 1.4 var(--face-mono);
	}

	.groups {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 1.5rem;
	}

	/* a section's head is a phrase: its name over its line, a bar at each end */
	.group-head {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0 0 0.5rem;
		padding: 0 0 0.3rem 0.4rem;
		border-bottom: 1.5px solid var(--ink);
	}

	.group-head::before,
	.group-head::after {
		content: '';
		position: absolute;
		bottom: -0.35rem;
		height: 0.7rem;
		border-left: 1.5px solid var(--ink);
	}

	.group-head::before {
		left: 0;
	}

	.group-head::after {
		right: 0;
	}

	.group-head em {
		font: italic 400 0.9375rem / 1 var(--face-display);
	}

	.count {
		font-size: 0.6875rem;
		color: var(--quiet);
	}

	.cells {
		display: flex;
		flex-wrap: wrap;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.cells li {
		margin: 0 -1px -1px 0;
	}

	.cell {
		position: relative;
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		border: 1px solid var(--ink);
		color: var(--c-name);
		text-decoration: none;
		background: var(--paper);
	}

	.cell::after {
		content: '';
		position: absolute;
		left: 0.6rem;
		right: 0.6rem;
		bottom: 0.4rem;
		height: 0.2rem;
		background: var(--c-line);
	}

	.cell:hover,
	.cell:focus-visible {
		z-index: 1;
		outline: 1.5px solid var(--ink);
		outline-offset: -1px;
		background: color-mix(in srgb, var(--c-line) 13%, var(--paper));
	}

	.glyph {
		font-size: 1.125rem;
		font-variant-ligatures: none;
		translate: 0 -0.15rem;
		white-space: nowrap;
	}

	.glyph.long {
		font-size: 0.6875rem;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.readout {
		min-height: 1.4em;
		margin: 0;
		color: var(--quiet);
	}

	.r-mark {
		margin-right: 0.5rem;
	}

	@media (max-width: 600px) {
		.cell {
			width: 2.75rem;
			height: 2.75rem;
		}
	}
</style>
