<script lang="ts">
	// a difference from CommonMark as a small plate: the mark, what you write,
	// the source, and the two readings side by side, each with what it renders as
	// and the html under it. The source's score rules the characters that decide
	import ContrastSource from '../ContrastSource.svelte';
	import Witness from '../Witness.svelte';
	import type { BuiltContrast } from '../types';

	interface Props {
		contrast: BuiltContrast;
		palette?: 'riso' | 'cvd';
	}

	let { contrast: c, palette = 'riso' }: Props = $props();
</script>

<article class="contrast" id={c.id} style:--own-line="var(--line-{c.tone})" style:--own-name="var(--name-{c.tone})" aria-labelledby="{c.id}-title">
	<header class="head">
		<div class="mark" aria-hidden="true"><span class="glyph" class:long={c.mark.length > 3}>{c.mark}</span></div>
		<h3 id="{c.id}-title"><a href="#{c.id}">{@html c.write}</a></h3>
	</header>

	<div class="src">
		<ContrastSource contrast={c} {palette} />
	</div>

	<div class="readings">
		<section aria-label={c.gfm ? 'In GFM' : 'In CommonMark'}>
			<p class="who riso">{c.gfm ? 'GFM' : 'CommonMark'}</p>
			<p class="said">{@html c.commonmark}</p>
			<Witness reading={c.commonmark_reading} label="CommonMark" />
		</section>
		<section aria-label="In mdsvex">
			<p class="who riso">mdsvex</p>
			<p class="said">{@html c.mdsvex}</p>
			<Witness reading={c.mdsvex_reading} label="mdsvex" />
		</section>
	</div>

	{#if c.fix}<p class="fix">{@html c.fix}</p>{/if}
</article>

<style>
	.contrast {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ink);
		background: var(--paper);
		scroll-margin-top: 1.5rem;
	}

	.head {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr);
		border-bottom: 1px solid var(--ink);
	}

	.mark {
		position: relative;
		display: grid;
		place-items: center;
		border-right: 1px solid var(--ink);
		padding: 0.875rem 0.25rem 1.5rem;
	}

	.mark::after {
		content: '';
		position: absolute;
		left: 0.75rem;
		right: 0.75rem;
		bottom: 0.75rem;
		height: 0.3rem;
		background: var(--own-line);
	}

	.glyph {
		font: 400 1.375rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		white-space: nowrap;
	}

	.glyph.long {
		font-size: 0.875rem;
	}

	h3 {
		align-self: center;
		margin: 0;
		padding: 0.875rem 1.25rem;
		font: 400 1.3125rem / 1.2 var(--face-display);
		text-wrap: balance;
	}

	h3 a {
		color: inherit;
		text-decoration: none;
	}

	h3 :global(code) {
		font-size: 0.82em;
		color: var(--own-name);
	}

	.src {
		padding: 0.875rem 1.25rem 1rem;
		border-bottom: 1px solid var(--ink);
	}

	.readings {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		flex: 1;
	}

	.readings section {
		display: grid;
		align-content: start;
		gap: 0.5rem;
		padding: 0.875rem 1.25rem 1rem;
		min-width: 0;
	}

	.readings section + section {
		border-left: 1px solid var(--ink);
	}

	@container (max-width: 26rem) {
		.readings {
			grid-template-columns: minmax(0, 1fr);
		}

		.readings section + section {
			border-left: 0;
			border-top: 1px solid var(--staff);
		}
	}

	.who {
		margin: 0;
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--quiet);
	}

	.said {
		margin: 0;
		font: italic 400 1rem / 1.35 var(--face-text);
	}

	.fix {
		margin: 0;
		padding: 0.625rem 1.25rem 0.75rem;
		border-top: 1px solid var(--ink);
		font-size: 0.9375rem;
	}

	.fix::before {
		content: '→ ';
		color: var(--own-name);
	}
</style>
