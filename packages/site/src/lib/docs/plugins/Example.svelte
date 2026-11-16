<script lang="ts">
	// a plugin's example as a plate: what you write, as the parser reads it,
	// beside what you get, the plugin's real output from when the site built.
	// "Edit" turns the source into a textarea and loads the compilers; from then
	// on each change compiles in the browser with the plugin on and mounts where
	// the built output was. A plugin that can't run in the browser keeps its
	// built output and says why
	import { untrack } from 'svelte';
	import Score from '$lib/design/score/Score.svelte';
	import type { Plugin } from './types';

	// the plugins' own stylesheets, so their output looks as it does on a site
	import.meta.glob('/node_modules/@mdsvex/plugin-*/dist/*.css', { eager: true });

	interface Props {
		plugin: Plugin;
		/** inside a plate that draws its own frame: no box of its own */
		bare?: boolean;
	}

	let { plugin, bare = false }: Props = $props();

	const built = $derived(plugin.example.output);

	// a plugin that leaves the page as it was opens on what it gives instead
	const opening = (o: Plugin['example']['output']) => (o.unchanged && o.warnings.length ? 'warnings' : o.unchanged && o.data ? 'data' : 'page');
	// set here too as effects never run on the server, so the page shows its source without javascript
	let source = $state(untrack(() => plugin.example.source));
	let editing = $state(false);
	let view = $state<'page' | 'html' | 'data' | 'warnings'>(untrack(() => opening(plugin.example.output)));
	$effect.pre(() => {
		view = opening(plugin.example.output);
	});
	let status = $state<'built' | 'loading' | 'live' | 'error'>('built');
	let live = $state<{ data: Record<string, unknown> | null; warnings: Plugin['example']['output']['warnings']; error: string | null } | null>(null);
	let html = $state('');
	let mounted = $state(false);
	let target: HTMLElement | undefined = $state();
	let area: HTMLTextAreaElement | undefined = $state();

	$effect.pre(() => {
		source = plugin.example.source;
	});

	const output = $derived(live ?? built);
	const views = $derived(
		[
			['page', 'page'],
			['html', 'html'],
			output.data ? ['data', 'plugin_data'] : null,
			output.warnings.length ? ['warnings', `warnings ${output.warnings.length}`] : null,
		].filter(Boolean) as [typeof view, string][],
	);

	// a view that went away with an edit, the warnings fixed, falls back to the page
	$effect(() => {
		if (!views.some(([v]) => v === view)) view = 'page';
	});

	let destroy = () => {};
	let timer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;

	async function compile_now() {
		if (!target) return;
		const mine = ++generation;
		const { run } = await import('./live');
		// a fresh element for each run, so a failed one leaves the last good output
		const next = document.createElement('div');
		const result = await run(plugin.package, source, plugin.example, plugin.needs, next);
		if (mine !== generation) return result.destroy();
		live = result.output;
		if (result.output.error) {
			status = 'error';
			return;
		}
		destroy();
		destroy = result.destroy;
		target.replaceChildren(...next.childNodes);
		html = target.innerHTML.replace(/<!--[^>]*-->/g, '');
		mounted = true;
		status = 'live';
	}

	async function edit() {
		editing = true;
		if (plugin.live) return;
		status = 'loading';
		await compile_now();
		area?.focus();
	}

	function changed() {
		if (plugin.live) return;
		clearTimeout(timer);
		timer = setTimeout(compile_now, 200);
	}

	function reset() {
		source = plugin.example.source;
		live = null;
		status = 'built';
		destroy();
		destroy = () => {};
		target?.replaceChildren();
		mounted = false;
	}

	$effect(() => () => destroy());

	/** an example's links go where the example's site would, not this one: they stay put */
	function stay(e: MouseEvent) {
		if ((e.target as Element).closest('a[href]')) e.preventDefault();
	}

	const said = $derived(
		{
			built: 'Built with the plugin on when the site was built.',
			loading: 'Loading mdsvex and Svelte…',
			live: 'Compiled in your browser with the plugin on.',
			error: 'This edit does not compile; the last output stays.',
		}[status],
	);
</script>

<figure class="example" class:bare aria-label="{plugin.title}, an example">
	<div class="half write">
		<div class="head">
			<span class="label">You write</span>
			<span class="actions">
				{#if !editing}
					<button type="button" onclick={edit}>{plugin.live ? 'Show source' : 'Edit'}</button>
				{:else if status !== 'built' && source !== plugin.example.source}
					<button type="button" onclick={reset}>Reset</button>
				{/if}
			</span>
		</div>
		{#if editing}
			<textarea
				bind:this={area}
				bind:value={source}
				oninput={changed}
				readonly={!!plugin.live}
				spellcheck="false"
				aria-label="The example's source{plugin.live ? ', read only' : ''}"
				rows={Math.min(16, source.split('\n').length + 1)}
			></textarea>
		{/if}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="score" class:quiet={editing} onclick={editing ? undefined : edit}>
			<Score source={source.endsWith('\n') ? source : `${source}\n`} label="The example, as the parser reads it" />
		</div>
		{#if plugin.example.files}
			{#each Object.entries(plugin.example.files) as [path, text] (path)}
				<details class="file">
					<summary><span class="label">and the file it reads,</span> <code>{path}</code></summary>
					<pre class="code"><code>{text}</code></pre>
				</details>
			{/each}
		{/if}
	</div>

	<div class="half get">
		<div class="head">
			<span class="label">You get</span>
			{#if views.length > 1}
				<span class="pick" role="group" aria-label="Show the output as">
					{#each views as [v, name] (v)}
						<button type="button" aria-pressed={view === v} onclick={() => (view = v)}>{name}</button>
					{/each}
				</span>
			{/if}
		</div>

		{#if built.unchanged && view !== 'page'}
			<p class="unchanged">
				The page is the same without the plugin. What it gives is
				{#if output.warnings.length}its warnings:{:else}<code>plugin_data</code>, for a template or a list of pages:{/if}
			</p>
		{/if}
		{#if built.error && !live}
			<p class="failed">
				The build could not render this example: <code>{built.error}</code>. Nothing is shown in its place.
			</p>
		{/if}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="rendered" hidden={view !== 'page' || mounted} onclick={stay}>{@html built.html}</div>
		<!-- the live output, mounted by live.ts, apart from the built one so svelte never owns what it replaces -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="rendered" hidden={view !== 'page' || !mounted} bind:this={target} onclick={stay}></div>
		{#if view === 'html'}
			<pre class="code"><code>{live ? html : built.pretty}</code></pre>
		{:else if view === 'data'}
			<pre class="code"><code>plugin_data = {JSON.stringify(output.data, (k, v) => (k === 'position' ? undefined : v), '\t')}</code></pre>
		{:else if view === 'warnings'}
			<ol class="warnings">
				{#each output.warnings as w, i (i)}
					<li><span class="line">line {w.line ?? '?'}</span> <code>{w.code}</code> {w.message}</li>
				{/each}
			</ol>
		{/if}
		{#if live?.error}
			<p class="failed" role="status"><code>{live.error}</code></p>
		{/if}
	</div>

	<figcaption>
		<span role="status">{said}</span>
		{#if plugin.live}
			<span class="blocked">It can’t run in the browser yet: {plugin.live}.</span>
		{/if}
	</figcaption>
</figure>

<style>
	.example {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		border: 1px solid var(--ink);
		background: var(--paper);
		container-type: inline-size;
	}

	/* inside a plate: the plate's rules part it, the halves sit on its padding */
	.bare {
		border: 0;
		border-top: 1px solid var(--staff);
	}

	.half {
		min-width: 0;
		padding: 1rem clamp(0.875rem, 3cqi, 1.75rem) 1.25rem;
	}

	.get {
		border-top: 1px solid var(--ink);
	}

	@media (min-width: 52rem) {
		.example {
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		}

		.example .get {
			border-top: 0;
			border-left: 1px solid var(--ink);
		}

		.example figcaption {
			grid-column: 1 / -1;
		}
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.875rem;
	}

	.label {
		font: 400 0.75rem / 1.4 var(--face-mono);
		letter-spacing: 0.02em;
		color: var(--quiet);
	}

	.actions button,
	.pick button {
		font: 400 0.75rem / 1 var(--face-mono);
		color: var(--ink);
		background: none;
		border: 1px solid var(--ink);
		padding: 0.375rem 0.625rem;
		cursor: pointer;
	}

	.pick {
		display: inline-flex;
		flex-wrap: wrap;
	}

	.pick button + button {
		border-left: 0;
	}

	.pick button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--paper);
	}

	button:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.score {
		cursor: text;
		overflow-x: auto;
	}

	/* while the textarea is the source, the score under it follows what is typed */
	.score.quiet {
		cursor: auto;
		margin-top: 1rem;
	}

	textarea {
		box-sizing: border-box;
		width: 100%;
		margin: 0;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--ink);
		border-radius: 0;
		background: var(--paper);
		color: var(--ink);
		font: 400 0.875rem / 1.55 var(--face-mono);
		font-variant-ligatures: none;
		tab-size: 2;
		resize: vertical;
	}

	textarea:focus-visible {
		outline: 2px solid var(--line-directive);
		outline-offset: 1px;
	}

	.file {
		margin-top: 0.875rem;
	}

	.file summary {
		cursor: pointer;
	}

	.file code {
		font: 400 0.8125rem / 1 var(--face-mono);
	}

	pre {
		margin: 0.5rem 0 0;
		padding: 0.75rem 0.875rem;
		max-height: 20rem;
		overflow: auto;
		border: 1px solid var(--staff);
		font: 400 0.8125rem / 1.55 var(--face-mono);
		white-space: pre;
	}

	/* the output as a page shows it: body type, the plugin's own stylesheet */
	.rendered {
		font: 400 1rem / 1.55 var(--face-text);
		color: var(--ink);
		min-width: 0;
		overflow-x: auto;
	}

	.rendered :global(:where(h1, h2, h3)) {
		font-family: var(--face-display);
		font-weight: 400;
		line-height: 1.15;
		margin: 0.75rem 0 0.5rem;
	}

	.rendered :global(h1) {
		font-size: 1.75rem;
	}

	.rendered :global(h2) {
		font-size: 1.375rem;
	}

	.rendered :global(h3) {
		font-size: 1.125rem;
	}

	.rendered :global(:where(p, ul, ol, pre, figure, details, nav)) {
		margin: 0 0 0.75rem;
	}

	.rendered :global(a) {
		color: var(--name-link);
	}

	.rendered :global(svg) {
		max-width: 100%;
		height: auto;
	}

	.rendered :global(iframe) {
		max-width: 100%;
	}

	.warnings {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.5rem;
		font: 400 0.8125rem / 1.45 var(--face-mono);
	}

	.warnings li {
		padding-left: 0.75rem;
		border-left: 1.5px solid var(--line-item);
	}

	.warnings .line {
		color: var(--quiet);
	}

	.warnings code,
	.failed code,
	.unchanged code {
		color: var(--name-item);
		font: inherit;
		background: none;
		padding: 0;
	}

	.unchanged {
		margin: 0 0 0.75rem;
		font-size: 0.9375rem;
		color: var(--quiet);
	}

	.failed {
		margin: 0.75rem 0 0;
		font: 400 0.8125rem / 1.45 var(--face-mono);
		color: var(--quiet);
	}

	figcaption {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		padding: 0.625rem clamp(0.875rem, 3cqi, 1.75rem);
		border-top: 1px solid var(--staff);
		font: 400 0.75rem / 1.45 var(--face-mono);
		color: var(--quiet);
	}

	.blocked {
		color: var(--ink);
	}
</style>
