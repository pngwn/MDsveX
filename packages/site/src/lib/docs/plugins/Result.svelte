<script lang="ts" module>
	import type { Plugin } from './types';

	/** what a plugin reads, in a few words, from its bundle: what it owns, what it acts on */
	export function reads_line(p: Plugin): string[] {
		const r = p.reads;
		const out: string[] = [];
		if (r.directives.length) out.push(`owns ${r.directives.map((d) => `${d}`).join(', ')}`);
		if (r.fences.length) out.push(`claims ${r.fences.map((f) => `${f} fences`).join(', ')}`);
		if (r.elements.length) out.push(`replaces ${r.elements.map((e) => `<${e}>`).join(', ')}`);
		const nodes = r.nodes.filter((n) => !(r.fences.length && n === 'code_fence'));
		if (nodes.length) out.push(`acts on ${nodes.map((n) => (n === 'code_fence' ? 'code blocks' : `${n}s`)).join(', ')}`);
		if (r.observes.length) out.push(`reads ${r.observes.join(', ')} from another plugin`);
		if (r.text) out.push('reads text as it is written');
		if (r.document) out.push('reads the whole document');
		return out;
	}
</script>

<script lang="ts">
	// one plugin in the finder: a line of what it is for and the syntax it
	// reads, which opens on its example. A <details>, so it opens without
	// JavaScript, and the example's output is in the page from the build
	import { CONCERNS } from './concerns';
	import Example from './Example.svelte';
	import Syntax from './Syntax.svelte';
	import type { Hit } from './search';

	interface Props {
		plugin: Plugin;
		hit?: Hit | null;
		/** the concern it is listed under, so its others can be said as "also" */
		under?: string;
	}

	let { plugin: p, hit = null, under }: Props = $props();

	let open = $state(false);

	const also = $derived(CONCERNS.filter((c) => p.concerns.includes(c.id) && c.id !== under));
	const needs = $derived(
		[p.needs?.heading_ids && 'heading_ids', p.needs?.unwrap_images && 'unwrap_images', ...p.peers.filter((x) => !x.optional).map((x) => x.name)].filter(Boolean) as string[],
	);
	const optional = $derived(p.peers.filter((x) => x.optional).map((x) => x.name));
</script>

<details class="result" id={p.id} bind:open>
	<summary>
		<span class="name-col">
			<span class="name">{p.title}</span>
			<code class="package">{p.package}</code>
		</span>
		<span class="what">{p.description}</span>
		<span class="syntax" aria-label="Syntax it reads">
			{#each p.syntax as s (s.mark)}
				<Syntax sample={s} />
			{:else}
				<span class="none">no syntax of its own</span>
			{/each}
		</span>
		<span class="meta">
			{#if hit}
				<span class="why">{#each hit.why as w, i (i)}{i ? ', ' : ''}{needs.includes(w.text) ? 'Requires' : 'Matched ' + w.field} <b>{w.text.length > 48 ? w.text.slice(0, 46) + '…' : w.text}</b>{/each}</span>
			{/if}
			{#each reads_line(p) as r (r)}<span>{r}</span>{/each}
			{#if needs.length}<span>needs {needs.join(', ')}</span>{/if}
			{#if optional.length}<span>with {optional.join(' or ')}, optional peers</span>{/if}
			{#if p.waits}<span>waits, as {p.waits}</span>{/if}
			{#if also.length}<span>{under ? 'also' : 'for'} {also.map((c) => c.name.toLowerCase()).join(', ')}</span>{/if}
		</span>
	</summary>

	{#if open}
		<div class="body">
			<Example plugin={p} />
			<p class="links">
				<a href={p.href}>{p.title}, the whole page</a>
				<code>pnpm add -D {p.package}@next{needs.filter((n) => p.peers.some((x) => x.name === n)).map((n) => ` ${n}`).join('')}</code>
			</p>
		</div>
	{:else}
		<!-- closed, the built output is still in the page for a reader without JavaScript -->
		<noscript><div class="body"><div class="nojs">{@html p.example.output.html}</div></div></noscript>
	{/if}
</details>

<style>
	.result {
		container-type: inline-size;
		border-top: 1px solid var(--staff);
	}

	.result[open] {
		border-top-color: var(--ink);
	}

	summary {
		position: relative;
		display: grid;
		grid-template-columns: minmax(9rem, 0.8fr) minmax(14rem, 1.3fr) minmax(12rem, 1fr);
		grid-template-areas:
			'name what syntax'
			'name meta meta';
		gap: 0.25rem 1.5rem;
		align-items: baseline;
		padding: 1rem 1.5rem 0.875rem 0;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover .name {
		text-decoration: underline 1.5px var(--staff);
		text-underline-offset: 0.15em;
	}

	summary:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	.name-col {
		grid-area: name;
		display: grid;
		gap: 0.25rem;
	}

	.name {
		font: 400 1.5rem / 1.1 var(--face-display);
	}

	/* the open mark of a details, drawn as a small bar line beside the name */
	summary::after {
		content: '';
		position: absolute;
		right: 3px;
		top: 1.6rem;
		width: 0.4em;
		height: 0.4em;
		margin-left: 0.4em;
		border-right: 1.5px solid var(--quiet);
		border-bottom: 1.5px solid var(--quiet);
		transform: translateY(-0.2em) rotate(45deg);
	}

	.result[open] summary::after {
		transform: translateY(0) rotate(-135deg);
	}

	.package {
		font: 400 0.6875rem / 1.3 var(--face-mono);
		color: var(--quiet);
		background: none;
		padding: 0;
		overflow-wrap: anywhere;
	}

	.what {
		grid-area: what;
		font: 400 1rem / 1.45 var(--face-text);
		max-width: 52ch;
	}

	.syntax {
		grid-area: syntax;
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.25rem 1.75rem;
	}

	.none {
		font: italic 400 0.875rem / 1.2 var(--face-text);
		color: var(--quiet);
	}

	.meta {
		grid-area: meta;
		display: flex;
		flex-wrap: wrap;
		gap: 0.125rem 1rem;
		font: 400 0.75rem / 1.45 var(--face-mono);
		color: var(--quiet);
	}

	.why {
		color: var(--ink);
	}

	.why b {
		font-weight: 700;
	}

	.body {
		padding: 0.25rem 0 1.75rem;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 1.5rem;
		margin: 0.875rem 0 0;
		font: 400 0.8125rem / 1.4 var(--face-mono);
	}

	.links a {
		color: var(--ink);
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.2em;
	}

	.links a:hover {
		text-decoration-color: var(--ink);
	}

	.links code {
		color: var(--quiet);
		background: none;
		padding: 0;
		font: inherit;
		overflow-wrap: anywhere;
	}

	.result:not([open]) .syntax > :global(:nth-child(n + 2)),
	.result:not([open]) .meta > :not(.why),
	.result:not([open]) .meta:not(:has(.why)) {
		display: none;
	}

	@container (max-width: 47rem) {
		summary {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'name' 'what' 'syntax' 'meta';
			gap: 0.375rem;
		}

		.name-col {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0.75rem;
		}

		.syntax {
			margin-top: 0.125rem;
		}

	}
</style>
