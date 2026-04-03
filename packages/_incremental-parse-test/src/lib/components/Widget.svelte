<script lang="ts">
	import type { Snippet } from 'svelte'
	import { fade } from 'svelte/transition'


	let { count = '0', children }: { count?: string; children?: Snippet } = $props()
	let value = $state(Number(count) || 0)
</script>

<span class="widget" in:fade|global={{ duration: 100 }}>
	<button onclick={() => value--}>−</button>
	<span class="value">{value}</span>
	<button onclick={() => value++}>+</button>
</span>

<style>
	.widget {
		display: inline-flex;
		align-items: center;
		gap: 0;
		border: 1px solid var(--accent);
		border-radius: var(--radius-sm);
		overflow: hidden;
		vertical-align: middle;
		font-size: 0.8rem;
	}

	button {
		background: var(--bg-tertiary);
		color: var(--accent);
		border: none;
		padding: 0.15rem 0.3rem;
		font-size: 0.8rem;
		font-family: var(--font-mono);
		cursor: pointer;
		line-height: 1;
		border-radius: 2px;
		margin: 0 5px;
	}

	button:hover {
		background: var(--accent);
		color: var(--bg-primary);
	}

	.value {
		padding: 0.15rem 0rem;
		min-width: 1rem;
		text-align: center;
		color: var(--accent);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
</style>
