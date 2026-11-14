<script>
	/** @type {{ children?: import('svelte').Snippet, rt?: string }} */
	let { children, rt } = $props();
</script>

<!-- rp is what a browser without ruby shows around the reading -->
<ruby class="ruby"
	>{@render children?.()}{#if rt}<rp>(</rp><rt>{rt}</rt><rp>)</rp>{/if}</ruby
>
