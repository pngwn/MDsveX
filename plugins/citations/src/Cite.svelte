<script>
	/**
	 * @typedef {{
	 *   cites?: import('./index.js').Cited[] | string,
	 *   style?: import('./list.js').CitationStyle,
	 *   children?: import('svelte').Snippet,
	 *   class?: import('svelte/elements').ClassValue,
	 *   [attribute: string]: unknown,
	 * }} Props
	 */

	/** @type {Props} */
	let { cites, style = 'numeric', children: _children, class: class_name, ...rest } = $props();

	// the directive gives its keys as json, an arg is always a string
	const list = $derived(typeof cites === 'string' ? JSON.parse(cites) : (cites ?? []));
	const numeric = $derived(style === 'numeric');
</script>

{#if list.length > 0}
	<span {...rest} class={['citation', class_name]}
		>{numeric ? '[' : '('}{#each list as cite, i (cite.id)}{#if i > 0}{numeric ? ', ' : '; '}{/if}{#if cite.href}<a
					href={cite.href}
					id={cite.id}
					role="doc-biblioref">{cite.label}</a
				>{:else}{cite.label}{/if}{/each}{numeric ? ']' : ')'}</span
	>
{/if}
