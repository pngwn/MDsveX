<script lang="ts">
	// the stream lab: the incremental parser and the streaming renderers, a step
	// at a time. Like the playground it owns the viewport and draws the nav itself
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import Nav from "$lib/Nav.svelte";
	import { google_fonts } from "$lib/design/fonts";
	import { use_theme } from "$lib/design/theme.svelte";
	import { FIXTURE_SECTIONS } from "$lib/stream/fixtures";
	import { SECTIONS } from "$lib/stream/snippets";
	// outside the frame, so the frame styles are imported here
	import "$lib/design/tokens.css";
	import "$lib/design/base.css";
	import "$lib/design/type.css";
	import "@twinkleplop/theme-ayu/light";
	import "$lib/design/code.css";
	import "$lib/design/prose.css";
	import "$lib/stream/lab.css";

	let { children } = $props();

	const theme = use_theme();

	const path = (section: string, slug: string) => `/stream/${section}/${slug}`;
	const current = $derived(page.params.section);
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link rel="stylesheet" href={google_fonts} />
</svelte:head>

{#snippet links(section: { slug: string; snippets: { name: string; slug: string }[] })}
	<ul>
		{#each section.snippets as snippet (snippet.slug)}
			{@const href = path(section.slug, snippet.slug)}
			<li>
				<a
					href="{href}{page.url.search}"
					aria-current={page.url.pathname === href ? "page" : undefined}
				>
					{snippet.name}
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<!-- design-frame, so code.css reaches the rendered documents -->
<div class="lab design-frame" data-theme={theme?.value ?? "auto"}>
	<header>
		<Nav>
			<!-- the sidebar on a narrow screen -->
			<select
				class="jump"
				aria-label="Example"
				value={page.url.pathname}
				onchange={(e) => goto(e.currentTarget.value + page.url.search)}
			>
				{#each SECTIONS as section (section.slug)}
					<optgroup label={section.name}>
						{#each section.snippets as snippet (snippet.slug)}
							<option value={path(section.slug, snippet.slug)}>{snippet.name}</option>
						{/each}
					</optgroup>
				{/each}
			</select>
			<span class="lede">the parser, a chunk at a time</span>
			<a class="try" href="/playground/streaming">try your own components and plugins</a>
		</Nav>
	</header>

	<div class="body">
		<nav class="examples" aria-label="Examples">
			{#each SECTIONS as section (section.slug)}
				<details open>
					<summary>{section.name}</summary>
					{@render links(section)}
				</details>
			{/each}

			<h2 class="pane-head">Parser test fixtures</h2>
			{#each FIXTURE_SECTIONS as section (section.slug)}
				<details open={section.slug === current}>
					<summary>{section.name} <span class="count">{section.snippets.length}</span></summary>
					{@render links(section)}
				</details>
			{/each}
		</nav>

		<main>
			{@render children()}
		</main>
	</div>
</div>

<style>
	/* fixed so the page owns the viewport like an editor */
	.lab {
		color-scheme: light dark;
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		color: var(--ink);
		background: var(--paper);
		font: 400 0.8125rem / 1.4 var(--face-mono);
		font-variant-ligatures: none;
	}

	.lab[data-theme="light"] {
		color-scheme: light;
	}

	.lab[data-theme="dark"] {
		color-scheme: dark;
	}

	header {
		flex: none;
		padding: 0.875rem clamp(1rem, 2vw, 1.5rem);
		border-bottom: 1px solid var(--staff);
	}

	.lede {
		color: var(--quiet);
	}

	.try {
		margin-left: auto;
		color: var(--ink);
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.3em;
	}

	.try:hover {
		text-decoration-color: var(--ink);
	}

	.jump {
		display: none;
		min-width: 0;
		max-width: 100%;
	}

	.body {
		flex: 1;
		min-height: 0;
		display: flex;
	}

	.examples {
		flex: none;
		width: 15rem;
		overflow-y: auto;
		border-right: 1px solid var(--staff);
	}

	details {
		border-bottom: 1px solid var(--staff);
	}

	summary {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary::before {
		content: "+";
		width: 1ch;
		color: var(--quiet);
	}

	details[open] > summary::before {
		content: "−";
	}

	summary .count {
		margin-left: auto;
	}

	ul {
		margin: 0;
		padding: 0 0 0.5rem;
		list-style: none;
	}

	li a {
		display: block;
		padding: 0.2rem 0.75rem 0.2rem calc(1.25rem + 1ch);
		color: var(--quiet);
		text-decoration: none;
	}

	li a:hover,
	li a[aria-current="page"] {
		color: var(--ink);
	}

	li a[aria-current="page"] {
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	main {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	@media (max-width: 48rem) {
		.examples,
		.lede {
			display: none;
		}

		.jump {
			display: block;
		}
	}
</style>
