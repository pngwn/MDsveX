<script>
	import Toc from "@mdsvex/plugin-toc/Toc.svelte";

	let { title, plugin_data, children } = $props();

	const page = $derived(plugin_data.page);
</script>

<article class="post">
	<header>
		{#if title}<h1>{title}</h1>{/if}
		<p class="reading-time">{page.minutes} min read</p>
		{#if page.edit_url}
			<a class="edit" href={page.edit_url}>Edit this page</a>
		{/if}
	</header>
	<Toc headings={plugin_data.toc?.headings} aria-label="On this page" />
	{@render children()}
</article>
