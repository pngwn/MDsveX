<script lang="ts">
import type { Snippet } from "svelte";

let {
	type = "info",
	children,
}: {
	type?: string;
	children?: Snippet;
} = $props();

let dismissed = $state(false);

const icons: Record<string, string> = {
	warning: "⚠",
	error: "✕",
	success: "✓",
	info: "ℹ",
};
</script>

{#if !dismissed}
	<div class="alert alert-{type}" role="alert">
		<span class="icon">{icons[type] ?? icons.info}</span>
		<div class="content">
			{#if children}
				{@render children()}
			{/if}
		</div>
		<button class="dismiss" onclick={() => dismissed = true} aria-label="Dismiss">×</button>
	</div>
{/if}

<style>
	.alert {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		border-radius: var(--radius-sm);
		padding: 0.65rem 0.85rem;
		margin-bottom: 0.75rem;
		font-size: 0.85rem;
		line-height: 1.5;
		animation: slide-in 0.2s ease-out;
	}

	@keyframes slide-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.alert-warning {
		border: 1px solid #f59e0b;
		background: #f59e0b12;
		color: #fbbf24;
	}
	.alert-error {
		border: 1px solid #ef4444;
		background: #ef444412;
		color: #f87171;
	}
	.alert-success {
		border: 1px solid #22c55e;
		background: #22c55e12;
		color: #4ade80;
	}
	.alert-info {
		border: 1px solid #60a5fa;
		background: #60a5fa12;
		color: #93c5fd;
	}

	.icon {
		flex-shrink: 0;
		font-size: 1rem;
		line-height: 1.4;
	}

	.content {
		flex: 1;
		min-width: 0;
		border: none;
		padding: 0;
		margin: 0;
		margin-left: 10px
	}

	.content :global(p) {
		margin: 0;
	}

	.dismiss {
		flex-shrink: 0;
		background: none;
		border: none;
		color: inherit;
		opacity: 0.5;
		font-size: 1.1rem;
		padding: 0 0.2rem;
		cursor: pointer;
		line-height: 1;
		font-family: var(--font-mono);
	}

	.dismiss:hover {
		opacity: 1;
	}
</style>
