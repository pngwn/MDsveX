<script lang="ts">
	// the plugins section as a finder: search what you want to do, a syntax or
	// an option, or browse by the job a plugin does. Every plugin is read from
	// its package and every example is its real output from the build
	// (catalog.server.ts); a plugin the site depends on shows up on the next
	// build. docs/plugins/+page.svx renders it with the page's data.
	//
	// ?q= searches, ?for= picks a concern, so a search can be linked to
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import Score from '$lib/design/score/Score.svelte';
	import { pages } from '../../../routes/docs/nav.js';
	import { CONCERNS, type ConcernId } from './concerns';
	import { CORE, core_terms, type Core } from './core';
	import Result from './Result.svelte';
	import { hit, keep, words_of, type Hit } from './search';
	import type { Plugin, Term } from './types';

	interface Props {
		plugins: Plugin[];
		/** what search matches for each plugin, by id */
		terms: Record<string, Term[]>;
	}

	let data: Props = $props();

	const title = '# Find a _plugin_';
	const writing = pages.filter((p) => p.href.startsWith('/docs/plugins/writing/')).sort((a, b) => a.order - b.order);
	const TRY = ['tabs', ':::', 'cite', 'rel', 'heading_ids', 'mermaid', '@user'];

	let query = $state('');
	let concern = $state<ConcernId | null>(null);
	let input: HTMLInputElement | undefined = $state();

	const words = $derived(words_of(query));
	const searching = $derived(words.length > 0);

	/** each plugin with its hit, best first, when searching */
	const found = $derived.by(() => {
		if (!searching) return [];
		const out: { plugin: (typeof data.plugins)[number]; hit: Hit }[] = [];
		for (const plugin of data.plugins) {
			if (concern && !plugin.concerns.includes(concern)) continue;
			const h = hit(words, data.terms[plugin.id]);
			if (h) out.push({ plugin, hit: h });
		}
		return keep(out).sort((a, b) => b.hit.score - a.hit.score);
	});

	const core = $derived(
		searching
			? keep(CORE.map((c) => ({ c, hit: hit(words, core_terms(c)) })).filter((x): x is { c: (typeof CORE)[number]; hit: Hit } => !!x.hit)).map((x) => x.c)
			: [],
	);

	/** browsing: each concern with its plugins, under the first concern a plugin names unless one is picked */
	const groups = $derived(
		CONCERNS.filter((c) => !concern || c.id === concern)
			.map((c) => ({
				...c,
				plugins: data.plugins.filter((p) => (concern ? p.concerns.includes(c.id) : p.concerns[0] === c.id)),
			}))
			.filter((g) => g.plugins.length > 0),
	);
	const unsorted = $derived(concern ? [] : data.plugins.filter((p) => p.concerns.length === 0));

	const exact = $derived(core.find((c) => c.options?.includes(query.trim().toLowerCase())));
	const related_core = $derived(core.filter((c) => c !== exact));

	const count = (id: ConcernId) => data.plugins.filter((p) => p.concerns.includes(id)).length;

	function sync() {
		const url = new URL(location.href);
		if (query) url.searchParams.set('q', query);
		else url.searchParams.delete('q');
		if (concern) url.searchParams.set('for', concern);
		else url.searchParams.delete('for');
		replaceState(url, {});
	}

	function pick(id: ConcernId | null) {
		concern = concern === id ? null : id;
		sync();
	}

	function try_word(word: string) {
		query = word;
		sync();
		input?.focus();
	}

	onMount(() => {
		const params = new URL(location.href).searchParams;
		query = params.get('q') ?? '';
		const f = params.get('for');
		if (CONCERNS.some((c) => c.id === f)) concern = f as ConcernId;

		// `/` focuses search, as it does on most docs sites, unless the reader is typing somewhere
		const key = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement;
			if (e.key !== '/' || t.closest('input, textarea, select, [contenteditable]')) return;
			e.preventDefault();
			input?.focus();
		};
		addEventListener('keydown', key);

		// a link to /docs/plugins#tabs opens that plugin
		const id = location.hash.slice(1);
		if (id) tick().then(() => document.getElementById(id)?.setAttribute('open', ''));
		return () => removeEventListener('keydown', key);
	});
</script>

{#snippet builtins(items: Core[], title: string)}
	{#if items.length}
		<div class="group core">
			<h2 class="group-head"><em>{title}</em></h2>
			<ul class="core-list">
				{#each items as c (c.href)}
					<li>
						<a href={c.href}>{c.name}</a>
						<span>{#each c.line.split('`') as part, i (i)}{#if i % 2}<code>{part}</code>{:else}{part}{/if}{/each}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
{/snippet}

<div class="wide finder">
<header class="hero">
	<div class="title-score">
		<Score source={title} label="Find a plugin, as a heading with emphasis" />
	</div>
	<h1 class="rag">Find a <em>plugin</em></h1>
	<p class="sub">{data.plugins.length} first-party plugins, by what you want to do.</p>
</header>

<section class="find" aria-label="Find a plugin">
	<label class="search">
		<span class="ask">What do you want to do?</span>
		<input
			bind:this={input}
			value={query}
			oninput={(e) => { query = e.currentTarget.value; sync(); }}
			type="search"
			placeholder="a task, a syntax, an option"
			autocomplete="off"
			spellcheck="false"
			aria-describedby="tries"
		/>
	</label>
	<p class="tries" id="tries">
		<span>Try</span>
		{#each TRY as word (word)}
			<button type="button" onclick={() => try_word(word)}>{word}</button>
		{/each}
		<span class="key" aria-hidden="true">or press <kbd>/</kbd></span>
	</p>

	<label class="task-filter">Filter by task
		<select value={concern ?? ''} onchange={(e) => { concern = e.currentTarget.value as ConcernId || null; sync(); }}>
			<option value="">All tasks</option>
			{#each CONCERNS as c (c.id)}<option value={c.id}>{c.name} ({count(c.id)})</option>{/each}
		</select>
	</label>
	<nav class="concerns" aria-label="By concern">
		<ul>
			{#each CONCERNS as c (c.id)}
				<li>
					<button type="button" class="concern" aria-pressed={concern === c.id} onclick={() => pick(c.id)}>
						<em>{c.name.toLowerCase()}</em>
						<span class="count">{count(c.id)}</span>
					</button>
				</li>
			{/each}
		</ul>
	</nav>
</section>

<section class="results" aria-label="Plugins">
	<p class="sr" role="status">
		{#if searching}{found.length} plugin{found.length === 1 ? '' : 's'}{core.length ? ` and ${core.length} built in` : ''} found{/if}
	</p>

	{#if searching}
		{#if exact}{@render builtins([exact], 'Built-in option')}{/if}
		{#if found.length}
			<div class="group">
				<h2 class="group-head"><em>Plugins</em> <span class="line">for “{query}”{concern ? `, to ${CONCERNS.find((c) => c.id === concern)?.name.toLowerCase()}` : ''}</span></h2>
				{#each found as { plugin, hit: h } (plugin.id)}
					<Result {plugin} hit={h} />
				{/each}
			</div>
		{/if}
		{@render builtins(related_core, 'Built in')}
		{#if !found.length && !core.length}
			<div class="empty">
				<p>No results for “{query}”{concern ? ' in ' + CONCERNS.find((c) => c.id === concern)?.name : ''}.</p>
				<button type="button" onclick={() => try_word('')}>Clear search and browse {concern ? CONCERNS.find((c) => c.id === concern)?.name : 'all tasks'}</button>
				{#if concern}<button type="button" onclick={() => { concern = null; try_word(''); }}>Clear filters</button>{/if}
				<a href="/docs/plugins/writing/bundles">Write your own plugin</a>
			</div>
		{/if}
	{:else}
		{#each groups as g (g.id)}
			<div class="group" id="for-{g.id}">
				<h2 class="group-head"><em>{g.name.toLowerCase()}</em> <span class="line">{g.line}</span></h2>
				{#each g.plugins as plugin (plugin.id)}
					<Result {plugin} under={g.id} />
				{/each}
			</div>
		{/each}
		{#if unsorted.length}
			<div class="group">
				<h2 class="group-head"><em>not sorted yet</em> <span class="line">Their packages name no concern.</span></h2>
				{#each unsorted as plugin (plugin.id)}
					<Result {plugin} />
				{/each}
			</div>
		{/if}
	{/if}
</section>

<section class="own" aria-labelledby="own">
	<div class="own-head">
		<p class="kicker">Nothing fits?</p>
		<h2 id="own">Write your own</h2>
		<p>
			A plugin is a function that returns a bundle: the directives it owns, the components that render them, and handlers that reshape
			what the parser read. It adds no syntax: everything here works through directives, fences and the nodes the parser already reads.
		</p>
	</div>
	<ol class="path">
		{#each writing as page, i (page.href)}
			<li>
				<span class="n">{i + 1}</span>
				<a href={page.href}>{page.title}</a>
			</li>
		{/each}
	</ol>
</section>
</div>

<style>
	/* inside the docs' .prose article: every rule is under .finder, so it outranks .prose's */
	/* a minmax(0, 1fr) column, so nothing inside, a block of code, can widen the finder past the page */
	.finder {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0;
	}

	.finder .hero {
		display: grid;
		justify-items: center;
		padding: clamp(2rem, 5vw, 3.5rem) 0 clamp(1.5rem, 3.5vw, 2.5rem);
		text-align: center;
	}

	.finder .title-score {
		--size: clamp(1.0625rem, 2.4vw, 1.75rem);
		--track: 0.42em;
		--row: 1.6rem;
		--name-size: 1rem;
		font: 400 var(--size) / 1 var(--face-mono);
		width: min(100%, calc(20 * (1ch + var(--track))));
		text-align: left;
	}

	@media (max-width: 600px) {
		.finder .title-score {
			--size: 0.9375rem;
			--track: 0.2em;
			--name-size: 0.8125rem;
			--row: 1.25rem;
		}
	}

	.finder h1 {
		margin: clamp(1rem, 3vw, 2rem) 0 0;
		font: 400 clamp(3rem, 9vw, 6.5rem) / 0.95 var(--face-display);
		letter-spacing: -0.015em;
	}

	.finder h1 em {
		color: var(--name-emph);
	}

	.finder .sub {
		margin: 1.25rem 0 0;
		font: italic 400 clamp(1.125rem, 2.2vw, 1.5rem) / 1.3 var(--face-text);
		color: var(--quiet);
	}

	.finder .find {
		display: grid;
		gap: 0.875rem;
		padding: 2rem 0 1.5rem;
		border-top: 1.5px solid var(--ink);
	}

	.finder .find {
		grid-template-columns: minmax(0, 1fr);
	}

	.finder .search {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.5rem;
	}

	.finder .ask {
		font: italic 400 1.25rem / 1.2 var(--face-display);
	}

	.finder input {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 46rem;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--ink);
		border-radius: 0;
		background: var(--paper);
		color: var(--ink);
		font: 400 1.0625rem / 1.3 var(--face-mono);
		letter-spacing: 0.04em;
		font-variant-ligatures: none;
	}

	@media (max-width: 40rem) {
		.finder input {
			font-size: 0.9375rem;
			letter-spacing: 0.01em;
		}
	}

	input::placeholder {
		color: var(--quiet);
	}

	input:focus-visible {
		outline: 2px solid var(--line-directive);
		outline-offset: 1px;
	}

	.finder .tries {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.375rem 0.75rem;
		margin: 0;
		font: 400 0.8125rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.finder .tries button {
		font: inherit;
		color: var(--ink);
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.2em;
	}

	.finder .tries button:hover {
		text-decoration-color: var(--ink);
	}

	.finder .tries button:focus-visible,
	.finder .concern:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.finder .key kbd {
		font: inherit;
		border: 1px solid var(--staff);
		padding: 0 0.3em;
	}

	@media (hover: none) {
		.finder .key {
			display: none;
		}
	}

	/* the concerns, as the atlas heads its families: a name over a line, a bar at each end */
	.finder .concerns ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.875rem 1.25rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	.finder .concern {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem 0.4rem;
		border: 0;
		border-bottom: 1.5px solid var(--quiet-line);
		background: none;
		color: var(--ink);
		cursor: pointer;
	}

	.finder .concern::before,
	.finder .concern::after {
		content: '';
		position: absolute;
		bottom: -0.35rem;
		height: 0.7rem;
		border-left: 1.5px solid var(--quiet-line);
	}

	.finder .concern::before {
		left: 0;
	}

	.finder .concern::after {
		right: 0;
	}

	.finder .concern em {
		font: italic 400 0.9375rem / 1 var(--face-display);
	}

	.finder .concern .count {
		font: 400 0.6875rem / 1 var(--face-mono);
		color: var(--quiet);
	}

	.finder .concern:hover,
	.finder .concern[aria-pressed='true'] {
		border-bottom-color: var(--ink);
	}

	.finder .concern:hover::before,
	.finder .concern:hover::after,
	.finder .concern[aria-pressed='true']::before,
	.finder .concern[aria-pressed='true']::after {
		border-color: var(--ink);
	}

	.finder .concern[aria-pressed='true'] {
		background: color-mix(in srgb, var(--ink) 7%, transparent);
	}

	.task-filter { display: none; }
	.empty button, .task-filter select {
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		padding: 0.5rem;
		border: 1px solid var(--quiet-line);
	}
	.empty button { cursor: pointer; }
	.empty a {
		display: block;
		margin-top: 0.75rem;
	}
	@media (max-width: 40rem) {
		.finder .concerns { display: none; }
		.task-filter {
			display: grid;
			gap: 0.375rem;
			font: 400 0.875rem / 1.4 var(--face-mono);
		}
	}

	.finder .results {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2.5rem;
		padding-top: 1rem;
	}

	.finder .group {
		border-bottom: 1px solid var(--staff);
	}

	.finder .group-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 1rem;
		margin: 0;
		padding-bottom: 0.625rem;
		border-bottom: 1.5px solid var(--ink);
		font-weight: 400;
	}

	.finder .group-head em {
		font: italic 400 clamp(1.375rem, 2.6vw, 1.75rem) / 1.1 var(--face-display);
	}

	.finder .group-head .line {
		font: 400 0.9375rem / 1.4 var(--face-text);
		color: var(--quiet);
	}

	.finder .core-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.finder .core-list li {
		display: grid;
		grid-template-columns: minmax(9rem, 13rem) minmax(0, 1fr);
		gap: 0.25rem 1.5rem;
		padding: 0.875rem 0;
		border-top: 1px solid var(--staff);
	}

	.finder .core-list li:first-child {
		border-top: 0;
	}

	.finder .core-list a {
		font: 400 1.25rem / 1.2 var(--face-display);
		color: var(--ink);
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.15em;
	}

	.finder .core-list code {
		font: 400 0.875em / 1 var(--face-mono);
		background: none;
		padding: 0;
	}

	@media (max-width: 40rem) {
		.finder .core-list li {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.finder .empty {
		margin: 0;
		max-width: 52ch;
	}

	.finder .empty a,
	.finder .path a {
		color: var(--ink);
	}

	/* write your own, a plate as the atlas draws one: a hairline box, its parts parted */
	.finder .own {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		margin-top: clamp(3rem, 7vw, 5rem);
		border: 1px solid var(--ink);
	}

	.finder .own-head {
		padding: 1.5rem clamp(1rem, 3vw, 2.25rem);
		border-right: 1px solid var(--ink);
	}

	.finder .kicker {
		margin: 0 0 0.25rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.finder .own h2 {
		margin: 0 0 0.75rem;
		font: 400 clamp(2rem, 5vw, 3rem) / 1.05 var(--face-display);
	}

	.finder .own-head p:last-child {
		margin: 0;
		max-width: 52ch;
	}

	.finder .path {
		margin: 0;
		padding: 1.5rem clamp(1rem, 3vw, 2.25rem);
		list-style: none;
		display: grid;
		align-content: center;
		gap: 0.75rem;
	}

	.finder .path li {
		display: flex;
		align-items: baseline;
		gap: 0.875rem;
		font: 400 1.25rem / 1.25 var(--face-display);
	}

	.finder .path .n {
		font: 400 0.75rem / 1 var(--face-mono);
		color: var(--quiet);
		min-width: 1.25rem;
	}

	@media (max-width: 46rem) {
		.finder .own {
			grid-template-columns: minmax(0, 1fr);
		}

		.finder .own-head {
			border-right: 0;
			border-bottom: 1px solid var(--ink);
		}
	}


	.finder .sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
