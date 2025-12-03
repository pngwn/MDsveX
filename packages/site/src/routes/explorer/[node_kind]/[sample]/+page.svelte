<script lang="ts">
	import TestHeader from '$lib/components/TestHeader.svelte';
	import CodePanel from '$lib/components/CodePanel.svelte';
	import TokensPanel from '$lib/components/TokensPanel.svelte';
	import RoutePanel from '$lib/components/RoutePanel.svelte';
	import InspectorPanel from '$lib/components/InspectorPanel.svelte';
	import { parse_markdown_svelte, type node_buffer } from '@mdsvex/parse';

	let { data } = $props();

	let source = $derived(
		data.samples_for_kind.find(([file]) => file === data.sample_id)?.[1]
	);

	type get_node_without_children = Omit<
		ReturnType<node_buffer['get_node']>,
		'children'
	>;

	type node_with_children = get_node_without_children & {
		children: node_with_children[];
	};
	function build_tree(
		node_buffer: node_buffer,
		index: number
	): node_with_children {
		const node = node_buffer.get_node(index);
		const children = node.children.map((childIndex) =>
			build_tree(node_buffer, childIndex)
		);

		const full_node = { ...node, children };

		return full_node;
	}

	let nodes_as_text = $derived.by(() => {
		const { nodes } = parse_markdown_svelte(source || '');
		if (!nodes) return [];
		return [build_tree(nodes, 0)];
	});

	// Create the mapper with your original and compiled grammars
	// let mapper = $derived(
	// 	data.raw_grammar && data.grammar && new GrammarMapper(data.raw_grammar, data.grammar)
	// );

	// Create an introspector with the grammar mapper for readable names
	// const introspector = $derived(
	// 	mapper &&
	// 		new TokenizerIntrospector({
	// 			log: console.log,
	// 			enhancedLogging: true, // This will log with readable names automatically
	// 			grammarMapper: mapper as any // Pass the mapper so introspector can use readable names
	// 		})
	// );

	// let tokens = $derived(
	// 	source && data.grammar && tokenize(source, data.grammar, introspector as any)
	// );

	let position = $state(0);
	let selectedToken = $state(0);
	let rightPanelView = $state<'tokens' | 'route'>('tokens');

	// Component references
	let codePanelRef = $state<CodePanel>();
	let tokensPanelRef = $state<TokensPanel>();

	// function getAnalysisAtPosition(position: number) {
	// 	return mapper?.analyzePosition(introspector as any, position);
	// }

	// function getFullRoute(position: number) {
	// 	return mapper?.getFullRoute(introspector as any, position);
	// }

	// function getEnhancedRoute(position: number) {
	// 	// Use getCompleteRoute to show all states including probes
	// 	return mapper?.getCompleteRoute(introspector as any, position);
	// }

	// let analysis = $derived(getAnalysisAtPosition(position));

	// Get only the current active route (from last time we returned to main)
	// let activeRoute = $derived.by(() => {
	// 	const route = getEnhancedRoute(position);
	// 	if (!route) return [];

	// 	// Find the last occurrence where we're back at main (depth 0)
	// 	let lastMainIndex = 0;
	// 	for (let i = route.length - 1; i >= 0; i--) {
	// 		const step = route[i];

	// 		// Find the most recent return to main
	// 		if (
	// 			(step.type === 'POP' && step.depth === 0 && step.toName === 'main') ||
	// 			(step.type === 'START' && step.stateName === 'main')
	// 		) {
	// 			// Start from the next step after returning to main
	// 			lastMainIndex = i;
	// 			// If we popped back to main, start from there
	// 			if (step.type === 'POP') {
	// 				lastMainIndex = i + 1;
	// 				// If there's no next step, we're at main
	// 				if (lastMainIndex >= route.length) {
	// 					return [
	// 						{
	// 							type: 'START',
	// 							state: 0,
	// 							stateName: 'main',
	// 							position: step.position,
	// 							depth: 0
	// 						} as RouteStep
	// 					];
	// 				}
	// 			}
	// 			break;
	// 		}
	// 	}

	// 	// Return the route from the last main position to current
	// 	return route.slice(lastMainIndex);
	// });

	function handle_meta_click(meta: [number, number]) {
		console.log('handle_meta_click', meta);
		codePanelRef?.create_aribtrary_range(...meta);
	}

	function handleTokenClick(tokenIndex: number) {
		console.log('handleTokenClick', tokenIndex);
		selectedToken = tokenIndex;
		codePanelRef?.highlightToken(tokenIndex);
	}

	// function handleTokenSelect(index: number) {
	// 	selectedToken = index;
	// 	codePanelRef?.highlightToken(index);
	// }

	function handlePositionChange(newPosition: number) {
		position = newPosition;
		// Update position highlight if needed
		const htmlContainer = document.querySelector('.code-inner') as HTMLElement;
		if (htmlContainer) {
			const textNode = htmlContainer.firstChild;
			if (textNode) {
				const r = new Range();
				r.setStart(textNode, position);
				r.setEnd(textNode, position + 1);
				const hl = CSS.highlights.get('position');
				if (hl) {
					hl.clear();
					hl.add(r);
				}
			}
		}
	}

	// Keyboard shortcuts for switching views
	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === '1' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			rightPanelView = 'tokens';
		} else if (event.key === '2' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();
			rightPanelView = 'route';
		}
	}

	// $effect(() => {
	// 	window.addEventListener('keydown', handleGlobalKeydown);
	// 	return () => window.removeEventListener('keydown', handleGlobalKeydown);
	// });
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
				<!-- <RoutePanel  /> -->
			{/if}
		</div>
	</div>
	<!-- 
	<InspectorPanel
		{source}
		{position}
		{analysis}
		onPositionChange={handlePositionChange}
	/> -->
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
