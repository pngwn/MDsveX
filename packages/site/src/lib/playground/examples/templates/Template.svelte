<script module>
	export { default as h2 } from './Heading.svelte';
	export { default as p } from './Paragraph.svelte';
</script>

<script>
	let { title, author, children } = $props();
</script>

<article>
	<header>
		<h1>{title}</h1>
		<small>by {author}</small>
	</header>

	{@render children()}
</article>

<style>
	article {
		max-width: 60ch;
		margin: 0 auto;
		font-family: system-ui, sans-serif;
	}

	header {
		border-bottom: 2px solid #00dc82;
		margin-bottom: 1em;
	}
</style>
