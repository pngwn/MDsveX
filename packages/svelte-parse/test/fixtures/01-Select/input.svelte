<script>
	import { createEventDispatcher } from 'svelte';
	import Icon from './Icon.svelte';

	/** Binding value
	 * @svelte-prop {Any} [selected]
	 * */
	export let selected = '';

	/** Type (color) of the select
	 * @svelte-prop {String} [type]
	 * @values <code>is-white</code>, <code>is-black</code>, <code>is-light</code>, <code>is-dark</code>, <code>is-primary</code>, <code>is-info</code>, <code>is-success</code>, <code>is-warning</code>, <code>is-danger</code>, and any other colors you've set in the <code>$colors</code> list on Sass
	 * */
	export let type = '';

	/** Text when nothing is selected
	 * @svelte-prop {String} [placeholder]
	 * */
	export let placeholder = '';

	/** Multiple Select
	 * @svelte-prop {String} [multiple=false]
	 * */
	export let multiple = false;

	/** Size of the select
	 * @svelte-prop {String} [size]
	 * @values <code>is-small</code>, <code>is-medium</code>, <code>is-large</code>
	 * */

	export let size = '';

	/** Same as native size
	 * @svelte-prop {String} [nativeSize]
	 * */
	export let nativeSize;

	/** Select will be expanded (full-width)
	 * @svelte-prop {Boolean} [expanded=false]
	 * */
	export let expanded = false;

	/** Select will be rounded
	 * @svelte-prop {Boolean} [rounded=false]
	 * */
	export let rounded = false;

	/** Select value is required
	 * @svelte-prop {Boolean} [required=false]
	 * */
	export let required = false;

	/** Add the loading state to the Select
	 * @svelte-prop {Boolean} [loading=false]
	 * */
	export let loading = false;

	/** Icon name to be added
	 * @svelte-prop {String} [icon]
	 * */

	export let icon = '';

	/** Icon pack to use
	 * @svelte-prop {String} [iconPack=mdi]
	 * @values <code>mdi</code>, <code>fa</code>, <code>fas</code>, <code>far</code>, <code>fad</code>, <code>fal</code>
	 * */
	export let iconPack = 'mdi';

	/** Add the disabled state to the Select
	 * @svelte-prop {String} [disabled = false]
	 * */

	export let disabled = false;

	const dispatch = createEventDispatcher();

	let focused = false;
	let hovered = false;

	function onChange() {
		dispatch('input', selected);
	}

	function onBlur() {
		focused = false;
		dispatch('blur');
	}

	function onHover() {
		hovered = true;
		dispatch('hover');
	}

	function onFocus() {
		focused = true;
		dispatch('focus');
	}
</script>

<div class="control" class:is-expanded={expanded} class:has-icons-left={icon}>
	<span
		class="select {size} {type}"
		class:is-fullwidth={expanded}
		class:is-loading={loading}
		class:is-multiple={multiple}
		class:is-rounded={rounded}
		class:is-empty={selected === ''}
		class:is-focused={focused}
		class:is-hovered={hovered}
		class:is-required={required}>
		{#if !multiple}
			<select
				bind:value={selected}
				size={nativeSize}
				disabled={disabled ? 'disabled' : ''}
				on:change={onChange}
				on:blur={onBlur}
				on:hover={onHover}
				on:focus={onFocus}>
				{#if placeholder && selected === ''}
					<option value="x" disabled hidden>{placeholder}</option>
				{/if}
				<slot />
			</select>
		{:else}
			<select
				bind:value={selected}
				multiple
				size={nativeSize}
				disabled={disabled ? 'disabled' : ''}
				on:change={onChange}
				on:blur={onBlur}
				on:hover={onHover}
				on:focus={onFocus}>
				{#if placeholder && selected === ''}
					<option value="x" disabled hidden>{placeholder}</option>
				{/if}
				<slot />
			</select>
		{/if}
	</span>

	{#if icon}
		<Icon isLeft {icon} pack={iconPack} {size} />
	{/if}
</div>
