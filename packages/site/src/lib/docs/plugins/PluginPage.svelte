<script lang="ts">
	// a plugin's docs page: the atlas's plate turned to a plugin, over the page's
	// own prose. The plate is read from the plugin: its mark and name, what it
	// does, how to install and turn it on, the syntax it reads, and its example,
	// built with the plugin on. Under the prose, its options from its types and
	// the parts its package exports. docs/plugins/+layout.svelte puts it round
	// every page whose frontmatter names a package
	import type { Snippet } from 'svelte';
	import { tone } from '$lib/design/score/kinds';
	import { CONCERNS } from './concerns';
	import Example from './Example.svelte';
	import { reads_line } from './Result.svelte';
	import Syntax from './Syntax.svelte';
	import type { Plugin } from './types';

	interface Props {
		plugin: Plugin;
		/** the page's prose */
		children: Snippet;
	}

	let { plugin: p, children }: Props = $props();

	const first = $derived(p.syntax[0]);
	const own = $derived(first ? tone(first.kind) : 'other');
	// the mark, the first syntax with what is written in its brackets left out: `::toc[]`, `[](#id)`
	const glyph = $derived(first ? first.mark.replace(/\[[^\]]*\]/g, '[]').replace(/\[\]\(([^)]*)\)/, '[]($1)').replace(/\(([^)]*)=[^)]*\)/, '') : '·');
	const concerns = $derived(CONCERNS.filter((c) => p.concerns.includes(c.id)));
	const install = $derived(['pnpm add -D', `${p.package}@next`, ...p.peers.filter((x) => !x.optional).map((x) => x.name)].join(' '));
	const optional = $derived(p.peers.filter((x) => x.optional).map((x) => x.name));
	const config = $derived.by(() => {
		const others = p.example.with ?? [];
		const factories = [...others.map((w) => w.replace('@mdsvex/plugin-', '').replace(/-/g, '_')), p.factory];
		const imports = [...others.map((w, i) => `import { ${factories[i]} } from '${w}';`), `import { ${p.factory} } from '${p.package}';`];
		const parts = [p.needs?.heading_ids && 'heading_ids: true', p.needs?.unwrap_images && 'unwrap_images: true', `plugins: [${factories.map((f) => `${f}()`).join(', ')}]`].filter(Boolean);
		return `${imports.join('\n')}\n\nmdsvex({ ${parts.join(', ')} });`;
	});
</script>

<div class="wide plugin" style:--own-line="var(--line-{own})" style:--own-name="var(--name-{own})">
	<section class="plate" aria-labelledby="plugin-name">
		<header class="head">
			<div class="sigil" aria-hidden="true">
				<span class="glyph" style:font-size={glyph.length > 7 ? '1.25rem' : undefined}>{glyph}</span>
			</div>
			<div class="title">
				<p class="kicker">
					{#each concerns as c, i (c.id)}<a class="concern" href="/docs/plugins?for={c.id}"><em>{c.name.toLowerCase()}</em></a>{i < concerns.length - 1 ? ' ' : ''}{/each}
					<code class="pkg">{p.package}@{p.version}</code>
				</p>
				<h1 id="plugin-name">{p.title}</h1>
				<p class="what">{p.description}</p>
			</div>
		</header>

		<div class="setup">
			<div>
				<p class="label-h">Install</p>
				<pre class="code riso"><code>{install}</code></pre>
				{#if optional.length}
					<p class="note">With {#each optional as name, i (name)}{i ? ' or ' : ''}<code>{name}</code>{/each}, its optional peers, installed beside it.</p>
				{/if}
			</div>
			<div>
				<p class="label-h">Turn it on</p>
				<pre class="code riso"><code>{config}</code></pre>
				{#if p.waits}
					<p class="note">It waits, as {p.waits}: the Vite plugin and <code>compile_async</code> compile such a document, <code>compile</code> throws a <code>PluginAsyncError</code>.</p>
				{/if}
			</div>
		</div>

		<div class="reads">
			<p class="label-h">What it reads</p>
			<div class="phrases">
				{#each p.syntax as s (s.mark)}<Syntax sample={s} />{/each}
			</div>
			<p class="said riso">{reads_line(p).join(' · ')}</p>
		</div>

		<div class="example">
			<p class="label-h">An example</p>
			<Example plugin={p} bare />
		</div>
	</section>

	<div class="prose-body">
		{@render children()}
	</div>

	<section class="plate tail" aria-label="Options and parts">
		<div class="options">
			<p class="label-h">Options, from its types <span class="count">{p.options.length}</span></p>
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
				<p class="none">None.</p>
			{/if}
		</div>

		<footer class="parts riso">
			{#if p.exports.components.length}
				<p><span class="label">Components</span> {#each p.exports.components as c, i (c)}{i ? ', ' : ''}<code>{p.package}/{c}</code>{/each}</p>
			{/if}
			{#if p.exports.css.length}
				<p><span class="label">Stylesheet</span> {#each p.exports.css as c, i (c)}{i ? ', ' : ''}<code>{p.package}/{c}</code>{/each}<span class="quiet">, or <code>{p.factory}({'{'} css: false {'}'})</code> for none</span></p>
			{/if}
			<p><a href="/docs/plugins">Find another plugin</a> · <a href="/docs/plugins/writing/bundles">Write your own</a></p>
		</footer>
	</section>
</div>

<style>
	/* inside the docs' .prose article: every rule is under .plugin, so it outranks .prose's */
	/* every grid here has a minmax(0, 1fr) column: code.css sets a block's code
	   to max-content, and an auto column would grow to it, past the page */
	.plugin {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2.25rem;
	}

	.plugin .plate {
		container-type: inline-size;
		border: 1px solid var(--ink);
		background: var(--paper);
		min-width: 0;
		font-size: 1rem;
		line-height: 1.55;
	}

	.plugin .head {
		display: grid;
		grid-template-columns: 9rem minmax(0, 1fr);
		border-bottom: 1px solid var(--ink);
	}

	.plugin .sigil {
		position: relative;
		display: grid;
		place-items: center;
		border-right: 1px solid var(--ink);
		padding: 1.5rem 0.5rem 2rem;
	}

	.plugin .sigil::after {
		content: '';
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 1rem;
		height: 0.375rem;
		background: var(--own-line);
	}

	.plugin .glyph {
		font: 400 1.75rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		white-space: nowrap;
	}

	.plugin .title {
		padding: 1.5rem clamp(1rem, 3cqi, 2.25rem);
		min-width: 0;
	}

	.plugin .kicker {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		margin: 0 0 0.25rem;
	}

	.plugin .concern {
		color: var(--ink);
		text-decoration: none;
	}

	.plugin .concern em {
		font: italic 400 0.9375rem / 1 var(--face-display);
	}

	.plugin .concern:hover em {
		text-decoration: underline 1px;
		text-underline-offset: 0.2em;
	}

	.plugin .pkg {
		font: 400 0.75rem / 1.3 var(--face-mono);
		color: var(--quiet);
		background: none;
		padding: 0;
		overflow-wrap: anywhere;
	}

	.plugin h1 {
		margin: 0;
		font: 400 clamp(2.25rem, 7cqi, 3.5rem) / 1.02 var(--face-display);
		letter-spacing: -0.01em;
	}

	.plugin .what {
		max-width: 52ch;
		margin: 0.625rem 0 0;
		font-size: 1.0625rem;
	}

	.plugin .setup,
	.plugin .reads,
	.plugin .example,
	.plugin .options,
	.plugin .parts {
		padding: 1.25rem clamp(1rem, 3cqi, 2.25rem) 1.5rem;
		min-width: 0;
	}

	.plugin .setup,
	.plugin .reads {
		border-bottom: 1px solid var(--ink);
	}

	.plugin .example {
		padding-bottom: 0;
	}

	/* a section's name, as the atlas labels a plate's parts */
	.plugin .label-h {
		margin: 0 0 0.75rem;
		font: italic 400 1.125rem / 1.2 var(--face-display);
	}

	.plugin .count {
		font: normal 400 0.75rem / 1 var(--face-mono);
		color: var(--quiet);
	}

	.plugin .setup {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
	}

	@container (min-width: 46rem) {
		.plugin .setup {
			grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
			gap: 2rem;
		}
	}

	/* an install line and a config are short: they wrap rather than scroll */
	.plugin .setup pre {
		margin: 0;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--staff);
		font: 400 0.8125rem / 1.55 var(--face-mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* code.css's max-content would keep the line whole; here it wraps in its block */
	.plugin .setup pre > code {
		width: auto;
	}

	.plugin .note {
		margin: 0.625rem 0 0;
		font-size: 0.9375rem;
		max-width: 60ch;
	}

	.plugin .phrases {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 2rem;
		align-items: end;
	}

	.plugin .said {
		margin: 0.875rem 0 0;
		font: 400 0.8125rem / 1.45 var(--face-mono);
		color: var(--quiet);
	}

	/* the page's own prose, at its reading measure, between the two plates */
	.plugin .prose-body {
		max-width: var(--prose-measure);
	}

	.plugin .prose-body > :global(:first-child) {
		margin-top: 0;
	}

	.plugin .options dl {
		margin: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
	}

	.plugin .option dt {
		margin: 0;
	}

	.plugin .sig {
		font: 400 0.8125rem / 1.5 var(--face-mono);
		font-variant-ligatures: none;
		background: none;
		padding: 0;
		overflow-wrap: anywhere;
	}

	.plugin .o-name {
		color: var(--own-name);
		font-weight: 700;
	}

	.plugin .type,
	.plugin .default {
		color: var(--quiet);
	}

	.plugin .option dd {
		margin: 0.25rem 0 0;
		max-width: 62ch;
	}

	.plugin .none {
		margin: 0;
	}

	.plugin .note code,
	.plugin .parts code {
		font: 400 0.875em / 1 var(--face-mono);
		font-variant-ligatures: none;
		background: none;
		padding: 0;
		color: var(--own-name);
		overflow-wrap: anywhere;
	}

	.plugin .parts {
		border-top: 1px solid var(--ink);
		font: 400 0.8125rem / 1.5 var(--face-mono);
		color: var(--ink);
	}

	.plugin .parts p {
		margin: 0 0 0.375rem;
	}

	.plugin .parts code {
		color: var(--ink);
		font-size: 1em;
	}

	.plugin .label,
	.plugin .quiet {
		color: var(--quiet);
	}

	.plugin .label {
		margin-right: 0.5rem;
	}

	.plugin .parts a {
		color: var(--ink);
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.2em;
	}

	@container (max-width: 30rem) {
		.plugin .head {
			grid-template-columns: 5rem minmax(0, 1fr);
		}

		.plugin .glyph {
			font-size: 1rem !important;
		}

		.plugin .sigil {
			padding: 1rem 0.25rem 1.75rem;
		}

		.plugin .sigil::after {
			left: 0.75rem;
			right: 0.75rem;
			bottom: 0.875rem;
		}
	}
</style>
