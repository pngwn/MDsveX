<script lang="ts">
	const { children, ...rest } = $props();
</script>

<p>am layout</p>
<p>metadata title: {rest.title}</p>
{@render children()}