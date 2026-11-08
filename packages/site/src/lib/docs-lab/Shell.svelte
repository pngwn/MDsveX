<script lang="ts">
	// a lab page in the docs: the real docs nav, lit at the page it stands for,
	// as routes/docs/+layout.svelte draws it. A column beside the page, or with
	// `nav="top"` a line over it, for a direction that needs the width; on a
	// phone always a list to open over the page. The line bird perches on the
	// page's last score
	import type { Snippet } from 'svelte';
	import Perch from '$lib/design/penguin/Perch.svelte';
	import { nav as sections } from '../../routes/docs/nav.js';
	import './lab.css';

	interface Props {
		/** the real page this lab page stands for */
		current: string;
		nav?: 'side' | 'top';
		/** which direction this is, said over the page */
		direction: string;
		/**
		 * run the page's right edge out to the page's gutter on a screen wider
		 * than the frame's measure, so its plates keep growing; the nav stays
		 * where the frame puts it, under the site's own
		 */
		bleed?: boolean;
		children: Snippet;
	}

	let { current, nav = 'side', direction, bleed = false, children }: Props = $props();

	const here = $derived(
		sections.flatMap((s) => s.groups.flatMap((g) => g.pages.map((p) => ({ ...p, section_title: s.title })))).find((p) => p.href === current),
	);
</script>

{#snippet contents()}
	{#each sections as s (s.key)}
		<h2>{s.title}</h2>
		{#each s.groups as group}
			{#if group.title}<h3>{group.title}</h3>{/if}
			<ul>
				{#each group.pages as p (p.href)}
					<li><a href={p.href} aria-current={p.href === current ? 'page' : undefined}>{p.title}</a></li>
				{/each}
			</ul>
		{/each}
	{/each}
{/snippet}

<p class="lab riso"><a href="/docs-lab">Docs lab</a> <span aria-hidden="true">/</span> {direction}</p>

<div class="docs" class:with-side={nav === 'side'} class:with-top={nav === 'top'} class:bleed>
	{#if nav === 'side'}
		<nav class="side riso" aria-label="Docs">
			<a class="index" href="/docs">All docs</a>
			{@render contents()}
		</nav>
	{/if}

	<details class="drawer riso">
		<summary>
			<span class="where">{here?.section_title ?? 'Docs'}</span>
			<span class="what">{here?.title ?? ''}</span>
		</summary>
		<nav aria-label="Docs">
			<a class="index" href="/docs">All docs</a>
			{@render contents()}
		</nav>
	</details>

	<Perch>
		<div class="page lab-page">{@render children()}</div>
	</Perch>
</div>

<style>
	.lab {
		margin: 0.75rem 0 0;
		font: 400 0.75rem / 1.4 var(--face-mono);
		color: var(--quiet);
		letter-spacing: 0.04em;
	}

	.lab a {
		color: var(--quiet);
	}

	.docs {
		--column: 13rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		column-gap: clamp(2.5rem, 5vw, 5rem);
		padding-top: clamp(1rem, 3vw, 2.5rem);
	}

	.docs.with-side {
		grid-template-columns: var(--column) minmax(0, 1fr);
	}

	/* main is the frame's measure, centred; a percentage margin is of main's
	   width, so this is how far main's right edge sits in from the page's
	   gutter, nothing below the measure */
	.docs.bleed {
		margin-right: min(0px, calc(50% - 50vw + var(--gutter)));
	}

	nav {
		font: 400 0.8125rem / 1.45 var(--face-mono);
		font-variant-ligatures: none;
	}

	.side {
		position: sticky;
		top: 1.5rem;
		align-self: start;
		max-height: calc(100svh - 3rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-bottom: 2rem;
		scrollbar-width: thin;
	}

	nav h2 {
		margin: 1.75rem 0 0.5rem;
		mask-image: none;
		font: inherit;
		color: var(--quiet);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	nav h3 {
		margin: 1rem 0 0.35rem;
		mask-image: none;
		font: italic 400 0.8125rem / 1.45 var(--face-mono);
		color: var(--quiet);
	}

	nav ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	nav li {
		margin: 0.2rem 0;
	}

	nav a {
		color: var(--quiet);
		text-decoration: none;
	}

	nav a:hover {
		color: var(--ink);
	}

	nav a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
	}

	.index {
		color: var(--ink);
	}

	.page {
		min-width: 0;
	}

	/* the line over the page: the docs drawer, at every width */
	.drawer {
		display: none;
		margin-bottom: 1.5rem;
		border-block: 1px solid var(--staff);
		font: 400 0.8125rem / 1.45 var(--face-mono);
	}

	.with-top .drawer {
		display: block;
	}

	summary {
		display: flex;
		gap: 0.75rem;
		padding: 0.65rem 0;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::after {
		content: '+';
		margin-left: auto;
		color: var(--quiet);
	}

	.drawer[open] summary::after {
		content: '−';
	}

	.where {
		color: var(--quiet);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.what {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.drawer nav {
		padding-bottom: 1rem;
		columns: 14rem auto;
		column-gap: 2rem;
	}

	.drawer nav h2:first-of-type {
		margin-top: 1rem;
	}

	@media (max-width: 860px) {
		.docs.with-side {
			grid-template-columns: minmax(0, 1fr);
			padding-top: 0.5rem;
		}

		.side {
			display: none;
		}

		.drawer {
			display: block;
		}
	}
</style>
