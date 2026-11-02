<script lang="ts">
	import Workbook from '$lib/docs-lab/workbook/Workbook.svelte';

	let { data } = $props();
</script>

<Workbook page={data.page} />
