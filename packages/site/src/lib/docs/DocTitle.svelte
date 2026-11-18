<script lang="ts">
	import type { Snippet } from 'svelte';
	import ReadingSwitch from './ReadingSwitch.svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<div class="preference"><ReadingSwitch /></div>

<style>
	.preference { display: none; }
	:global(article.prose:has(.pair, .contrast)) > .preference {
		display: block;
		margin-block: -0.5rem 1.25rem;
	}
</style>
