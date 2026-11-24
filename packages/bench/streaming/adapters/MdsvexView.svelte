<script>
	import Node from '@mdsvex/render/Node.svelte';

	let buf = $state.raw(null);
	let blocks = $state.raw([]);

	export function set(next_buf, next_blocks) {
		buf = next_buf;
		blocks = next_blocks;
	}
</script>

{#if buf !== null}
	{#each blocks as block (block.idx)}
		{#key block.v}
			<Node {buf} idx={block.idx} source="" />
		{/key}
	{/each}
{/if}
