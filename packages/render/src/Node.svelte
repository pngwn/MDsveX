<script lang="ts">
import type { node_buffer } from "@mdsvex/parse/utils";
import {
	buf_children,
	buf_text,
	buf_text_content,
} from "@mdsvex/parse/buf-utils";
import type { Component } from "svelte";
import Node from "./Node.svelte";

type ComponentMap = Record<string, Component<any>>;

let {
	buf,
	idx,
	source,
	components,
}: {
	buf: node_buffer;
	idx: number;
	source: string;
	components?: ComponentMap;
} = $props();

const NONE = 0xffffffff;

// kind constants
const K_ROOT = 0;
const K_TEXT = 1;
const K_HTML = 2;
const K_HEADING = 3;
const K_CODE_FENCE = 5;
const K_LINE_BREAK = 6;
const K_PARAGRAPH = 7;
const K_CODE_SPAN = 8;
const K_EMPHASIS = 9;
const K_STRONG = 10;
const K_THEMATIC_BREAK = 11;
const K_LINK = 12;
const K_IMAGE = 13;
const K_BLOCK_QUOTE = 14;
const K_LIST = 15;
const K_LIST_ITEM = 16;
const K_HARD_BREAK = 17;
const K_SOFT_BREAK = 18;
const K_STRIKETHROUGH = 19;
const K_SUPERSCRIPT = 20;
const K_SUBSCRIPT = 21;
const K_TABLE = 22;
const K_TABLE_HEADER = 23;
const K_TABLE_ROW = 24;
const K_TABLE_CELL = 25;
const K_HTML_COMMENT = 26;

const NEWLINE = "\n";

/** metadata keys that are structural and should not become html attributes. */
const INTERNAL_KEYS = new Set([
	"ordered", "tight", "start",
	"info", "info_start", "info_end",
	"tag", "attributes", "self_closing",
	"alignments", "col_count",
	"src",
]);
const LINK_SKIP = new Set(["href", "title"]);
const IMAGE_SKIP = new Set(["title"]);

/** extract plugin-set attrs from metadata as a spreadable object. */
function get_attrs(meta: Record<string, unknown> | undefined, skip?: Set<string>): Record<string, any> {
	if (!meta) return {};
	const result: Record<string, any> = {};
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		if (skip !== undefined && skip.has(key)) continue;
		const val = meta[key];
		if (val === true) {
			result[key] = true;
		} else if (val !== false && val != null) {
			result[key] = String(val);
		}
	}
	return result;
}

let kind = $derived(buf._kinds[idx]);
let extra = $derived(buf._extras[idx]);
let meta = $derived(buf.metadata_at(idx));

// a pending paragraph inside a list_item is a speculative wrapper for
// a list that may still become loose. render its children transparently
// so the tight-list default matches the common case and avoids a
// <p> flash before the list closes.
let skip_list_item_paragraph_wrapper = $derived(
	kind === K_PARAGRAPH &&
		buf._pending_nodes[idx] === 1 &&
		buf._kinds[buf._parents[idx]] === K_LIST_ITEM,
);
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
	{@const rows = buf_children(buf, table_idx)}
	<table>
		{#each rows as row_idx (row_idx)}
			{#if buf._kinds[row_idx] === K_TABLE_HEADER}
				<thead>
					<tr>
						{#each buf_children(buf, row_idx).filter((c) => buf._kinds[c] === K_TABLE_CELL) as cell_idx, col (cell_idx)}
							{@const align = alignments[col]}
							<th align={align && align !== 'none' ? align : undefined}>
								{@render child_nodes(cell_idx)}
							</th>
						{/each}
					</tr>
				</thead>
			{/if}
		{/each}
		<tbody>
			{#each rows as row_idx (row_idx)}
				{#if buf._kinds[row_idx] === K_TABLE_ROW}
					<tr>
						{#each buf_children(buf, row_idx).filter((c) => buf._kinds[c] === K_TABLE_CELL) as cell_idx, col (cell_idx)}
							{@const align = alignments[col]}
							<td align={align && align !== 'none' ? align : undefined}>
								{@render child_nodes(cell_idx)}
							</td>
						{/each}
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
{/snippet}

{#if kind === K_ROOT}
	{@render child_nodes(idx)}
{:else if kind === K_HEADING}
	<svelte:element this={'h' + extra} {...get_attrs(meta)}>
		{@render child_nodes(idx)}
	</svelte:element>
{:else if kind === K_PARAGRAPH}
	{#if skip_list_item_paragraph_wrapper}
		{@render child_nodes(idx)}
	{:else}
		<p {...get_attrs(meta)}>{@render child_nodes(idx)}</p>
	{/if}
{:else if kind === K_EMPHASIS}
	<em {...get_attrs(meta)}>{@render child_nodes(idx)}</em>
{:else if kind === K_STRONG}
	<strong {...get_attrs(meta)}>{@render child_nodes(idx)}</strong>
{:else if kind === K_CODE_SPAN}
	<code {...get_attrs(meta)}>{buf_text(buf, idx, source).replace(/\n/g, ' ')}</code>
{:else if kind === K_CODE_FENCE}
	{@const info =
		(meta?.info as string | undefined) ??
		(meta?.info_start != null
			? source.slice(meta.info_start as number, meta.info_end as number)
			: undefined)}
	<pre><code class={info ? 'language-' + info : undefined} {...get_attrs(meta)}
			>{buf_text(buf, idx, source)}</code
		></pre>
{:else if kind === K_BLOCK_QUOTE}
	<blockquote {...get_attrs(meta)}>{@render child_nodes(idx)}</blockquote>
{:else if kind === K_LINK}
	<a href={meta?.href as string} title={(meta?.title as string) || undefined} {...get_attrs(meta, LINK_SKIP)}>
		{@render child_nodes(idx)}
	</a>
{:else if kind === K_IMAGE}
	<img
		src={meta?.src as string}
		alt={buf_text_content(buf, idx, source)}
		title={(meta?.title as string) || undefined}
		{...get_attrs(meta, IMAGE_SKIP)}
	/>
{:else if kind === K_LIST}
	{#if meta?.ordered}
		{@const start = meta?.start as number | undefined}
		<ol start={start != null && start !== 1 ? start : undefined} {...get_attrs(meta)}>
			{@render child_nodes(idx)}
		</ol>
	{:else}
		<ul {...get_attrs(meta)}>{@render child_nodes(idx)}</ul>
	{/if}
{:else if kind === K_LIST_ITEM}
	<li {...get_attrs(meta)}>{@render child_nodes(idx)}</li>
{:else if kind === K_THEMATIC_BREAK}
	<hr {...get_attrs(meta)} />
{:else if kind === K_HARD_BREAK}
	<br />
{:else if kind === K_SOFT_BREAK}
	{NEWLINE}
{:else if kind === K_STRIKETHROUGH}
	<del {...get_attrs(meta)}>{@render child_nodes(idx)}</del>
{:else if kind === K_SUPERSCRIPT}
	<sup {...get_attrs(meta)}>{@render child_nodes(idx)}</sup>
{:else if kind === K_SUBSCRIPT}
	<sub {...get_attrs(meta)}>{@render child_nodes(idx)}</sub>
{:else if kind === K_HTML}
	{@const tag = meta?.tag as string}
	{@const attrs = meta?.attributes as Record | undefined}
	{@const spread = attrs
		? Object.fromEntries(
				Object.entries(attrs).map(([k, v]) => [k, v === true ? true : v])
			)
		: {}}
	{@const CustomComponent = components?.[tag]}
	{@const is_raw_text = tag === 'script' || tag === 'style'}
	{#if CustomComponent}
		<CustomComponent {...spread}>
			{#if !meta?.self_closing}
				{@render child_nodes(idx)}
			{/if}
		</CustomComponent>
	{:else}
		<svelte:element this={tag} {...spread}>
			{#if meta?.self_closing}
				<!-- void element -->
			{:else if is_raw_text}
				{buf_text(buf, idx, source)}
			{:else}
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
