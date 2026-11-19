<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
	let group: HTMLElement;
	let feedback = $state('');
	let timer: ReturnType<typeof setTimeout>;

	async function copy() {
		const code = group.querySelector('.tab-panel:not([hidden]) code');
		if (!code) return;
		clearTimeout(timer);
		try {
			await navigator.clipboard.writeText(code.textContent.trim());
			feedback = 'Copied';
		} catch {
			feedback = 'Copy failed';
		}
		timer = setTimeout(() => feedback = '', 1800);
	}
	onDestroy(() => clearTimeout(timer));
</script>

<div class="commands" bind:this={group}>
	{@render children()}
	<button type="button" onclick={copy} aria-label="Copy selected command">{feedback || 'Copy'}</button>
	<span class="status" role="status">{feedback}</span>
</div>

<style>
	.commands { position: relative; }
	.commands :global(.tabs-list) { padding-right: 5rem; }
	.commands :global(pre > code) {
		white-space: pre-wrap;
		width: auto;
	}
	button {
		position: absolute;
		inset: 0 0.25rem auto auto;
		min-width: 4.5rem;
		min-height: 2.25rem;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 0.8125rem/1.4 var(--face-mono);
		cursor: pointer;
	}
	.status {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
