<script lang="ts">
	import type { node_buffer } from '@mdsvex/parse/utils'
	import { buf_children, buf_text, buf_text_content } from '@mdsvex/parse/buf-utils'
	import type { Component } from 'svelte'
	import Node from './Node.svelte'

	type ComponentMap = Record<string, Component<any>>

	let {
		buf,
		idx,
		source,
		components,
	}: {
		buf: node_buffer
		idx: number
		source: string
		components?: ComponentMap
	} = $props()

	const NONE = 0xffffffff

	// ── Kind constants ──────────────────────────────────────
	const K_ROOT = 0
	const K_TEXT = 1
	const K_HTML = 2
	const K_HEADING = 3
	const K_CODE_FENCE = 5
	const K_LINE_BREAK = 6
	const K_PARAGRAPH = 7
	const K_CODE_SPAN = 8
	const K_EMPHASIS = 9
	const K_STRONG = 10
	const K_THEMATIC_BREAK = 11
	const K_LINK = 12
	const K_IMAGE = 13
	const K_BLOCK_QUOTE = 14
	const K_LIST = 15
	const K_LIST_ITEM = 16
	const K_HARD_BREAK = 17
	const K_SOFT_BREAK = 18
	const K_STRIKETHROUGH = 19
	const K_SUPERSCRIPT = 20
	const K_SUBSCRIPT = 21
	const K_TABLE = 22
	const K_TABLE_HEADER = 23
	const K_TABLE_ROW = 24
	const K_TABLE_CELL = 25
	const K_HTML_COMMENT = 26

	const NEWLINE = '\n'

	let kind = $derived(buf._kinds[idx])
	let extra = $derived(buf._extras[idx])
	let meta = $derived(buf.metadata_at(idx))
</script>

{#snippet child_nodes(parent_idx: number)}
	{#each buf_children(buf, parent_idx) as child_idx (child_idx)}
		{@const kind = buf._kinds[child_idx]}
		{#if kind === K_TEXT}
			{buf_text(buf, child_idx, source)}
		{:else if kind === K_LINE_BREAK}
			<!-- skip -->
		{:else}
			<Node {buf} idx={child_idx} {source} {components} />
		{/if}
	{/each}
{/snippet}

{#snippet table_body(table_idx: number)}
	{@const meta = buf.metadata_at(table_idx)}
	{@const alignments = (meta?.alignments as string[]) ?? []}
	<table>
		{#each buf_children(buf, table_idx) as row_idx (row_idx)}
			{@const row_kind = buf._kinds[row_idx]}
			{#if row_kind === K_TABLE_HEADER}
				<thead>
					<tr>
						{#each buf_children(buf, row_idx).filter(c => buf._kinds[c] === K_TABLE_CELL) as cell_idx, col (cell_idx)}
							{@const align = alignments[col]}
							<th align={align && align !== 'none' ? align : undefined}>
								{@render child_nodes(cell_idx)}
							</th>
						{/each}
					</tr>
				</thead>
			{:else if row_kind === K_TABLE_ROW}
				<tr>
					{#each buf_children(buf, row_idx).filter(c => buf._kinds[c] === K_TABLE_CELL) as cell_idx, col (cell_idx)}
						{@const align = alignments[col]}
						<td align={align && align !== 'none' ? align : undefined}>
							{@render child_nodes(cell_idx)}
						</td>
					{/each}
				</tr>
			{/if}
		{/each}
	</table>
{/snippet}

{#if kind === K_ROOT}
	{@render child_nodes(idx)}
{:else if kind === K_HEADING}
	<svelte:element this={'h' + extra}>
		{buf_text(buf, idx, source)}
	</svelte:element>
{:else if kind === K_PARAGRAPH}
	<p>{@render child_nodes(idx)}</p>
{:else if kind === K_EMPHASIS}
	<em>{@render child_nodes(idx)}</em>
{:else if kind === K_STRONG}
	<strong>{@render child_nodes(idx)}</strong>
{:else if kind === K_CODE_SPAN}
	<code>{buf_text(buf, idx, source)}</code>
{:else if kind === K_CODE_FENCE}
	{@const info = meta?.info as string | undefined ?? (meta?.info_start != null ? source.slice(meta.info_start as number, meta.info_end as number) : undefined)}
	<pre><code class={info ? 'language-' + info : undefined}>{buf_text(buf, idx, source)}</code></pre>
{:else if kind === K_BLOCK_QUOTE}
	<blockquote>{@render child_nodes(idx)}</blockquote>
{:else if kind === K_LINK}
	<a href={meta?.href as string} title={meta?.title as string || undefined}>
		{@render child_nodes(idx)}
	</a>
{:else if kind === K_IMAGE}
	<img
		src={meta?.src as string}
		alt={buf_text_content(buf, idx, source)}
		title={meta?.title as string || undefined}
	/>
{:else if kind === K_LIST}
	{#if meta?.ordered}
		{@const start = meta?.start as number | undefined}
		<ol start={start != null && start !== 1 ? start : undefined}>
			{@render child_nodes(idx)}
		</ol>
	{:else}
		<ul>{@render child_nodes(idx)}</ul>
	{/if}
{:else if kind === K_LIST_ITEM}
	<li>{@render child_nodes(idx)}</li>
{:else if kind === K_THEMATIC_BREAK}
	<hr />
{:else if kind === K_HARD_BREAK}
	<br />
{:else if kind === K_SOFT_BREAK}
	{NEWLINE}
{:else if kind === K_STRIKETHROUGH}
	<del>{@render child_nodes(idx)}</del>
{:else if kind === K_SUPERSCRIPT}
	<sup>{@render child_nodes(idx)}</sup>
{:else if kind === K_SUBSCRIPT}
	<sub>{@render child_nodes(idx)}</sub>
{:else if kind === K_HTML}
	{@const tag = meta?.tag as string}
	{@const attrs = meta?.attributes as Record<string, string | boolean> | undefined}
	{@const spread = attrs ? Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v === true ? true : v])) : {}}
	{@const CustomComponent = components?.[tag]}
	{#if CustomComponent}
		<CustomComponent {...spread}>
			{#if !meta?.self_closing}
				{@render child_nodes(idx)}
			{/if}
		</CustomComponent>
	{:else}
		<svelte:element this={tag} {...spread}>
			{#if !meta?.self_closing}
				{@render child_nodes(idx)}
			{/if}
		</svelte:element>
	{/if}
{:else if kind === K_HTML_COMMENT}
	<!-- {buf_text(buf, idx, source)} -->
{:else if kind === K_TABLE}
	{@render table_body(idx)}
{:else}
	{@render child_nodes(idx)}
{/if}
