<script lang="ts">
	// `::::added`, a grid of marks, the atlas's index cells for a list of small
	// things: each `:::add` in it is a cell with its mark, what you write and what
	// you get. Learn's "Added to CommonMark" is one
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="added wide">{@render children?.()}</div>

<style>
	.added {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
		margin: 1.5rem 0 2rem;
		border-top: 1px solid var(--ink);
		border-left: 1px solid var(--ink);
	}
</style>
