<script module>
	export { default as h1 } from './PostHeading.svelte';
</script>

<script>
	let { title, children } = $props();
</script>

<article class="post" data-title={title}>{@render children()}</article>
