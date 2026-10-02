<script lang="ts">
	let { src, alt }: { src: string; alt: string } = $props();
</script>

<figure>
	<img {src} {alt} />
	<figcaption>{alt}</figcaption>
</figure>
