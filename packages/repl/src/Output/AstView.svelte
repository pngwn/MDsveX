<script lang="ts">
	import Message from '../Message.svelte';
	import AstNode from './AstNode.svelte';
	import type { Snippet } from 'svelte';
	import type { Workspace } from '../workspace.svelte';

	/** any tree whose nodes carry type, start and end offsets into the current file */
	type Ast = any;

	interface Props {
		workspace: Workspace;
		ast: Ast;
		active?: boolean;
		note?: string;
		/** options shown in the top corner of the view */
		controls?: Snippet;
	}

	let {
		workspace,
		ast,
		active = true,
		note = 'The AST is not public API and may change at any point in time',
		controls,
	}: Props = $props();

	let cursor = $state<number | null>(0);

	let path_nodes = $derived(find_deepest_path(cursor, [ast]) || []);

	function find_deepest_path(cursor: number | null, paths: Ast[]): Ast[] | undefined {
		if (cursor === null) return;
		const value = paths[paths.length - 1];

		if (!value) return;

		for (const v of Object.values(value)) {
			if (typeof v === 'object') {
				const result = find_deepest_path(cursor, paths.concat([v]));
				if (result) return result;
			}
		}

		if (
			'start' in value &&
			'end' in value &&
			typeof value.start === 'number' &&
			typeof value.end === 'number' &&
			value.start <= cursor &&
			cursor <= value.end
		) {
			return paths;
		}
	}

	$effect(() => {
		if (active) {
			workspace.onhover((pos) => {
				cursor = pos;
			});
		}
	});

	$effect(() => {
		if (active) {
			const leaf = path_nodes.at(-1) ?? null;
			workspace.highlight_range(leaf);
		}

		return () => {
			workspace.highlight_range(null);
		};
	});
</script>

<div class="ast-view">
	<pre>
		<code>
			{#if typeof ast === 'object'}
				<ul>
					<AstNode
						value={ast}
						{path_nodes}
						{active}
						onhover={(node) => {
							if (
								node === null ||
								(node.type !== undefined && node.start !== undefined && node.end !== undefined)
							) {
								cursor = node && node.start + 1;
								workspace.highlight_range(node);
							}
						}}
					/>
				</ul>
			{:else}
				<p>No AST available</p>
			{/if}
		</code>
	</pre>

	<Message kind="info">{note}</Message>

	{#if controls}
		<div class="controls">
			{@render controls()}
		</div>
	{/if}

</div>

<style>
	.ast-view {
		--base: hsl(45, 7%, 45%);
		--string: hsl(41, 37%, 45%);
		--number: hsl(102, 27%, 50%);
		background: var(--repl-bg-3);
		color: var(--repl-code-text);
		display: flex;
		flex-direction: column;
	}

	.ast-view {
		height: 100%;
		font: var(--repl-font-mono);
	}

	/* the host page owns pre and code styles, so the tree sets everything it relies on */
	pre {
		flex: 1;
		min-height: 0;
		overflow: auto;
		margin: 0;
		white-space: normal;
		padding: 10px;
		tab-size: 2;
		-moz-tab-size: 2;
		font: var(--repl-font-mono);
	}

	code {
		display: block;
		padding: 0;
		background: none;
		color: inherit;
		font: inherit;
	}

	ul {
		padding: 0;
		margin: 0;
		list-style-type: none;
	}

	.controls {
		position: absolute;
		top: 10px;
		right: 10px;
		display: flex;
		gap: 10px;
		align-items: center;
		font: var(--repl-font-ui-small);
	}
</style>
