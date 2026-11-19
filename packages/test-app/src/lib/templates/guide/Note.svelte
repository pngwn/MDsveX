<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'info' | 'warn';
		label?: Snippet;
		children?: Snippet;
	}

	let { tone = 'info', label, children }: Props = $props();
</script>

<aside class="note {tone}">
	{#if label}<strong>{@render label()}</strong>{/if}
	{@render children?.()}
</aside>
