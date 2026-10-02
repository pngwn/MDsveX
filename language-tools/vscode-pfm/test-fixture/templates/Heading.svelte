<script lang="ts">
	import type { Snippet } from 'svelte';

	let { level, children }: { level: number; children?: Snippet } = $props();
</script>

<h2 data-level={level}>{@render children?.()}</h2>
