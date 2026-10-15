<script lang="ts">
	import { is_raw_text_tag } from '@mdsvex/parse/utils';
	import type { NodeBuffer } from '@mdsvex/parse/utils';
	import {
		buf_children,
		buf_text,
		buf_text_content,
	} from '@mdsvex/parse/buf-utils';
	import { setContext } from 'svelte';
	import type { Component } from 'svelte';
	import Node from './Node.svelte';

	type ComponentMap = Record<string, Component<any>>;

	let {
		buf,
		idx,
		source,
		components,
		directives,
		plugin_data,
	}: {
		buf: NodeBuffer;
		idx: number;
		source: string;
		/** a component for an element by its tag */
		components?: ComponentMap;
		/** a component for a directive by its name, args are its props, label and children snippets */
		directives?: ComponentMap;
		/** what plugins wrote, a component reads it from the context, see PluginStream */
		plugin_data?: { readonly current: unknown };
	} = $props();

	// the key of @mdsvex/render/stream and of a compiled document, Symbol.for so every copy agrees
	// svelte-ignore state_referenced_locally
	if (plugin_data !== undefined)
		setContext(Symbol.for('mdsvex.plugin_data'), plugin_data);

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
	// a cell extra is its grid column, merged cells leave gaps in a row
	const K_TABLE_CELL = 25;
	const K_HTML_COMMENT = 26;
	const K_DIRECTIVE_INLINE = 30;
	const K_DIRECTIVE_LEAF = 31;
	const K_DIRECTIVE_CONTAINER = 32;
	const K_DIRECTIVE_LABEL = 35;
	const K_FOOTNOTE_REFERENCE = 36;
	const K_FOOTNOTE_DEFINITION = 37;
	const K_DEFINITION = 38;

	const NEWLINE = '\n';

	/** metadata keys that are structural and should not become html attributes. */
	const INTERNAL_KEYS = new Set([
		'ordered',
		'tight',
		'start',
		'checked',
		'info',
		'info_start',
		'info_end',
		'tag',
		'attributes',
		'self_closing',
		'alignments',
		'col_count',
		'header_columns',
		'spans',
		'src',
	]);
	const LINK_SKIP = new Set(['href', 'title']);
	const IMAGE_SKIP = new Set(['title']);

	/** extract plugin-set attrs from metadata as a spreadable object. */
	function get_attrs(
		meta: Record<string, unknown> | undefined,
		skip?: Set<string>
	): Record<string, any> {
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

	let kind = $derived(buf.kind_at(idx));
	let extra = $derived(buf.extra_at(idx));
	let meta = $derived(buf.metadata_at(idx));

	// a pending paragraph inside a list_item is a speculative wrapper for
	// a list that may still become loose. render its children transparently
	// so the tight-list default matches the common case and avoids a
	// <p> flash before the list closes.
	let skip_list_item_paragraph_wrapper = $derived(
		kind === K_PARAGRAPH &&
			buf.pending_at(idx) === 1 &&
			buf.kind_at(buf.parent_at(idx)) === K_LIST_ITEM
	);

	/** true when the checkbox of a task item goes inside its first paragraph, as github renders a loose list */
	function box_in_paragraph(item: number): boolean {
		const first = buf.first_child_at(item);
		return (
			first !== NONE &&
			buf.kind_at(first) === K_PARAGRAPH &&
			buf.pending_at(first) !== 1
		);
	}

	// the checkbox state this node renders, undefined for no checkbox
	let checked = $derived.by(() => {
		if (kind === K_LIST_ITEM) {
			return box_in_paragraph(idx) ? undefined : meta?.checked;
		}
		if (kind !== K_PARAGRAPH || skip_list_item_paragraph_wrapper) {
			return undefined;
		}
		const parent = buf.parent_at(idx);
		if (
			parent === NONE ||
			buf.kind_at(parent) !== K_LIST_ITEM ||
			buf.first_child_at(parent) !== idx
		) {
			return undefined;
		}
		return buf.metadata_at(parent)?.checked;
	});

	/** the directive_label of a leaf or container, its first child, or NONE */
	function label_of(node: number): number {
		if (kind === K_DIRECTIVE_INLINE) return NONE;
		const first = buf.first_child_at(node);
		return first !== NONE &&
			buf.parent_at(first) === node &&
			buf.kind_at(first) === K_DIRECTIVE_LABEL
			? first
			: NONE;
	}

	/** a child other than the label and line breaks, a component gets no empty children */
	function has_body(node: number): boolean {
		for (const child of buf_children(buf, node)) {
			const k = buf.kind_at(child);
			if (k !== K_LINE_BREAK && k !== K_DIRECTIVE_LABEL) return true;
		}
		return false;
	}

	let directive = $derived(
		kind === K_DIRECTIVE_INLINE ||
			kind === K_DIRECTIVE_LEAF ||
			kind === K_DIRECTIVE_CONTAINER
			? directives?.[meta?.name as string]
			: undefined
	);
</script>

{#snippet task_box()}
	{#if typeof checked === 'boolean'}
		<input type="checkbox" disabled {checked} />{' '}
	{/if}
{/snippet}

{#snippet child_nodes(parent_idx: number)}
	{#each buf_children(buf, parent_idx) as child_idx (child_idx)}
		{@const kind = buf.kind_at(child_idx)}
		{#if kind === K_TEXT}
			{buf_text(buf, child_idx, source)}
		{:else if kind === K_LINE_BREAK}
			<!-- skip -->
		{:else}
			<Node
				{buf}
				idx={child_idx}
				{source}
				{components}
				{directives}
				{plugin_data}
			/>
		{/if}
	{/each}
{/snippet}

{#snippet directive_label()}
	{@render child_nodes(label_of(idx))}
{/snippet}

{#snippet directive_body()}
	{@render child_nodes(idx)}
{/snippet}

{#snippet table_body(table_idx: number)}
	{@const meta = buf.metadata_at(table_idx)}
	{@const alignments = (meta?.alignments as string[]) ?? []}
	{@const header_columns = meta?.header_columns as number[] | undefined}
	{@const spans = meta?.spans === true}
	{@const col_count = (meta?.col_count as number | undefined) ?? alignments.length}
	{@const row_l = header_columns ? header_columns[0] : 0}
	{@const row_r = header_columns ? col_count - header_columns[1] : col_count}
	{@const rows = buf_children(buf, table_idx)}
	<table>
		{#each rows as row_idx (row_idx)}
			{#if buf.kind_at(row_idx) === K_TABLE_HEADER}
				<thead>
					<tr>
						{#each buf_children(buf, row_idx).filter((c) => buf.kind_at(c) === K_TABLE_CELL) as cell_idx (cell_idx)}
							{@const align = alignments[buf.extra_at(cell_idx)]}
							{@const cell_meta = spans ? buf.metadata_at(cell_idx) : undefined}
							<th
								align={align && align !== 'none' ? align : undefined}
								colspan={cell_meta?.colspan as number | undefined}
								rowspan={cell_meta?.rowspan as number | undefined}
							>
								{@render child_nodes(cell_idx)}
							</th>
						{/each}
					</tr>
				</thead>
			{/if}
		{/each}
		<tbody>
			{#each rows as row_idx (row_idx)}
				{#if buf.kind_at(row_idx) === K_TABLE_ROW}
					<tr>
						{#each buf_children(buf, row_idx).filter((c) => buf.kind_at(c) === K_TABLE_CELL) as cell_idx (cell_idx)}
							{@const col = buf.extra_at(cell_idx)}
							{@const align = alignments[col]}
							{@const cell_meta = spans ? buf.metadata_at(cell_idx) : undefined}
							{#if col < row_l || col >= row_r}
								<th
									scope="row"
									align={align && align !== 'none' ? align : undefined}
									colspan={cell_meta?.colspan as number | undefined}
									rowspan={cell_meta?.rowspan as number | undefined}
								>
									{@render child_nodes(cell_idx)}
								</th>
							{:else}
								<td
									align={align && align !== 'none' ? align : undefined}
									colspan={cell_meta?.colspan as number | undefined}
									rowspan={cell_meta?.rowspan as number | undefined}
								>
									{@render child_nodes(cell_idx)}
								</td>
							{/if}
						{/each}
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
{/snippet}

{#if directive}
	{@const Directive = directive}
	<Directive
		{...meta?.args}
		label={label_of(idx) !== NONE ? directive_label : undefined}
		children={has_body(idx) ? directive_body : undefined}
	/>
{:else if kind === K_ROOT}
	{@render child_nodes(idx)}
{:else if kind === K_HEADING}
	<svelte:element this={'h' + extra} {...get_attrs(meta)}>
		{@render child_nodes(idx)}
	</svelte:element>
{:else if kind === K_PARAGRAPH}
	{#if skip_list_item_paragraph_wrapper}
		{@render child_nodes(idx)}
	{:else}
		<p {...get_attrs(meta)}>{@render task_box()}{@render child_nodes(idx)}</p>
	{/if}
{:else if kind === K_EMPHASIS}
	<em {...get_attrs(meta)}>{@render child_nodes(idx)}</em>
{:else if kind === K_STRONG}
	<strong {...get_attrs(meta)}>{@render child_nodes(idx)}</strong>
{:else if kind === K_CODE_SPAN}
	<code {...get_attrs(meta)}
		>{buf_text(buf, idx, source).replace(/\n/g, ' ')}</code
	>
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
	<a
		href={meta?.href as string}
		title={(meta?.title as string) || undefined}
		{...get_attrs(meta, LINK_SKIP)}
	>
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
		<ol
			start={start != null && start !== 1 ? start : undefined}
			{...get_attrs(meta)}
		>
			{@render child_nodes(idx)}
		</ol>
	{:else}
		<ul {...get_attrs(meta)}>{@render child_nodes(idx)}</ul>
	{/if}
{:else if kind === K_LIST_ITEM}
	<li {...get_attrs(meta)}>{@render task_box()}{@render child_nodes(idx)}</li>
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
				Object.entries(attrs).map(([k, v]) => [
					k,
					v === true
						? true
						: typeof v === 'object' && v?.type === 'expression'
							? v.value
							: v,
				])
			)
		: {}}
	{@const CustomComponent = components?.[tag]}
	{@const is_raw_text = is_raw_text_tag(tag)}
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
{:else if kind === K_DIRECTIVE_LABEL}
	<!-- a directive renders as its children, its label is not one of them -->
{:else if kind === K_FOOTNOTE_REFERENCE}
	<!-- a stream has no number for it yet, so the label stands in -->
	<sup class="footnote-reference">{meta?.label}</sup>
{:else if kind === K_FOOTNOTE_DEFINITION}
	<div class="footnote">
		<sup class="footnote-reference">{meta?.label}</sup>
		{@render child_nodes(idx)}
	</div>
{:else if kind === K_DEFINITION}
	<!-- a link reference definition renders nothing, the links that use it carry its url -->
{:else}
	{@render child_nodes(idx)}
{/if}
