<script>
import { page } from "$app/state";
import { nav, pages } from "./nav.js";

let { children } = $props();

const current = $derived(pages.find((p) => p.href === page.url.pathname));
</script>

<svelte:head>
	<title>{current ? `${current.title} · mdsvex docs` : "mdsvex docs"}</title>
</svelte:head>

{#if page.url.pathname === "/docs"}
	{@render children()}
{:else}
	<div class="container">
		<nav aria-label="docs">
			<a class="index" href="/docs">docs</a>
			{#each nav as section}
				<h2>{section.title}</h2>
				{#each section.groups as group}
					{#if group.title}
						<h3>{group.title}</h3>
					{/if}
					<ul>
						{#each group.pages as p}
							<li>
								<a href={p.href} aria-current={p === current ? "page" : undefined}>{p.title}</a>
							</li>
						{/each}
					</ul>
				{/each}
			{/each}
			<a class="index" href="/playground">playground</a>
		</nav>

		<article>
			{@render children()}
		</article>
	</div>
{/if}

<style>
	.container {
		display: grid;
		grid-template-columns: 24rem minmax(0, 1fr);
		gap: 4rem;
		margin: 8rem auto 0;
		padding: 0 3rem;
		max-width: 120rem;
	}

	nav {
		position: sticky;
		top: 2rem;
		align-self: start;
		max-height: calc(100vh - 4rem);
		overflow-y: auto;
		font-size: 1.5rem;
	}

	nav h2 {
		margin: 2.5rem 0 0.5rem;
		font-size: 1.4rem;
		text-transform: uppercase;
	}

	nav h3 {
		margin: 1.5rem 0 0.5rem;
		font-size: 1.4rem;
	}

	nav ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	nav li {
		margin: 0.4rem 0;
	}

	nav a {
		border: none;
		color: #777;
	}

	nav a:hover,
	nav a[aria-current="page"] {
		color: #000;
	}

	nav a[aria-current="page"] {
		font-weight: bold;
	}

	.index {
		display: block;
		margin: 2rem 0;
		font-family: "fira-full";
	}

	@media (max-width: 800px) {
		.container {
			grid-template-columns: minmax(0, 1fr);
		}

		nav {
			position: static;
			max-height: none;
		}
	}

	/* the article styles of the one page docs, as they were */

	article :global(h1) {
		margin-bottom: 4.6rem;
		font-family: 'roboto-sub';
		font-weight: 100;
		font-size: 4rem;
	}

	article :global(h2) {
		margin: 5rem 0 3rem 0;
		border-bottom: 1px solid #ccc;
		font-family: 'roboto-bold-full';
	}

	article :global(h3) {
		margin-bottom: 2rem;
		margin-top: 3rem;
		font-family: 'roboto-bold-full';
	}

	article :global(h4) {
		margin-top: 2rem;
		margin-bottom: 2rem;
		font-family: 'roboto-bold-full';
	}

	article :global(p) {
		font-family: 'roboto-full';
	}

	article > :global(ul) {
		margin-left: 5rem !important;
	}

	article :global(code) {
		font-family: 'fira-full';
		position: relative;
		border-radius: 0.3rem;
		color: #333;
		-webkit-font-smoothing: initial;
		background: #eee;
		padding: 0.2rem 0.4rem 0rem 0.4rem;
		white-space: pre;
		word-spacing: normal;
		word-break: normal;
		word-wrap: normal;
		font-size: 1.4rem;
	}

	article :global(pre code) {
		white-space: pre;
		background: none;
		color: #cbccc6;
		padding: 0;
		tab-size: 2rem;
	}

	article :global(pre) {
		background: #1f2430;
		color: #cbccc6;
		border-radius: 3px;
		padding: 1rem 2rem;
		margin: 0rem 0 4rem 0;
		font-size: 1.4rem;
		white-space: pre;
		word-spacing: normal;
		word-break: normal;
		word-wrap: normal;
		line-height: 2.5rem;
	}

	article :global(blockquote) {
		border: 1px solid #bebebe;
	}

	article :global(blockquote p) {
		color: #222;
		font-size: 1.8rem;
	}

	article :global(h3 code) {
		font-size: 2.2rem;
	}

	article :global(h4 code) {
		font-size: 1.8rem;
		margin-bottom: 2rem;
	}

	article :global(a) {
		color: #777;
		border-bottom: 1px solid #999;
	}

	article :global(a:hover) {
		color: #333;
		border-bottom: 1px solid #333;
	}

	article :global(h1 a),
	article :global(h2 a),
	article :global(h3 a),
	article :global(h4 a) {
		display: block;
		height: 100%;
		width: 0;
		padding-top: 1.23rem;
	}
</style>
