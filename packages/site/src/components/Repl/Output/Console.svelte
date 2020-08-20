<script>
	import JSONNode from 'svelte-json-tree';

	export let logs;
</script>

<div class="container">
	{#each logs as log}
		<div class="log console-{log.level}">
			{#if log.count > 1}
				<span class="count">{log.count}x</span>
			{/if}

			{#if log.level === 'clear'}
				<span class="info">Console was cleared</span>
			{:else if log.level === 'unclonable'}
				<span class="info error">Message could not be cloned. Open devtools to see it</span>
			{:else}
				{#each log.args as arg}
					<JSONNode value={arg} />
				{/each}
			{/if}
		</div>
	{/each}
</div>

<style>
	.log {
		border-bottom: 1px solid #eee;
		padding: 5px 10px;
		display: flex;
	}

	.log > :global(*) {
		margin-right: 10px;
		font-family: var(--font-mono);
	}

	.console-warn {
		background: #fffbe6;
		border-color: #fff4c4;
	}

	.console-error {
		background: #fff0f0;
		border-color: #fed6d7;
	}

	.count {
		color: #999;
		font-size: 12px;
		line-height: 1.2;
	}

	.info {
		color: #666;
		font-family: var(--font) !important;
		font-size: 12px;
	}

	.error {
		color: #da106e; /* todo make this a var */
	}
</style>