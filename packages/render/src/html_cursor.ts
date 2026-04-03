/**
 * Cursor-based PFM HTML Renderer
 *
 * Renders HTML from a PFMCursor over SOA node_buffer.
 * Zero per-node allocations — the cursor walks typed arrays directly,
 * text is lazily sliced from source only when needed.
 *
 * Usage:
 *
 *   const cursor = new PFMCursor(tree.get_buffer(), source);
 *   const html = renderCursor(cursor);
 */

import type { PFMCursor } from '@mdsvex/parse/cursor';

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

// ── Kind constants ──────────────────────────────────────────

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

// ── Precomputed tag strings ─────────────────────────────────

const H_OPEN = ['', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>'];
const H_CLOSE = ['', '</h1>', '</h2>', '</h3>', '</h4>', '</h5>', '</h6>'];

const HTML_VOID_ELEMENTS = new Set([
	'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
	'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

// ── Renderer ────────────────────────────────────────────────

/** Render children of the current cursor position, collecting escaped text and recursive node output. */
function _children(c: PFMCursor, out: string[]): void {
	if (!c.gotoFirstChild()) return;
	do {
		if (c.kind === K_TEXT) {
			out.push(escape(c.text()));
		} else {
			_node(c, out);
		}
	} while (c.gotoNextSibling());
	c.gotoParent();
}

/** Collect raw text from child text nodes (for image alt, link text fallback, etc.). */
function _childrenRaw(c: PFMCursor): string {
	if (!c.gotoFirstChild()) return '';
	let text = '';
	do {
		if (c.kind === K_TEXT) {
			text += c.text();
		} else {
			text += _childrenRaw(c);
		}
	} while (c.gotoNextSibling());
	c.gotoParent();
	return text;
}

/** Render a single node at the current cursor position. */
function _node(c: PFMCursor, out: string[]): void {
	switch (c.kind) {
		case K_ROOT:
			_children(c, out);
			break;

		case K_HEADING:
			out.push(H_OPEN[c.extra]);
			// Heading text is in value range (content leaf), not children
			out.push(escape(c.text()));
			out.push(H_CLOSE[c.extra]);
			break;

		case K_PARAGRAPH:
			out.push('<p>');
			_children(c, out);
			out.push('</p>');
			break;

		case K_EMPHASIS:
			out.push('<em>');
			_children(c, out);
			out.push('</em>');
			break;

		case K_STRONG:
			out.push('<strong>');
			_children(c, out);
			out.push('</strong>');
			break;

		case K_CODE_SPAN:
			out.push('<code>', escape(c.text()), '</code>');
			break;

		case K_CODE_FENCE: {
			const meta = c.meta();
			// TreeBuilder stores info as raw byte offsets (info_start/info_end)
			const info_start = meta?.info_start as number | undefined;
			const info_end = meta?.info_end as number | undefined;
			const info = info_start != null && info_end != null
				? c.slice(info_start, info_end) : undefined;
			if (info) {
				out.push('<pre><code class="language-', escape(info), '">', escape(c.text()), '</code></pre>');
			} else {
				out.push('<pre><code>', escape(c.text()), '</code></pre>');
			}
			break;
		}

		case K_BLOCK_QUOTE:
			out.push('<blockquote>\n');
			_children(c, out);
			out.push('\n</blockquote>');
			break;

		case K_LINK: {
			const meta = c.meta();
			out.push('<a');
			if (meta?.href) out.push(' href="', escape(meta.href as string), '"');
			if (meta?.title) out.push(' title="', escape(meta.title as string), '"');
			out.push('>');
			_children(c, out);
			out.push('</a>');
			break;
		}

		case K_IMAGE: {
			const meta = c.meta();
			out.push('<img');
			if (meta?.src) out.push(' src="', escape(meta.src as string), '"');
			// Alt text is in child text nodes, not value range
			out.push(' alt="', escape(_childrenRaw(c)), '"');
			if (meta?.title) out.push(' title="', escape(meta.title as string), '"');
			out.push(' />');
			break;
		}

		case K_LIST: {
			const meta = c.meta();
			const ordered = !!meta?.ordered;
			const tag = ordered ? 'ol' : 'ul';
			const start = meta?.start as number | undefined;
			out.push('<', tag);
			if (ordered && start != null && start !== 1) out.push(' start="', String(start), '"');
			out.push('>\n');
			_children(c, out);
			out.push('\n</', tag, '>');
			break;
		}

		case K_LIST_ITEM:
			out.push('<li>');
			_children(c, out);
			out.push('</li>\n');
			break;

		case K_THEMATIC_BREAK:
			out.push('<hr />');
			break;

		case K_HARD_BREAK:
			out.push('<br />\n');
			break;

		case K_SOFT_BREAK:
			out.push('\n');
			break;

		case K_STRIKETHROUGH:
			out.push('<del>');
			_children(c, out);
			out.push('</del>');
			break;

		case K_SUPERSCRIPT:
			out.push('<sup>');
			_children(c, out);
			out.push('</sup>');
			break;

		case K_SUBSCRIPT:
			out.push('<sub>');
			_children(c, out);
			out.push('</sub>');
			break;

		case K_HTML: {
			const meta = c.meta();
			const tag = meta?.tag as string;
			const htmlAttrs = meta?.attributes as Record<string, string | boolean> | undefined;

			out.push('<', tag);
			if (htmlAttrs) {
				for (const k in htmlAttrs) {
					const v = htmlAttrs[k];
					if (v === true) {
						out.push(' ', k);
					} else {
						out.push(' ', k, '="', escape(v as string), '"');
					}
				}
			}
			if (meta?.self_closing && HTML_VOID_ELEMENTS.has(tag.toLowerCase())) {
				out.push(' />');
			} else {
				out.push('>');
				_children(c, out);
				out.push('</', tag, '>');
			}
			break;
		}

		case K_HTML_COMMENT:
			out.push('<!--', c.text(), '-->');
			break;

		case K_TABLE:
			out.push('<table>\n');
			_tableContent(c, out);
			out.push('\n</table>');
			break;

		case K_LINE_BREAK:
			break;

		default:
			_children(c, out);
			break;
	}
}

function _tableContent(c: PFMCursor, out: string[]): void {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let inBody = false;

	if (!c.gotoFirstChild()) return;
	do {
		if (c.kind === K_TABLE_HEADER) {
			out.push('<thead>\n<tr>\n');
			_tableCells(c, 'th', alignments, out);
			out.push('</tr>\n</thead>\n');
		} else if (c.kind === K_TABLE_ROW) {
			if (!inBody) {
				out.push('<tbody>\n');
				inBody = true;
			}
			out.push('<tr>\n');
			_tableCells(c, 'td', alignments, out);
			out.push('</tr>\n');
		}
	} while (c.gotoNextSibling());
	c.gotoParent();

	if (inBody) out.push('</tbody>');
}

function _tableCells(c: PFMCursor, tag: string, alignments: string[], out: string[]): void {
	let col = 0;
	if (!c.gotoFirstChild()) return;
	do {
		if (c.kind === K_TABLE_CELL) {
			const align = alignments[col];
			if (align && align !== 'none') {
				out.push('<', tag, ' align="', align, '">');
			} else {
				out.push('<', tag, '>');
			}
			_children(c, out);
			out.push('</', tag, '>\n');
			col++;
		}
	} while (c.gotoNextSibling());
	c.gotoParent();
}

// ── Public API ──────────────────────────────────────────────

/** Render a PFM document to HTML using a cursor. Zero per-node allocations. */
export function renderCursor(cursor: PFMCursor): string {
	cursor.reset();
	const out: string[] = [];
	_node(cursor, out);
	return out.join('');
}
