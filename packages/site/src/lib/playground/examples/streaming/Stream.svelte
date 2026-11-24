<script>
	// the harness: feeds the source to the incremental parser a few characters
	// at a time and renders what there is so far, as a chat or an editor would
	import { onDestroy, onMount } from 'svelte';
	import { HeadingIds, heading_slug, PFMParser, WireEmitter } from '@mdsvex/parse';
	import { ComponentRenderer } from '@mdsvex/render/component';
	import { is_entity_name } from '@mdsvex/render/html-cursor';
	import { PluginStream } from '@mdsvex/render/stream';
	import Node from '@mdsvex/render/Node.svelte';

	let { source, plugins = [], directive_handlers = [], components = {}, directives = {} } = $props();

	let chunk = $state(3);
	let every = $state(20);
	let fed = $state(0);
	let playing = $state(false);
	let ended = $state(false);
	// raw, a proxy would hide the private fields of the stream
	let stream = $state.raw(null);
	let blocks = $state.raw([]);

	// what plugins wrote, for a component that reads it from the context
	const data = {
		get current() {
			return stream?.data.current;
		},
	};

	// keeps the blocks that have closed, so a long document costs little to draw
	const renderer = new ComponentRenderer();
	let emitter;
	let parser;
	let timer;

	function restart() {
		pause();
		stream?.stop();
		renderer.reset();
		const next = new PluginStream({
			plugins,
			directive_handlers,
			headings: new HeadingIds(heading_slug, is_entity_name),
		});
		next.renderers.push(renderer);
		// after each batch, and again when deferred work patches a node
		next.on_change(() => {
			blocks = renderer.update(next.buffer, '').map(({ idx, v }) => ({ idx, v }));
		});
		stream = next;
		// the parser emits opcodes, the emitter packs them into batches for the wire
		emitter = new WireEmitter();
		parser = new PFMParser(emitter);
		parser.init();
		fed = 0;
		ended = false;
		blocks = [];
	}

	function tick() {
		if (fed >= source.length) return finish();
		const next = Math.min(source.length, fed + chunk);
		emitter.set_source(source.slice(0, next));
		parser.feed(source.slice(fed, next));
		fed = next;
		stream.apply(emitter.flush());
	}

	function finish() {
		pause();
		if (ended) return;
		emitter.set_source(source);
		parser.finish();
		stream.apply(emitter.flush());
		ended = true;
		// waits for deferred work still running, then every block renders again
		stream.end()?.catch((error) => console.error(error));
	}

	function play() {
		if (ended) restart();
		playing = true;
		timer = setInterval(tick, every);
	}

	function pause() {
		playing = false;
		clearInterval(timer);
	}

	function retime() {
		if (!playing) return;
		pause();
		play();
	}

	onMount(() => {
		restart();
		play();
	});

	onDestroy(() => {
		pause();
		stream?.stop();
	});
</script>

<div class="controls">
	<button onclick={() => (playing ? pause() : play())}>{playing ? 'pause' : 'play'}</button>
	<button onclick={restart}>restart</button>
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
		<select bind:value={every} onchange={retime}>
			<option value={60}>60ms</option>
			<option value={20}>20ms</option>
			<option value={5}>5ms</option>
		</select>
	</label>
	<span>{fed}/{source.length}{ended ? ', ended' : ''}</span>
</div>

<article>
	{#if stream !== null}
		<!-- a block is keyed by its version, which changes until it has closed -->
		{#each blocks as block (block.idx)}
			{#key block.v}
				<Node buf={stream.buffer} idx={block.idx} source="" {components} {directives} plugin_data={data} />
			{/key}
		{/each}
	{/if}
</article>

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.75rem;
		margin-bottom: 1.5rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--staff);
		color: var(--quiet);
		font: 400 0.8125rem / 1.4 var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.controls :is(button, select) {
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--quiet-line);
		border-radius: 0;
		color: var(--ink);
		background: var(--paper);
		font: inherit;
		cursor: pointer;
	}

	.controls span {
		margin-left: auto;
	}
</style>
