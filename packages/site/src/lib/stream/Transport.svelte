<script lang="ts">
	// to the start, a step back, play or pause, a step on, to the end
	interface Props {
		playing: boolean;
		onstart: () => void;
		onback: () => void;
		ontoggle: () => void;
		onforward: () => void;
		onend: () => void;
	}

	let { playing, onstart, onback, ontoggle, onforward, onend }: Props = $props();

	const START = "M20 5v14l-7-7M6 5v14H4V5m9 0v14l-7-7";
	const STEP = "M13 6v12l8.5-6M4 18l8.5-6L4 6z";
	const PLAY = "M8 19V5l11 7z";
	const PAUSE = "M14 19V5h4v14zm-8 0V5h4v14z";
	const END = "M4 5v14l7-7m7-7v14h2V5m-9 0v14l7-7";
</script>

{#snippet icon(d: string, flip = false)}
	<svg viewBox="0 0 24 24" aria-hidden="true" class:flip><path fill="currentColor" {d} /></svg>
{/snippet}

<div class="transport">
	<button onclick={onstart} aria-label="To the start" title="To the start">{@render icon(START)}</button>
	<button onclick={onback} aria-label="Step back" title="Step back">{@render icon(STEP, true)}</button>
	<button class="play" onclick={ontoggle} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"}>
		{@render icon(playing ? PAUSE : PLAY)}
	</button>
	<button onclick={onforward} aria-label="Step forward" title="Step forward">{@render icon(STEP)}</button>
	<button onclick={onend} aria-label="To the end" title="To the end">{@render icon(END)}</button>
</div>

<style>
	.transport {
		display: flex;
		gap: 0.25rem;
	}

	button {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 1.75rem;
		padding: 0;
	}

	.play {
		color: var(--paper);
		background: var(--ink);
		border-color: var(--ink);
	}

	svg {
		width: 1rem;
		height: 1rem;
	}

	.flip {
		transform: rotate(180deg);
	}
</style>
