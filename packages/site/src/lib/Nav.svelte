<script lang="ts">
import type { Snippet } from "svelte";
import { page } from "$app/state";

/** tools drawn between the home link and the site links */
let { children }: { children?: Snippet } = $props();

const links = [
	["/docs", "docs"],
	["/atlas", "atlas"],
	["/playground", "playground"],
	["/stream", "stream"],
	["https://github.com/pngwn/mdsvex", "github"],
];

/** the section of the site a link leads to, lit while the page is in it */
const current = (href: string) =>
	page.url.pathname === href || page.url.pathname.startsWith(`${href}/`) ? "page" : undefined;
</script>

<nav class="site" aria-label="Site">
	<a class="home" href="/" aria-current={page.url.pathname === "/" ? "page" : undefined}>mdsvex</a>
	{#if children}<div class="tools">{@render children()}</div>{/if}
	<ul>
		{#each links as [href, title] (href)}
			<li><a {href} aria-current={current(href)}>{title}</a></li>
		{/each}
	</ul>
</nav>

<style>
	.site {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem clamp(0.5rem, 3vw, 1.5rem);
	}

	ul {
		display: flex;
		gap: clamp(0.5rem, 3vw, 1.25rem);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		color: var(--quiet);
		text-decoration: none;
	}

	a:hover,
	a[aria-current="page"] {
		color: var(--ink);
	}

	a[aria-current="page"] {
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	.home {
		color: var(--ink);
		font-weight: 700;
	}

	.home[aria-current="page"] {
		text-decoration: none;
	}

	.tools {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.75rem;
	}

	/* on a narrow screen the tools wrap under the site links */
	@media (max-width: 48rem) {
		.tools {
			order: 1;
			flex-basis: 100%;
		}
	}
</style>
