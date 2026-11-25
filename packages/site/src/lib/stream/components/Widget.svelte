<script lang="ts">
	// a counter, state a streamed document keeps while the rest of it arrives
	let { count = "0" }: { count?: string } = $props();
	// svelte-ignore state_referenced_locally
	let value = $state(Number(count) || 0);
</script>

<span class="widget">
	<button onclick={() => value--} aria-label="Less">−</button>
	<span class="value">{value}</span>
	<button onclick={() => value++} aria-label="More">+</button>
</span>

<style>
	.widget {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--line-comp);
		vertical-align: middle;
		font: 400 0.8125rem / 1 var(--face-mono);
	}

	button {
		padding: 0.25rem 0.5rem;
		border: 0;
		color: var(--name-comp);
		background: none;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		color: var(--paper);
		background: var(--line-comp);
	}

	.value {
		min-width: 2ch;
		text-align: center;
		color: var(--name-comp);
		font-variant-numeric: tabular-nums;
	}
</style>
