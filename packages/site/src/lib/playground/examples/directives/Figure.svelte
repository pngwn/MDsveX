<script>
	let { src, label } = $props();
</script>

<figure>
	<img {src} alt="" />
	{#if label}<figcaption>{@render label()}</figcaption>{/if}
</figure>
