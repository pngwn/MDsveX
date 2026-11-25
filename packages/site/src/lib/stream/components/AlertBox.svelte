<script lang="ts">
	import type { Snippet } from "svelte";

	let { type = "info", children }: { type?: string; children?: Snippet } = $props();

	let dismissed = $state(false);
</script>

{#if !dismissed}
	<div class="alert" data-type={type} role="alert">
		<span class="type">{type}</span>
		<div class="content">{@render children?.()}</div>
		<button onclick={() => (dismissed = true)} aria-label="Dismiss">×</button>
	</div>
{/if}

<style>
	.alert {
		--tone: var(--line-list);
		--name: var(--name-list);
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		margin: 0 0 1.1rem;
		padding: 0.6rem 0.75rem;
		border-left: 1.5px solid var(--tone);
	}

	.alert[data-type="warning"] {
		--tone: var(--line-strong);
		--name: var(--name-strong);
	}

	.alert[data-type="error"] {
		--tone: var(--line-item);
		--name: var(--name-item);
	}

	.alert[data-type="success"] {
		--tone: var(--line-quote);
		--name: var(--name-quote);
	}

	.type {
		color: var(--name);
		font: 400 0.75rem / 1.5 var(--face-mono);
	}

	.content {
		flex: 1;
		min-width: 0;
	}

	.content :global(p:last-child) {
		margin-bottom: 0;
	}

	button {
		padding: 0 0.25rem;
		border: 0;
		color: var(--quiet);
		background: none;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		color: var(--ink);
	}
</style>
