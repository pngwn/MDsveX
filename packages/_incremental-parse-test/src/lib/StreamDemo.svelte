<script lang="ts">
	import { onDestroy, onMount, setContext } from "svelte";
	import { HeadingIds, heading_slug, PFMParser, WireEmitter } from "@mdsvex/parse";
	import { ComponentRenderer } from "@mdsvex/render/component";
	import type { ComponentBlock } from "@mdsvex/render/component";
	import { is_entity_name } from "@mdsvex/render/html-cursor";
	import { PluginStream } from "@mdsvex/render/stream";
	import Node from "@mdsvex/render/Node.svelte";
	import Toc from "@mdsvex/plugin-toc/Toc.svelte";
	import { bibliography, cite } from "@mdsvex/plugin-citations/directives";
	import Bibliography from "@mdsvex/plugin-citations/Bibliography.svelte";
	import Lookup from "$lib/components/Lookup.svelte";
	import { stream_plugins } from "$lib/stream_plugins";
	import type { StreamDemo } from "$lib/stream_plugins";

	let { markdown, demo }: { markdown: string; demo: StreamDemo } = $props();

	const directives = { toc: Toc, lookup: Lookup, cite, bibliography };

	// raw, a proxy would hide the private fields of the stream
	let stream = $state.raw<PluginStream | null>(null);
	let blocks = $state.raw<ComponentBlock[]>([]);
	let fed = $state(0);
	let playing = $state(false);
	let ended = $state(false);
	let chunk = $state(3);
	let speed = $state(20);

	// what the page and every Node read the data from, that of the current stream
	const data = {
		get current() {
			return stream?.data.current;
		},
	};
	setContext(Symbol.for("mdsvex.plugin_data"), data);

	const renderer = new ComponentRenderer();
	let emitter: WireEmitter | null = null;
	let parser: PFMParser | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;

	function restart(): void {
		pause();
		stream?.stop();
		renderer.reset();
		const next = new PluginStream({
			...stream_plugins(demo),
			headings: new HeadingIds(heading_slug, is_entity_name),
		});
		next.renderers.push(renderer);
		next.on_change(() => {
			// the renderer bumps v in place, a keyed each sees new entries only
			blocks = renderer.update(next.buffer, "").map(({ idx, v }) => ({ idx, v }));
		});
		stream = next;
		emitter = new WireEmitter();
		parser = new PFMParser(emitter);
		parser.init();
		fed = 0;
		ended = false;
		blocks = [];
	}

	function tick(): void {
		if (stream === null || emitter === null || parser === null) return;
		if (fed >= markdown.length) return finish();
		const next = Math.min(markdown.length, fed + chunk);
		emitter.set_source(markdown.slice(0, next));
		parser.feed(markdown.slice(fed, next));
		fed = next;
		stream.apply(emitter.flush());
	}

	function finish(): void {
		pause();
		if (stream === null || emitter === null || parser === null || ended) return;
		emitter.set_source(markdown);
		parser.finish();
		stream.apply(emitter.flush());
		ended = true;
		stream.end()?.catch((error) => console.error(error));
	}

	function play(): void {
		if (ended) restart();
		playing = true;
		timer = setInterval(tick, speed);
	}

	function pause(): void {
		playing = false;
		if (timer !== null) clearInterval(timer);
		timer = null;
	}

	function to_end(): void {
		while (!ended) {
			if (fed >= markdown.length) finish();
			else tick();
		}
	}

	// the page makes a new demo for each document, so one start is enough
	onMount(restart);

	onDestroy(() => {
		pause();
		stream?.stop();
	});

	const looked_up = $derived(
		(data.current?.lookup?.looked_up as unknown[] | undefined)?.length ?? 0
	);

	const entries = $derived(
		(data.current?.toc?.headings as unknown[] | undefined)?.length ?? 0
	);

	const cited = $derived(
		(data.current?.citations?.cited as unknown[] | undefined)?.length ?? 0
	);

	const loaded = $derived(
		Object.keys(data.current?.citations ?? {}).filter((key) => key.startsWith("entry:"))
			.length
	);
</script>

<div class="stream">
	<header class="controls">
		<button onclick={() => (playing ? pause() : play())}>{playing ? "Pause" : "Play"}</button>
		<button onclick={restart}>Restart</button>
		<button onclick={to_end}>To the end</button>
		<label>
			chunk
			<select bind:value={chunk}>
				<option value={1}>1</option>
				<option value={3}>3</option>
				<option value={10}>10</option>
				<option value={40}>40</option>
			</select>
		</label>
		<label>
			tick
			<select
				bind:value={speed}
				onchange={() => {
					if (playing) {
						pause();
						play();
					}
				}}
			>
				<option value={60}>60ms</option>
				<option value={20}>20ms</option>
				<option value={5}>5ms</option>
			</select>
		</label>
		<span class="badge" data-testid="fed">{fed}/{markdown.length}</span>
		{#if demo === "citations"}
			<span class="badge" data-testid="cited">{cited} cited</span>
			<span class="badge" data-testid="loaded">{loaded} entries</span>
		{:else}
			<span class="badge" data-testid="entries">{entries} entries</span>
		{/if}
		{#if demo === "deferred"}
			<span class="badge" data-testid="looked-up">{looked_up} looked up</span>
		{/if}
		{#if ended}<span class="badge">ended</span>{/if}
	</header>

	<div class="panes">
		<article class="render-content prose" data-testid="document">
			{#if stream !== null}
				{#each blocks as block (block.idx)}
					{#key block.v}
						<Node
							buf={stream.buffer}
							idx={block.idx}
							source=""
							{directives}
							plugin_data={data}
						/>
					{/key}
				{/each}
			{/if}
		</article>
		<aside class="side" data-testid="side">
			{#if demo === "citations"}
				<div class="panel-header">Bibliography, live</div>
				<Bibliography aria-label="Live bibliography" />
			{:else}
				<div class="panel-header">Table of contents, live</div>
				<Toc aria-label="Live table of contents" />
			{/if}
		</aside>
	</div>
</div>

<style>
	.stream {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}
	.controls {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-secondary);
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
	.controls button,
	.controls select {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.25rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
	.badge {
		background: var(--bg-tertiary);
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-sm);
		color: var(--accent);
	}
	.panes {
		display: grid;
		grid-template-columns: 1fr 280px;
		flex: 1;
		overflow: hidden;
	}
	.render-content {
		padding: 1rem 1.5rem;
		overflow-y: auto;
	}
	.side {
		border-left: 1px solid var(--border);
		background: var(--bg-secondary);
		overflow-y: auto;
		font-size: 0.85rem;
	}
	.panel-header {
		padding: 0.5rem 0.75rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		border-bottom: 1px solid var(--border);
	}
	.side :global(nav),
	.side :global(.bibliography) {
		padding: 0.5rem 0.75rem;
	}
</style>
