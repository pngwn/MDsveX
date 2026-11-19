<script module>
	// element named exports replace those elements in documents using this template
	export { default as h2 } from './SectionHeading.svelte';
	export { default as blockquote } from './Callout.svelte';
</script>

<script>
	let { title, author, children } = $props();
</script>

<article class="article">
	<header>
		<h1>{title}</h1>
		{#if author}<p class="byline">by {author}</p>{/if}
	</header>
	{@render children()}
</article>

<style>
	.byline {
		opacity: 0.7;
	}
</style>
