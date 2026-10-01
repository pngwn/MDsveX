<script lang="ts">
	import Checkbox from './Checkbox.svelte';

	let {
		left = 'input',
		right = 'output',
		checked = $bindable(),
		onchange
	}: {
		left?: string;
		right?: string;
		checked: boolean;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<!-- svelte-ignore a11y_label_has_associated_control -->
<label class="input-output-toggle">
	<span aria-current={!checked} style="text-align: right">{left}</span>
	<span style="display:grid; place-items: center">
		<Checkbox
			{checked}
			onchange={(value) => {
				checked = value;
				onchange?.(checked);
			}}
		/>
	</span>
	<span aria-current={checked}>{right}</span>
</label>

<style>
	.input-output-toggle {
		position: relative;
		display: grid;
		user-select: none;
		flex: 0;
		grid-template-columns: 1fr 40px 1fr;
		grid-gap: 5px;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: var(--repl-pane-controls-height);
		border-top: 1px solid var(--repl-border);
		font: var(--repl-font-ui-small);
		z-index: 2;
	}

	span[aria-current='false'] {
		color: var(--repl-fg-4);
	}
</style>
