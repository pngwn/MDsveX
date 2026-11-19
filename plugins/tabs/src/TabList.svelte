<script>
	import { setContext } from 'svelte';

	/** @type {{ children?: import('svelte').Snippet }} */
	let { children } = $props();

	setContext('mdsvex-tabs-list', true);
</script>

{@render children?.()}
