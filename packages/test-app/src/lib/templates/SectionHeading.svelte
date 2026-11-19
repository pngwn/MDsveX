<script>
	let { level, children, ...rest } = $props();
</script>

<h2 class="section" data-level={level} {...rest}>{@render children()}</h2>
