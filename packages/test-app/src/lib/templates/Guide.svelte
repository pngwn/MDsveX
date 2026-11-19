<script module lang="ts">
	export { default as h2 } from './SectionHeading.svelte';
	export { default as img } from './guide/Figure.svelte';
	export * as directives from './guide/directives';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		level?: 'beginner' | 'advanced';
		draft?: boolean;
		children: Snippet;
	}

	let { title, level = 'beginner', draft = false, children }: Props = $props();
</script>

<article class="guide" data-level={level}>
	<header>
		<h1>{title}</h1>
		{#if draft}<p class="draft">draft</p>{/if}
	</header>
	{@render children()}
</article>
