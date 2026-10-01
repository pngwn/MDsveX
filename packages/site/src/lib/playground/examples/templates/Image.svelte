<script>
	let { src, alt, title } = $props();
</script>

<figure>
	<img {src} {alt} {title} />
	<figcaption>{alt}</figcaption>
</figure>
