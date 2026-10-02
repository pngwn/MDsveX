<script module lang="ts">
	export { default as h2 } from './Heading.svelte';
	export * as directives from './directives.ts';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, pinned = false, children }: { title: string; pinned?: boolean; children: Snippet } =
		$props();
</script>

<section class:pinned>
	<h1>{title}</h1>
	{@render children()}
</section>
