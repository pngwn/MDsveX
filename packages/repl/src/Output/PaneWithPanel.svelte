<script lang="ts">
	import { Spring } from 'svelte/motion';
	import { SplitPane, type Length } from '@rich_harris/svelte-split-pane';

	const UNIT_REGEX = /(\d+)(?:(px|rem|%|em))/i;

	interface Props {
		panel: string;
		pos?: Length;
		min?: Length;
		max?: Length;
		main?: import('svelte').Snippet;
		header?: import('svelte').Snippet;
		body?: import('svelte').Snippet;
	}

	let {
		panel,
		pos = $bindable('90%'),
		min = '42px',
		max = '-42px',
		main,
		header,
		body
	}: Props = $props();

	let previous_pos = Math.min(normalize(pos), 70);

	let container: HTMLElement;

	// a spring cannot be bound, so it drives pos instead
	const driver = new Spring(normalize(pos), {
		stiffness: 0.2,
		damping: 0.5
	});

	$effect(() => {
		pos = driver.current + '%';
	});

	const toggle = () => {
		const pc = normalize(pos);
		const px = pc * 0.01 * container.clientHeight;

		const open = container.clientHeight - px > 42;

		driver.set(pc, { hard: true });

		if (open) {
			previous_pos = pc;
			driver.set(100);
		} else {
			driver.set(previous_pos);
		}
	};

	function normalize(pos: string) {
		let normalized = +pos.replace(UNIT_REGEX, '$1');

		if (normalized < 0) {
			normalized += 100;
		}

		return normalized;
	}
</script>

<div class="pane-container" bind:this={container}>
	<SplitPane {min} {max} type="rows" bind:pos>
		{#snippet a()}
			<section>
				{@render main?.()}
			</section>
		{/snippet}

		{#snippet b()}
			<section>
				<div class="panel-header">
					<button class="panel-heading raised" onclick={toggle}>
						<svg
							width="18px"
							height="18px"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m7 15 5 5 5-5" />
							<path d="m7 9 5-5 5 5" />
						</svg>

						{panel}
					</button>

					{@render header?.()}
				</div>

				<div class="panel-body">
					{@render body?.()}
				</div>
			</section>
		{/snippet}
	</SplitPane>
</div>

<style>
	.pane-container {
		width: 100%;
		height: 100%;
	}

	.panel-header {
		height: var(--repl-pane-controls-height);
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 5px 5px 5px 10px;
	}

	.panel-body {
		overflow: auto;
		max-height: calc(100% - var(--repl-pane-controls-height));
	}

	.panel-heading {
		font: var(--repl-font-ui-small);
		text-transform: uppercase;
		height: 32px;
		padding: 0 8px;
		text-align: left;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	section {
		position: relative;
		overflow: hidden;
	}
</style>
