<script lang="ts">
	// notes or edges in a plate, side by side when wide, with no heading
	import type { Snippet } from 'svelte';

	interface Props {
		kind: 'notes' | 'edges';
		children?: Snippet;
	}

	let { kind, children }: Props = $props();
</script>

<section class="plate-{kind}" aria-label={kind === 'notes' ? 'Notes' : 'Edges'}>
	{@render children?.()}
</section>

<style>
	/* the prose keeps a reading measure; an example in it, an error an edge
	   shows, takes the part's width */
	section > :global(:not(.pair)) {
		max-width: 62ch;
	}

	section > :global(.pair) {
		margin: 0.75rem 0 0.5rem;
	}

	section > :global(:last-child) {
		margin-bottom: 0;
	}

	section :global(p) {
		margin: 0 0 0.5rem;
	}

	section :global(ul) {
		display: grid;
		gap: 0.375rem;
		margin: 0;
		padding-left: 1.1em;
	}

	section :global(li) {
		margin: 0;
	}

	section :global(li::marker) {
		color: var(--own-line);
	}

	/* the voice red stays red in every palette, --line-item does not */
	.plate-edges :global(li::marker) {
		color: var(--voice-rose);
	}

	/* an edge's fence and its error, set small */
	section :global(pre) {
		margin: 0;
		font-size: 0.8125rem;
	}
</style>
