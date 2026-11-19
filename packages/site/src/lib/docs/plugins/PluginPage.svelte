<script lang="ts">
	// a plugin's docs page: the atlas's plate turned to a plugin, over the page's
	// own prose. The plate is read from the plugin: its mark and name, what it
	// does, how to install and turn it on, the syntax it reads, and its example,
	// built with the plugin on. Under the prose, its options from its types and
	// the parts its package exports. docs/plugins/+layout.svelte puts it round
	// every page whose frontmatter names a package. Both plates are the docs'
	// one Plate, so a change to the plate changes these and every docs plate
	import type { Snippet } from 'svelte';
	import Plate from '../Plate.svelte';
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
	// the plugin needs one of its optional peers, the install line takes the first listed
	const optional = $derived(p.peers.filter((x) => x.optional).map((x) => x.name));
	const install_with = (peer?: string) =>
		['pnpm add -D', `${p.package}`, ...(p.example.with ?? []).map((w) => `${w}`), ...p.peers.filter((x) => !x.optional).map((x) => x.name), ...(peer ? [peer] : [])].join(' ');
	const install = $derived(install_with(optional[0]));
	const alternatives = $derived(optional.slice(1).map(install_with));
	const config = $derived.by(() => {
		const others = p.example.with ?? [];
		const factories = [...others.map((w) => w.replace('@mdsvex/plugin-', '').replace(/-/g, '_')), p.factory];
		const imports = [...others.map((w, i) => `import { ${factories[i]} } from '${w}';`), `import { ${p.factory} } from '${p.package}';`];
		const calls = factories.map((f, i) => (i === factories.length - 1 && p.example.options && Object.keys(p.example.options).length ? `${f}(${literal(p.example.options)})` : `${f}()`));
		const parts = [p.needs?.heading_ids && 'heading_ids: true', p.needs?.unwrap_images && 'unwrap_images: true', `plugins: [${calls.join(', ')}]`].filter(Boolean);
		return `${imports.join('\n')}\n\nmdsvex({ ${parts.join(', ')} });`;
	});

	/** the example options as a reader would write them */
	function literal(value: unknown): string {
		if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
		if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
		if (value !== null && typeof value === 'object') {
			const entries = Object.entries(value).map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : literal(k)}: ${literal(v)}`);
			return entries.length ? `{ ${entries.join(', ')} }` : '{}';
		}
		return String(value);
	}
</script>

<div class="wide plugin" style:--own-line="var(--line-{own})" style:--own-name="var(--name-{own})">
	<Plate id="plugin" mark={glyph} tone={own} title={p.title} level="h1" size="page">
		{#snippet kicker()}
			{#each concerns as c, i (c.id)}<a class="concern" href="/docs/plugins?for={c.id}"><em>{c.name.toLowerCase()}</em></a>{i < concerns.length - 1 ? ' ' : ''}{/each}
			<code class="pkg">{p.package}<wbr />@{p.version}</code>
		{/snippet}

		<div class="plate-lede"><p class="what">{p.description}</p></div>

		<div class="setup">
			<div>
				<p class="label-h">Install</p>
				<pre class="code"><code>{install}</code></pre>
				{#if alternatives.length}
					<p class="note">It needs one of {#each optional as name, i (name)}{i ? ' or ' : ''}<code>{name}</code>{/each}, its optional peers. For {#each optional.slice(1) as name, i (name)}{i ? ' or ' : ''}<code>{name}</code>{/each} instead:</p>
					{#each alternatives as line (line)}<pre class="code"><code>{line}</code></pre>{/each}
				{/if}
			</div>
			<div>
				<p class="label-h">Turn it on</p>
				<pre class="code"><code>{config}</code></pre>
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
			<p class="said">{reads_line(p).join(' · ')}</p>
		</div>

		<div class="example">
			<p class="label-h">An example</p>
			<Example plugin={p} bare />
		</div>
	</Plate>

	<div class="prose-body">
		{@render children()}
	</div>

	<Plate size="page">
		<section class="options" aria-label="Options">
			<p class="label-h">Options, from its types <span class="count">{p.options.length}</span></p>
			{#if p.options.length}
				<dl>
					{#each p.options as o (o.name)}
						<div class="option">
							<dt>
								<code class="sig"><span class="o-name">{o.name}</span>{o.optional ? '?' : ''}: <span class="type">{o.type}</span>{#if o.default}<span class="default">{' = '}{o.default}</span>{/if}</code>
							</dt>
							<dd>{o.text.replace(/^./, (c) => c.toUpperCase())}</dd>
						</div>
					{/each}
				</dl>
			{:else}
				<p class="none">None.</p>
			{/if}
		</section>

		<!-- the texture inside: a mask on the part would clip its hairline -->
		<footer class="parts">
			<div>
				{#if p.exports.components.length}
					<p><span class="label">Components</span> {#each p.exports.components as c, i (c)}{i ? ', ' : ''}<code>{p.package}/{c}</code>{/each}</p>
				{/if}
				{#if p.exports.css.length}
					<p><span class="label">Stylesheet</span> {#each p.exports.css as c, i (c)}{i ? ', ' : ''}<code>{p.package}/{c}</code>{/each}<span class="quiet">, or <code>{p.factory}({'{'} css: false {'}'})</code> for none</span></p>
				{/if}
				<p><a href="/docs/plugins">Find another plugin</a> · <a href="/docs/plugins/writing/bundles">Write your own</a></p>
			</div>
		</footer>
	</Plate>
</div>

<style>
	/* inside the docs' .prose article: every rule is under .plugin, so it outranks
	   .prose's. The plates themselves, their head and the hairlines between
	   their parts, are Plate.svelte's */
	/* every grid here has a minmax(0, 1fr) column: code.css sets a block's code
	   to max-content, and an auto column would grow to it, past the page */
	.plugin {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2.25rem;
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

	.plugin .what {
		max-width: 52ch;
		margin: 0.625rem 0 0;
		font-size: 1.0625rem;
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
	@container (max-width: 37.5rem) {
		.pkg {
			flex-basis: 100%;
			margin-left: 0;
			overflow-wrap: anywhere;
		}
	}
	.setup > :first-child pre code {
		width: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
