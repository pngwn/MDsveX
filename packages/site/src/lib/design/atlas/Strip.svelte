<script lang="ts">
	// the strip at the foot of the first screen, v7's index of every mark: each
	// family a phrase over its marks, a notehead where it opens and a bar where
	// it closes, its name over the line. Each mark is in its construct's colour
	// and links to its plate
	import { tone } from '../score/kinds';
	import { constructs, FAMILIES } from './constructs';

	const groups = FAMILIES.map((f) => ({ ...f, items: constructs.filter((c) => c.family === f.id) }));
</script>

<ul class="strip" aria-label="Every construct">
	{#each groups as group (group.id)}
		{#each group.items as c, i (c.id)}
			<li data-family={group.id} class:first={i === 0} class:last={i === group.items.length - 1}>
				{#if i === 0}<em class="voice" aria-hidden="true">{group.name.toLowerCase()}</em>{/if}
				<a href="#{c.id}" title={c.name} style:--c-line="var(--line-{tone(c.kinds[0])})" style:--c-name="var(--name-{tone(c.kinds[0])})"
					><span aria-hidden="true">{c.glyph}</span><span class="sr">{c.name}</span></a
				>
			</li>
		{/each}
	{/each}
</ul>

<style>
	.strip {
		display: flex;
		flex-wrap: wrap;
		row-gap: 1.6rem;
		margin: 0;
		padding: 1.3rem 0 0;
		list-style: none;
	}

	li {
		position: relative;
		padding: 0.2rem 0.5rem 0 0;
		border-top: 1.5px solid var(--v);
		color: var(--v);
	}

	li[data-family='block'] {
		--v: var(--voice-blue);
	}
	li[data-family='inline'] {
		--v: var(--voice-rose);
	}
	li[data-family='svelte'] {
		--v: var(--voice-orange);
	}
	li[data-family='directive'] {
		--v: var(--voice-green);
	}
	li[data-family='document'] {
		--v: var(--ink);
	}

	/* the gap after the last mark is the family's, so the next phrase starts clear */
	li.last {
		padding-right: 0;
		margin-right: 0.9rem;
	}

	li.first::before {
		content: '';
		position: absolute;
		left: -0.22rem;
		top: -0.28rem;
		width: 0.5rem;
		height: 0.4rem;
		border-radius: 50%;
		background: currentColor;
		rotate: -20deg;
	}

	li.last::after {
		content: '';
		position: absolute;
		right: -1px;
		top: -0.35rem;
		height: 0.7rem;
		border-right: 1.5px solid currentColor;
	}

	.voice {
		position: absolute;
		left: 0.3rem;
		bottom: calc(100% + 0.15rem);
		font: italic 400 0.875rem / 1 var(--face-display);
		white-space: nowrap;
	}

	a {
		display: block;
		padding: 0.1rem 0.15rem;
		font: 400 clamp(1.125rem, 1.8vw, 1.5rem) / 1.1 var(--face-mono);
		font-variant-ligatures: none;
		letter-spacing: 0.04em;
		white-space: nowrap;
		color: var(--c-name);
		text-decoration: none;
	}

	a:hover {
		background: color-mix(in srgb, var(--c-line) 13%, transparent);
	}

	a:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 3px;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
