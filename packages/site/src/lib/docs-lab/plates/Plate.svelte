<script lang="ts">
	// a concept as an atlas plate (lib/design/atlas/Entry.svelte): the mark and
	// the title over a hairline, the pair as the hero, then the notes and the
	// edges side by side. The page's prose is the plate's: its lede in the head,
	// what follows the example in the notes
	import Pair from '../Pair.svelte';
	import type { BuiltUnit } from '../types';

	interface Props {
		unit: BuiltUnit;
		/** where it sits: its section, and its place in the page */
		section: string;
		n: number;
		of: number;
		palette?: 'riso' | 'cvd';
		perch?: boolean;
	}

	let { unit: u, section, n, of, palette = 'riso', perch = false }: Props = $props();

	const has_notes = $derived(!!(u.body || u.see || u.commonmark));
	const has_edges = $derived(!!(u.edges?.length || u.error));
	// a mark longer than three cells is set smaller, so it sits in its cell
	const long_mark = $derived(u.mark.length > 3);
</script>

<article class="plate" id={u.id} style:--own-line="var(--line-{u.tone})" style:--own-name="var(--name-{u.tone})" aria-labelledby="{u.id}-title">
	<header class="head">
		<div class="mark" aria-hidden="true"><span class="glyph" class:long={long_mark}>{u.mark}</span></div>
		<div class="title">
			<p class="kicker">
				<em>{section.toLowerCase()}</em>
				<span class="count">{String(n).padStart(2, '0')} / {String(of).padStart(2, '0')}</span>
			</p>
			<h3 id="{u.id}-title"><a href="#{u.id}">{@html u.title}</a></h3>
			{#if u.lede}<div class="lede">{@html u.lede}</div>{/if}
		</div>
	</header>

	{#if u.example || u.code}
		<div class="figure">
			{#if u.code}
				<div class="given" class:alone={!u.example}>
					<p class="label riso">{u.example ? 'Given' : 'You write'}</p>
					{#each u.code as c, i (i)}{@html c.html}{/each}
				</div>
			{/if}
			{#if u.example}
				<Pair example={u.example} {palette} {perch} name={u.id.replace(/-/g, ' ')} />
			{/if}
		</div>
	{/if}

	{#if has_notes || has_edges}
		<div class="notes" class:single={!has_notes || !has_edges}>
			{#if has_notes}
				<section aria-label="Notes">
					<h4>Notes</h4>
					{#if u.body}<div class="body">{@html u.body}</div>{/if}
					{#if u.commonmark}<p><span class="against">Against CommonMark.</span> {@html u.commonmark}</p>{/if}
					{#if u.see}<p class="see"><span class="label">See also</span> {@html u.see}</p>{/if}
				</section>
			{/if}
			{#if has_edges}
				<section aria-label="Edges">
					<h4>Edges</h4>
					{#if u.edges?.length}
						<ul>
							{#each u.edges as edge, i (i)}<li>{@html edge}</li>{/each}
						</ul>
					{/if}
					{#if u.error}
						<div class="error-pair">
							<div class="err-src">{@html u.error.source_html}</div>
							<p class="err riso"><span>Error</span> {u.error.error}</p>
						</div>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</article>

<style>
	/* the atlas's sheet: one hairline box, its parts parted by hairlines */
	.plate {
		container-type: inline-size;
		border: 1px solid var(--ink);
		background: var(--paper);
		scroll-margin-top: 1.5rem;
	}

	.head {
		display: grid;
		grid-template-columns: 7.5rem minmax(0, 1fr);
		border-bottom: 1px solid var(--ink);
	}

	.mark {
		position: relative;
		display: grid;
		place-items: center;
		border-right: 1px solid var(--ink);
		padding: 1.5rem 0.5rem 2rem;
	}

	/* a short bar of the construct's colour under the mark, the atlas's swatch */
	.mark::after {
		content: '';
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		height: 0.375rem;
		background: var(--own-line);
	}

	.glyph {
		font: 400 2rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		white-space: nowrap;
	}

	.glyph.long {
		font-size: 1.25rem;
	}

	.title {
		padding: 1.5rem clamp(1rem, 3cqi, 2.25rem);
		min-width: 0;
	}

	.kicker {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		margin: 0 0 0.25rem;
	}

	.kicker em {
		font: italic 400 0.9375rem / 1 var(--face-display);
		color: var(--own-name);
	}

	.count {
		font: 400 0.75rem / 1.3 var(--face-mono);
		color: var(--quiet);
	}

	h3 {
		margin: 0;
		font: 400 clamp(1.75rem, 5cqi, 2.75rem) / 1.06 var(--face-display);
		letter-spacing: -0.01em;
		text-wrap: balance;
	}

	h3 a {
		color: inherit;
		text-decoration: none;
	}

	h3 a:hover {
		text-decoration: underline 1.5px;
		text-decoration-color: var(--own-line);
		text-underline-offset: 0.12em;
	}

	h3 :global(code) {
		font-size: 0.78em;
		color: var(--own-name);
	}

	.lede {
		max-width: 56ch;
		margin: 0.75rem 0 0;
	}

	.lede :global(:is(p, ol, ul)) {
		margin: 0 0 0.5rem;
	}

	.lede :global(:last-child) {
		margin-bottom: 0;
	}

	.lede :global(:is(ol, ul)) {
		padding-left: 1.4rem;
	}

	.lede :global(li) {
		margin: 0.25rem 0;
	}

	.lede :global(li::marker) {
		color: var(--own-name);
		font-family: var(--face-mono);
		font-size: 0.875em;
	}

	.figure {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
		padding: 1.5rem clamp(1rem, 3cqi, 2.25rem) 1.75rem;
		border-bottom: 1px solid var(--ink);
	}

	.figure:last-child {
		border-bottom: 0;
	}

	/* the plate runs the page's width; the room goes to what you write, where a
	   score wraps by systems, and what you get keeps the rest */
	@container (min-width: 50rem) {
		.figure :global(.pair.side) {
			grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
			column-gap: clamp(2rem, 3cqi, 3.5rem);
		}
	}

	.label {
		margin: 0 0 0.5rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	.given :global(pre) {
		margin: 0 0 0.75rem;
	}

	.given :global(pre:last-child) {
		margin-bottom: 0;
	}

	.notes {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}

	@container (min-width: 40rem) {
		.notes:not(.single) {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.notes:not(.single) section + section {
			border-left: 1px solid var(--ink);
		}
	}

	@container (max-width: 40rem) {
		.notes section + section {
			border-top: 1px solid var(--staff);
		}
	}

	.notes section {
		padding: 1.25rem clamp(1rem, 3cqi, 2.25rem) 1.5rem;
		min-width: 0;
		font-size: 1rem;
	}

	/* the notes are prose, at a reading measure however wide the plate */
	.notes section > * {
		max-width: 62ch;
	}

	h4 {
		margin: 0 0 0.5rem;
		font: italic 400 1rem / 1.2 var(--face-display);
	}

	.notes :global(p),
	.body :global(p) {
		margin: 0 0 0.5rem;
	}

	.notes ul {
		margin: 0;
		padding-left: 1.1em;
		display: grid;
		gap: 0.375rem;
	}

	.notes li::marker {
		color: var(--own-line);
	}

	.against {
		font-style: italic;
	}

	/* a sentence, so it flows as one: the label set before it like a kicker */
	.see .label {
		display: inline;
		margin: 0 0.5rem 0 0;
	}

	.error-pair {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.875rem;
	}

	.err-src :global(pre) {
		margin: 0;
		font-size: 0.8125rem;
	}

	.err {
		margin: 0;
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--line-item);
		font: 400 0.75rem / 1.55 var(--face-mono);
		font-variant-ligatures: none;
		overflow-wrap: anywhere;
	}

	.err span {
		color: var(--name-item);
	}

	@container (max-width: 30rem) {
		.head {
			grid-template-columns: 4.5rem minmax(0, 1fr);
		}

		.glyph {
			font-size: 1.375rem;
		}

		.glyph.long {
			font-size: 0.875rem;
		}

		.mark {
			padding: 1rem 0.25rem 1.75rem;
		}

		.mark::after {
			left: 0.75rem;
			right: 0.75rem;
			bottom: 0.875rem;
		}
	}
</style>
