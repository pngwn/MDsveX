<script lang="ts">
	import type { Snippet } from 'svelte';

	let { tone = 'info', children }: { tone?: 'info' | 'warn'; children?: Snippet } = $props();
</script>

<span class="badge {tone}">{@render children?.()}</span>
