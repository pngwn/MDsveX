<script module>
	const DURATION = 900;
	const COLOURS = ['#e8a33d', '#4f9d8f', '#c8553d', '#6a7fdb', '#b565a7', '#7a9e3a'];

	// when each bar was committed, by chart and index. A stream draws an open
	// block again with every chunk, so a bar picks its animation up where it
	// was and does not start over
	const committed_at = new Map();
</script>

<script>
	// label is the bracket text, children the list, and the args are props:
	// type as written, id and committed from plugin.js
	let { label, children, id = '', committed = '0', type = 'bar' } = $props();

	// a chart that opens with nothing committed is a new one, or a stream that began again
	// svelte-ignore state_referenced_locally
	if (committed === '0') {
		for (const key of committed_at.keys()) if (key.startsWith(id + ':')) committed_at.delete(key);
	}

	let list = $state();
	let rows = $state([]);

	// the items as the list holds them now, the text up to the colon is the name
	function read() {
		rows = [...list.querySelectorAll('li')].map((item) => {
			const text = item.textContent;
			const colon = text.indexOf(':');
			return {
				name: (colon === -1 ? text : text.slice(0, colon)).trim(),
				value: colon === -1 ? NaN : Number(text.slice(colon + 1)),
			};
		});
	}

	$effect(() => {
		read();
		const observer = new MutationObserver(read);
		observer.observe(list, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	});

	// an item is a bar once its line has ended, until then only its name shows
	const bars = $derived(
		rows.map((row, i) => ({ ...row, done: i < Number(committed) && Number.isFinite(row.value) }))
	);
	const max = $derived(Math.max(1, ...bars.filter((bar) => bar.done).map((bar) => bar.value)));

	/** how far into its animation bar i is, in ms */
	function age(i) {
		const key = `${id}:${i}`;
		if (!committed_at.has(key)) committed_at.set(key, performance.now());
		return performance.now() - committed_at.get(key);
	}
</script>

<figure class="chart" data-type={type}>
	{#if label}<figcaption>{@render label()}</figcaption>{/if}

	<div class="plot">
		{#each bars as bar, i (i)}
			<div class="column">
				<!-- as tall as the largest value, so a bar is its share of that -->
				<div class="track">
					{#if bar.done}
						{@const elapsed = age(i)}
						<span class="value">{bar.value}</span>
						<div
							class="bar"
							class:grow={elapsed < DURATION}
							style:height="{(bar.value / max) * 100}%"
							style:background={COLOURS[i % COLOURS.length]}
							style:animation-duration="{DURATION}ms"
							style:animation-delay="-{elapsed}ms"
						></div>
					{/if}
				</div>
				<span class="name">{bar.name || ' '}</span>
			</div>
		{/each}
	</div>

	<!-- the list itself, read and not shown -->
	<div hidden bind:this={list}>{@render children?.()}</div>
</figure>

<style>
	.chart {
		--height: 12rem;
		margin: 1.5rem 0;
		padding: 1rem;
		border: 1px solid currentColor;
		font-family: var(--font-mono, ui-monospace, monospace);
	}

	figcaption {
		min-height: 1.5em;
		font-weight: 600;
	}

	.plot {
		display: flex;
		gap: 0.75rem;
		/* room for the value over the tallest bar */
		margin-top: 2.5rem;
		/* the axis, a line right under the tracks */
		background: linear-gradient(currentColor, currentColor) 0 var(--height) / 100% 1px no-repeat;
	}

	.column {
		flex: 1;
		max-width: 5rem;
		min-width: 0;
	}

	.track {
		height: var(--height);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
	}

	.value {
		font-size: 0.8em;
		font-variant-numeric: tabular-nums;
	}

	.bar {
		flex: none;
		width: 100%;
		min-height: 1px;
		border-radius: 4px 4px 0 0;
		transform-origin: bottom;
	}

	.bar.grow {
		animation: grow cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.name {
		display: block;
		margin-top: 0.6rem;
		min-height: 1.5em;
		font-size: 0.85em;
		text-align: center;
		white-space: nowrap;
	}

	@keyframes grow {
		from {
			transform: scaleY(0);
		}
	}
</style>
