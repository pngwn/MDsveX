<script lang="ts">
	// a plugin's page is its plate over its own prose; every other page here
	// renders as it is
	import PluginPage from '$lib/docs/plugins/PluginPage.svelte';

	let { data, children } = $props();
</script>

{#if data.plugin}
	<PluginPage plugin={data.plugin}>{@render children()}</PluginPage>
{:else}
	{@render children()}
{/if}
