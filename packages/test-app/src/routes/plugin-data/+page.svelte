<script lang="ts">
	// each module is parsed for its data, no page is compiled for this list
	const posts = import.meta.glob("./*/+page.svx", {
		query: "?data",
		eager: true,
	}) as Record<string, typeof import("*?data")>;
</script>

<h1>Posts</h1>
<ul class="posts">
	{#each Object.entries(posts) as [path, { metadata, plugin_data }] (path)}
		<li>
			<a href="/plugin-data/{path.split('/')[1]}">{metadata?.title}</a>
			<span class="minutes">{plugin_data?.reading_time.minutes} min</span>
			<span class="words">{plugin_data?.reading_time.words} words</span>
			<span class="sections">
				{plugin_data?.toc?.headings.map((h) => h.text).join(", ")}
			</span>
		</li>
	{/each}
</ul>
