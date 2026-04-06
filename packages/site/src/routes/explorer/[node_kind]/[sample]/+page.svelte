<script lang="ts">
import TestHeader from "$lib/components/TestHeader.svelte";
import CodePanel from "$lib/components/CodePanel.svelte";
import TokensPanel from "$lib/components/TokensPanel.svelte";
import RoutePanel from "$lib/components/RoutePanel.svelte";
import InspectorPanel from "$lib/components/InspectorPanel.svelte";
import { parse_markdown_svelte, type node_buffer } from "@mdsvex/parse";

let { data } = $props();

let source = $derived(
	data.samples_for_kind.find(([file]) => file === data.sample_id)?.[1],
);

type get_node_without_children = Omit<
	ReturnType<node_buffer["get_node"]>,
	"children"
>;

type node_with_children = get_node_without_children & {
	children: node_with_children[];
};
function build_tree(
	node_buffer: node_buffer,
	index: number,
): node_with_children {
	const node = node_buffer.get_node(index);
	const children = node.children.map((childIndex) =>
		build_tree(node_buffer, childIndex),
	);

	const full_node = { ...node, children };

	return full_node;
}

let parse_result = $derived.by(() => {
	const input = source || "";
	const introspector = new Introspector(input);
	const { nodes } = parse_markdown_svelte(input, { introspector });
	return { nodes, introspector };
});

let nodes_as_text = $derived.by(() => {
	if (!parse_result.nodes) return [];
	return [build_tree(parse_result.nodes, 0)];
});

let introspector = $derived(parse_result.introspector);

interface route_step {
	type: "push" | "pop" | "swap";
	state: string;
	cursor: number;
	char: string;
	depth: number;
}

let route_steps = $derived.by(() => {
	const trace = introspector.get_trace();
	const steps: route_step[] = [];

	for (let i = 0; i < trace.length; i++) {
		const entry = trace[i];
		const prev = i > 0 ? trace[i - 1] : null;

		if (!prev) {
			steps.push({
				type: "push",
				state: entry.active,
				cursor: entry.cursor,
				char: entry.char,
				depth: entry.states.length - 1,
			});
			continue;
		}

		const prev_len = prev.states.length;
		const curr_len = entry.states.length;

		if (curr_len > prev_len) {
			for (let j = prev_len; j < curr_len; j++) {
				steps.push({
					type: "push",
					state: entry.states[j],
					cursor: entry.cursor,
					char: entry.char,
					depth: j,
				});
			}
		} else if (curr_len < prev_len) {
			for (let j = prev_len - 1; j >= curr_len; j--) {
				steps.push({
					type: "pop",
					state: prev.states[j],
					cursor: entry.cursor,
					char: entry.char,
					depth: j,
				});
			}
		} else if (entry.active !== prev.active) {
			steps.push({
				type: "swap",
				state: entry.active,
				cursor: entry.cursor,
				char: entry.char,
				depth: curr_len - 1,
			});
		}
	}

	return steps;
});

let position = $state(0);
let analysis = $derived(introspector.get_state_at(position));

let selectedToken = $state(0);
let rightPanelView = $state<"tokens" | "route">("tokens");

let codePanelRef = $state<CodePanel>();
let tokensPanelRef = $state<TokensPanel>();

function handle_meta_click(meta: [number, number]) {
	codePanelRef?.create_aribtrary_range(...meta);
}

function handleTokenClick(tokenIndex: number) {
	selectedToken = tokenIndex;
	codePanelRef?.highlightToken(tokenIndex);
}

function handlePositionChange(newPosition: number) {
	position = Math.max(0, Math.min(newPosition, (source?.length ?? 1) - 1));
	const htmlContainer = document.querySelector(".code-inner") as HTMLElement;
	if (htmlContainer) {
		const textNode = htmlContainer.firstChild;
		if (textNode) {
			const r = new Range();
			r.setStart(textNode, position);
			r.setEnd(textNode, position + 1);
			const hl = CSS.highlights.get("position");
			if (hl) {
				hl.clear();
				hl.add(r);
			}
		}
	}
}

function handleGlobalKeydown(event: KeyboardEvent) {
	if (event.key === "1" && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		rightPanelView = "tokens";
	} else if (event.key === "2" && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		rightPanelView = "route";
	}
}

$effect(() => {
	window.addEventListener("keydown", handleGlobalKeydown);
	return () => window.removeEventListener("keydown", handleGlobalKeydown);
});

$effect(() => {
	source;
	position = 0;
});
</script>

<div class="page-wrapper">
	<TestHeader
		all_kinds={data.all_kinds}
		all_samples={data.samples_for_kind}
		kind_id={data.kind_id}
		sample_id={data.sample_id}
	/>

	<div class="main-content">
		<CodePanel
			bind:this={codePanelRef}
			{source}
			nodes={nodes_as_text}
			onTokenClick={handleTokenClick}
		/>

		<div class="right-panel">
			<div class="panel-tabs">
				<button
					class="panel-tab"
					class:active={rightPanelView === 'tokens'}
					onclick={() => (rightPanelView = 'tokens')}
					title="Token Stream (Cmd+1)"
				>
					Token Stream
				</button>
				<button
					class="panel-tab"
					class:active={rightPanelView === 'route'}
					onclick={() => (rightPanelView = 'route')}
					title="State Route (Cmd+2)"
				>
					State Route
				</button>
			</div>

			{#if rightPanelView === 'tokens' && source}
				<TokensPanel
					bind:this={tokensPanelRef}
					nodes={nodes_as_text}
					{selectedToken}
					onTokenSelect={handleTokenClick}
					on_meta_click={handle_meta_click}
				/>
			{:else}
				<RoutePanel steps={route_steps} {position} />
			{/if}
		</div>
	</div>

	<InspectorPanel
		{source}
		{position}
		{analysis}
		onPositionChange={handlePositionChange}
	/>
</div>

<style>
	.page-wrapper {
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.main-content {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 450px;
		gap: 2rem;
		padding: 1rem 0;
		overflow: hidden;
		min-height: 0;
	}

	.right-panel {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		border-bottom: 1px solid var(--border);
		padding-bottom: 0.5rem;
	}

	.panel-tab {
		background: transparent;
		color: var(--text-secondary);
		border: none;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		position: relative;
	}

	.panel-tab:hover {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}

	.panel-tab.active {
		color: var(--accent);
		background: var(--bg-tertiary);
	}

	.panel-tab.active::after {
		content: '';
		position: absolute;
		bottom: -0.5rem;
		left: 0;
		right: 0;
		height: 2px;
		background: var(--accent);
	}
</style>
