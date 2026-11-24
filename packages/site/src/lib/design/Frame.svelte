<script lang="ts">
	// the page frame every 1.0 page sits in: paper, the faces, the texture, a slot
	// for the nav and a footer, in light or dark. The root layout puts every page
	// in it but the playground and the stream lab, which own the viewport.
	//
	// Dark is a proposal: SCORE.md gives no dark palette, so tokens.css carries one
	// made by SCORE.md's own contrast rule. `auto` follows the visitor's setting
	import type { Snippet } from 'svelte';
	import { google_fonts } from './fonts';
	import { RAG, RAG_SCALE, texture_style } from './texture';
	import './tokens.css';
	import './base.css';
	import './type.css';
	import './texture.css';
	// the class rules for highlighted code; code.css gives them the score's colours
	import '@twinkleplop/theme-ayu/light';
	import './code.css';
	import './prose.css';

	interface Props {
		children: Snippet;
		/** the site's nav, at the top of the page */
		nav?: Snippet;
		/** the foot of the page, after a rule; a plain colophon if not given */
		footer?: Snippet;
		theme?: 'auto' | 'light' | 'dark';
	}

	let { children, nav, footer, theme = 'auto' }: Props = $props();
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="stylesheet" href={google_fonts} />
</svelte:head>

<div class="design-frame" data-theme={theme} style={texture_style}>
	{#if nav}
		<header class="nav">{@render nav()}</header>
	{/if}

	<main>{@render children()}</main>

	<footer>
		<div>
			{#if footer}
				{@render footer()}
			{:else}
				<p class="colophon">mdsvex, markdown with Svelte in it. MIT licence.</p>
			{/if}
		</div>
	</footer>

	<!-- the ragged edge for display Playfair, texture.css's .rag -->
	<svg class="defs" aria-hidden="true">
		<filter id={RAG} x="-5%" y="-5%" width="110%" height="110%">
			<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="4" result="noise" />
			<feDisplacementMap in="SourceAlpha" in2="noise" scale={RAG_SCALE} xChannelSelector="R" yChannelSelector="G" result="edge" />
			<feComposite in="SourceGraphic" in2="edge" operator="in" />
		</filter>
	</svg>
</div>

<style>
	.design-frame {
		--gutter: clamp(1rem, 4vw, 3.5rem);
		--measure: 92rem;

		color-scheme: light dark;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		min-height: 100svh;
		padding: 0 var(--gutter);
		color: var(--ink);
		background: var(--paper);
		font: 400 1.0625rem / 1.55 var(--face-text);
		font-optical-sizing: auto;
		overflow-x: clip;
	}

	.design-frame[data-theme='light'] {
		color-scheme: light;
	}

	.design-frame[data-theme='dark'] {
		color-scheme: dark;
	}

	.design-frame :global(*),
	.design-frame :global(*::before),
	.design-frame :global(*::after) {
		box-sizing: inherit;
	}

	.nav,
	main,
	footer {
		width: 100%;
		max-width: var(--measure);
		margin: 0 auto;
	}

	/* meta is in the mono, SCORE.md: one mono for source, code and labels */
	.nav {
		padding: 1.25rem 0;
		font: 400 0.8125rem / 1.4 var(--face-mono);
	}

	main {
		flex: 1;
	}

	footer {
		margin-top: clamp(4rem, 9vw, 7rem);
		padding: 1.5rem 0 3rem;
		border-top: 1.5px solid var(--ink);
		font: 400 0.8125rem / 1.5 var(--face-mono);
		color: var(--quiet);
	}

	.colophon {
		margin: 0;
	}

	.defs {
		position: absolute;
		width: 0;
		height: 0;
	}
</style>
