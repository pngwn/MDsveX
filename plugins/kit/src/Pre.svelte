<script>
	import { onDestroy } from 'svelte';

	/**
	 * @typedef {{
	 *   children?: import('svelte').Snippet,
	 *   code?: string,
	 *   lang?: string,
	 *   title?: string,
	 *   caption?: string,
	 *   nocopy?: boolean | string,
	 *   [prop: string]: unknown,
	 * }} Props
	 */

	/** @type {Props} */
	let { children, code, lang, title, caption, nocopy } = $props();

	/** @type {'' | 'copied' | 'failed'} */
	let status = $state('');
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;

	async function copy() {
		clearTimeout(timer);
		try {
			await navigator.clipboard.writeText(code ?? '');
			status = 'copied';
		} catch {
			// no clipboard outside a secure context, or the reader refused it
			status = 'failed';
		}
		timer = setTimeout(() => (status = ''), 2000);
	}

	onDestroy(() => clearTimeout(timer));
</script>

<div class="code-block" data-language={lang || undefined}>
	{#if title}<div class="code-block-title">{title}</div>{/if}
	<!-- the button goes first so spacing rules for what follows a pre never move it -->
	<div class="code-block-body">
		{#if !nocopy && code !== undefined}
			<div class="code-block-actions">
				<!-- a live region is only read when it changes, so it is there from the start -->
				<span class="code-block-status" role="status"
					>{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : ''}</span
				>
				<button
					type="button"
					class="code-block-copy"
					aria-label={title ? `Copy code of ${title}` : 'Copy code'}
					onclick={copy}>Copy</button
				>
			</div>
		{/if}
		{@render children?.()}
	</div>
	{#if caption}<div class="code-block-caption">{caption}</div>{/if}
</div>
