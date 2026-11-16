<script lang="ts">
	// the page's switch, one line of meta: what it does, and its state as a
	// switch. The docs template puts it over every page that has an example
	import { onMount } from 'svelte';
	import { use_reading } from './reading.svelte';

	interface Props {
		/** how it is drawn: a line of meta, or a box like the atlas's colour pick */
		look?: 'line' | 'box';
	}

	let { look = 'line' }: Props = $props();

	const reading = use_reading();
	onMount(() => reading.restore());
</script>

<div class="switch {look}">
	<button type="button" role="switch" aria-checked={reading.on} onclick={() => reading.set(!reading.on)}>
		<span class="track" aria-hidden="true"><span class="knob"></span></span>
		<span class="what">Show the reading</span>
	</button>
	<span class="note">{reading.on ? 'every example drawn as its score' : 'every example as you write it'}</span>
</div>

<style>
	.switch {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.75rem;
		font: 400 0.8125rem / 1.4 var(--face-mono);
		font-variant-ligatures: none;
		color: var(--quiet);
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0;
		border: 0;
		font: inherit;
		color: var(--ink);
		background: none;
		cursor: pointer;
	}

	button:focus-visible {
		outline: 1.5px solid var(--ink);
		outline-offset: 3px;
	}

	/* a phrase in small: a line with a bar at each end, the knob a bar that moves along it */
	.track {
		position: relative;
		width: 1.75rem;
		height: 0.7rem;
		border-bottom: 1.5px solid var(--ink);
		translate: 0 -0.2rem;
	}

	.track::before,
	.track::after {
		content: '';
		position: absolute;
		bottom: -0.35rem;
		height: 0.7rem;
		border-left: 1.5px solid var(--ink);
	}

	.track::before {
		left: 0;
	}

	.track::after {
		right: 0;
	}

	.knob {
		position: absolute;
		left: 0.2rem;
		bottom: -0.25rem;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		border: 1.5px solid var(--ink);
		background: var(--paper);
	}

	[aria-checked='true'] .knob {
		left: calc(100% - 0.7rem);
		background: var(--ink);
	}

	@media (prefers-reduced-motion: no-preference) {
		.knob {
			transition: left 160ms ease;
		}
	}

	.box {
		display: inline-flex;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--ink);
	}

	.box .note {
		display: none;
	}
</style>
