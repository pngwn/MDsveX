<script>
	/**
	 * @typedef {{
	 *   src?: string,
	 *   alt?: string,
	 *   title?: string,
	 *   figure?: string,
	 *   [attribute: string]: unknown,
	 * }} Props
	 */

	/** @type {Props} */
	let { src, alt, title, figure, ...rest } = $props();
</script>

{#if figure === 'true' && title}
	<figure class="figure">
		<img {src} {alt} {...rest} />
		<figcaption class="figure-caption">{title}</figcaption>
	</figure>
{:else}
	<img {src} {alt} {title} {...rest} />
{/if}
