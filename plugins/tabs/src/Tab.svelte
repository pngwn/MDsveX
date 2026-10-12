<script>
	import { getContext } from 'svelte';

	/**
	 * @type {{
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   title?: string,
	 *   index?: string,
	 * }}
	 */
	let { label, children, title, index = '0' } = $props();

	/**
	 * @type {{
	 *   id: string,
	 *   selected: number,
	 *   select: (index: number) => void,
	 *   keydown: (event: KeyboardEvent) => void,
	 * } | undefined}
	 */
	const tabs = getContext('mdsvex-tabs');
	const in_list = getContext('mdsvex-tabs-list') === true;

	const position = $derived(Number(index));
	// a tab written outside of tabs has nothing to switch it, so it shows
	const selected = $derived(tabs === undefined || tabs.selected === position);
</script>

{#if tabs === undefined}
	<div class="tab-panel">
		<div class="tab-panel-label">{@render label?.()}{title}</div>
		{@render children?.()}
	</div>
{:else if in_list}
	<button
		type="button"
		class="tab"
		role="tab"
		id="{tabs.id}-tab-{index}"
		aria-controls="{tabs.id}-panel-{index}"
		aria-selected={selected}
		tabindex={selected ? 0 : -1}
		onclick={() => tabs.select(position)}
		onkeydown={tabs.keydown}>{@render label?.()}{title}</button
	>
{:else}
	<div
		class="tab-panel"
		role="tabpanel"
		id="{tabs.id}-panel-{index}"
		aria-labelledby="{tabs.id}-tab-{index}"
		hidden={!selected}
		tabindex="0"
	>
		<!-- shown by the stylesheet where scripting is off and every panel is open -->
		<div class="tab-panel-label" hidden>{@render label?.()}{title}</div>
		{@render children?.()}
	</div>
{/if}
