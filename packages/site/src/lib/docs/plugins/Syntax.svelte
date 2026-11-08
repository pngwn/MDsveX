<script lang="ts">
	// a syntax a plugin reads, as one phrase of the score: the mark in the
	// underlay's mono, a line over it in the colour of what the parser reads
	// it as, a bar at each end, and its name in the corner. The kind is the real
	// parser's (catalog.server.ts reads it with pfm_tree), so `:tada:` is drawn
	// as the quiet text it is: emoji works on text, it adds no syntax
	import { tone } from '$lib/design/score/kinds';
	import type { Sample } from './types';

	let { sample }: { sample: Sample } = $props();

	const WORDS: Record<string, string> = {
		directive_container: 'directive',
		directive_leaf: 'directive',
		directive_inline: 'directive',
		code_fence: 'code block',
		html_comment: 'comment',
	};

	const t = $derived(tone(sample.kind));
	const quiet = $derived(t === 'text');
	// a directive is named by its name, as the score names it
	const directive = $derived(sample.kind.startsWith('directive_') ? /^:+([\w-]+)/.exec(sample.mark)?.[1] : undefined);
	// the characters the construct owns take its name tone, its content stays ink
	const runs = $derived(
		[...sample.mark.matchAll(/([:#`\[\]()<>!=-]+)|([^:#`\[\]()<>!=-]+)/g)].map((m) => ({ text: m[0], syntax: !!m[1] && !quiet })),
	);
	const name = $derived(quiet ? '' : directive ? `${directive} directive` : (WORDS[sample.kind] ?? sample.kind.replace(/_/g, ' ')));
</script>

<span class="phrase" class:quiet style:--c-line="var(--line-{t})" style:--c-name="var(--name-{t})">
	{#if name}<em class="name" aria-hidden="true">{name}</em>{/if}
	<code class="underlay riso">{#each runs as r, i (i)}{#if r.syntax}<span class="own">{r.text}</span>{:else}{r.text}{/if}{/each}</code>
</span>

<style>
	.phrase {
		position: relative;
		display: inline-grid;
		align-content: end;
		padding-top: 1.05rem;
		max-width: 100%;
	}

	.quiet {
		padding-top: 0.5rem;
	}

	/* the line and its bars, over the mark, as a phrase sits over its underlay */
	.phrase::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: calc(1.05rem - 0.45rem);
		height: 0.7rem;
		border-inline: 1.5px solid var(--c-line);
		background: linear-gradient(var(--c-line), var(--c-line)) center / 100% 1.5px no-repeat;
	}

	.quiet::before {
		top: calc(0.5rem - 0.2rem);
		height: 0.4rem;
		border-width: 1px;
		background-size: 100% 1px;
	}

	.name {
		position: absolute;
		left: calc(2px + 1.5px);
		top: -0.05rem;
		font: italic 400 0.8125rem / 1 var(--face-display);
		color: var(--c-name);
		white-space: nowrap;
	}

	.underlay {
		display: block;
		padding: 0.125rem 0.125rem 0;
		font: 400 0.8125rem / 1.35 var(--face-mono);
		letter-spacing: 0.08em;
		font-variant-ligatures: none;
		color: var(--ink);
		background: none;
		white-space: pre;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.own {
		color: var(--c-name);
	}
</style>
