<script>
import { afterNavigate } from "$app/navigation";
import { page } from "$app/state";
import Frame from "$lib/design/Frame.svelte";
import { provide_theme } from "$lib/design/theme.svelte";

let { children } = $props();

// prerendered pages can't read the query, so ?theme is read once in the browser
const theme = provide_theme();
afterNavigate(({ to }) => to && theme.from(to.url));

const links = [
	["/docs", "docs"],
	["/playground", "playground"],
	["https://github.com/pngwn/mdsvex", "github"],
];

/** the section of the site a link leads to, lit while the page is in it */
const current = (href) =>
	page.url.pathname === href || page.url.pathname.startsWith(`${href}/`) ? "page" : undefined;
</script>

<!-- the playground owns the viewport, as an editor does, and has its own bar -->
{#if page.route.id?.startsWith("/playground")}
	{@render children()}
{:else}
	<Frame theme={theme.value}>
		{#snippet nav()}
			<nav class="site" aria-label="Site">
				<a class="home" href="/" aria-current={page.url.pathname === "/" ? "page" : undefined}>mdsvex</a>
				<ul>
					{#each links as [href, title]}
						<li><a {href} aria-current={current(href)}>{title}</a></li>
					{/each}
				</ul>
			</nav>
		{/snippet}

		{@render children()}
	</Frame>
{/if}

<style>
	.site {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1.5rem;
	}

	ul {
		display: flex;
		gap: 1.25rem;
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
</style>
