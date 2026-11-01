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

<main>
	<Cheatsheet />

	<div class="sections">
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
	</div>
</main>

<style>
	.sections {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
		gap: 3rem;
		margin: 0 65px 65px;
	}

	ul {
		list-style: none;
		padding: 0;
	}

	li {
		margin: 0.5rem 0;
	}
</style>
