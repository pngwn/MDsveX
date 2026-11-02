<script lang="ts">
	// one parser's reading of a contrast's source: what it renders as, set in the
	// page's text face, and the html it gives. Real output both: micromark for
	// CommonMark, mdsvex's compile rendered for mdsvex (build.server.ts)
	import type { Reading } from './types';

	interface Props {
		reading: Reading;
		/** the rendered page, the html, or both, the page over its html */
		show?: 'both' | 'rendered' | 'html';
		label?: string;
	}

	let { reading, show = 'both', label }: Props = $props();
</script>

<div class="witness">
	{#if show !== 'html'}
		<!-- the reading as a reader sees it: the real html, set as a page would set it -->
		<div class="rendered" aria-label={label ? `${label}, rendered` : undefined} role="group">{@html reading.html}</div>
	{/if}
	{#if show !== 'rendered'}
		<div class="html wrap">{@html reading.html_code}</div>
	{/if}
</div>

<style>
	.witness {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.625rem;
		min-width: 0;
	}

	.rendered {
		min-width: 0;
		font: 400 1.0625rem / 1.45 var(--face-text);
		overflow-wrap: anywhere;
	}

	.rendered :global(:is(p, h1, h2, blockquote, pre, ul, ol, hr)) {
		margin: 0 0 0.375rem;
	}

	.rendered :global(:last-child) {
		margin-bottom: 0;
	}

	.rendered :global(:is(h1, h2)) {
		font: 500 1.375rem / 1.15 var(--face-display);
	}

	.rendered :global(h2) {
		font-size: 1.1875rem;
	}

	.rendered :global(blockquote) {
		padding-left: 0.75rem;
		border-left: 1.5px solid var(--line-quote);
	}

	.rendered :global(hr) {
		border: 0;
		border-top: 1px solid var(--ink);
		margin-block: 0.625rem;
	}

	.rendered :global(pre) {
		margin: 0;
		padding: 0 0 0 0.75rem;
		font-size: 0.875rem;
	}

	.rendered :global(a) {
		color: var(--name-link);
	}

	.html :global(pre) {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.5;
	}
</style>
