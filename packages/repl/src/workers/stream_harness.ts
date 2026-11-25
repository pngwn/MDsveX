/**
 * the component the preview mounts when it streams: the entry document is fed
 * to the incremental parser a few characters at a time and rendered as it
 * grows, with the plugins, directives and components the compile would use
 */

import type { Bundle } from 'mdsvex/compile';
import type { MdsvexCompileOptions } from './mdsvex';
import { PLUGINS_ENTRY } from './plugins';

interface Source {
	specifier: string;
	names: string[];
}

/** imports each name of each source, and the object that holds the last of each name */
function table(prefix: string, sources: Source[]) {
	let imports = '';
	const entries = new Map<string, string>();
	sources.forEach((source, i) => {
		if (source.names.length === 0) return;
		const locals = source.names.map((name, j) => {
			const local = `${prefix}${i}_${j}`;
			entries.set(name, local);
			return `${name} as ${local}`;
		});
		imports += `\timport { ${locals.join(', ')} } from ${JSON.stringify(source.specifier)};\n`;
	});
	const object = [...entries]
		.map(([name, local]) => `${JSON.stringify(name)}: ${local}`)
		.join(', ');
	return { imports, object: `{ ${object} }` };
}

export function stream_harness(
	entry: string,
	options: MdsvexCompileOptions,
	bundles: Bundle[],
	has_plugins: boolean
): string {
	const components = table('c', options.components ?? []);
	// those of the plugins sit below the directives option, as in a compile
	const directives = table('d', [
		...bundles.flatMap((bundle) =>
			bundle.module === undefined || bundle.directives === undefined
				? []
				: [{ specifier: bundle.module, names: Object.keys(bundle.directives) }]
		),
		...(options.directives ?? []),
	]);

	return `<script>
	import { onDestroy, onMount } from 'svelte';
	import { HeadingIds, heading_slug, PFMParser, WireEmitter } from '@mdsvex/parse';
	import { ComponentRenderer } from '@mdsvex/render/component';
	import { is_entity_name } from '@mdsvex/render/html-cursor';
	import { PluginStream } from '@mdsvex/render/stream';
	import Node from '@mdsvex/render/Node.svelte';
	import source from ${JSON.stringify(`./${entry}?raw`)};
	${has_plugins ? `import exported from './${PLUGINS_ENTRY}';` : 'const exported = [];'}
${components.imports}${directives.imports}
	const components = ${components.object};
	const directives = ${directives.object};

	// each export as mdsvex takes it, see as_bundle
	const KEYS = ['name', 'module', 'directives', 'parse', 'components', 'fences'];
	const bundles = exported.map(([name, value]) => {
		const made = typeof value === 'function' ? value() : value;
		const bundle = KEYS.some((key) => key in made) ? made : { parse: made };
		return { ...bundle, name: bundle.name || name };
	});
	const plugins = bundles.filter((b) => b.parse).map((b) => ({ ...b.parse, name: b.name }));
	const directive_handlers = bundles
		.filter((b) => b.directives)
		.map((b) => ({ name: b.name, directives: b.directives }));

	let chunk = $state(3);
	let every = $state(20);
	let fed = $state(0);
	let playing = $state(false);
	let ended = $state(false);
	let stream = $state.raw(null);
	let blocks = $state.raw([]);

	const data = {
		get current() {
			return stream?.data.current;
		},
	};

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
			${options.heading_ids ? 'headings: new HeadingIds(heading_slug, is_entity_name),' : ''}
		});
		next.renderers.push(renderer);
		next.on_change(() => {
			blocks = renderer.update(next.buffer, '').map(({ idx, v }) => ({ idx, v }));
		});
		stream = next;
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

<div class="stream-controls">
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

{#if stream !== null}
	{#each blocks as block (block.idx)}
		{#key block.v}
			<Node buf={stream.buffer} idx={block.idx} source="" {components} {directives} plugin_data={data} />
		{/key}
	{/each}
{/if}

<style>
	.stream-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.75rem;
		margin-bottom: 1.5rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--bg-3, #ddd);
		color: var(--fg-3, #666);
		font: 400 0.8125rem / 1.4 var(--font-mono, ui-monospace, monospace);
		font-variant-numeric: tabular-nums;
	}

	.stream-controls :is(button, select) {
		padding: 0.25rem 0.5rem;
		border: 1px solid currentColor;
		border-radius: var(--border-radius, 2px);
		color: var(--fg-1, #222);
		background: var(--bg-1, #fff);
		font: inherit;
		cursor: pointer;
	}

	.stream-controls span {
		margin-left: auto;
	}
</style>
`;
}
