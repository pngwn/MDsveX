<script lang="ts">
	// one plugin as a plate, the atlas's sheet for a construct turned to a
	// plugin: its mark and name over a hairline, what it does, how to install
	// and turn it on, the syntax it reads, its example, its options read from
	// its source, and where it stops. Beside it, every plugin by concern, so the
	// next one is a click away
	import Perch from '$lib/design/penguin/Perch.svelte';
	import { tone } from '$lib/design/score/kinds';
	import { CONCERNS } from './authored';
	import Example from './Example.svelte';
	import { reads_line } from './Result.svelte';
	import Syntax from './Syntax.svelte';
	import type { Plugin } from './types';

	interface Props {
		plugin: Plugin;
		/** every plugin, for the index */
		all: Plugin[];
	}

	let { plugin: p, all }: Props = $props();

	const first = $derived(p.syntax[0]);
	const own = $derived(first ? tone(first.kind) : 'other');
	// the mark, the first syntax with what is written in its brackets left out: `::toc[]`, `[](#id)`
	const glyph = $derived(first ? first.mark.replace(/\[[^\]]*\]/g, '[]').replace(/\[\]\(([^)]*)\)/, '[]($1)').replace(/\(([^)]*)=[^)]*\)/, '') : '·');
	const concerns = $derived(CONCERNS.filter((c) => p.concerns.includes(c.id)));
	const install = $derived(['pnpm add -D', `${p.package}@next`, ...p.peers.filter((x) => !x.optional).map((x) => x.name)].join(' '));
	const optional = $derived(p.peers.filter((x) => x.optional).map((x) => x.name));
	const config = $derived.by(() => {
		const parts = [p.needs?.heading_ids && 'heading_ids: true', p.needs?.unwrap_images && 'unwrap_images: true', `plugins: [${p.factory}()]`].filter(Boolean);
		return `import { ${p.factory} } from '${p.package}';\n\nmdsvex({ ${parts.join(', ')} });`;
	});
	const index = $derived(CONCERNS.map((c) => ({ ...c, plugins: all.filter((x) => x.concerns[0] === c.id) })).filter((g) => g.plugins.length));

	/** `code` in a line of edges, set as code */
	const parts = (text: string) => text.split('`').map((t, i) => ({ t, code: i % 2 === 1 }));
</script>

<div class="page">
	<!-- the line bird stands on the plate's top rule -->
	<Perch on=".plate">
	<article class="plate" style:--own-line="var(--line-{own})" style:--own-name="var(--name-{own})" aria-labelledby="name">
		<header class="head">
			<div class="sigil" aria-hidden="true">
				<span class="glyph" style:font-size={glyph.length > 7 ? '1.25rem' : undefined}>{glyph}</span>
			</div>
			<div class="title">
				<p class="kicker">
					{#each concerns as c, i (c.id)}<a class="concern" href="/docs-lab/plugins?for={c.id}"><em>{c.name.toLowerCase()}</em></a>{i < concerns.length - 1 ? ' ' : ''}{/each}
					<code class="pkg">{p.package}@{p.version}</code>
				</p>
				<h1 id="name">{p.title}</h1>
				<p class="what">{p.description.replace(/ for mdsvex\b/, '')}</p>
			</div>
		</header>

		<section class="setup" aria-label="Install and turn it on">
			<div>
				<h2>Install</h2>
				<pre class="code riso"><code>{install}</code></pre>
				{#if optional.length}
					<p class="note">With {#each optional as name, i (name)}{i ? ' or ' : ''}<code>{name}</code>{/each}, its optional peers, installed beside it.</p>
				{/if}
			</div>
			<div>
				<h2>Turn it on</h2>
				<pre class="code riso"><code>{config}</code></pre>
				{#if p.async}
					<p class="note">It waits, as {p.async}: the Vite plugin and <code>compile_async</code> compile such a document, <code>compile</code> throws a <code>PluginAsyncError</code>.</p>
				{/if}
			</div>
		</section>

		<section class="reads" aria-labelledby="reads">
			<h2 id="reads">What it reads</h2>
			<div class="phrases">
				{#each p.syntax as s (s.mark)}<Syntax sample={s} />{/each}
			</div>
			<p class="said riso">{reads_line(p).join(' · ')}</p>
		</section>

		<section class="example" aria-labelledby="example">
			<h2 id="example">An example</h2>
			<Example plugin={p} bare />
		</section>

		<section class="options" aria-labelledby="options">
			<h2 id="options">Options <span class="count">{p.options.length}</span></h2>
			{#if p.options.length}
				<dl>
					{#each p.options as o (o.name)}
						<div class="option">
							<dt>
								<code class="sig riso"><span class="o-name">{o.name}</span>{o.optional ? '?' : ''}: <span class="type">{o.type}</span>{#if o.default}<span class="default">{' = '}{o.default}</span>{/if}</code>
							</dt>
							<dd>{o.text.replace(/^./, (c) => c.toUpperCase())}</dd>
						</div>
					{/each}
				</dl>
			{:else}
				<p>None.</p>
			{/if}
		</section>

		<section class="edges" aria-labelledby="edges">
			<h2 id="edges">Edges</h2>
			<ul>
				{#each p.edges as edge, i (i)}
					<li>{#each parts(edge) as part, j (j)}{#if part.code}<code>{part.t}</code>{:else}{part.t}{/if}{/each}</li>
				{/each}
			</ul>
		</section>

		<footer class="parts riso">
			{#if p.exports.components.length}
				<p><span class="label">Components</span> {#each p.exports.components as c, i (c)}{i ? ', ' : ''}<code>{p.package}/{c}</code>{/each}</p>
			{/if}
			{#if p.exports.css.length}
				<p><span class="label">Stylesheet</span> {#each p.exports.css as c, i (c)}{i ? ', ' : ''}<code>{p.package}/{c}</code>{/each}<span class="quiet">, or <code>{p.factory}({'{'} css: false {'}'})</code> for none</span></p>
			{/if}
			<p><a href={p.docs}>Its docs page today</a></p>
		</footer>
	</article>
	</Perch>

	<nav class="index" aria-label="Every plugin">
		<a class="back" href="/docs-lab/plugins">Find a plugin</a>
		{#each index as g (g.id)}
			<div class="group">
				<p class="group-head"><em>{g.name.toLowerCase()}</em></p>
				<ul>
					{#each g.plugins as x (x.id)}
						<li>
							<a
								href={x.page ? `/docs-lab/plugins/${x.id}` : `/docs-lab/plugins#${x.id}`}
								aria-current={x.id === p.id ? 'page' : undefined}
								class:has-page={x.page}>{x.title}</a
							>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
		<a class="back own" href="/docs/plugins/writing/bundles">Write your own</a>
	</nav>
</div>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(12rem, 16rem);
		gap: clamp(1.25rem, 3vw, 2.5rem);
		align-items: start;
		padding-top: clamp(1.5rem, 4vw, 3rem);
	}

	.page > :global(*) {
		min-width: 0;
	}

	.plate {
		container-type: inline-size;
		border: 1px solid var(--ink);
		background: var(--paper);
		min-width: 0;
	}

	.head {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr);
		border-bottom: 1px solid var(--ink);
	}

	.sigil {
		position: relative;
		display: grid;
		place-items: center;
		border-right: 1px solid var(--ink);
		padding: 1.5rem 0.5rem 2rem;
	}

	.sigil::after {
		content: '';
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		height: 0.375rem;
		background: var(--own-line);
	}

	.glyph {
		font: 400 1.75rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		white-space: nowrap;
	}

	.title {
		padding: 1.5rem clamp(1rem, 3cqi, 2.25rem);
		min-width: 0;
	}

	.kicker {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		margin: 0 0 0.25rem;
	}

	.concern {
		color: var(--ink);
		text-decoration: none;
	}

	.concern em {
		font: italic 400 0.9375rem / 1 var(--face-display);
	}

	.concern:hover em {
		text-decoration: underline 1px;
		text-underline-offset: 0.2em;
	}

	.pkg {
		font: 400 0.75rem / 1.3 var(--face-mono);
		color: var(--quiet);
		background: none;
		padding: 0;
		overflow-wrap: anywhere;
	}

	h1 {
		margin: 0;
		font: 400 clamp(2.5rem, 8cqi, 4rem) / 1.02 var(--face-display);
		letter-spacing: -0.01em;
	}

	.what {
		max-width: 52ch;
		margin: 0.625rem 0 0;
		font-size: 1.0625rem;
	}

	section,
	.parts {
		padding: 1.25rem clamp(1rem, 3cqi, 2.25rem) 1.5rem;
		border-bottom: 1px solid var(--ink);
		min-width: 0;
	}

	.parts {
		border-bottom: 0;
	}

	h2 {
		margin: 0 0 0.75rem;
		font: italic 400 1.125rem / 1.2 var(--face-display);
	}

	.count {
		font: normal 400 0.75rem / 1 var(--face-mono);
		color: var(--quiet);
	}

	.setup {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
	}

	@container (min-width: 46rem) {
		.setup {
			grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
			gap: 2rem;
		}
	}

	/* an install line and a config are short: they wrap rather than scroll */
	.setup pre {
		margin: 0;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--staff);
		font: 400 0.8125rem / 1.55 var(--face-mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.note {
		margin: 0.625rem 0 0;
		font-size: 0.9375rem;
		max-width: 60ch;
	}

	.phrases {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 2rem;
		align-items: end;
	}

	.said {
		margin: 0.875rem 0 0;
		font: 400 0.8125rem / 1.45 var(--face-mono);
		color: var(--quiet);
	}

	.options dl {
		margin: 0;
		display: grid;
		gap: 1rem;
	}

	.option dt {
		margin: 0;
	}

	.sig {
		font: 400 0.8125rem / 1.5 var(--face-mono);
		font-variant-ligatures: none;
		background: none;
		padding: 0;
		overflow-wrap: anywhere;
	}

	.o-name {
		color: var(--own-name);
		font-weight: 700;
	}

	.type,
	.default {
		color: var(--quiet);
	}

	.option dd {
		margin: 0.25rem 0 0;
		max-width: 62ch;
	}

	.edges ul {
		margin: 0;
		padding-left: 1.1em;
		display: grid;
		gap: 0.5rem;
		max-width: 70ch;
	}

	.edges li::marker {
		color: var(--own-line);
	}

	section :global(p code),
	.edges code,
	.parts code {
		font: 400 0.875em / 1 var(--face-mono);
		font-variant-ligatures: none;
		background: none;
		padding: 0;
		color: var(--own-name);
		overflow-wrap: anywhere;
	}

	.parts {
		font: 400 0.8125rem / 1.5 var(--face-mono);
		color: var(--ink);
	}

	.parts p {
		margin: 0 0 0.375rem;
	}

	.parts code {
		color: var(--ink);
		font-size: 1em;
	}

	.label,
	.quiet {
		color: var(--quiet);
	}

	.label {
		margin-right: 0.5rem;
	}

	.parts a {
		color: var(--ink);
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.2em;
	}

	/* the index, every plugin by concern, the atlas's families as phrase heads */
	.index {
		position: sticky;
		top: 1.5rem;
		display: grid;
		gap: 1rem;
		font: 400 0.8125rem / 1.4 var(--face-mono);
	}

	.group-head {
		margin: 0 0 0.375rem;
		padding: 0 0 0.25rem 0.4rem;
		position: relative;
		border-bottom: 1.5px solid var(--quiet-line);
	}

	.group-head::before,
	.group-head::after {
		content: '';
		position: absolute;
		bottom: -0.35rem;
		height: 0.7rem;
		border-left: 1.5px solid var(--quiet-line);
	}

	.group-head::before {
		left: 0;
	}

	.group-head::after {
		right: 0;
	}

	.group-head em {
		font: italic 400 0.875rem / 1 var(--face-display);
	}

	.index ul {
		margin: 0;
		padding: 0 0 0 0.4rem;
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.125rem 0.875rem;
	}

	.index a {
		color: var(--quiet);
		text-decoration: none;
	}

	.index a.has-page {
		color: var(--ink);
	}

	.index a:hover {
		text-decoration: underline 1px;
		text-underline-offset: 0.2em;
	}

	.index a[aria-current='page'] {
		color: var(--ink);
		font-weight: 700;
		text-decoration: underline 1.5px var(--own-line, var(--ink));
		text-underline-offset: 0.25em;
	}

	.back {
		color: var(--ink) !important;
	}

	.back:not(.own)::before {
		content: '← ';
	}

	.own::after {
		content: ' →';
	}

	@media (max-width: 60rem) {
		.page {
			grid-template-columns: minmax(0, 1fr);
		}

		.index {
			position: static;
			order: -1;
			display: flex;
			gap: 1rem;
			overflow-x: auto;
			scrollbar-width: none;
			margin: 0 calc(var(--gutter) * -1);
			padding: 0 var(--gutter) 0.5rem;
		}

		.index .group {
			flex: none;
		}

		.index ul {
			flex-wrap: nowrap;
		}

		.index .back {
			flex: none;
			align-self: end;
		}
	}

	@container (max-width: 30rem) {
		.head {
			grid-template-columns: 5rem minmax(0, 1fr);
		}

		.glyph {
			font-size: 1rem !important;
		}

		.sigil {
			padding: 1rem 0.25rem 1.75rem;
		}

		.sigil::after {
			left: 0.75rem;
			right: 0.75rem;
			bottom: 0.875rem;
		}
	}
</style>
