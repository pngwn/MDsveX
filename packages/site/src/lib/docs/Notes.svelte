<script lang="ts">
	// `:::notes` in a plate: what follows its example
	import type { Snippet } from 'svelte';
	import PlateSection from './PlateSection.svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<PlateSection kind="notes">{@render children?.()}</PlateSection>
