<script lang="ts">
	import ConsoleLine from './ConsoleLine.svelte';
	import JSONNode from '@sveltejs/svelte-json-tree';
	import ConsoleTable from './ConsoleTable.svelte';
	import type { Log } from './Log.svelte';

	interface Props {
		log: Log;
		depth?: number;
	}

	let { log, depth = 0 }: Props = $props();

	function toggle_group_collapse() {
		log.collapsed = !log.collapsed;
	}

	let style;

	function sanitize_css(text: string) {
		style ??= document.createElement('span').style;
		style.cssText = text;

		for (const key in style) {
			const value = style[key];
			if (typeof value === 'string' && value.includes('url(')) {
				style[key] = value.replace(/url\([^)]+\)/g, '');
			}
		}

		style.position = 'static';
		return style.cssText;
	}

	function format_args(args: any[] = []) {
		if (args.length === 0) return args;

		if (typeof args[0] !== 'string') {
			return args.map((value) => ({ type: 'value', value }));
		}

		args = args.slice();

		const parts = args.shift().split(/(%[sdifoOc])/g);

		const formatted = [];

		if (parts[0] !== '') {
			formatted.push({ type: 'value', value: parts[0] });
		}

		for (let i = 1; i < parts.length; i += 2) {
			const type = parts[i];
			const next = parts[i + 1];
			const value = args.shift();

			switch (type) {
				case '%s':
					formatted.push({ type: 'value', value: String(value), formatted: true });
					break;

				case '%d':
				case '%i':
					formatted.push({
						type: 'value',
						value: typeof value === 'symbol' ? NaN : parseInt(value, 10),
						formatted: true
					});
					break;

				case '%f':
					formatted.push({
						type: 'value',
						value: typeof value === 'symbol' ? NaN : parseFloat(value),
						formatted: true
					});
					break;

				case '%o':
				case '%O':
					formatted.push({ type: 'value', value, formatted: true });
					break;

				case '%c':
					formatted.push({
						type: 'style',
						style: sanitize_css(String(value)),
						value: next,
						formatted: true
					});
					break;
			}

			if (type !== '%c' && next !== '') {
				formatted.push({ type: 'value', value: next, formatted: true });
			}
		}

		for (const value of args) {
			formatted.push({ type: 'value', value });
		}

		return formatted;
	}

	const chars: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;'
	};

	function escape_html(html: string) {
		return html.replace(/[&<>]/g, (c) => chars[c]);
	}

	function link(str: string) {
		return str.replace(
			/(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/g,
			(m) => `<a target="_blank" href="${m}">${m}</a>`
		);
	}
</script>

{#if log.command === 'table'}
	<ConsoleTable data={log.data} columns={log.columns} />
{/if}

<div class="{log.command} line" style="--indent: {depth * 15}px">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		role="button"
		tabindex="0"
		onclick={toggle_group_collapse}
		class="log"
		class:expandable={log.stack || log.command === 'group'}
	>
		{#if log.count && log.count > 1}
			<span class="count">{log.count}</span>
		{/if}

		{#if log.stack || log.command === 'group'}
			<span class="arrow" class:expand={!log.collapsed}>{'\u25B6'}</span>
		{/if}

		{#if log.command === 'clear'}
			<span class="meta">Console was cleared</span>
		{:else if log.command === 'unclonable'}
			<span class="meta meta-error">Message could not be cloned. Open devtools to see it</span>
		{:else if log.command === 'table'}
			<JSONNode value={log.data} />
		{:else}
			<span class="values">
				{#each format_args(log.args) as part}
					<!-- whitespace is handled by hand to match devtools -->
					{#if !part.formatted}
						{' '}
					{/if}{#if part.type === 'value'}
						{#if part.value instanceof Error}
							<pre>{part.value.name + '\n' + part.value.stack.replace(/^\n+/, '')}</pre>
						{:else}
							<JSONNode value={part.value} defaultExpandedLevel={log.expanded ? 1 : 0} />
						{/if}
					{:else}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span class="styled" style={part.style} onclick={(e) => e.stopPropagation()}>
							{@html link(escape_html(part.value))}
						</span>
					{/if}
				{/each}
			</span>
		{/if}
	</div>

	{#if log.stack && !log.collapsed}
		<div class="stack">
			{#each log.stack as line}
				<span>{line.label}</span>
				<span class="location">{line.location}</span>
			{/each}
		</div>
	{/if}

	{#each new Array(depth) as _, idx}
		<div class="outline" style="left: {idx * 15 + 15}px"></div>
	{/each}
</div>

{#if log.command === 'group' && !log.collapsed}
	{#each log.logs ?? [] as child_log}
		<ConsoleLine log={child_log} depth={depth + 1} />
	{/each}
{/if}

<style>
	.line {
		--bg: var(--repl-bg-1);
		--border: var(--repl-bg-3);
		font: var(--repl-font-mono);
		display: block;
		position: relative;
		width: 100%;
		text-align: left;
		border-width: 1px;
		border-style: solid none none none;
		border-color: var(--border);
		background: var(--bg);
	}

	.warn {
		--bg: var(--warning-bg);
		--border: var(--warning-border);
	}

	.error {
		--bg: var(--error-bg);
		--border: var(--error-border);
	}

	.warn,
	.error {
		border-style: solid none;

		& + :global(&) {
			border-top: none;
		}
	}

	.log {
		padding: 5px 10px 5px calc(10px + var(--indent));
		display: flex;
		gap: 10px;
		width: 100%;
		font-size: 12px;
		align-items: start;
	}

	.log.expandable {
		cursor: pointer;
	}

	.values {
		display: block;
		flex: 1;
	}

	.stack {
		display: grid;
		grid-template-columns: minmax(0, auto) minmax(auto, 1fr);
		grid-gap: 0 20px;
		font-size: 12px;
		margin: 0 10px 4px calc(1em + var(--indent));
		overflow: hidden;
		line-height: 1.5;

		.location {
			position: relative;
			background: var(--bg);
			&::before {
				content: '';
				position: absolute;
				width: 10px;
				height: 100%;
				left: -10px;
				top: 0;
				background: linear-gradient(to right, transparent, var(--bg));
			}
		}
	}

	.count {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		min-width: 1.5em;
		height: 1.4em;
		padding: 0.5em;
		border-radius: 4px;
		background-color: var(--repl-fg-3);
		color: var(--repl-bg-1);
		font-size: 10px;
	}

	.meta {
		color: var(--repl-fg-4);
		font: var(--repl-font-ui-small);
	}

	.meta-error {
		color: var(--error-fg);
	}

	.outline {
		border-left: 1px solid #9c9cab;
		position: absolute;
		top: 0;
		bottom: -1px;
	}

	.arrow {
		font-size: 9px;
		transition: 150ms;
		transform-origin: 50% 50%;
		transform: translateY(2px);
	}

	.arrow.expand {
		transform: translateY(2px) rotateZ(90deg);
	}

	.styled {
		white-space: pre-wrap;
	}
</style>
