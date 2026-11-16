<script module>
import { nav, pages } from "./nav.js";
import redirects from "./redirects.json";

// a page that moves or goes takes its old links with it, so the prerender fails
for (const [id, to] of Object.entries(redirects))
	if (!pages.some((p) => p.href === to.split("#")[0]))
		throw new Error(`/docs#${id} redirects to ${to}, which is no docs page`);
</script>

<script>
import { goto } from "$app/navigation";
import { onMount } from "svelte";
import Cheatsheet from "../../components/Cheatsheet.svx";

// the docs were one page, so an old link is /docs#id, the hash never reaches
// the server, and redirects.json says which page has that id now
onMount(() => {
	const to = redirects[decodeURIComponent(location.hash.slice(1))];
	if (to) goto(to, { replaceState: true });
});
</script>

<div class="index">
	<header class="prose">
		<h1 class="rag">Docs</h1>
		<p class="lede">mdsvex is markdown with Svelte in it. Learn the language, follow a guide, add a plugin, or look something up.</p>
	</header>

	<nav class="sections" aria-label="Docs">
		{#each nav as section}
			<section>
				<h2>{section.title}</h2>
				{#each section.groups as group}
					{#if group.title}
						<h3>{group.title}</h3>
					{/if}
					<ul>
						{#each group.pages as p}
							<li><a href={p.href}>{p.title}</a></li>
						{/each}
					</ul>
				{/each}
			</section>
		{/each}
	</nav>

	<section class="quick" aria-labelledby="at-a-glance">
		<h2 id="at-a-glance" class="label">At a glance</h2>
		<Cheatsheet />
	</section>
</div>

<style>
	.index {
		padding-top: clamp(1.5rem, 4vw, 3.5rem);
	}

	.lede {
		color: var(--quiet);
		font-size: 1.25rem;
	}

	.sections {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 2rem clamp(1.5rem, 4vw, 3rem);
		margin: clamp(2rem, 5vw, 3.5rem) 0;
		font: 400 0.875rem / 1.5 var(--face-mono);
		font-variant-ligatures: none;
	}

	.sections h2,
	.label {
		margin: 0 0 0.6rem;
		/* a mono label, not the linen texture.css gives headings */
		mask-image: none;
		font: 400 0.8125rem / 1.4 var(--face-mono);
		color: var(--quiet);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.sections h3 {
		margin: 1rem 0 0.35rem;
		mask-image: none;
		font: italic 400 0.8125rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		margin: 0.25rem 0;
	}

	.sections a {
		color: var(--ink);
		text-decoration: none;
	}

	.sections a:hover {
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	.quick {
		margin-top: clamp(2.5rem, 6vw, 4.5rem);
	}

	.label {
		margin-bottom: 1.25rem;
	}
</style>
