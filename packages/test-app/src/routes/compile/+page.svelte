<script lang="ts">
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

{@html data.html}
