<script lang="ts">
	import PluginPage from '$lib/docs-lab/plugins/PluginPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.plugin.title}, a plugin, mdsvex</title>
	<meta name="description" content={data.plugin.description} />
</svelte:head>

<PluginPage plugin={data.plugin} all={data.all} />
