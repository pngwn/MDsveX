<script lang="ts">
	import Token from '$lib/components/Token.svelte';
	interface Node {
		kind: string;
		start: number;
		end: number;
		metadata: any;
		parent: number | null;
		next: number | null;
		prev: number | null;
		children: number[];
		value: [number, number];
		index: number;
		depth: number;
	}

	interface Props {
		nodes: Node[];
		selectedToken: number;
		onTokenSelect: (index: number) => void;
		on_meta_click: (meta: [number, number]) => void;
	}

	let { nodes, selectedToken, onTokenSelect, on_meta_click }: Props = $props();

	let is_expanded = $state(nodes.map(() => (nodes.length > 20 ? false : true)));

	console.log('onTokenSelect', onTokenSelect);

	let tokensContainer = $state<HTMLButtonElement[]>([]);

	function handleKeydown(event: KeyboardEvent) {
		event.preventDefault();
		if (!tokensContainer[selectedToken]) return;

		if (event.key === 'ArrowUp') {
			onTokenSelect(selectedToken - 1);
		} else if (event.key === 'ArrowDown') {
			onTokenSelect(selectedToken + 1);
		}

		const t = tokensContainer[selectedToken].getBoundingClientRect();
		const containerRect =
			tokensContainer[selectedToken]!.parentElement!.getBoundingClientRect();
		const isInView =
			t.top > containerRect.top && t.bottom < containerRect.bottom;

		if (!isInView) {
			tokensContainer[selectedToken].scrollIntoView({ behavior: 'smooth' });
		}
	}

	export function scrollTokenIntoView(index: number) {
		if (!tokensContainer[index]) return;
		const t = tokensContainer[index].getBoundingClientRect();
		const containerRect =
			tokensContainer[index]!.parentElement!.getBoundingClientRect();
		const isInView =
			t.top > containerRect.top && t.bottom < containerRect.bottom;
		if (!isInView) {
			tokensContainer[index].scrollIntoView({
				behavior: 'smooth',
				block: 'nearest',
			});
		}
	}
</script>

<div class="tokens-panel">
	<div class="tokens-list">
		<Token {nodes} {selectedToken} {onTokenSelect} {on_meta_click}></Token>
	</div>
</div>

<style>
	.tokens-panel {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow: hidden;
		min-height: 0;
	}

	.tokens-list {
		flex: 1;
		padding-right: 0.5rem;
		overflow-y: auto;
		overflow-x: hidden;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
