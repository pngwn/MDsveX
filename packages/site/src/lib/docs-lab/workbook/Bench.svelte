<script lang="ts">
	// one editable example: the source in an editor, what mdsvex compiles it to
	// beside it, and the nudges under it. Until a reader touches it, it is the
	// build's output and no compiler is loaded; the first focus, keystroke or
	// nudge wakes real mdsvex in the browser, and from then on the output
	// follows the source. With the reading on, the editor shows the score of
	// what is in it
	import Output from '$lib/design/atlas/Output.svelte';
	import Score, { type Focus } from '$lib/design/score/Score.svelte';
	import { ExampleReading, use_reading } from '../reading.svelte';
	import type { BuiltExample } from '../types';
	import { compile_live, wake, type Compiled } from './live';

	interface Props {
		example: BuiltExample;
		/** the nudges: what to change, and the source that change gives */
		tries?: { change: string; source?: string }[];
		name: string;
		palette?: 'riso' | 'cvd';
	}

	let { example, tries = [], name, palette = 'riso' }: Props = $props();

	// the example is where the editor starts; from then on the reader's text is the state
	// svelte-ignore state_referenced_locally
	const reading = new ExampleReading(use_reading(), example.scored);
	// svelte-ignore state_referenced_locally
	let text = $state(example.source);
	// svelte-ignore state_referenced_locally
	let compiled = $state<Compiled>({ code: example.code, segments: example.segments, error: example.error });
	let phase = $state<'asleep' | 'waking' | 'awake'>('asleep');
	let focus = $state<Focus | null>(null);
	let tried = $state<number | null>(null);

	const changed = $derived(text !== example.source);
	const lines = $derived(text.split('\n').length);

	let run = 0;
	async function recompile() {
		const at = ++run;
		const next = await compile_live(text, example.setup, example.file);
		if (at === run) compiled = next;
	}

	async function touch() {
		if (phase !== 'asleep') return;
		phase = 'waking';
		await wake();
		phase = 'awake';
		if (changed) recompile();
	}

	function oninput() {
		focus = null;
		tried = null;
		if (phase === 'awake') recompile();
		else touch();
	}

	function load(source: string, i: number | null) {
		text = source;
		tried = i;
		focus = null;
		reading.set(false);
		if (phase === 'awake') recompile();
		else touch();
	}
</script>

<div class="bench">
	<div class="write">
		<div class="head riso">
			<span class="label">You write</span>
			{#if example.file}<span class="file">{example.file}</span>{/if}
			<span class="pick" role="group" aria-label="Show {name} as">
				<button type="button" aria-pressed={!reading.on} onclick={() => reading.set(false)}>edit</button>
				<button type="button" aria-pressed={reading.on} onclick={() => reading.set(true)}>score</button>
			</span>
		</div>
		{#if reading.on}
			<div class="score">
				<Score source={text.endsWith('\n') ? text : `${text}\n`} {palette} bind:focus label="{name}, as the parser reads it" />
			</div>
		{:else}
			<textarea
				class="editor riso"
				aria-label="{name}, editable"
				spellcheck="false"
				autocapitalize="off"
				autocomplete="off"
				rows={Math.max(2, lines)}
				bind:value={text}
				onfocus={touch}
				{oninput}
			></textarea>
		{/if}
		<p class="state riso" aria-live="polite">
			{#if phase === 'asleep'}<span class="dot"></span> edit it: mdsvex compiles in your browser{:else if phase === 'waking'}<span class="dot on"></span> loading mdsvex…{:else}<span class="dot on"></span> live{/if}
			{#if changed}<button type="button" class="reset" onclick={() => load(example.source, null)}>back to the example</button>{/if}
		</p>
	</div>

	<div class="get wrap">
		<div class="head riso"><span class="label">You get</span></div>
		{#if compiled.error}
			<p class="error riso"><span>Error</span> {compiled.error}</p>
		{:else}
			<Output source={text.endsWith('\n') ? text : `${text}\n`} compiled={{ code: compiled.code, segments: compiled.segments, with: [] }} bind:focus {name} />
		{/if}
	</div>

	{#if tries.length}
		<ul class="tries">
			{#each tries as t, i (i)}
				<li>
					{#if t.source}
						<button type="button" class:on={tried === i} onclick={() => load(t.source!, i)}>
							<span class="now riso">Now try</span>
							<span class="change">{@html t.change}</span>
						</button>
					{:else}
						<span class="now riso">Now try</span> <span class="change">{@html t.change}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.bench {
		container-type: inline-size;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 21rem), 1fr));
		gap: 1rem 1.75rem;
		min-width: 0;
	}

	.write,
	.get {
		min-width: 0;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.875rem;
		padding-bottom: 0.5rem;
		font: 400 0.75rem / 1.4 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--quiet);
	}

	.label {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.file {
		color: var(--ink);
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

	.pick button:hover,
	.reset:hover {
		color: var(--ink);
	}

	.pick button[aria-pressed='true'] {
		color: var(--ink);
		text-decoration: underline 1px;
		text-underline-offset: 0.3em;
	}

	/* the editor is the page's code, set as a fence, with a hairline box to say it takes typing */
	.editor {
		display: block;
		box-sizing: border-box;
		width: 100%;
		margin: 0;
		padding: 0.75rem 0.875rem;
		border: 1px solid var(--ink);
		border-radius: 0;
		resize: vertical;
		font: 400 0.9375rem / 1.6 var(--face-mono);
		font-variant-ligatures: none;
		tab-size: 2;
		color: var(--ink);
		background: var(--paper);
		white-space: pre;
		overflow-x: auto;
	}

	.editor:focus-visible {
		outline: 1.5px solid var(--ink);
		outline-offset: 2px;
	}

	.score {
		padding: 0.5rem 0 0.25rem;
	}

	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.75rem;
		margin: 0.5rem 0 0;
		font: 400 0.6875rem / 1.4 var(--face-mono);
		color: var(--quiet);
	}

	.dot {
		display: inline-block;
		width: 0.4rem;
		height: 0.4rem;
		margin-right: -0.25rem;
		border: 1px solid var(--quiet);
		border-radius: 50%;
	}

	.dot.on {
		border-color: var(--line-code);
		background: var(--line-code);
	}

	.reset {
		margin-left: auto;
		text-decoration: underline 1px var(--staff);
		text-underline-offset: 0.25em;
	}

	.get :global(figcaption) {
		display: none;
	}

	.error {
		margin: 0;
		padding: 0.875rem 1rem;
		border: 1px solid var(--line-item);
		font: 400 0.8125rem / 1.6 var(--face-mono);
		overflow-wrap: anywhere;
	}

	.error span {
		color: var(--name-item);
	}

	/* the nudges, the workbook's exercises: each loads its change into the editor */
	.tries {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.5rem;
		margin: 0.25rem 0 0;
		padding: 0;
		list-style: none;
	}

	.tries button {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--staff);
		font: inherit;
		font-size: 0.9375rem;
		text-align: left;
		color: var(--ink);
		background: none;
		cursor: pointer;
	}

	.tries button:hover,
	.tries button.on {
		border-style: solid;
		border-color: var(--ink);
	}

	.now {
		flex: none;
		font: 400 0.6875rem / 1.4 var(--face-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--name-code);
	}
</style>
