<script lang="ts">
	import type { PFMNode } from '@mdsvex/parse'
	import Node from './Node.svelte'

	let { node }: { node: PFMNode } = $props()

	function text_content(n: PFMNode): string {
		let text = ''
		for (let i = 0; i < n.content.length; i++) {
			const item = n.content[i]
			if (typeof item === 'string') {
				text += item
			} else {
				text += text_content(item)
			}
		}
		return text
	}

	const NEWLINE = '\n'

	function get_cells(row: PFMNode): { cell: PFMNode; col: number }[] {
		const cells: { cell: PFMNode; col: number }[] = []
		let col = 0
		for (let i = 0; i < row.content.length; i++) {
			const item = row.content[i]
			if (typeof item !== 'string' && item.kindName === 'table_cell') {
				cells.push({ cell: item, col })
				col++
			}
		}
		return cells
	}

	function get_header(table: PFMNode): PFMNode | null {
		for (let i = 0; i < table.content.length; i++) {
			const item = table.content[i]
			if (typeof item !== 'string' && item.kindName === 'table_header') return item
		}
		return null
	}

	function get_rows(table: PFMNode): PFMNode[] {
		const rows: PFMNode[] = []
		for (let i = 0; i < table.content.length; i++) {
			const item = table.content[i]
			if (typeof item !== 'string' && item.kindName === 'table_row') rows.push(item)
		}
		return rows
	}
</script>

{#snippet children(n: PFMNode)}
	{#each n.content as item, i (typeof item === 'string' ? 't' + i : item.id)}
		{#if typeof item === 'string'}
			{item}
		{:else}
			<Node node={item} />
		{/if}
	{/each}
{/snippet}

{#snippet table_body(table: PFMNode)}
	{@const alignments = (table.attrs.alignments as string[]) ?? []}
	{@const header = get_header(table)}
	{@const rows = get_rows(table)}
	<table>
		{#if header}
			<thead>
				<tr>
					{#each get_cells(header) as { cell, col } (cell.id)}
						{@const align = alignments[col]}
						<th align={align && align !== 'none' ? align : undefined}>
							{@render children(cell)}
						</th>
					{/each}
				</tr>
			</thead>
		{/if}
		{#if rows.length > 0}
			<tbody>
				{#each rows as row (row.id)}
					<tr>
						{#each get_cells(row) as { cell, col } (cell.id)}
							{@const align = alignments[col]}
							<td align={align && align !== 'none' ? align : undefined}>
								{@render children(cell)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		{/if}
	</table>
{/snippet}

{#if node.kindName === 'root'}
	{@render children(node)}
{:else if node.kindName === 'heading'}
	<svelte:element this={'h' + node.extra}>
		{@render children(node)}
	</svelte:element>
{:else if node.kindName === 'paragraph'}
	<p>{@render children(node)}</p>
{:else if node.kindName === 'emphasis'}
	<em>{@render children(node)}</em>
{:else if node.kindName === 'strong_emphasis'}
	<strong>{@render children(node)}</strong>
{:else if node.kindName === 'code_span'}
	<code>{text_content(node)}</code>
{:else if node.kindName === 'code_fence'}
	{@const info = node.attrs.info as string | undefined}
	<pre><code class={info ? 'language-' + info : undefined}>{text_content(node)}</code></pre>
{:else if node.kindName === 'block_quote'}
	<blockquote>{@render children(node)}</blockquote>
{:else if node.kindName === 'link'}
	<a href={node.attrs.href as string} title={node.attrs.title as string || undefined}>
		{@render children(node)}
	</a>
{:else if node.kindName === 'image'}
	<img
		src={node.attrs.src as string}
		alt={text_content(node)}
		title={node.attrs.title as string || undefined}
	/>
{:else if node.kindName === 'list'}
	{#if node.attrs.ordered}
		{@const start = node.attrs.start as number | undefined}
		<ol start={start != null && start !== 1 ? start : undefined}>
			{@render children(node)}
		</ol>
	{:else}
		<ul>{@render children(node)}</ul>
	{/if}
{:else if node.kindName === 'list_item'}
	<li>{@render children(node)}</li>
{:else if node.kindName === 'thematic_break'}
	<hr />
{:else if node.kindName === 'hard_break'}
	<br />
{:else if node.kindName === 'soft_break'}
	{NEWLINE}
{:else if node.kindName === 'strikethrough'}
	<del>{@render children(node)}</del>
{:else if node.kindName === 'superscript'}
	<sup>{@render children(node)}</sup>
{:else if node.kindName === 'subscript'}
	<sub>{@render children(node)}</sub>
{:else if node.kindName === 'table'}
	{@render table_body(node)}
{:else if node.kindName === 'table_header' || node.kindName === 'table_row' || node.kindName === 'table_cell'}
	{@render children(node)}
{:else if node.kindName === 'line_break'}
	<!-- skip -->
{:else}
	{@render children(node)}
{/if}
