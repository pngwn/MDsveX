<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { data, children } = $props();

	const sections = $derived(data.sections);
	const fixture_start = $derived(sections.findIndex((s: { slug: string }) => s.slug.startsWith('fixtures--')));

	let collapsed: Record<string, boolean> = $state({});

	function is_collapsed(slug: string, is_fixture: boolean): boolean {
		if (slug in collapsed) return collapsed[slug];
		return is_fixture;
	}

	function toggle(slug: string, is_fixture: boolean) {
		collapsed[slug] = !is_collapsed(slug, is_fixture);
	}


</script>

<svelte:head>
	<title>PFM Incremental Parser</title>
</svelte:head>

<div class="app">
	<header>
		<div class="title">
			<span class="logo">PFM</span>
			<span class="sep">/</span>
			<span>Incremental Parser</span>
		</div>
	</header>

	<div class="body">
		<nav class="sidebar">
			<div class="panel-header">Examples</div>
			<div class="nav-list">
				{#each sections.slice(0, fixture_start === -1 ? sections.length : fixture_start) as section (section.slug)}
					<div class="section">
						<button class="section-label" onclick={() => toggle(section.slug, false)}>
							<span class="chevron" class:open={!is_collapsed(section.slug, false)}>›</span>
							{section.name}
						</button>
						{#if !is_collapsed(section.slug, false)}
							{#each section.snippets as snippet (snippet.slug)}
								{@const path = `/${section.slug}/${snippet.slug}`}
								{@const href = `${path}${page.url.search}`}
								<a
									class="nav-link"
									class:active={page.url.pathname === path}
									{href}
								>
									{snippet.name}
								</a>
							{/each}
						{/if}
					</div>
				{/each}

				{#if fixture_start !== -1}
					<div class="fixture-divider">Test Fixtures</div>
					{#each sections.slice(fixture_start) as section (section.slug)}
						<div class="section">
							<button class="section-label" onclick={() => toggle(section.slug, true)}>
								<span class="chevron" class:open={!is_collapsed(section.slug, true)}>›</span>
								{section.name}
							</button>
							{#if !is_collapsed(section.slug, true)}
								{#each section.snippets as snippet (snippet.slug)}
									{@const path = `/${section.slug}/${snippet.slug}`}
									{@const href = `${path}${page.url.search}`}
									<a
										class="nav-link"
										class:active={page.url.pathname === path}
										{href}
									>
										{snippet.name}
									</a>
								{/each}
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</nav>

		<main>
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-secondary);
		flex-shrink: 0;
	}

	.title {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.logo {
		color: var(--accent);
		font-weight: 700;
		font-size: 1rem;
	}

	.sep { color: var(--text-tertiary); }

	.body {
		display: flex;
		flex: 1;
		overflow: hidden;
	}

	.sidebar {
		width: 200px;
		flex-shrink: 0;
		background: var(--bg-secondary);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		padding: 0.5rem 0.75rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		border-bottom: 1px solid var(--border);
		background: var(--bg-secondary);
		flex-shrink: 0;
	}

	.nav-list {
		overflow-y: auto;
		flex: 1;
	}

	.section {
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		width: 100%;
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
		font-weight: 600;
		font-family: inherit;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
	}

	.section-label:hover {
		color: var(--accent-hover);
	}

	.chevron {
		display: inline-block;
		font-size: 0.8rem;
		line-height: 1;
		transition: transform 0.15s ease;
		transform: rotate(0deg);
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.nav-link {
		display: block;
		padding: 0.35rem 0.75rem 0.35rem 1.25rem;
		color: var(--text-secondary);
		font-size: 0.8rem;
		text-decoration: none;
		border-left: 2px solid transparent;
	}

	.nav-link:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.nav-link.active {
		background: var(--bg-tertiary);
		color: var(--accent);
		border-left-color: var(--accent);
	}

	.fixture-divider {
		padding: 0.6rem 0.75rem 0.35rem;
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-tertiary);
		font-weight: 600;
		border-top: 1px solid var(--border);
		margin-top: 0.25rem;
	}

	main {
		flex: 1;
		overflow: hidden;
	}
</style>
