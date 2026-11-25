<script lang="ts" module>
	import type { Highlight } from './component.js';

	// each chunk replaces every token of an open fence, about 1ms for 1000 characters, a longer one waits until it closes
	const OPEN_FENCE_LIMIT = 4096;

	const HIGHLIGHT_CONTEXT = {
		filename: undefined,
		unknown_language() {},
		warn() {},
	};
	const OPEN_HIGHLIGHT_CONTEXT = { ...HIGHLIGHT_CONTEXT, open: true };

	// the text selector keeps the arrow from being drawn as an emoji
	const BACK_ARROW = String.fromCharCode(0x21a9, 0xfe0e);

	/** the href of an id, a label with half a surrogate pair has no encoding and goes as it is */
	function fragment(id: string): string {
		try {
			return '#' + encodeURIComponent(id);
		} catch {
			return '#' + id;
		}
	}

	function attribute_text(attrs: Record<string, any>): string {
		let out = '';
		for (const key in attrs) {
			const value = attrs[key];
			out +=
				value === true
					? ' ' + key
					: ' ' +
						key +
						'="' +
						String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;') +
						'"';
		}
		return out;
	}

	/** html with attrs at the end of the open tag it starts with, unchanged when that is no tag */
	function with_attributes(html: string, tag: string, attrs: string): string {
		const at = tag.length + 1;
		const after = html.charCodeAt(at);
		if (
			attrs === '' ||
			!html.startsWith('<' + tag) ||
			(after !== 62 && after !== 32 && after !== 9 && after !== 10)
		)
			return html;
		let quote = 0;
		for (let i = at; i < html.length; i++) {
			const ch = html.charCodeAt(i);
			if (quote !== 0) {
				if (ch === quote) quote = 0;
			} else if (ch === 34 || ch === 39) quote = ch;
			else if (ch === 62) return html.slice(0, i) + attrs + html.slice(i);
		}
		return html;
	}

	/** the html of a fence from the highlighter, null draws it plain */
	function fence_html(
		highlight: Highlight,
		code: string,
		info: string | undefined,
		attrs: Record<string, any>,
		open: boolean
	): string | null {
		let lang = info ?? '';
		let meta = '';
		const space = lang.search(/[ \t]/);
		if (space !== -1) {
			meta = lang.slice(space).trim();
			lang = lang.slice(0, space);
		}
		try {
			if (typeof highlight === 'function') {
				const out = highlight(code, { lang, meta, inline: false, open });
				return typeof out === 'string'
					? with_attributes(out, 'pre', attribute_text(attrs))
					: null;
			}
			const block = highlight.block(
				code,
				lang,
				meta,
				open ? OPEN_HIGHLIGHT_CONTEXT : HIGHLIGHT_CONTEXT
			);
			if (block === null) return null;
			if (block.attributes === null)
				return block.before + block.body + block.after;
			return (
				block.before +
				'<pre' +
				block.attributes +
				attribute_text(attrs) +
				'>' +
				block.body +
				'</pre>' +
				block.after
			);
		} catch {
			// an open fence can be code the highlighter can not read yet
			return null;
		}
	}

	/** the html of a code span with a #! hint from the highlighter, null draws it plain */
	function span_html(
		highlight: Highlight,
		code: string,
		lang: string,
		attrs: Record<string, any>,
		open: boolean
	): string | null {
		if (code.indexOf('\n') !== -1) code = code.replace(/\n/g, ' ');
		try {
			if (typeof highlight === 'function') {
				const out = highlight(code, { lang, meta: '', inline: true, open });
				return typeof out === 'string'
					? with_attributes(out, 'code', attribute_text(attrs))
					: null;
			}
			if (highlight.inline === undefined) return null;
			const span = highlight.inline(
				code,
				lang,
				open ? OPEN_HIGHLIGHT_CONTEXT : HIGHLIGHT_CONTEXT
			);
			if (span === null) return null;
			if (span.attributes === null) return span.body;
			return (
				'<code' +
				span.attributes +
				attribute_text(attrs) +
				'>' +
				span.body +
				'</code>'
			);
		} catch {
			return null;
		}
	}
</script>

<script lang="ts">
	import { is_raw_text_tag } from '@mdsvex/parse/utils';
	import type { NodeBuffer } from '@mdsvex/parse/utils';
	import {
		buf_children,
		buf_code,
		buf_text,
		buf_text_content,
		footnote_id,
		footnote_ref_id,
	} from '@mdsvex/parse/buf-utils';
	import type { FootnoteIndex } from '@mdsvex/parse/buf-utils';
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
		highlight,
		footnotes,
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
		/** highlights code fences, takes what the highlight option of compile takes, its html is not escaped */
		highlight?: Highlight | false | null;
		/** the footnotes of a ComponentRenderer, without it a reference is its label and a definition is drawn in place */
		footnotes?: FootnoteIndex | null;
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
	// the block a ComponentRenderer adds for the footnotes section, which is no node
	const FOOTNOTES_BLOCK = -1;
	const K_FOOTNOTES = -1;

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

	let kind = $derived(
		idx === FOOTNOTES_BLOCK ? K_FOOTNOTES : (buf.kind_at(idx) as number)
	);
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

	/** the props compile gives a footnote replacement, null for a reference in a note that is not drawn */
	let reference = $derived.by(() => {
		if (kind !== K_FOOTNOTE_REFERENCE || !footnotes) return undefined;
		const at = footnotes.references.get(idx);
		if (at === undefined) return null;
		const number = Math.floor(at / 65536);
		const label = footnotes.labels[number - 1];
		return {
			label,
			number,
			href: fragment(footnote_id(label)),
			id: footnote_ref_id(number, at % 65536),
		};
	});

	interface Note {
		node: number;
		number: number;
		id: string;
		/** set when a footnote before it has no definition, so the list skips a number */
		value: number | undefined;
		count: number;
		/** its last block when that is a paragraph, which then holds the links back */
		paragraph: number;
	}

	/** every footnote a reference reached that has a definition, in number order */
	function notes_of(index: FootnoteIndex): Note[] {
		const notes: Note[] = [];
		let next = 1;
		for (let i = 0; i < index.definitions.length; i++) {
			const node = index.definitions[i];
			if (node === NONE) continue;
			let last = NONE;
			for (const child of buf_children(buf, node)) {
				if (buf.kind_at(child) !== K_LINE_BREAK) last = child;
			}
			notes.push({
				node,
				number: i + 1,
				id: footnote_id(index.labels[i]),
				value: i + 1 !== next ? i + 1 : undefined,
				count: index.counts[i],
				paragraph:
					last !== NONE && buf.kind_at(last) === K_PARAGRAPH ? last : NONE,
			});
			next = i + 2;
		}
		return notes;
	}

	// the info string of a fence, the #! hint of a code span
	let fence_info = $derived(
		kind === K_CODE_FENCE || kind === K_CODE_SPAN
			? ((meta?.info as string | undefined) ??
					(meta?.info_start != null
						? source.slice(meta.info_start as number, meta.info_end as number)
						: undefined))
			: undefined
	);

	// a highlighter that reads state runs again for a closed fence when that state changes
	let highlighted = $derived.by(() => {
		if (!highlight) return null;
		if (kind === K_CODE_SPAN) {
			// inline math is a code span too, it has no hint
			if (!fence_info) return null;
			return span_html(
				highlight,
				buf_code(buf, idx, source),
				fence_info,
				get_attrs(meta),
				buf.end_at(idx) === NONE
			);
		}
		if (kind !== K_CODE_FENCE) return null;
		const code = buf_code(buf, idx, source);
		const open = buf.end_at(idx) === NONE;
		if (open && code.length > OPEN_FENCE_LIMIT) return null;
		return fence_html(highlight, code, fence_info, get_attrs(meta), open);
	});
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
				{highlight}
				{footnotes}
			/>
		{/if}
	{/each}
{/snippet}

{#snippet back_links(note: Note)}
	{#each { length: note.count } as _, i (i)}
		{@const name = i === 0 ? '' + note.number : note.number + '-' + (i + 1)}
		{' '}<a
			href={fragment(footnote_ref_id(note.number, i + 1))}
			role="doc-backlink"
			aria-label={'Back to reference ' + name}
			>{BACK_ARROW}{#if i !== 0}<sup>{i + 1}</sup>{/if}</a
		>
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
{:else if kind === K_CODE_SPAN && highlighted === null}
	<code {...get_attrs(meta)}
		>{buf_code(buf, idx, source).replace(/\n/g, ' ')}</code
	>
{:else if kind === K_CODE_FENCE && highlighted === null}
	{@const info = fence_info}
	<pre><code class={info ? 'language-' + info : undefined} {...get_attrs(meta)}
			>{buf_code(buf, idx, source)}</code
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
	{#if reference === undefined}
		<sup class="footnote-reference">{meta?.label}</sup>
	{:else if reference !== null}
		<sup
			><a href={reference.href} id={reference.id} role="doc-noteref"
				>{reference.number}</a
			></sup
		>
	{/if}
{:else if kind === K_FOOTNOTE_DEFINITION}
	{#if !footnotes}
		<div class="footnote">
			<sup class="footnote-reference">{meta?.label}</sup>
			{@render child_nodes(idx)}
		</div>
	{/if}
{:else if kind === K_DEFINITION}
	<!-- a link reference definition renders nothing, the links that use it carry its url -->
{:else if highlighted !== null}
	<!-- last so the branch index svelte writes for every other node stays the same -->
	{@html highlighted}
{:else if kind === K_FOOTNOTES}
	{@const notes = footnotes ? notes_of(footnotes) : []}
	{#if notes.length !== 0}
		<section class="footnotes" role="doc-endnotes" aria-label="Footnotes">
			<ol>
				{#each notes as note (note.node)}
					<li id={note.id} value={note.value}>
						{#each buf_children(buf, note.node) as child_idx (child_idx)}
							{@const kind = buf.kind_at(child_idx)}
							{#if kind === K_TEXT}
								{buf_text(buf, child_idx, source)}
							{:else if kind === K_LINE_BREAK}
								<!-- skip -->
							{:else if child_idx === note.paragraph}
								<p {...get_attrs(buf.metadata_at(child_idx))}>
									{@render child_nodes(child_idx)}{@render back_links(note)}
								</p>
							{:else}
								<Node
									{buf}
									idx={child_idx}
									{source}
									{components}
									{directives}
									{plugin_data}
									{highlight}
									{footnotes}
								/>
							{/if}
						{/each}
						{#if note.paragraph === NONE}{@render back_links(note)}{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/if}
{:else}
	{@render child_nodes(idx)}
{/if}
