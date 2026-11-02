<script lang="ts">
	// Learn's differences from CommonMark as one bench: a key per difference,
	// one editor, and the two readings of what is in it, CommonMark's beside
	// mdsvex's, each rendered and as html. Picking a key loads its source; a
	// link to its id (the strip at the top, or another page) picks it too. Until
	// a reader edits, both readings are the build's; then micromark and mdsvex
	// read the edit in the browser
	import { onMount } from 'svelte';
	import Score from '$lib/design/score/Score.svelte';
	import { ExampleReading, use_reading } from '../reading.svelte';
	import type { BuiltContrast } from '../types';
	import { read_both, safe, wake_render, type LiveReadings } from './live';

	interface Props {
		contrasts: BuiltContrast[];
		palette?: 'riso' | 'cvd';
	}

	let { contrasts, palette = 'riso' }: Props = $props();

	const reading = new ExampleReading(use_reading());
	let index = $state(0);
	const c = $derived(contrasts[index]);
	// svelte-ignore state_referenced_locally
	let text = $state(contrasts[0].source);
	let live = $state<LiveReadings | null>(null);
	let phase = $state<'asleep' | 'waking' | 'awake'>('asleep');
	let bench: HTMLElement;

	const edited = $derived(text !== c.source);

	function pick(i: number, scroll = false) {
		index = i;
		text = contrasts[i].source;
		live = null;
		if (scroll) bench.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	}

	let run = 0;
	async function reread() {
		const at = ++run;
		const next = await read_both(text, !!c.gfm);
		if (at === run) live = edited ? next : null;
	}

	async function oninput() {
		if (phase === 'asleep') {
			phase = 'waking';
			await wake_render();
			phase = 'awake';
		}
		if (phase === 'awake') reread();
	}

	function from_hash() {
		const i = contrasts.findIndex((x) => `#${x.id}` === location.hash);
		if (i >= 0) pick(i, true);
	}

	onMount(() => {
		from_hash();
		addEventListener('hashchange', from_hash);
		return () => removeEventListener('hashchange', from_hash);
	});
</script>

<div class="cbench" bind:this={bench}>
	<!-- the anchors the strip and other pages link to, one per difference -->
	{#each contrasts as x (x.id)}<span class="anchor" id={x.id}></span>{/each}

	<div class="keys" role="tablist" aria-label="Differences from CommonMark">
		{#each contrasts as x, i (x.id)}
			<button
				type="button"
				role="tab"
				aria-selected={i === index}
				class="key"
				style:--c-line="var(--line-{x.tone})"
				style:--c-name="var(--name-{x.tone})"
				onclick={() => {
					history.replaceState(history.state, '', `#${x.id}`);
					pick(i);
				}}
			>
				<span aria-hidden="true">{x.mark}</span><span class="sr">{x.write.replace(/<[^>]+>/g, '')}</span>
			</button>
		{/each}
	</div>

	<div class="panel" role="tabpanel" style:--own-name="var(--name-{c.tone})">
		<p class="lemma">{@html c.write}{#if c.fix}<span class="fix"> · {@html c.fix}</span>{/if}</p>

		<div class="edit">
			<div class="head riso">
				<span class="label">You write</span>
				<span class="pick" role="group" aria-label="Show the source as">
					<button type="button" aria-pressed={!reading.on} onclick={() => reading.set(false)}>edit</button>
					<button type="button" aria-pressed={reading.on} onclick={() => reading.set(true)}>score</button>
				</span>
			</div>
			{#if reading.on}
				<Score source={`${text}\n`} {palette} cue={edited ? [] : c.ranges} label="The source as mdsvex reads it" />
			{:else}
				<textarea class="editor riso" aria-label="The source, editable" spellcheck="false" rows={Math.max(2, text.split('\n').length)} bind:value={text} {oninput}></textarea>
			{/if}
			<p class="state riso" aria-live="polite">
				{#if phase === 'waking'}loading micromark and mdsvex…{:else if edited && phase === 'awake'}both read your edit, live{:else}edit it: both parsers read it in your browser{/if}
				{#if edited}<button type="button" class="reset" onclick={() => pick(index)}>back to the example</button>{/if}
			</p>
		</div>

		<div class="readings">
			<section>
				<p class="who riso">{c.gfm ? 'GFM' : 'CommonMark'}</p>
				{#if !edited}<p class="said">{@html c.commonmark}</p>{/if}
				{#if live}
					<div class="rendered">{@html safe(live.commonmark)}</div>
					<pre class="html"><code>{live.commonmark}</code></pre>
				{:else}
					<div class="rendered">{@html c.commonmark_reading.html}</div>
					<div class="html-hl wrap">{@html c.commonmark_reading.html_code}</div>
				{/if}
			</section>
			<section>
				<p class="who riso">mdsvex</p>
				{#if !edited}<p class="said">{@html c.mdsvex}</p>{/if}
				{#if live?.error}
					<p class="error riso"><span>Error</span> {live.error}</p>
				{:else if live}
					<div class="rendered">{@html safe(live.mdsvex)}</div>
					<pre class="html"><code>{live.mdsvex}</code></pre>
				{:else}
					<div class="rendered">{@html c.mdsvex_reading.html}</div>
					<div class="html-hl wrap">{@html c.mdsvex_reading.html_code}</div>
				{/if}
			</section>
		</div>
	</div>
</div>

<style>
	.cbench {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1rem;
		scroll-margin-top: 1.5rem;
	}

	.anchor {
		position: absolute;
		top: 0;
		scroll-margin-top: 1.5rem;
	}

	/* the strip's marks as keys: a hairline cap each, the mark in its colour, the
	   picked one pressed, ink on paper reversed */
	.keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.key {
		min-width: 2.75rem;
		height: 2.5rem;
		padding: 0 0.5rem;
		border: 1px solid var(--ink);
		border-bottom-width: 3px;
		border-bottom-color: var(--c-line);
		font: 400 1rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--c-name);
		background: var(--paper);
		cursor: pointer;
	}

	.key:hover {
		background: color-mix(in srgb, var(--c-line) 13%, var(--paper));
	}

	.key[aria-selected='true'] {
		border-color: var(--ink);
		border-bottom-color: var(--ink);
		color: var(--paper);
		background: var(--ink);
		translate: 0 2px;
	}

	.key:focus-visible {
		outline: 1.5px solid var(--ink);
		outline-offset: 2px;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.panel {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
		padding: 1.25rem clamp(1rem, 2.5vw, 1.75rem) 1.5rem;
		border: 1px solid var(--ink);
	}

	.lemma {
		margin: 0;
		font: 400 1.375rem / 1.25 var(--face-display);
	}

	.lemma :global(code) {
		color: var(--own-name);
		font-size: 0.82em;
	}

	.fix {
		font: italic 400 1.0625rem / 1.3 var(--face-text);
		color: var(--quiet);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		padding-bottom: 0.5rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.label,
	.who {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.pick {
		display: flex;
		gap: 0.75rem;
		margin-left: auto;
	}

	.pick button,
	.reset {
		padding: 0;
		border: 0;
		font: inherit;
		color: var(--quiet);
		background: none;
		cursor: pointer;
	}

	.pick button[aria-pressed='true'] {
		color: var(--ink);
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	.editor {
		display: block;
		box-sizing: border-box;
		width: 100%;
		margin: 0;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--ink);
		border-radius: 0;
		resize: vertical;
		font: 400 1.0625rem / 1.6 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--ink);
		background: var(--paper);
		white-space: pre;
	}

	.state {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin: 0.5rem 0 0;
		font: 400 0.6875rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.reset {
		margin-left: auto;
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.25em;
	}

	.readings {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
		gap: 1rem 1.75rem;
	}

	.readings section {
		display: grid;
		align-content: start;
		gap: 0.5rem;
		min-width: 0;
		padding-top: 0.75rem;
		border-top: 1px solid var(--staff);
	}

	.who {
		margin: 0;
		font: 400 0.75rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.said {
		margin: 0;
		font: italic 400 1rem / 1.35 var(--face-text);
	}

	.rendered {
		font: 400 1.0625rem / 1.45 var(--face-text);
		overflow-wrap: anywhere;
	}

	.rendered :global(:is(p, h1, h2, blockquote, pre, ul, ol, hr)) {
		margin: 0 0 0.375rem;
	}

	.rendered :global(:is(h1, h2)) {
		font: 500 1.375rem / 1.15 var(--face-display);
	}

	.rendered :global(blockquote) {
		padding-left: 0.75rem;
		border-left: 1.5px solid var(--line-quote);
	}

	.rendered :global(hr) {
		border: 0;
		border-top: 1px solid var(--ink);
	}

	.html,
	.html-hl :global(pre) {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.error {
		margin: 0;
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--line-item);
		font: 400 0.75rem / 1.55 var(--face-mono);
		overflow-wrap: anywhere;
	}

	.error span {
		color: var(--name-item);
	}
</style>
