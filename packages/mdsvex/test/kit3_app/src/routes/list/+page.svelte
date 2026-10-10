<script>
	let { data } = $props();
</script>

<ul>
	{#each data.posts as post}
		<li>{post.slug}: {post.title ?? 'untitled'}</li>
	{/each}
</ul>
