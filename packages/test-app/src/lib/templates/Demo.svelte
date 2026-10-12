<script module lang="ts">
	// a block marked run hands its module to the component that replaces pre
	export { default as pre } from './demo/Pre.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<article class="demo-page">
	{@render children()}
</article>
