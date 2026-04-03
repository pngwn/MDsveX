/**
 * PFM HTML Renderer
 *
 * Converts a PFMNode tree (from PFMDocument) to HTML strings.
 *
 * Two usage modes:
 *
 *   1. renderNode(node) — render any node to HTML. Pure function.
 *
 *   2. HTMLRenderer — maintains a list of {id, html} block entries
 *      for root's children. Caches closed blocks so only the active
 *      (streaming) block is re-rendered. Designed for keyed Svelte
 *      {#each} lists where prior blocks are stable.
 */

import type { PFMNode, PFMDocument } from '@mdsvex/parse';

// ── HTML escaping ────────────────────────────────────────────

function escape(text: string): string {
	let result = '';
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		switch (ch) {
			case 38: // &
				result += '&amp;';
				break;
			case 60: // <
				result += '&lt;';
				break;
			case 62: // >
				result += '&gt;';
				break;
			case 34: // "
				result += '&quot;';
				break;
			default:
				result += text[i];
		}
	}
	return result;
}

/** HTML void elements that are allowed to self-close. Non-void elements
 *  must use an explicit closing tag or browsers will swallow siblings. */
const HTML_VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// ── Render helpers ───────────────────────────────────────────

function renderContent(node: PFMNode, components?: HtmlComponentMap): string {
	let html = '';
	for (let i = 0; i < node.content.length; i++) {
		const item = node.content[i];
		if (typeof item === 'string') {
			html += escape(item);
		} else {
			html += renderNode(item, components);
		}
	}
	return html;
}

function renderContentRaw(node: PFMNode): string {
	let text = '';
	for (let i = 0; i < node.content.length; i++) {
		const item = node.content[i];
		if (typeof item === 'string') {
			text += item;
		} else {
			text += renderContentRaw(item);
		}
	}
	return text;
}

// ── Types ───────────────────────────��───────────────────────

/**
 * Custom HTML component renderer. Receives the tag's attributes and
 * pre-rendered inner HTML string. Returns an HTML string.
 */
export type HtmlComponentFn = (
	attrs: Record<string, string | boolean>,
	innerHTML: string,
) => string;

/** Map of tag names to custom render functions for the HTML renderer. */
export type HtmlComponentMap = Record<string, HtmlComponentFn>;

// ── Node renderer ────────────────────────────────────────────

/** Render a PFMNode to an HTML string. */
export function renderNode(node: PFMNode, components?: HtmlComponentMap): string {
	switch (node.kindName) {
		case 'root':
			return renderContent(node, components);

		case 'heading':
			return `<h${node.extra}>${renderContent(node, components)}</h${node.extra}>`;

		case 'paragraph':
			return `<p>${renderContent(node, components)}</p>`;

		case 'emphasis':
			return `<em>${renderContent(node, components)}</em>`;

		case 'strong_emphasis':
			return `<strong>${renderContent(node, components)}</strong>`;

		case 'code_span':
			return `<code>${escape(renderContentRaw(node))}</code>`;

		case 'code_fence': {
			const info = node.attrs.info as string | undefined;
			const cls = info ? ` class="language-${escape(info)}"` : '';
			return `<pre><code${cls}>${escape(renderContentRaw(node))}</code></pre>`;
		}

		case 'block_quote':
			return `<blockquote>\n${renderContent(node, components)}\n</blockquote>`;

		case 'link': {
			const href = node.attrs.href as string | undefined;
			const title = node.attrs.title as string | undefined;
			let attrs = href ? ` href="${escape(href)}"` : '';
			if (title) attrs += ` title="${escape(title)}"`;
			return `<a${attrs}>${renderContent(node, components)}</a>`;
		}

		case 'image': {
			const src = node.attrs.src as string | undefined;
			const alt = renderContentRaw(node);
			const title = node.attrs.title as string | undefined;
			let attrs = src ? ` src="${escape(src)}"` : '';
			attrs += ` alt="${escape(alt)}"`;
			if (title) attrs += ` title="${escape(title)}"`;
			return `<img${attrs} />`;
		}

		case 'list': {
			const ordered = !!node.attrs.ordered;
			const tag = ordered ? 'ol' : 'ul';
			const start = node.attrs.start as number | undefined;
			const startAttr = ordered && start != null && start !== 1 ? ` start="${start}"` : '';
			return `<${tag}${startAttr}>\n${renderContent(node, components)}\n</${tag}>`;
		}

		case 'list_item':
			return `<li>${renderContent(node, components)}</li>\n`;

		case 'thematic_break':
			return '<hr />';

		case 'hard_break':
			return '<br />\n';

		case 'soft_break':
			return '\n';

		case 'strikethrough':
			return `<del>${renderContent(node, components)}</del>`;

		case 'superscript':
			return `<sup>${renderContent(node, components)}</sup>`;

		case 'subscript':
			return `<sub>${renderContent(node, components)}</sub>`;

		case 'html': {
			const tag = node.attrs.tag as string;
			const htmlAttrs = node.attrs.attributes as Record<string, string | boolean> | undefined;
			const customFn = components?.[tag];

			if (customFn) {
				const innerHTML = node.attrs.self_closing ? '' : renderContent(node, components);
				return customFn(htmlAttrs ?? {}, innerHTML);
			}

			let attrStr = '';
			if (htmlAttrs) {
				for (const [k, v] of Object.entries(htmlAttrs)) {
					if (v === true) {
						attrStr += ` ${k}`;
					} else {
						attrStr += ` ${k}="${escape(String(v))}"`;
					}
				}
			}
			if (node.attrs.self_closing && HTML_VOID_ELEMENTS.has(tag.toLowerCase())) {
				return `<${tag}${attrStr} />`;
			}
			return `<${tag}${attrStr}>${renderContent(node, components)}</${tag}>`;
		}

		case 'html_comment': {
			const text = renderContentRaw(node);
			return `<!--${text}-->`;
		}

		case 'table':
			return `<table>\n${renderTableContent(node, components)}\n</table>`;

		case 'table_header':
		case 'table_row':
		case 'table_cell':
			// Handled by renderTableContent — shouldn't reach here standalone
			return renderContent(node, components);

		default:
			return renderContent(node, components);
	}
}

function renderTableContent(table: PFMNode, components?: HtmlComponentMap): string {
	const alignments = (table.attrs.alignments as string[]) ?? [];
	let html = '';
	let inBody = false;
	for (let i = 0; i < table.content.length; i++) {
		const item = table.content[i];
		if (typeof item === 'string') continue;
		if (item.kindName === 'table_header') {
			html += `<thead>\n<tr>\n${renderTableCells(item, 'th', alignments, components)}</tr>\n</thead>\n`;
		} else if (item.kindName === 'table_row') {
			if (!inBody) {
				html += '<tbody>\n';
				inBody = true;
			}
			html += `<tr>\n${renderTableCells(item, 'td', alignments, components)}</tr>\n`;
		}
	}
	if (inBody) html += '</tbody>';
	return html;
}

function renderTableCells(row: PFMNode, tag: string, alignments: string[], components?: HtmlComponentMap): string {
	let html = '';
	let col = 0;
	for (let i = 0; i < row.content.length; i++) {
		const item = row.content[i];
		if (typeof item === 'string') continue;
		if (item.kindName === 'table_cell') {
			const align = alignments[col];
			const attrs = align && align !== 'none' ? ` align="${align}"` : '';
			html += `<${tag}${attrs}>${renderContent(item, components)}</${tag}>\n`;
			col++;
		}
	}
	return html;
}

// ── Block entry ──────────────────────────────────────────────

export interface BlockEntry {
	/** Stable node ID — use as Svelte each key. */
	id: number;
	/** Rendered HTML string. */
	html: string;
}

// ── HTMLRenderer ─────────────────────────────────────────────

/**
 * Maintains a stable list of block-level HTML entries for a PFMDocument.
 *
 * Call update() after each doc.apply(batch). Only re-renders blocks
 * that are still open (streaming). Closed blocks are cached.
 *
 * Usage with Svelte:
 *
 *   let blocks = $state<BlockEntry[]>([]);
 *   const renderer = new HTMLRenderer();
 *
 *   // after each batch:
 *   doc.apply(batch);
 *   blocks = renderer.update(doc);
 *
 *   // in template:
 *   {#each blocks as block (block.id)}
 *     {@html block.html}
 *   {/each}
 */
export class HTMLRenderer {
	/** Current block entries. Stable array — entries are mutated, not recreated. */
	blocks: BlockEntry[] = [];
	/** Tracks which block IDs have been finalized (closed). */
	private closed: Set<number> = new Set();

	/**
	 * Update rendered blocks from the current document state.
	 * Returns the blocks array (same reference — mutated in place).
	 */
	update(doc: PFMDocument): BlockEntry[] {
		if (!doc.root) return this.blocks;

		const content = doc.root.content;
		let blockIdx = 0;

		for (let i = 0; i < content.length; i++) {
			const item = content[i];
			if (typeof item === 'string') continue;
			// Skip structural line breaks between blocks
			if (item.kindName === 'line_break') continue;

			if (blockIdx >= this.blocks.length) {
				// New block
				this.blocks.push({ id: item.id, html: renderNode(item) });
			} else if (!this.closed.has(item.id)) {
				// Existing block, still open — re-render
				this.blocks[blockIdx].html = renderNode(item);
			}

			if (item.closed && !this.closed.has(item.id)) {
				// Just closed — render one final time and cache
				this.blocks[blockIdx].html = renderNode(item);
				this.closed.add(item.id);
			}

			blockIdx++;
		}

		return this.blocks;
	}

	/** Reset for a new document. */
	reset(): void {
		this.blocks.length = 0;
		this.closed.clear();
	}
}
