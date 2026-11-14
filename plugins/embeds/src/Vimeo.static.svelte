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

	// dnt asks the player to track nothing
	const src = $derived(
		'https://player.vimeo.com/video/' +
			encodeURIComponent(id ?? '') +
			'?dnt=1' +
			(start ? '#t=' + encodeURIComponent(start) + 's' : '')
	);
</script>

{#if id}
	<div class="embed embed-vimeo">
		<iframe
			{src}
			title={title || 'Vimeo video'}
			loading="lazy"
			allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
			referrerpolicy="strict-origin-when-cross-origin"
			allowfullscreen
		></iframe>
	</div>
{:else if label}
	<p>{@render label()}</p>
{/if}
