<script lang="ts">
	import { untrack } from 'svelte';
	import { PFMParser } from '@mdsvex/parse';
	import { RecordingEmitter, build_render_tree, type Op, type RenderNode } from '$lib/recorder';
	import { Play, Pause, SkipForward, SkipBackward, FastForward } from '$lib';

	let { markdown }: { markdown: string } = $props();

	let chunk_size = $state(1);
	let step_index = $state(0);
	let playing = $state(false);
	let play_speed = $state(80);
	let play_timer: ReturnType<typeof setInterval> | null = null;

	// Reset when markdown changes
	$effect(() => {
		markdown;
		untrack(() => {
			stop();
			step_index = 0;
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
		if (step_index < 0) return '';
		return markdown.slice(0, chunk_boundaries[step_index]);
	});

	let render_tree = $derived(build_render_tree(current_ops, markdown, fed_source.length));
	let new_ops = $derived(step_index < step_ops.length ? step_ops[step_index] : []);

	let new_ops_start = $derived.by(() => {
		let count = 0;
		for (let i = 0; i < step_index && i < step_ops.length; i++) {
			count += step_ops[i].length;
		}
		return count;
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
		if (playing) { stop(); return; }
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
		if (play_timer) { clearInterval(play_timer); play_timer = null; }
	}

	function jump_to_end() {
		stop();
		step_index = total_steps - 1;
	}

	function format_op(op: Op): string {
		switch (op.op) {
			case 'open': return `open(${op.id}, ${op.kindName}${op.pending ? ', pending' : ''})`;
			case 'close': return `close(${op.id})`;
			case 'text': return `text(${op.parent}, ${op.start}..${op.end})`;
			case 'attr': return `attr(${op.id}, ${op.key}, ${JSON.stringify(op.value)})`;
			case 'revoke': return `revoke(${op.id})`;
		}
	}

	function op_color(op: Op): string {
		switch (op.op) {
			case 'open': return op.pending ? '#f59e0b' : 'var(--accent)';
			case 'close': return '#60a5fa';
			case 'text': return 'var(--text-secondary)';
			case 'attr': return '#a78bfa';
			case 'revoke': return '#ef4444';
		}
	}
</script>

<div class="viewer">
	<div class="viewer-header">
		<div class="controls">
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
				<div class="panel-header">Rendered</div>
				<div class="render-content">
					{#snippet render_node(node: RenderNode, depth: number)}
						{#if node.kind === 'root'}
							{#each node.children as child, idx (idx)}
								{@render render_node(child, depth)}
							{/each}
						{:else if node.kind === 'paragraph'}
							<p>
								{#each node.children as child, idx (idx)}
									{@render render_node(child, depth + 1)}
								{/each}
							</p>
						{:else if node.kind === 'heading'}
							{@const level = node.attrs.extra || 1}
							{#if level === 1}<h1>{node.text ?? ''}</h1>
							{:else if level === 2}<h2>{node.text ?? ''}</h2>
							{:else if level === 3}<h3>{node.text ?? ''}</h3>
							{:else}<h4>{node.text ?? ''}</h4>
							{/if}
						{:else if node.kind === 'text'}
							<span>{node.text ?? ''}</span>
						{:else if node.kind === 'strong_emphasis'}
							<strong>
								{#each node.children as child, idx (idx)}
									{@render render_node(child, depth + 1)}
								{/each}
							</strong>
						{:else if node.kind === 'emphasis'}
							<em>
								{#each node.children as child, idx (idx)}
									{@render render_node(child, depth + 1)}
								{/each}
							</em>
						{:else if node.kind === 'strikethrough'}
							<del>
								{#each node.children as child, idx (idx)}
									{@render render_node(child, depth + 1)}
								{/each}
							</del>
						{:else if node.kind === 'superscript'}
							<sup>
								{#each node.children as child, idx (idx)}
									{@render render_node(child, depth + 1)}
								{/each}
							</sup>
						{:else if node.kind === 'code_fence'}
							<pre class="rendered-code"><code>{node.text ?? ''}</code></pre>
						{:else if node.kind === 'code_span'}
							<code>{node.text ?? ''}</code>
						{:else if node.kind === 'block_quote'}
							<blockquote>
								{#each node.children as child, idx (idx)}
									{@render render_node(child, depth + 1)}
								{/each}
							</blockquote>
						{:else if node.kind === 'list'}
							{#if node.attrs.ordered}
								<ol>
									{#each node.children as child, idx (idx)}
										{@render render_node(child, depth + 1)}
									{/each}
								</ol>
							{:else}
								<ul>
									{#each node.children as child, idx (idx)}
										{@render render_node(child, depth + 1)}
									{/each}
								</ul>
							{/if}
						{:else if node.kind === 'list_item'}
							<li>
								{#each node.children as child, idx (idx)}
									{@render render_node(child, depth + 1)}
								{/each}
							</li>
						{:else if node.kind === 'thematic_break'}
							<hr />
						{:else if node.kind === 'hard_break'}
							<br />
						{:else if node.kind === 'table'}
							{@const aligns = node.attrs?.alignments ?? []}
							<table>
								{#each node.children as child, idx (idx)}
									{@render render_table_row(child, aligns)}
								{/each}
							</table>
						{:else if node.kind === 'table_header'}
							<!-- handled by render_table_row -->
						{:else if node.kind === 'table_row'}
							<!-- handled by render_table_row -->
						{:else if node.kind === 'link'}
							<a href={node.attrs.href ?? '#'}>{#each node.children as child, idx (idx)}{@render render_node(child, depth + 1)}{/each}</a>
						{:else if node.kind === 'image'}
							<div class="img-wrap">
								{#if node.attrs.src}
									<img alt={node.text ?? ''} src={node.attrs.src ?? ''} />
								{/if}
							</div>
						{:else if node.kind === 'line_break'}
							<!-- skip block-level breaks -->
						{:else}
							<span class="unknown">[{node.kind}]</span>
						{/if}
					{/snippet}
					{#snippet render_table_row(row: RenderNode, aligns: string[])}
						{#if row.kind === 'table_header'}
							<thead>
								<tr>
									{#each row.children as cell, col (col)}
										{@const align = aligns[col] ?? 'none'}
										<th style:text-align={align !== 'none' ? align : undefined}>
											{#each cell.children as child, ci (ci)}
												{@render render_node(child, 3)}
											{/each}
										</th>
									{/each}
								</tr>
							</thead>
						{:else if row.kind === 'table_row'}
							<tr>
								{#each row.children as cell, col (col)}
									{@const align = aligns[col] ?? 'none'}
									<td style:text-align={align !== 'none' ? align : undefined}>
										{#each cell.children as child, ci (ci)}
											{@render render_node(child, 3)}
										{/each}
									</td>
								{/each}
							</tr>
						{/if}
					{/snippet}
					{@render render_node(render_tree, 0)}
				</div>
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
		color: var(--text-primary);
		font-size: 0.9rem;
		line-height: 1.7;
	}

	.render-content h1 { font-size: 1.6rem; color: var(--accent); margin-bottom: 0.75rem; }
	.render-content h2 { font-size: 1.3rem; color: var(--accent); margin-bottom: 0.5rem; }
	.render-content h3 { font-size: 1.1rem; color: var(--accent); margin-bottom: 0.5rem; }
	.render-content h4 { font-size: 1rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
	.render-content p { margin-bottom: 0.75rem; }
	.render-content strong { color: #f59e0b; font-weight: 600; }
	.render-content em { color: #c084fc; }
	.render-content del { color: var(--text-tertiary); text-decoration: line-through; }
	.render-content sup { color: #60a5fa; font-size: 0.75em; }
	.render-content a { color: var(--accent); text-decoration: underline; }
	.render-content blockquote {
		border-left: 3px solid var(--accent);
		padding-left: 1rem;
		color: var(--text-secondary);
		margin-bottom: 0.75rem;
	}
	.render-content ul, .render-content ol {
		margin-left: 1.5rem;
		margin-bottom: 0.75rem;
	}
	.render-content li { margin-bottom: 0.25rem; }
	.render-content hr {
		border: none;
		border-top: 1px solid var(--border-light);
		margin: 1rem 0;
	}

	.render-content table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 0.75rem;
		font-size: 0.85rem;
	}
	.render-content th, .render-content td {
		border: 1px solid var(--border);
		padding: 0.4rem 0.75rem;
	}
	.render-content th {
		background: var(--bg-tertiary);
		color: var(--accent);
		font-weight: 600;
	}
	.render-content td {
		background: var(--bg-code);
	}
	.render-content thead {
		border-bottom: 2px solid var(--accent);
	}

	.render-content img {
		width: 100%;
		height: 100%;
	}

	.render-content img:not([src]) {
		opacity: 0;
	}

	.img-wrap {
		border: 0;
		outline: none;
		border-radius: 2px;
		width: 150px;
		height: 150px;
		background: var(--bg-tertiary) url(/image.svg) no-repeat center center;
		-webkit-appearance: none;
		appearance: none;
		overflow: hidden;
	}

	.rendered-code {
		background: var(--bg-tertiary);
		padding: 0.75rem;
		border-radius: var(--radius-sm);
		margin-bottom: 0.75rem;
		overflow-x: auto;
	}

	.rendered-code code {
		background: transparent;
		padding: 0;
		color: var(--text-primary);
	}

	.unknown {
		color: var(--text-tertiary);
		font-style: italic;
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
