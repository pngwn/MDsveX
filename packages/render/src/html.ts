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

const ESCAPE_TEST = /[&<>"]/;
const ESCAPE_MATCH = /[&<>"]/g;
const ESCAPE_TABLE: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
};
function escape_replace(ch: string): string {
	return ESCAPE_TABLE[ch];
}

function escape(text: string): string {
	if (!ESCAPE_TEST.test(text)) return text;
	return text.replace(ESCAPE_MATCH, escape_replace);
}

/** HTML void elements that are allowed to self-close. Non-void elements
 *  must use an explicit closing tag or browsers will swallow siblings. */
const HTML_VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// ── Render helpers ───────────────────────────────────────────

function renderContent(node: PFMNode, components?: HtmlComponentMap): string {
	const content = node.content;
	if (content.length === 1) {
		const item = content[0];
		return typeof item === 'string' ? escape(item) : renderNode(item, components);
	}
	let html = '';
	for (let i = 0; i < content.length; i++) {
		const item = content[i];
		if (typeof item === 'string') {
			html += escape(item);
		} else {
			html += renderNode(item, components);
		}
	}
	return html;
}

function renderContentRaw(node: PFMNode): string {
	const content = node.content;
	if (content.length === 1) {
		const item = content[0];
		return typeof item === 'string' ? item : renderContentRaw(item);
	}
	let text = '';
	for (let i = 0; i < content.length; i++) {
		const item = content[i];
		if (typeof item === 'string') {
			text += item;
		} else {
			text += renderContentRaw(item);
		}
	}
	return text;
}

// ── Types ────────────────────────────────────────────────────

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

// ── Kind constants (mirrors node_kind enum from parse) ──────

const K_ROOT = 0;
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

// ── Precomputed tag strings ─────────────────────────────────

const H_OPEN = ['', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>'];
const H_CLOSE = ['', '</h1>', '</h2>', '</h3>', '</h4>', '</h5>', '</h6>'];

// ── Node renderer ────────────────────────────────────────────

/** Render a PFMNode to an HTML string. */
export function renderNode(node: PFMNode, components?: HtmlComponentMap): string {
	switch (node.kind) {
		case K_ROOT:
			return renderContent(node, components);

		case K_HEADING:
			return H_OPEN[node.extra] + renderContent(node, components) + H_CLOSE[node.extra];

		case K_PARAGRAPH:
			return '<p>' + renderContent(node, components) + '</p>';

		case K_EMPHASIS:
			return '<em>' + renderContent(node, components) + '</em>';

		case K_STRONG:
			return '<strong>' + renderContent(node, components) + '</strong>';

		case K_CODE_SPAN:
			return '<code>' + escape(renderContentRaw(node)) + '</code>';

		case K_CODE_FENCE: {
			const info = node.attrs.info as string | undefined;
			const cls = info ? ' class="language-' + escape(info) + '"' : '';
			return '<pre><code' + cls + '>' + escape(renderContentRaw(node)) + '</code></pre>';
		}

		case K_BLOCK_QUOTE:
			return '<blockquote>\n' + renderContent(node, components) + '\n</blockquote>';

		case K_LINK: {
			let open = '<a';
			const href = node.attrs.href as string | undefined;
			const title = node.attrs.title as string | undefined;
			if (href) open += ' href="' + escape(href) + '"';
			if (title) open += ' title="' + escape(title) + '"';
			return open + '>' + renderContent(node, components) + '</a>';
		}

		case K_IMAGE: {
			let tag = '<img';
			const src = node.attrs.src as string | undefined;
			const title = node.attrs.title as string | undefined;
			if (src) tag += ' src="' + escape(src) + '"';
			tag += ' alt="' + escape(renderContentRaw(node)) + '"';
			if (title) tag += ' title="' + escape(title) + '"';
			return tag + ' />';
		}

		case K_LIST: {
			const ordered = !!node.attrs.ordered;
			const tag = ordered ? 'ol' : 'ul';
			const start = node.attrs.start as number | undefined;
			const startAttr = ordered && start != null && start !== 1 ? ' start="' + start + '"' : '';
			return '<' + tag + startAttr + '>\n' + renderContent(node, components) + '\n</' + tag + '>';
		}

		case K_LIST_ITEM:
			return '<li>' + renderContent(node, components) + '</li>\n';

		case K_THEMATIC_BREAK:
			return '<hr />';

		case K_HARD_BREAK:
			return '<br />\n';

		case K_SOFT_BREAK:
			return '\n';

		case K_STRIKETHROUGH:
			return '<del>' + renderContent(node, components) + '</del>';

		case K_SUPERSCRIPT:
			return '<sup>' + renderContent(node, components) + '</sup>';

		case K_SUBSCRIPT:
			return '<sub>' + renderContent(node, components) + '</sub>';

		case K_HTML: {
			const tag = node.attrs.tag as string;
			const htmlAttrs = node.attrs.attributes as Record<string, string | boolean> | undefined;
			const customFn = components?.[tag];

			if (customFn) {
				const innerHTML = node.attrs.self_closing ? '' : renderContent(node, components);
				return customFn(htmlAttrs ?? {}, innerHTML);
			}

			let attrStr = '';
			if (htmlAttrs) {
				for (const k in htmlAttrs) {
					const v = htmlAttrs[k];
					if (v === true) {
						attrStr += ' ' + k;
					} else {
						attrStr += ' ' + k + '="' + escape(v as string) + '"';
					}
				}
			}
			if (node.attrs.self_closing && HTML_VOID_ELEMENTS.has(tag.toLowerCase())) {
				return '<' + tag + attrStr + ' />';
			}
			return '<' + tag + attrStr + '>' + renderContent(node, components) + '</' + tag + '>';
		}

		case K_HTML_COMMENT:
			return '<!--' + renderContentRaw(node) + '-->';

		case K_TABLE:
			return '<table>\n' + renderTableContent(node, components) + '\n</table>';

		case K_TABLE_HEADER:
		case K_TABLE_ROW:
		case K_TABLE_CELL:
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
		if (item.kind === K_TABLE_HEADER) {
			html += '<thead>\n<tr>\n' + renderTableCells(item, 'th', alignments, components) + '</tr>\n</thead>\n';
		} else if (item.kind === K_TABLE_ROW) {
			if (!inBody) {
				html += '<tbody>\n';
				inBody = true;
			}
			html += '<tr>\n' + renderTableCells(item, 'td', alignments, components) + '</tr>\n';
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
		if (item.kind === K_TABLE_CELL) {
			const align = alignments[col];
			const attrs = align && align !== 'none' ? ' align="' + align + '"' : '';
			html += '<' + tag + attrs + '>' + renderContent(item, components) + '</' + tag + '>\n';
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
			if (item.kind === K_LINE_BREAK) continue;

			if (blockIdx >= this.blocks.length) {
				// New block
				this.blocks.push({ id: item.id, html: renderNode(item) });
				if (item.closed) this.closed.add(item.id);
			} else if (!this.closed.has(item.id)) {
				// Open block — render (final render if closing)
				this.blocks[blockIdx].html = renderNode(item);
				if (item.closed) this.closed.add(item.id);
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
