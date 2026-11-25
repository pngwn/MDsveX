<script lang="ts">
	// a document arriving over the wire with its plugins running: what they write
	// shows beside the text as it grows, and deferred work patches blocks that
	// already rendered
	import { onDestroy, onMount, setContext } from "svelte";
	import { HeadingIds, heading_slug, PFMParser, WireEmitter } from "@mdsvex/parse";
	import { ComponentRenderer } from "@mdsvex/render/component";
	import type { ComponentBlock } from "@mdsvex/render/component";
	import { is_entity_name } from "@mdsvex/render/html-cursor";
	import { PluginStream } from "@mdsvex/render/stream";
	import Node from "@mdsvex/render/Node.svelte";
	import { create_highlight, load_default_languages } from "mdsvex/highlight";
	import type { HighlightConfig } from "mdsvex/highlight";
	import Toc from "@mdsvex/plugin-toc/Toc.svelte";
	import { bibliography, cite } from "@mdsvex/plugin-citations/directives";
	import Bibliography from "@mdsvex/plugin-citations/Bibliography.svelte";
	import Lookup from "./components/Lookup.svelte";
	import { stream_plugins } from "./stream_plugins";
	import type { StreamDemo } from "./stream_plugins";

	// the page keys the demo by its example, so neither prop changes
	let { markdown, demo }: { markdown: string; demo: StreamDemo } = $props();

	const directives = { toc: Toc, lookup: Lookup, cite, bibliography };

	// raw, a proxy would hide the private fields of the stream
	let stream = $state.raw<PluginStream | null>(null);
	let blocks = $state.raw<ComponentBlock[]>([]);
	let fed = $state(0);
	let playing = $state(false);
	let ended = $state(false);
	// undefined until the languages load, fences drawn before that are plain
	let highlight = $state.raw<HighlightConfig>();
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

	// it plays as it opens, an empty page says nothing
	onMount(() => {
		restart();
		play();
		load_default_languages().then((languages) => {
			highlight = create_highlight({ languages });
		});
	});

	onDestroy(() => {
		pause();
		stream?.stop();
	});

	const count = (value: unknown) => (value as unknown[] | undefined)?.length ?? 0;
	const looked_up = $derived(count(data.current?.lookup?.looked_up));
	const entries = $derived(count(data.current?.toc?.headings));
	const cited = $derived(count(data.current?.citations?.cited));
	const loaded = $derived(
		Object.keys(data.current?.citations ?? {}).filter((key) => key.startsWith("entry:")).length,
	);
</script>

<div class="stream">
	<div class="controls">
		<button class="play" onclick={() => (playing ? pause() : play())}>{playing ? "pause" : "play"}</button>
		<button onclick={restart}>restart</button>
		<button onclick={to_end}>to the end</button>
		<label>
			chunk
			<select bind:value={chunk}>
				<option value={1}>1 char</option>
				<option value={3}>3 chars</option>
				<option value={10}>10 chars</option>
				<option value={40}>40 chars</option>
			</select>
		</label>
		<label>
			every
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
		<span class="counts">
			<span data-testid="fed">{fed}/{markdown.length}</span>
			{#if demo === "citations"}
				<span data-testid="cited">{cited} cited</span>
				<span data-testid="loaded">{loaded} entries</span>
			{:else}
				<span data-testid="entries">{entries} entries</span>
			{/if}
			{#if demo === "deferred"}
				<span data-testid="looked-up">{looked_up} looked up</span>
			{/if}
			{#if ended}<span class="ended">ended</span>{/if}
		</span>
	</div>

	<div class="panes">
		<article class="output prose" data-testid="document">
			{#if stream !== null}
				{#each blocks as block (block.idx)}
					{#key block.v}
						<Node
							buf={stream.buffer}
							idx={block.idx}
							source=""
							{directives}
							{highlight}
							plugin_data={data}
						/>
					{/key}
				{/each}
			{/if}
		</article>
		<aside data-testid="side">
			{#if demo === "citations"}
				<h2 class="pane-head">Bibliography, live</h2>
				<Bibliography aria-label="Live bibliography" />
			{:else}
				<h2 class="pane-head">Table of contents, live</h2>
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
		min-height: 0;
	}

	.controls {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--staff);
		color: var(--quiet);
	}

	.play {
		min-width: 7ch;
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
	}

	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1rem;
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}

	.ended {
		color: var(--ink);
	}

	.panes {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(12rem, 20rem);
	}

	.output {
		padding: 1rem 1.25rem;
		overflow-y: auto;
		font-size: 1rem;
	}

	aside {
		border-left: 1px solid var(--staff);
		overflow-y: auto;
	}

	aside :global(a) {
		color: var(--ink);
	}

	aside :global(nav),
	aside :global(.bibliography) {
		padding: 0.5rem 0.75rem;
	}

	@media (max-width: 48rem) {
		.panes {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) minmax(6rem, 30vh);
		}

		aside {
			border-left: 0;
			border-top: 1px solid var(--staff);
		}
	}
</style>
