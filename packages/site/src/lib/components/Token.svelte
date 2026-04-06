<script lang="ts">
import Token from "$lib/components/Token.svelte";
import { onMount } from "svelte";
// import type { parse_node } from '@mdsvex/parse';

interface Props {
	nodes: any[];
	selectedToken: number;
	onTokenSelect: (index: number) => void;
	on_meta_click: (meta: [number, number]) => void;
	depth?: number;
}

let {
	nodes,
	selectedToken,
	onTokenSelect,
	depth = 0,
	on_meta_click,
}: Props = $props();

let is_expanded = $state(nodes.map(() => (nodes.length > 20 ? false : true)));

let tokensContainer = $state<HTMLButtonElement[]>([]);

function handleKeydown(event: KeyboardEvent) {
	console.log("handleKeydown", event.key, { selectedToken });
	if (event.key === "ArrowDown") {
		onTokenSelect(selectedToken + 1);

		event.preventDefault();
	} else if (event.key === "ArrowUp") {
		onTokenSelect(selectedToken - 1);
		event.preventDefault();
	} else {
		return; // Ignore other keys
	}
}

onMount(() => {
	if (selectedToken !== undefined && tokensContainer[selectedToken]) {
		tokensContainer[selectedToken].focus();
	}
});

function handle_meta_click(event: MouseEvent, meta: [number, number]) {
	console.log("handle_meta_click");
	event.stopPropagation();
	on_meta_click(meta);
}
</script>

{#each nodes as token, i}
	<button
		bind:this={tokensContainer[token.index]}
		class:selected={token.index === selectedToken}
		onclick={() => onTokenSelect(token.index)}
		onkeydown={handleKeydown}
		style="margin-left: {Math.min(4, depth || 0) * 1}rem"
	>
		{#if token.children.length > 0}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				class="expand-icon"
				class:expanded={is_expanded[i]}
				onclick={() => (is_expanded[i] = !is_expanded[i])}
			>
				▶</span
			>
		{/if}
		<code>
			<span class="value {token.kind}">{token.kind}</span>
			{#if token.metadata.info_start != null}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="info"
					onclick={(e) =>
						handle_meta_click(e, [
							token.metadata.info_start,
							token.metadata.info_end,
						])}
					><span class="label">INFO</span>
					[{token.metadata.info_start},{token.metadata.info_end}]</span
				>
			{/if}
			{#if (token.value[0] && token.value[0] != token.start) || (token.value[1] && token.value[1] != token.end)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span class="info" onclick={(e) => handle_meta_click(e, token.value)}
					><span class="label">VALUE</span>
					[{token.value[0]},{token.value[1]}]</span
				>
			{/if}
			<span class="pos">[{token.start},{token.end}]</span>
		</code>
	</button>
	{#if is_expanded[i]}
		<Token
			nodes={token.children}
			{selectedToken}
			{onTokenSelect}
			depth={depth + 1}
			{on_meta_click}
		/>
	{/if}
{/each}

<style>
	button {
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		padding: 0;
		margin: 0;
		cursor: pointer;
		outline: none;
		transition: all 0.2s ease;
		display: flex;
		/* justify-content: center; */
		align-items: center;
		color: var(--accent-dim);
	}

	button:hover {
		background: var(--bg-hover);
		border-color: var(--border-light);
	}

	button.selected {
		background: var(--accent-dim);
		border-color: var(--accent);
	}

	code {
		display: flex;
		flex-direction: row;
		justify-content: flex-start;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem;
		background: transparent;
		/* border-left: 1px solid var(--border); */
		border-radius: 0;
		width: 100%;
	}

	.info {
		color: var(--text-secondary);
		font-size: 0.75rem;
		line-height: 1;
		padding-right: 0.4rem;
		overflow: hidden;
		border-radius: 3px;
		background-color: var(--accent-dim);
	}

	.label {
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.05em;

		background-color: var(--accent);
		padding: 0.4rem 0.4rem 0.25rem 0.4rem;
		display: inline-block;
		height: 100%;
		color: var(--text-tertiary);
		font-size: 0.7rem;
	}

	.pos {
		color: var(--text-tertiary);
		font-size: 0.75rem;
		margin-left: auto;
	}

	.value {
		color: var(--accent);
		font-weight: 500;
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.expand-icon {
		/* font-size: 0.7rem; */
		display: inline-block;
		color: var(--text-tertiary);
		padding-right: 0.25rem;
		padding-left: 0.5rem;
		transition: transform 0.2s ease;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.expanded {
		transform: rotate(90deg);
	}
</style>
