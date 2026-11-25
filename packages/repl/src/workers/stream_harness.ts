/**
 * the component the preview mounts when it streams: the entry document is fed
 * to the incremental parser a few characters at a time and rendered as it
 * grows, with the plugins, directives and components the compile would use
 */

import type { Bundle } from 'mdsvex/compile';
import type { MdsvexCompileOptions, ReplHighlight } from './mdsvex';
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

/** the highlight config of the playground and the bundled languages the document names */
export interface StreamHighlight {
	options: ReplHighlight;
	languages: string[];
}

/** the statements that build the highlighter once its languages have loaded */
function load_highlight({ options, languages }: StreamHighlight): string {
	return `		const highlight_options = ${JSON.stringify(options)};
		const language_names = ${JSON.stringify(languages)};
		Promise.all(language_names.map((name) => language_loaders[name]())).then((modules) => {
			const languages = {};
			language_names.forEach((name, i) => (languages[name] = modules[i]));
			const annotations = highlight_options.annotations;
			highlight = create_highlight({
				...highlight_options,
				languages: { ...languages, ...highlight_options.languages },
				annotations: Array.isArray(annotations)
					? annotations.map((name) =>
							name === 'shiki_notation'
								? shiki_notation()
								: default_annotations.find((plugin) => plugin.verbs[0] === name)
						)
					: annotations,
			});
		});
`;
}

export function stream_harness(
	entry: string,
	options: MdsvexCompileOptions,
	bundles: Bundle[],
	has_plugins: boolean,
	highlight: StreamHighlight | null = null
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
	${
		highlight === null
			? ''
			: "import { create_highlight, default_annotations, language_loaders, shiki_notation } from 'mdsvex/highlight';"
	}
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
	let highlight = $state.raw();

	const data = {
		get current() {
			return stream?.data.current;
		},
	};

	// an open block is drawn again on every chunk, so the fade of a marked line
	// carries on from when the line was first marked, it does not start again
	const MARKED = '.l.highlight, .l.emphasis, .l.diff-add, .l.diff-del, .l.diff-mod';
	const marked_at = new Map();
	let output;

	function keep_fades() {
		const now = performance.now();
		output.querySelectorAll('pre.twinkleplop').forEach((pre, p) => {
			pre.querySelectorAll('.l').forEach((line, l) => {
				if (!line.matches(MARKED) || line.style.animationDelay) return;
				const key = p + ':' + l;
				if (!marked_at.has(key)) marked_at.set(key, now);
				line.style.animationDelay = marked_at.get(key) - now + 'ms';
			});
		});
	}

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
		marked_at.clear();
	}

	function tick() {
		if (fed >= source.length) return finish();
		const next = Math.min(source.length, fed + chunk);
		emitter.set_source(source.slice(0, next));
		parser.feed(source.slice(fed, next));
		fed = next;
		stream.apply(emitter.flush());
	}

	// the parser only goes forward, so a place behind is fed again from the start
	function seek(to) {
		pause();
		if (to < fed || ended) restart();
		while (fed < to) tick();
		if (to >= source.length) finish();
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
		const observer = new MutationObserver(keep_fades);
		observer.observe(output, { childList: true, subtree: true });
		restart();
		play();
${highlight === null ? '' : load_highlight(highlight)}		return () => observer.disconnect();
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
	<input
		type="range"
		aria-label="how much of the document has arrived"
		min="0"
		max={source.length}
		value={fed}
		oninput={(e) => seek(Number(e.currentTarget.value))}
	/>
</div>

<div class="stream-output" bind:this={output}>
	{#if stream !== null}
		{#each blocks as block (block.idx)}
			{#key block.v}
				<Node buf={stream.buffer} idx={block.idx} source="" {components} {directives} {highlight} plugin_data={data} />
			{/key}
		{/each}
	{/if}
</div>

<style>
	.stream-output {
		display: contents;
	}

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

	.stream-controls input[type='range'] {
		flex: 0 0 100%;
		margin: 0;
		accent-color: var(--fg-1, #222);
		cursor: pointer;
	}
</style>
`;
}
