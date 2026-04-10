<script lang="ts">
import { untrack } from "svelte";
import { page } from "$app/state";
import { goto } from "$app/navigation";
import { PFMParser, WireEmitter, PluginDispatcher, WireTextSource } from "@mdsvex/parse";
import type { ParsePlugin } from "@mdsvex/parse";
import { WireTreeBuilder } from "@mdsvex/parse/wire-tree-builder";
import { CursorHTMLRenderer } from "@mdsvex/render/html-cursor";
import type { CursorBlockEntry } from "@mdsvex/render/html-cursor";
import { ComponentRenderer } from "@mdsvex/render/component";
import type { ComponentBlock } from "@mdsvex/render/component";
import Node from "@mdsvex/render/Node.svelte";
import { RecordingEmitter, type Op } from "$lib/recorder";
import { autolink } from "@mdsvex/plugin-autolink";
import { Play, Pause, SkipForward, SkipBackward, FastForward } from "$lib";
import Widget from "$lib/components/Widget.svelte";
import AlertBox from "$lib/components/AlertBox.svelte";

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function wrap_parent(): ParsePlugin {
	return {
		strong_emphasis: {
			parse(node) {
				node.type = "link";
				node.attrs.href = "HELLO";
				// node.parent.attrs.style = "background: red;";
			},
		},
	};
}
const customComponents = { Widget, AlertBox };
const parsePlugins = [autolink(), wrap_parent()];

let { markdown }: { markdown: string } = $props();

// ── Query param helpers ──────────────────────────────────
const VALID_CHUNKS = [1, 2, 5, 10, 9999];
const VALID_SPEEDS = [200, 80, 30, 10];
const VALID_RENDERERS = ["html", "dom", "canvas"] as const;

function read_params() {
	const params = page.url?.searchParams;
	if (!params) return { chunk: 1, speed: 80, renderer: "dom" as const };
	const c = Number(params.get("chunk"));
	const s = Number(params.get("speed"));
	const r = params.get("renderer");
	return {
		chunk: VALID_CHUNKS.includes(c) ? c : 1,
		speed: VALID_SPEEDS.includes(s) ? s : 80,
		renderer: VALID_RENDERERS.includes(r as any)
			? (r as "html" | "dom" | "canvas")
			: "dom",
	};
}

function write_params() {
	const url = new URL(page.url);
	url.searchParams.set("chunk", String(chunk_size));
	url.searchParams.set("speed", String(play_speed));
	url.searchParams.set("renderer", render_mode);
	goto(url.toString(), { replaceState: true, keepFocus: true, noScroll: true });
}

const initial = read_params();
let chunk_size = $state(initial.chunk);
let step_index = $state();
let playing = $state(false);
let play_speed = $state(initial.speed);
let play_timer: ReturnType<typeof setInterval> | null = null;
let render_mode: "html" | "dom" | "canvas" = $state(initial.renderer);

// Sync state -> URL. Silently skip if router isn't ready yet (SSR/hydration).
$effect(() => {
	chunk_size;
	play_speed;
	render_mode;
	untrack(() => {
		try {
			write_params();
		} catch {}
	});
});

// Reset when markdown changes
$effect(() => {
	markdown;
	untrack(() => {
		stop();
		step_index = total_steps - 1;
	});
});

let chunk_boundaries: number[] = $derived.by(() => {
	const boundaries: number[] = [];
	for (let i = 0; i < markdown.length; i += chunk_size) {
		boundaries.push(Math.min(i + chunk_size, markdown.length));
	}
	return boundaries;
});

let total_steps = $derived(chunk_boundaries.length + 1);

let step_ops: Op[][] = $derived.by(() => {
	const all_step_ops: Op[][] = [];
	const recorder = new RecordingEmitter();
	const parser = new PFMParser(recorder);
	parser.init();

	let prev_count = 0;
	for (let i = 0; i < chunk_boundaries.length; i++) {
		const chunk_end = chunk_boundaries[i];
		const chunk_start = i === 0 ? 0 : chunk_boundaries[i - 1];
		const chunk = markdown.slice(chunk_start, chunk_end);

		parser.feed(chunk);

		all_step_ops.push(recorder.ops.slice(prev_count));
		prev_count = recorder.ops.length;
	}

	parser.finish();
	all_step_ops.push(recorder.ops.slice(prev_count));

	return all_step_ops;
});

let current_ops = $derived.by(() => {
	const ops: Op[] = [];
	for (let i = 0; i <= step_index && i < step_ops.length; i++) {
		ops.push(...step_ops[i]);
	}
	return ops;
});

let fed_source = $derived.by(() => {
	if (step_index >= chunk_boundaries.length) return markdown;
	if (step_index < 0) return "";
	return markdown.slice(0, chunk_boundaries[step_index]);
});

let new_ops = $derived(
	step_index < step_ops.length ? step_ops[step_index] : [],
);

let new_ops_start = $derived.by(() => {
	let count = 0;
	for (let i = 0; i < step_index && i < step_ops.length; i++) {
		count += step_ops[i].length;
	}
	return count;
});

// ── Wire pipeline (for HTML renderer) ────────────────────
let wire_step_batches: unknown[][][] = $derived.by(() => {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	parser.init();

	const batches: unknown[][][] = [];
	let accumulated = "";

	for (let i = 0; i < chunk_boundaries.length; i++) {
		const chunk_end = chunk_boundaries[i];
		const chunk_start = i === 0 ? 0 : chunk_boundaries[i - 1];
		const chunk = markdown.slice(chunk_start, chunk_end);
		accumulated += chunk;
		emitter.set_source(accumulated);
		parser.feed(chunk);
		batches.push(emitter.flush());
	}

	emitter.set_source(accumulated);
	parser.finish();
	batches.push(emitter.flush());

	return batches;
});

let html_blocks: CursorBlockEntry[] = $derived.by(() => {
	const text_source = new WireTextSource([]);
	const dispatcher = new PluginDispatcher(parsePlugins, text_source);
	const builder = new WireTreeBuilder(128, dispatcher);
	const renderer = new CursorHTMLRenderer();

	for (let i = 0; i <= step_index && i < wire_step_batches.length; i++) {
		const batch = wire_step_batches[i];
		if (batch.length > 0) {
			builder.apply(batch);
		}
	}

	// run sequential plugins after all batches applied
	dispatcher.run_sequential(builder.get_buffer());

	renderer.update(builder.get_buffer(), "");
	return renderer.blocks.map((b) => ({ idx: b.idx, html: b.html }));
});

let dom_renderer = $derived.by(() => {
	const text_source = new WireTextSource([]);
	const dispatcher = new PluginDispatcher(parsePlugins, text_source);
	const builder = new WireTreeBuilder(128, dispatcher);
	const renderer = new ComponentRenderer();

	for (let i = 0; i <= step_index && i < wire_step_batches.length; i++) {
		const batch = wire_step_batches[i];
		if (batch.length > 0) {
			builder.apply(batch);
		}
	}

	dispatcher.run_sequential(builder.get_buffer());

	renderer.update(builder.get_buffer(), "");
	return renderer;
});

function reset() {
	stop();
	step_index = 0;
}

function step_forward() {
	if (step_index < total_steps - 1) step_index++;
	else stop();
}

function step_back() {
	if (step_index > 0) step_index--;
}

function play_toggle() {
	if (playing) {
		stop();
		return;
	}
	playing = true;
	play_timer = setInterval(() => {
		if (step_index < total_steps - 1) {
			step_index++;
		} else {
			stop();
		}
	}, play_speed);
}

function stop() {
	playing = false;
	if (play_timer) {
		clearInterval(play_timer);
		play_timer = null;
	}
}

function jump_to_end() {
	stop();
	step_index = total_steps - 1;
}

function format_op(op: Op): string {
	switch (op.op) {
		case "open":
			return `open(${op.id}, ${op.kindName}${op.pending ? ", pending" : ""})`;
		case "close":
			return `close(${op.id})`;
		case "text":
			return `text(${op.parent}, ${op.start}..${op.end})`;
		case "attr":
			return `attr(${op.id}, ${op.key}, ${JSON.stringify(op.value)})`;
		case "revoke":
			return `revoke(${op.id})`;
		case "commit":
			return `commit(${op.id})`;
	}
}

function op_color(op: Op): string {
	switch (op.op) {
		case "open":
			return op.pending ? "#f59e0b" : "var(--accent)";
		case "close":
			return "#60a5fa";
		case "text":
			return "var(--text-secondary)";
		case "attr":
			return "#a78bfa";
		case "revoke":
			return "#ef4444";
		case "commit":
			return "#10b981";
	}
}
</script>

<div class="viewer">
	<div class="viewer-header">
		<div class="controls">
			<label class="chunk-control">
				<span>render</span>
				<select bind:value={render_mode}>
					<option value="dom">Svelte DOM</option>
					<option value="html">HTML String</option>

				</select>
			</label>
			<label class="chunk-control">
				<span>chunk</span>
				<select bind:value={chunk_size} onchange={() => reset()}>
					<option value={1}>1 byte</option>
					<option value={2}>2 bytes</option>
					<option value={5}>5 bytes</option>
					<option value={10}>10 bytes</option>
					<option value={9999}>full</option>
				</select>
			</label>
			<label class="chunk-control">
				<span>speed</span>
				<select bind:value={play_speed}>
					<option value={200}>slow</option>
					<option value={80}>normal</option>
					<option value={30}>fast</option>
					<option value={10}>turbo</option>
				</select>
			</label>
		</div>
	</div>

	<div class="main">
		<div class="center">
			<div class="panel source-panel">
				<div class="panel-header">
					Source
					<span class="badge">{fed_source.length}/{markdown.length}</span>
				</div>
				<pre class="source-code"><code>{#each markdown as char, i (i)}<span
					class:fed={i < fed_source.length}
					class:cursor={i === fed_source.length}
					class:unfed={i >= fed_source.length}
				>{char}</span>{/each}</code></pre>
			</div>

			<div class="panel render-panel">
				<div class="panel-header">
					Rendered
					<span class="badge">
						{#if render_mode === 'html'}
							{html_blocks.length} blocks
						{:else}
							{dom_renderer.blocks.length} blocks
						{/if}
					</span>
				</div>
				{#if render_mode === 'canvas'}
					<div class="render-canvas">
						<!-- canvas mode TODO: update to use NodeBuffer -->
					</div>
				{:else}
					<div class="render-content prose">
						{#if render_mode === 'dom' && dom_renderer.buf}
							{#each dom_renderer.blocks as block (block.idx)}
								{#key block.v}
									<Node buf={dom_renderer.buf} idx={block.idx} source={dom_renderer.source} components={customComponents} />
								{/key}
							{/each}
						{:else}
							{#each html_blocks as block (block.idx)}
								{@html block.html}
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div class="panel opcodes-panel">
			<div class="panel-header">
				Opcodes
				<span class="badge">{current_ops.length}</span>
			</div>
			<div class="opcode-list">
				{#each current_ops as op, i (i)}
					<div
						class="opcode"
						class:new-op={i >= new_ops_start}
						style:color={op_color(op)}
					>
						<span class="op-idx">{i}</span>
						{format_op(op)}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<footer>
		<div class="playback">
			<button class="ctrl-btn" onclick={reset} title="Reset">
				<SkipBackward/>
			</button>
			<button class="ctrl-btn" onclick={step_back} title="Step back" style:transform="rotate(180deg)">
				<FastForward />
			</button>
			<button class="ctrl-btn play-btn" onclick={play_toggle} title={playing ? 'Pause' : 'Play'}>
				{#if playing}
					<Pause />
				{:else}
					<Play />
				{/if}
			</button>
			<button class="ctrl-btn" onclick={step_forward} title="Step forward">
				<FastForward />
			</button>
			<button class="ctrl-btn" onclick={jump_to_end} title="Jump to end">
				<SkipForward />
			</button>
		</div>
		<div class="step-info">
			<span>Step {step_index + 1} / {total_steps}</span>
			<input
				type="range"
				min="0"
				max={total_steps - 1}
				bind:value={step_index}
				class="step-slider"
			/>
			<span class="chunk-label">
				{#if step_index < chunk_boundaries.length}
					chunk [{step_index === 0 ? 0 : chunk_boundaries[step_index - 1]}..{chunk_boundaries[step_index]}]
				{:else}
					finish()
				{/if}
			</span>
		</div>
		<div class="step-detail">
			{#if new_ops.length > 0}
				<span class="new-count">+{new_ops.length} ops</span>
			{:else}
				<span class="no-ops">no new ops</span>
			{/if}
		</div>
	</footer>
</div>

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.viewer-header {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--bg-secondary);
		flex-shrink: 0;
	}

	.controls {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.chunk-control {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		color: var(--text-secondary);
		font-size: 0.75rem;
	}

	.chunk-control select {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.25rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.main {
		display: grid;
		grid-template-columns: 1fr 320px;
		flex: 1;
		overflow: hidden;
	}

	.panel {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--border);
		overflow: hidden;
	}

	.panel-header {
		padding: 0.5rem 0.75rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-tertiary);
		border-bottom: 1px solid var(--border);
		background: var(--bg-secondary);
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-shrink: 0;
	}

	.badge {
		background: var(--bg-tertiary);
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-sm);
		font-size: 0.65rem;
		color: var(--accent);
	}

	.center {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.source-panel {
		border-right: none;
		border-bottom: 1px solid var(--border);
		max-height: 40%;
	}

	.source-code {
		padding: 0.75rem;
		overflow: auto;
		flex: 1;
		background: var(--bg-code);
		white-space: pre-wrap;
		word-break: break-all;
	}

	.source-code .fed {
		color: var(--text-primary);
	}

	.source-code .cursor {
		background: var(--accent);
		color: var(--bg-primary);
	}

	.source-code .unfed {
		color: var(--text-tertiary);
		opacity: 0.3;
	}

	.render-panel {
		flex: 1;
		border-right: none;
		overflow: hidden;
	}

	.render-content {
		padding: 1rem;
		overflow-y: auto;
		flex: 1;
	}

	.render-canvas {
		flex: 1;
		overflow: hidden;
	}

	.opcodes-panel {
		border-right: none;
		background: var(--bg-secondary);
	}

	.opcode-list {
		overflow-y: auto;
		flex: 1;
		font-size: 0.75rem;
	}

	.opcode {
		padding: 0.2rem 0.75rem;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
		transition: background 0.1s ease;
	}

	.opcode.new-op {
		background: var(--bg-tertiary);
	}

	.op-idx {
		display: inline-block;
		width: 2.5rem;
		color: var(--text-tertiary);
		text-align: right;
		margin-right: 0.5rem;
	}

	footer {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--border);
		background: var(--bg-secondary);
		flex-shrink: 0;
	}

	.playback {
		display: flex;
		gap: 0.25rem;
	}

	.ctrl-btn {
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		color: var(--text-secondary);
		border-radius: 2px;
		padding: 0.35rem 0.5rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 30px;
	}

	.ctrl-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.play-btn {
		background: var(--accent-dim);
		border-color: var(--accent);
		color: var(--accent);
	}

	.play-btn:hover {
		background: var(--accent);
		color: var(--bg-primary);
	}

	.step-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		color: var(--text-secondary);
		font-size: 0.8rem;
	}

	.step-slider {
		flex: 1;
		accent-color: var(--accent);
		height: 4px;
	}

	.chunk-label {
		color: var(--text-tertiary);
		font-size: 0.7rem;
		min-width: 10rem;
	}

	.step-detail {
		font-size: 0.75rem;
		text-align: right;
		width: 75px;
	}

	.new-count {
		color: var(--accent);
	}

	.no-ops {
		color: var(--text-tertiary);
	}
</style>
