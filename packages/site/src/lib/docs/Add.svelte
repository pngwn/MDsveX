<script lang="ts">
	// one cell of `::::added`: `:::add[what you write](mark=…, tone=…)` with what
	// you get as its body. The docs plugin gives it an id, and leaves it for the
	// page's strip as it does a plate
	import type { Snippet } from 'svelte';

	interface Props {
		id?: string;
		mark?: string;
		tone?: string;
		label?: Snippet;
		children?: Snippet;
	}

	let { id, mark = '', tone = 'other', label, children }: Props = $props();
</script>

<div class="add" {id} style:--own-line="var(--line-{tone})" style:--own-name="var(--name-{tone})">
	<span class="add-mark" class:long={mark.length > 3} aria-hidden="true">{mark}</span>
	<span class="write">{@render label?.()}</span>
	<div class="get">{@render children?.()}</div>
</div>

<style>
	.add {
		display: grid;
		grid-template-columns: 3.5rem minmax(0, 1fr);
		grid-template-rows: auto auto;
		column-gap: 0.875rem;
		padding: 0.875rem 1rem;
		border-right: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
		scroll-margin-top: 1.5rem;
	}

	.add-mark {
		grid-row: 1 / 3;
		align-self: center;
		justify-self: start;
		padding-bottom: 0.4rem;
		border-bottom: 0.25rem solid var(--own-line);
		font: 400 1.375rem / 1 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--own-name);
		white-space: nowrap;
	}

	.add-mark.long {
		font-size: 0.875rem;
	}

	.write {
		font-size: 0.9375rem;
		line-height: 1.45;
	}

	.get {
		font: italic 400 0.9375rem / 1.4 var(--face-text);
		color: var(--quiet);
	}

	.get :global(p) {
		margin: 0;
	}
</style>
