<script>
	/**
	 * @typedef {{
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   kind?: string,
	 *   title?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { label, children, kind = 'note', title = 'Note' } = $props();
</script>

<!-- a note is no landmark and the title is no heading, so callouts stay out of the landmarks and the outline -->
<div class="callout" data-kind={kind} role="note">
	<p class="callout-title">
		<svg
			class="callout-icon"
			viewBox="0 0 16 16"
			width="16"
			height="16"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			focusable="false"
			role={label ? 'img' : undefined}
			aria-label={label ? title : undefined}
			aria-hidden={label ? undefined : 'true'}
		>
			{#if kind === 'tip'}
				<path d="M5.75 11.25h4.5M6.5 13.75h3M6 9.5C4.9 8.7 4.25 7.6 4.25 6.25a3.75 3.75 0 0 1 7.5 0c0 1.35-.65 2.45-1.75 3.25" />
			{:else if kind === 'important'}
				<path d="M2.25 2.75h11.5v8h-6.5l-3.5 2.75v-2.75h-1.5zM8 4.75v3M8 9.25v.01" />
			{:else if kind === 'warning'}
				<path d="M8 1.75l6.5 11.5h-13zM8 6v3.25M8 11.25v.01" />
			{:else if kind === 'caution'}
				<path d="M5.4 1.75h5.2l3.65 3.65v5.2l-3.65 3.65H5.4L1.75 10.6V5.4zM8 4.75v3.75M8 10.75v.01" />
			{:else}
				<circle cx="8" cy="8" r="6.25" />
				<path d="M8 7.25v4M8 4.75v.01" />
			{/if}
		</svg>
		<span class="callout-title-text">{#if label}{@render label()}{:else}{title}{/if}</span>
	</p>
	<div class="callout-body">{@render children?.()}</div>
</div>
