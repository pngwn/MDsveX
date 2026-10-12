<script>
	import Toc from "@mdsvex/plugin-toc/Toc.svelte";

	let { title, plugin_data, children } = $props();
</script>

<article class="post">
	<header>
		<h1>{title}</h1>
		<p class="reading-time">{plugin_data.reading_time.minutes} min read</p>
	</header>
	<Toc headings={plugin_data.toc?.headings} aria-label="On this page" />
	{@render children()}
</article>
