<script lang="ts">
	import Plates from '$lib/docs-lab/plates/Plates.svelte';

	let { data } = $props();
</script>

<Plates page={data.page} />
