<script lang="ts">
	// a source fed to the incremental parser a chunk at a time: what it has read,
	// the opcodes it emitted, and what they render to, at any step of the way
	import { onDestroy, untrack } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { PFMParser, WireEmitter, PluginDispatcher, WireTextSource } from "@mdsvex/parse";
	import { WireTreeBuilder } from "@mdsvex/parse/wire-tree-builder";
	import { CursorHTMLRenderer } from "@mdsvex/render/html-cursor";
	import { ComponentRenderer } from "@mdsvex/render/component";
	import Node from "@mdsvex/render/Node.svelte";
	import { RecordingEmitter, format_op, type Op } from "./recorder";
	import { PLUGIN_SETS } from "./plugins";
	import Transport from "./Transport.svelte";
	import Widget from "./components/Widget.svelte";
	import AlertBox from "./components/AlertBox.svelte";

	const components = { Widget, AlertBox };

	// the page keys the viewer by its example, so neither prop changes
	let { markdown, plugins = "none" }: { markdown: string; plugins?: string } = $props();

	const CHUNKS = [1, 2, 5, 10, 9999];
	const SPEEDS = [200, 80, 30, 10];
	type Renderer = "dom" | "html";

	// the settings ride in the query, which the links of the sidebar carry along
	const params = page.url.searchParams;
	const asked_chunk = Number(params.get("chunk"));
	const asked_speed = Number(params.get("speed"));

	let chunk_size = $state(CHUNKS.includes(asked_chunk) ? asked_chunk : 1);
	let play_speed = $state(SPEEDS.includes(asked_speed) ? asked_speed : 80);
	let render_mode = $state<Renderer>(params.get("renderer") === "html" ? "html" : "dom");
	// svelte-ignore state_referenced_locally
	let plugin_set = $state(plugins in PLUGIN_SETS ? plugins : "none");

	$effect(() => {
		const url = new URL(untrack(() => page.url));
		url.searchParams.set("chunk", String(chunk_size));
		url.searchParams.set("speed", String(play_speed));
		url.searchParams.set("renderer", render_mode);
		// the router is not ready on the first run after a load
		goto(url, { replaceState: true, keepFocus: true, noScroll: true }).catch(() => {});
	});

	/** the offset each chunk ends at */
	const ends = $derived.by(() => {
		const ends: number[] = [];
		for (let i = 0; i < markdown.length; i += chunk_size)
			ends.push(Math.min(i + chunk_size, markdown.length));
		return ends;
	});

	/** one step for each chunk and one for finish() */
	const total = $derived(ends.length + 1);
	// svelte-ignore state_referenced_locally
	let step = $state(total - 1);

	/** the opcodes of each step, and how far the parser had read after it */
	const recorded = $derived.by(() => {
		const emitter = new RecordingEmitter();
		const parser = new PFMParser(emitter);
		parser.init();
		const ops: Op[][] = [];
		const read: number[] = [];
		let seen = 0;
		const take = () => {
			ops.push(emitter.ops.slice(seen));
			read.push(emitter.read);
			seen = emitter.ops.length;
		};
		for (let i = 0; i < ends.length; i++) {
			parser.feed(markdown.slice(i === 0 ? 0 : ends[i - 1], ends[i]));
			take();
		}
		parser.finish();
		take();
		return { ops, read };
	});

	/** the same steps as wire batches, what a renderer is given */
	const batches = $derived.by(() => {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		parser.init();
		const batches: unknown[][][] = [];
		for (let i = 0; i < ends.length; i++) {
			emitter.set_source(markdown.slice(0, ends[i]));
			parser.feed(markdown.slice(i === 0 ? 0 : ends[i - 1], ends[i]));
			batches.push(emitter.flush());
		}
		emitter.set_source(markdown);
		parser.finish();
		batches.push(emitter.flush());
		return batches;
	});

	const ops = $derived(recorded.ops.slice(0, step + 1).flat());
	const fresh = $derived(recorded.ops[step]?.length ?? 0);
	const fed = $derived(step < ends.length ? ends[step] : markdown.length);
	const read = $derived(Math.min(recorded.read[step] ?? fed, fed));

	/** the tree after this step, built again from the first batch so a step back is a step */
	const built = $derived.by(() => {
		const set = PLUGIN_SETS[plugin_set].make();
		const dispatcher = new PluginDispatcher(
			set.plugins,
			new WireTextSource([]),
			set.directive_handlers,
		);
		const builder = new WireTreeBuilder(128, dispatcher);
		for (let i = 0; i <= step && i < batches.length; i++)
			if (batches[i].length > 0) builder.apply(batches[i]);
		dispatcher.run_sequential(builder.get_buffer());
		return builder.get_buffer();
	});

	const html_blocks = $derived.by(() => {
		if (render_mode !== "html") return [];
		const renderer = new CursorHTMLRenderer();
		renderer.update(built, "");
		return renderer.blocks.map((b) => ({ idx: b.idx, html: b.html }));
	});

	const dom_blocks = $derived(
		render_mode === "dom" ? new ComponentRenderer().update(built, "") : [],
	);

	const block_count = $derived(render_mode === "html" ? html_blocks.length : dom_blocks.length);

	let playing = $state(false);
	let timer: ReturnType<typeof setInterval> | null = null;

	function stop() {
		playing = false;
		if (timer !== null) clearInterval(timer);
		timer = null;
	}

	function forward() {
		if (step < total - 1) step++;
		else stop();
	}

	function toggle() {
		if (playing) return stop();
		if (step >= total - 1) step = 0;
		playing = true;
		timer = setInterval(forward, play_speed);
	}

	/** a new speed takes effect on the next tick */
	function retime() {
		if (!playing) return;
		stop();
		toggle();
	}

	function to(index: number) {
		stop();
		step = Math.max(0, Math.min(total - 1, index));
	}

	onDestroy(stop);

	// the newest opcodes are at the foot of the list
	let op_list: HTMLElement | undefined = $state();
	$effect(() => {
		ops;
		if (op_list) op_list.scrollTop = op_list.scrollHeight;
	});
</script>

<div class="viewer">
	<div class="settings">
		<label>
			plugins
			<select bind:value={plugin_set} data-testid="plugins">
				{#each Object.entries(PLUGIN_SETS) as [key, set] (key)}
					<option value={key}>{set.label}</option>
				{/each}
			</select>
		</label>
		<label>
			render
			<select bind:value={render_mode}>
				<option value="dom">Svelte components</option>
				<option value="html">HTML string</option>
			</select>
		</label>
		<label>
			chunk
			<select bind:value={chunk_size} onchange={() => to(0)}>
				<option value={1}>1 char</option>
				<option value={2}>2 chars</option>
				<option value={5}>5 chars</option>
				<option value={10}>10 chars</option>
				<option value={9999}>whole</option>
			</select>
		</label>
		<label>
			speed
			<select bind:value={play_speed} onchange={retime}>
				<option value={200}>slow</option>
				<option value={80}>normal</option>
				<option value={30}>fast</option>
				<option value={10}>turbo</option>
			</select>
		</label>
	</div>

	<div class="panes">
		<section class="source" aria-label="Source">
			<h2 class="pane-head">
				Source
				<span class="count" data-testid="fed">{fed}/{markdown.length}</span>
			</h2>
			<!-- read, then held: fed to the parser but not yet decided, then not yet fed -->
			<pre><code><span class="read">{markdown.slice(0, read)}</span><span class="held" title="fed, and held until the parser can decide">{markdown.slice(read, fed)}</span><span class="unfed">{markdown.slice(fed)}</span></code></pre>
		</section>

		<section class="rendered" aria-label="Rendered">
			<h2 class="pane-head">
				Rendered
				<span class="count">{block_count} {block_count === 1 ? "block" : "blocks"}</span>
			</h2>
			<div class="output prose" data-testid="document">
				{#if render_mode === "dom"}
					{#each dom_blocks as block (block.idx)}
						<Node buf={built} idx={block.idx} source="" {components} />
					{/each}
				{:else}
					{#each html_blocks as block (block.idx)}
						{@html block.html}
					{/each}
				{/if}
			</div>
		</section>

		<section class="opcodes" aria-label="Opcodes">
			<h2 class="pane-head">
				Opcodes
				<span class="count" data-testid="ops">{ops.length}</span>
			</h2>
			<ol bind:this={op_list}>
				{#each ops as op, i (i)}
					<li class={[op.op, { pending: op.op === "open" && op.pending, fresh: i >= ops.length - fresh }]}>
						<span class="at">{i}</span>{format_op(op)}
					</li>
				{/each}
			</ol>
		</section>
	</div>

	<footer>
		<Transport
			{playing}
			onstart={() => to(0)}
			onback={() => to(step - 1)}
			ontoggle={toggle}
			onforward={() => to(step + 1)}
			onend={() => to(total - 1)}
		/>
		<span class="step" data-testid="step">step {step + 1}/{total}</span>
		<input
			type="range"
			aria-label="Step"
			min="0"
			max={total - 1}
			value={step}
			oninput={(e) => to(Number(e.currentTarget.value))}
		/>
		<span class="chunk">
			{#if step < ends.length}
				feed [{step === 0 ? 0 : ends[step - 1]}..{ends[step]}]
			{:else}
				finish()
			{/if}
		</span>
		<span class="new" class:none={fresh === 0}>+{fresh} ops</span>
	</footer>
</div>

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.settings {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem 1rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--staff);
		color: var(--quiet);
	}

	.panes {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(14rem, 22rem);
		grid-template-rows: minmax(4rem, auto) minmax(0, 1fr);
		grid-template-areas:
			"source opcodes"
			"rendered opcodes";
	}

	section {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
	}

	.source {
		grid-area: source;
		max-height: 38vh;
		border-bottom: 1px solid var(--staff);
	}

	.rendered {
		grid-area: rendered;
	}

	.opcodes {
		grid-area: opcodes;
		border-left: 1px solid var(--staff);
	}

	pre {
		flex: 1;
		margin: 0;
		padding: 0.75rem;
		border: 0;
		overflow: auto;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font: 400 0.8125rem / 1.6 var(--face-mono);
		background: var(--well);
	}

	.held {
		text-decoration: underline 1.5px var(--name-strong);
		text-underline-offset: 0.3em;
	}

	.unfed {
		color: var(--faint);
	}

	.output {
		flex: 1;
		padding: 1rem 1.25rem;
		overflow: auto;
		font-size: 1rem;
	}

	ol {
		flex: 1;
		margin: 0;
		padding: 0;
		overflow: auto;
		list-style: none;
		font-size: 0.75rem;
	}

	li {
		padding: 0.15rem 0.75rem;
		white-space: nowrap;
		color: var(--name-heading);
	}

	li.fresh {
		background: var(--well-chrome);
	}

	li.pending {
		color: var(--name-strong);
	}

	li.close {
		color: var(--name-list);
	}

	li.text {
		color: var(--quiet);
	}

	li.attr {
		color: var(--name-para);
	}

	li.revoke {
		color: var(--name-item);
	}

	li.commit {
		color: var(--name-quote);
	}

	.at {
		display: inline-block;
		width: 2.5rem;
		margin-right: 0.5rem;
		text-align: right;
		color: var(--quiet-line);
	}

	footer {
		flex: none;
		display: flex;
		align-items: center;
		gap: 0.5rem 1rem;
		padding: 0.5rem 0.75rem;
		border-top: 1px solid var(--staff);
		color: var(--quiet);
		font-variant-numeric: tabular-nums;
	}

	input[type="range"] {
		flex: 1;
		min-width: 4rem;
		accent-color: var(--ink);
	}

	.step {
		min-width: 12ch;
	}

	.chunk {
		min-width: 17ch;
	}

	.new {
		min-width: 8ch;
		text-align: right;
		color: var(--ink);
	}

	.new.none {
		color: var(--quiet-line);
	}

	/* one column, the opcodes under the document */
	@media (max-width: 48rem) {
		.panes {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(8rem, 1fr) minmax(6rem, 30vh);
			grid-template-areas: "source" "rendered" "opcodes";
		}

		.source {
			max-height: 24vh;
		}

		.opcodes {
			border-left: 0;
			border-top: 1px solid var(--staff);
		}

		footer {
			flex-wrap: wrap;
		}

		.chunk {
			display: none;
		}
	}
</style>
