<script lang="ts">
	import StreamDemo from "$lib/StreamDemo.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

{#key data.demo}
	<StreamDemo markdown={data.markdown} demo={data.demo} />
{/key}
