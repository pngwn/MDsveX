<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { SECTIONS } from '$lib/snippets';

	let { children } = $props();

	$inspect(page)
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
				{#each SECTIONS as section (section.slug)}
					<div class="section">
						<div class="section-label">{section.name}</div>
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
					</div>
				{/each}
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
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--accent);
		font-weight: 600;
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

	main {
		flex: 1;
		overflow: hidden;
	}
</style>
