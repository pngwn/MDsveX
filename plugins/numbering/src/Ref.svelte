<script>
	import { getContext } from 'svelte';
	import { AND, prefix_arg, PREFIXES, ref_parts } from './words.js';

	/**
	 * @typedef {{
	 *   ids?: string[] | string,
	 *   prefixes?: Partial<import('./words.js').Prefixes> | string,
	 *   and?: string,
	 *   prefix?: string | false,
	 *   children?: import('svelte').Snippet,
	 *   class?: import('svelte/elements').ClassValue,
	 *   [attribute: string]: unknown,
	 * }} Props
	 */

	/** @type {Props} */
	let {
		ids,
		prefixes,
		and = AND,
		prefix,
		children: _children,
		class: class_name,
		...rest
	} = $props();

	// what the plugins wrote, from a compiled document or a stream, current changes as targets arrive
	/** @type {import('mdsvex/compile').PluginDataContext | undefined} */
	const plugin_data = getContext(Symbol.for('mdsvex.plugin_data'));

	// the directive gives its ids and prefixes as json, an arg is always a string
	const parts = $derived.by(() => {
		/** @type {string[]} */
		const list = typeof ids === 'string' ? JSON.parse(ids) : (ids ?? []);
		const given =
			typeof prefixes === 'string' ? JSON.parse(prefixes) : (prefixes ?? {});
		const data = /** @type {Record<string, import('./words.js').Target> | undefined} */ (
			plugin_data?.current?.numbering
		);
		return ref_parts(
			list,
			{
				prefixes: { ...PREFIXES, ...given },
				and,
				prefix: prefix === false ? false : prefix_arg(prefix),
			},
			(id) => data?.['target:' + id]
		);
	});
</script>

{#if parts.length > 0}
	<span {...rest} class={['ref', class_name]}
		>{#each parts as part, i (i)}{#if part.href}<a href={part.href}>{part.text}</a
				>{:else}{part.text}{/if}{/each}</span
	>
{/if}
