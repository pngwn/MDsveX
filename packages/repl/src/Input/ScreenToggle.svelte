<script lang="ts">
	let {
		left = 'Input',
		right = 'Output',
		checked,
		onchange,
	}: {
		left?: string;
		right?: string;
		checked: boolean;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<div class="input-output-toggle" role="group" aria-label="Playground pane">
	<button aria-pressed={!checked} onclick={() => onchange?.(false)}>{left}</button>
	<button aria-pressed={checked} onclick={() => onchange?.(true)}>{right}</button>
</div>

<style>
	.input-output-toggle {
		position: relative;
		display: flex;
		justify-content: center;
		box-sizing: border-box;
		height: var(--repl-pane-controls-height);
		border-top: 1px solid var(--repl-border);
	}
	.input-output-toggle button {
		padding: 0 1rem;
		font: var(--repl-font-ui-small);
		color: var(--repl-fg-2);
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
	}
	.input-output-toggle button[aria-pressed='true'] {
		color: var(--repl-fg-1);
		border-bottom: 2px solid var(--repl-fg-accent);
		font-weight: 600;
	}
</style>
