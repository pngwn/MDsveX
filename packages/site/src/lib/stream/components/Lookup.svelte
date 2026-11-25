<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		definition,
		children,
	}: { definition?: string; children?: Snippet } = $props();
</script>

<span class={["lookup", { pending: definition === undefined }]}>
	<strong>{@render children?.()}</strong>
	{#if definition === undefined}
		<span class="note">looking up…</span>
	{:else}
		<span class="note">({definition})</span>
	{/if}
</span>

<style>
	.note {
		font-size: 0.85em;
		color: var(--quiet);
	}

	.pending .note {
		font-style: italic;
	}
</style>
