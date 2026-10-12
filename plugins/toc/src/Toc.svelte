<script>
	import { toc_tree } from './tree.js';

	/**
	 * @type {{
	 *   headings?: import('./tree.js').TocHeading[] | string,
	 *   min_depth?: number | string,
	 *   max_depth?: number | string,
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   class?: import('svelte/elements').ClassValue,
	 *   [attribute: string]: unknown,
	 * }}
	 */
	let {
		headings,
		min_depth = 1,
		max_depth = 6,
		label,
		children: _children,
		class: class_name,
		...rest
	} = $props();

	const id = $props.id();

	const tree = $derived.by(() => {
		// the directive gives its headings as json, an arg is always a string
		/** @type {import('./tree.js').TocHeading[]} */
		const all = typeof headings === 'string' ? JSON.parse(headings) : (headings ?? []);
		const min = Number(min_depth);
		const max = Number(max_depth);
		return toc_tree(all.filter((heading) => heading.depth >= min && heading.depth <= max));
	});
</script>

{#snippet list(/** @type {import('./tree.js').TocNode[]} */ nodes)}
	<ul>
		{#each nodes as node (node)}
			<li>
				<a href="#{node.id}">{node.text}</a>{#if node.children.length > 0}{@render list(node.children)}{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#if tree.length > 0}
	<nav aria-labelledby={label ? `${id}-label` : undefined} {...rest} class={['toc', class_name]}>
		{#if label}<p class="toc-label" id="{id}-label">{@render label()}</p>{/if}{@render list(tree)}
	</nav>
{/if}
