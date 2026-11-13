<script lang="ts">
	// a plate's first prose, which the docs plugin wraps so the plate can set it
	// in its head beside the mark (Plate.svelte)
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="plate-lede">{@render children?.()}</div>

<style>
	.plate-lede > :global(:last-child) {
		margin-bottom: 0;
	}

	.plate-lede :global(li::marker) {
		color: var(--own-name);
		font-family: var(--face-mono);
		font-size: 0.875em;
	}
</style>
