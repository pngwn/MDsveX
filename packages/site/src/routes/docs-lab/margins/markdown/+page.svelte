<script lang="ts">
	import Margins from '$lib/docs-lab/margins/Margins.svelte';

	let { data } = $props();
</script>

<Margins page={data.page} />
