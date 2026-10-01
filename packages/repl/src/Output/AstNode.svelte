<script lang="ts">
	import AstNode from './AstNode.svelte';
	import { get_repl_context } from '../context';
	import { tick } from 'svelte';
	import type { CompileResult } from 'svelte/compiler';

	type Ast = CompileResult['ast'];

	interface Props {
		key?: string;
		value: Ast;
		path_nodes?: Ast[];
		active?: boolean;
		depth?: number;
		onhover: (node: { type: string; start: number; end: number } | null) => void;
	}

	let { key = '', value, path_nodes = [], active = true, onhover, depth = 0 }: Props = $props();

	const { workspace } = get_repl_context();

	// svelte-ignore state_referenced_locally
	let root = depth === 0;
	let open = $state(root);

	let li: HTMLLIElement;

	let is_leaf = $derived(path_nodes[path_nodes.length - 1] === value);
	let is_marked = $derived(!root && path_nodes.includes(value));

	let is_array = $derived(Array.isArray(value));
	let is_primitive = $derived(value === null || typeof value !== 'object');
	let key_text = $derived(key ? `${key}:` : '');

	$effect(() => {
		if (active && typeof value === 'object' && value !== null) {
			workspace.onselect((from, to) => {
				// legacy fragments keep their nodes in children
				const nodes =
					value.type === 'Fragment' ? (value.nodes ?? value.children) : is_array ? value : [value];

				const start = nodes[0]?.start;
				const end = nodes[nodes.length - 1]?.end;

				if (typeof start !== 'number' || typeof end !== 'number') {
					return;
				}

				// the node holding the cursor opens so the cursor is always in view
				if (start <= from && end >= to) {
					open = true;

					if (is_leaf) {
						tick().then(() => {
							li.scrollIntoView({
								block: 'center'
							});
						});
					}
				}
			});
		}
	});
</script>

<li bind:this={li} data-marked={is_marked} data-leaf={is_leaf}>
	{#if is_primitive || (is_array && value.length === 0)}
		<span class="value">
			{#if key_text}
				<span>{key_text}</span>
			{/if}

			{#if value == undefined}
				<span class="token comment">{String(value)}</span>
			{:else}
				<span class="token {typeof value}">
					{typeof value === 'bigint' ? `${value}n` : JSON.stringify(value)}
				</span>
			{/if}
		</span>
	{:else}
		<!-- svelte-ignore a11y_mouse_events_have_key_events (seems like a false positive) -->
		<details
			bind:open
			onfocusin={(e) => (e.stopPropagation(), onhover(value))}
			onfocusout={() => onhover(null)}
			onmouseover={(e) => (e.stopPropagation(), onhover(value))}
			onmouseleave={() => onhover(null)}
			ontoggle={(e) => {
				// toggle events fire while the ast tab is hidden too
				if (!active) return;

				if (e.currentTarget.open && value && typeof value.start === 'number') {
					workspace.highlight_range(value, true);
				}
			}}
		>
			<summary>
				{#if key}
					<span class="key">{key}</span>:
				{/if}

				{#if is_array}
					[{#if !open}
						<span class="token comment">...</span>]
						<span class="token comment">({value.length})</span>
					{/if}
				{:else}
					{#if value.type}
						<span class="token comment">{value.type}</span>
					{/if}
					{'{'}{#if !open}<span class="token comment">...</span>}{/if}
				{/if}
			</summary>

			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<ul
				onclick={(e) => {
					if (value && typeof value.start === 'number') {
						workspace.highlight_range(value, true);
						e.stopPropagation();
					}
				}}
			>
				{#each Object.entries(value) as [k, v]}
					<AstNode
						key={is_array ? undefined : k}
						value={v}
						{path_nodes}
						{active}
						{onhover}
						depth={depth + 1}
					/>
				{/each}
			</ul>

			<span>{is_array ? ']' : '}'}</span>
		</details>
	{/if}
</li>

<style>
	* {
		font: var(--repl-font-mono);
	}

	ul {
		padding: 0 0 0 2ch;
		margin: 0;
		list-style-type: none;
	}

	[data-marked='true']:not(:has(> [open])),
	[data-leaf='true'] {
		background-color: var(--repl-bg-highlight);
	}

	summary {
		position: relative;
		display: block;
		cursor: pointer;

		.key {
			text-decoration: underline;
		}

		&:hover .key {
			text-decoration: underline;
		}
	}

	.token {
		color: var(--repl-code-text);
	}

	.token.string {
		color: var(--repl-code-string);
	}

	.token.number,
	.token.bigint {
		color: var(--repl-code-constant);
	}

	.token.comment {
		color: var(--repl-code-comment);
	}
</style>
