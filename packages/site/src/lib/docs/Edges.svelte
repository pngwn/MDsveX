<script lang="ts">
	// `:::edges` in a plate: where the construct stops holding, and what it does there
	import type { Snippet } from 'svelte';
	import PlateSection from './PlateSection.svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<PlateSection kind="edges">{@render children?.()}</PlateSection>
