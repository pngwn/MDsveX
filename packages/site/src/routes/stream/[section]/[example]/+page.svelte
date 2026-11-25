<script lang="ts">
	import { page } from "$app/state";
	import StreamDemo from "$lib/stream/StreamDemo.svelte";
	import Viewer from "$lib/stream/Viewer.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.snippet.name} · mdsvex stream lab</title>
</svelte:head>

<!-- a new viewer for each example, so a step or a stream never outlives its document -->
{#key page.url.pathname}
	{#if data.snippet.stream}
		<StreamDemo markdown={data.snippet.markdown} demo={data.snippet.stream} />
	{:else}
		<Viewer markdown={data.snippet.markdown} plugins={data.snippet.plugins} />
	{/if}
{/key}
