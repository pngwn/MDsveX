<script>
	import { onMount } from 'svelte';

	/**
	 * @typedef {{
	 *   children?: import('svelte').Snippet,
	 *   code?: string,
	 *   title?: string,
	 *   caption?: string,
	 *   theme?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { children, code = '', title, caption, theme } = $props();

	const id = $props.id();

	let svg = $state('');
	let failed = $state(false);

	// on the client only, the server and the first render show the code
	onMount(() => {
		let live = true;
		const dark = matchMedia('(prefers-color-scheme: dark)').matches;
		import('mermaid')
			.then(async ({ default: mermaid }) => {
				mermaid.initialize({
					startOnLoad: false,
					// strict has mermaid sanitize the svg it returns, which is rendered as html
					securityLevel: 'strict',
					theme: /** @type {any} */ (theme || (dark ? 'dark' : 'default')),
				});
				// parse throws where render would draw its error into the page
				await mermaid.parse(code);
				const out = await mermaid.render('mermaid-' + id, code);
				if (live) svg = out.svg;
			})
			.catch((/** @type {unknown} */ error) => {
				// what render leaves in the body when it fails
				document.getElementById('dmermaid-' + id)?.remove();
				if (!live) return;
				failed = true;
				console.error(error);
			});
		return () => {
			live = false;
		};
	});
</script>

<figure class="diagram diagram-mermaid">
	{#if title}<figcaption class="diagram-title">{title}</figcaption>{/if}
	{#if svg}
		<div class="diagram-svg">{@html svg}</div>
		<details class="diagram-source">
			<summary>Diagram source</summary>
			{@render children?.()}
		</details>
	{:else}
		{#if failed}<p class="diagram-error">The diagram could not be drawn, its source follows.</p>{/if}
		{@render children?.()}
	{/if}
	{#if caption}<div class="diagram-caption">{caption}</div>{/if}
</figure>
