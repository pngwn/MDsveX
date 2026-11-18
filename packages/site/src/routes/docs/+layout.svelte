<script>
import { afterNavigate } from "$app/navigation";
import { page } from "$app/state";
import { provide_reading } from "$lib/docs/reading.svelte";
import { nav, pages } from "./nav.js";

let { children } = $props();
let drawer = $state();
let sidebar = $state();

afterNavigate(({ from, to }) => {
	if (drawer?.open && from?.url?.pathname !== to?.url?.pathname) {
		drawer.open = false;
		if (!to?.url.hash) {
			const heading = document.querySelector("#docs-article h1");
			heading?.setAttribute("tabindex", "-1");
			heading?.focus({ preventScroll: true });
		}
	}
	const active = sidebar?.querySelector('[aria-current="page"]');
	if (active && sidebar.clientHeight) {
		const offset = active.getBoundingClientRect().top - sidebar.getBoundingClientRect().top;
		if (offset < 0 || offset + active.offsetHeight > sidebar.clientHeight)
			sidebar.scrollTop += offset - sidebar.clientHeight / 2;
	}
});

const current = $derived(pages.find((p) => p.href === page.url.pathname));
const section = $derived(nav.find((s) => s.key === current?.section));

const reading = provide_reading(page.url.pathname.split("/")[2] || "learn");
$effect(() => {
	if (current) reading.enter(current.section);
});
</script>

<svelte:head>
	<title>{current ? `${current.title} · mdsvex docs` : "mdsvex docs"}</title>
</svelte:head>

{#snippet contents()}
	{#each nav as s (s.key)}
		<h2>{s.title}</h2>
		{#each s.groups as group (group.title)}
			{#if group.title}
				<h3>{group.title}</h3>
			{/if}
			<ul>
				{#each group.pages as p (p.href)}
					<li>
						<a href={p.href} aria-current={p === current ? "page" : undefined}>{p.title}</a>
					</li>
				{/each}
			</ul>
		{/each}
	{/each}
{/snippet}

{#if page.url.pathname === "/docs"}
	{@render children()}
{:else}
	<div class="docs">
		<!-- a column beside the page, and on a phone a list to open over it -->
		<nav bind:this={sidebar} class="side" aria-label="Docs">
			<a class="index" href="/docs">All docs</a>
			{@render contents()}
		</nav>

		<details bind:this={drawer} class="drawer">
			<summary>
				<span class="where">{section?.title ?? "Docs"}</span>
				<span class="what">{current?.title ?? ""}</span>
			</summary>
			<nav aria-label="Docs">
				<a class="index" href="/docs">All docs</a>
				{@render contents()}
			</nav>
		</details>

		<div class="page" id="docs-article" tabindex="-1">
			{#key page.url.pathname}
				<article class="prose">
					{@render children()}
				</article>
			{/key}
		</div>
	</div>
{/if}

<style>
	.docs {
		--column: 13rem;
		display: grid;
		grid-template-columns: var(--column) minmax(0, 1fr);
		column-gap: clamp(2.5rem, 5vw, 5rem);
		padding-top: clamp(1.5rem, 4vw, 3.5rem);
		/* the page runs out to the page's gutter on a screen wider than the
		   frame's measure, so its plates keep growing; the nav stays under the
		   site's own. main is the measure, centred, and a percentage margin is of
		   its width: this is how far main's edge sits in from the gutter */
		margin-right: min(0px, calc(50% - 50vw + var(--gutter)));
	}

	.page {
		min-width: 0;
	}

	/* the nav is meta, in the mono; SCORE.md: one mono for labels */
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
		/* a mono label, not the linen texture.css gives headings */
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

	nav a[aria-current="page"] {
		color: var(--ink);
		font-weight: 700;
	}

	.index {
		color: var(--ink);
	}

	.drawer {
		display: none;
	}

	/* a phone: the column goes, its list opens from a line above the page */
	@media (max-width: 63rem) {
		.docs {
			grid-template-columns: minmax(0, 1fr);
			padding-top: 0.5rem;
		}

		.side {
			display: none;
		}

		.drawer {
			display: block;
			margin-bottom: 1.5rem;
			border-block: 1px solid var(--staff);
			font: 400 0.8125rem / 1.45 var(--face-mono);
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
			content: "+";
			margin-left: auto;
			color: var(--quiet);
		}

		.drawer[open] summary::after {
			content: "−";
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
		}

		.drawer nav h2:first-of-type {
			margin-top: 1rem;
		}
	}
</style>
