<script>
	import { getContext } from 'svelte';
	import { bibliography_of, entry_parts } from './list.js';

	/**
	 * @typedef {{
	 *   data?: import('./list.js').CitationsData | string,
	 *   style?: import('./list.js').CitationStyle,
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   class?: import('svelte/elements').ClassValue,
	 *   'aria-label'?: string,
	 *   [attribute: string]: unknown,
	 * }} Props
	 */

	/** @type {Props} */
	let {
		data,
		style = 'numeric',
		label,
		children: _children,
		class: class_name,
		'aria-label': aria_label = 'References',
		...rest
	} = $props();

	const id = $props.id();

	// what the plugins wrote, from a compiled document or a stream, current changes as citations arrive
	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
	const plugin_data = getContext(Symbol.for('mdsvex.plugin_data'));

	// the directive hands over the whole data as json once the document is complete, a template the object
	const entries = $derived(
		bibliography_of(
			typeof data === 'string' ? JSON.parse(data) : (data ?? plugin_data?.current?.citations),
			style
		)
	);
</script>

{#snippet item(/** @type {import('./list.js').ListedEntry} */ entry)}
	<li id={entry.id}>
		{#each entry_parts(entry, style) as part, i (i)}{#if i > 0}{' '}{/if}{#if part.kind === 'title'}<cite
					>{part.text}</cite
				>{:else if part.kind === 'url'}<a href={part.text}>{part.text}</a
				>{:else}{part.text}{/if}{/each}{#each entry.cited_by as ref (ref)}{' '}<a
				href="#{ref}"
				role="doc-backlink"
				aria-label="Back to citation {ref.slice(5)}">↩︎</a
			>{/each}
	</li>
{/snippet}

{#if entries.length > 0}
	<section
		role="doc-bibliography"
		aria-labelledby={label ? `${id}-label` : undefined}
		aria-label={label ? undefined : aria_label}
		{...rest}
		class={['bibliography', class_name]}
	>
		{#if label}<p class="bibliography-label" id="{id}-label">{@render label()}</p>{/if}{#if style === 'numeric'}
			<ol>
				{#each entries as entry (entry.id)}{@render item(entry)}{/each}
			</ol>
		{:else}
			<ul>
				{#each entries as entry (entry.id)}{@render item(entry)}{/each}
			</ul>
		{/if}
	</section>
{/if}
