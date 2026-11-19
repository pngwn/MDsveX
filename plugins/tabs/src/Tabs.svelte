<script module>
	const STORE = 'mdsvex-tabs:';
	const EVENT = 'mdsvex-tabs';

	/** @param {HTMLElement} tab */
	function key_of(tab) {
		return (tab.textContent ?? '').trim();
	}
</script>

<script>
	import { onMount, setContext, tick } from 'svelte';
	import TabList from './TabList.svelte';

	/**
	 * @typedef {{
	 *   label?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet,
	 *   group?: string,
	 *   code?: string,
	 * }} Props
	 */

	/** @type {Props} */
	let { label, children, group, code } = $props();

	const id = $props.id();

	let selected = $state(0);
	/** @type {HTMLElement | undefined} */
	let list = $state();

	/** @returns {HTMLElement[]} */
	function tabs() {
		return list ? Array.from(list.querySelectorAll(':scope > [role="tab"]')) : [];
	}

	/** @param {string} key */
	function show(key) {
		const index = tabs().findIndex((tab) => key_of(tab) === key);
		if (index !== -1) selected = index;
	}

	/** @param {number} index */
	async function select(index) {
		const tab = tabs()[index];
		selected = index;
		if (!group || !tab) return;
		const key = key_of(tab);
		try {
			localStorage.setItem(STORE + group, key);
		} catch {
			// storage can be turned off, the tabs still switch
		}
		// tab sets above this one change height, the tab stays under the pointer
		const top = tab.getBoundingClientRect().top;
		dispatchEvent(new CustomEvent(EVENT, { detail: { group, key, from: id } }));
		await tick();
		scrollBy(0, tab.getBoundingClientRect().top - top);
	}

	/** @param {KeyboardEvent} event */
	function keydown(event) {
		const all = tabs();
		const from = all.indexOf(/** @type {HTMLElement} */ (event.currentTarget));
		if (from === -1) return;
		const forward = getComputedStyle(all[from]).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
		const back = forward === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
		let to = from;
		if (event.key === forward) to = (from + 1) % all.length;
		else if (event.key === back) to = (from - 1 + all.length) % all.length;
		else if (event.key === 'Home') to = 0;
		else if (event.key === 'End') to = all.length - 1;
		else return;
		event.preventDefault();
		all[to].focus();
		select(to);
	}

	// after hydration, so the server and the first client render agree on the first tab
	onMount(() => {
		if (!group) return;
		let stored = null;
		try {
			stored = localStorage.getItem(STORE + group);
		} catch {
			// no storage, the first tab stays
		}
		if (stored !== null) show(stored);
		/** @param {Event} event */
		const sync = (event) => {
			const detail = /** @type {CustomEvent} */ (event).detail;
			// two tabs of one set can share a label, the set that was clicked has its choice
			if (detail.group === group && detail.from !== id) show(detail.key);
		};
		addEventListener(EVENT, sync);
		return () => removeEventListener(EVENT, sync);
	});

	setContext('mdsvex-tabs', {
		id,
		get selected() {
			return selected;
		},
		select,
		keydown,
	});
	// a tab is rendered twice, as its button in the list and as its panel here
	setContext('mdsvex-tabs-list', false);
</script>

<div class={['tabs', code && 'tabs-code']}>
	{#if label}<p class="tabs-label" id="{id}-label">{@render label()}</p>{/if}
	<div
		class="tabs-list"
		role="tablist"
		aria-labelledby={label ? `${id}-label` : undefined}
		bind:this={list}
	>
		<TabList>{@render children?.()}</TabList>
	</div>
	{@render children?.()}
</div>
