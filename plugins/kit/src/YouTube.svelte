<script>
	/**
	 * @typedef {{
	 *   label?: import('svelte').Snippet,
	 *   id?: string,
	 *   title?: string,
	 *   start?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { label, id, title, start } = $props();

	// the domain that sets no cookie until the video plays
	const src = $derived(
		'https://www.youtube-nocookie.com/embed/' +
			encodeURIComponent(id ?? '') +
			(start ? '?start=' + encodeURIComponent(start) : '')
	);
</script>

{#if id}
	<div class="embed embed-youtube">
		<iframe
			{src}
			title={title || 'YouTube video'}
			loading="lazy"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
			referrerpolicy="strict-origin-when-cross-origin"
			allowfullscreen
		></iframe>
	</div>
{:else if label}
	<p>{@render label()}</p>
{/if}
