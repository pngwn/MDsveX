<script>
	let { title, plugin_data, children } = $props();
</script>

<article class="post">
	<header>
		<h1>{title}</h1>
		<p class="reading-time">{plugin_data.reading_time.minutes} min read</p>
	</header>
	<nav class="toc" aria-label="On this page">
		<ul>
			{#each plugin_data.toc.headings as heading (heading.id)}
				<li data-depth={heading.depth}>
					<a href="#{heading.id}">{heading.text}</a>
				</li>
			{/each}
		</ul>
	</nav>
	{@render children()}
</article>
