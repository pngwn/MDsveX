/**
 * cursor-based pfm html renderer
 *
 * renders html from a cursor over soa node_buffer.
 * zero per-node allocations, the cursor walks typed arrays directly,
 * text is lazily sliced from source only when needed.
 *
 * usage:
 *
 *   const cursor = new cursor(tree.get_buffer(), source);
 *   const html = rendercursor(cursor);
 */

import { Cursor } from "@mdsvex/parse/cursor";
import type { node_buffer } from "@mdsvex/parse/utils";

//  html escaping

const ESCAPE_TEST = /[&<>"]/;
const ESCAPE_MATCH = /[&<>"]/g;
const ESCAPE_TABLE: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
};
function escape_replace(ch: string): string {
	return ESCAPE_TABLE[ch];
}
function escape(text: string): string {
	if (!ESCAPE_TEST.test(text)) return text;
	return text.replace(ESCAPE_MATCH, escape_replace);
}

//  kind constants

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
const K_SVELTE_TAG = 27;
const K_SVELTE_BLOCK = 28;
const K_SVELTE_BRANCH = 29;
const K_MUSTACHE = 4;

//  precomputed tag strings

const H_OPEN = ["", "<h1>", "<h2>", "<h3>", "<h4>", "<h5>", "<h6>"];
const H_CLOSE = ["", "</h1>", "</h2>", "</h3>", "</h4>", "</h5>", "</h6>"];

const HTML_VOID_ELEMENTS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

//  renderer

/** render children of the current cursor position, collecting escaped text and recursive node output. */
function _children(c: Cursor, out: string[]): void {
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

/** collect raw text from child text nodes (for image alt, link text fallback, etc.). */
function _childrenRaw(c: Cursor): string {
	if (!c.gotoFirstChild()) return "";
	let text = "";
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

/** render a single node at the current cursor position. */
function _node(c: Cursor, out: string[]): void {
	switch (c.kind) {
		case K_ROOT:
			_children(c, out);
			break;

		case K_HEADING: {
			const meta = c.meta();
			if (meta?.id) {
				out.push("<h", String(c.extra), ' id="', escape(meta.id as string), '">');
			} else {
				out.push(H_OPEN[c.extra]);
			}
			_children(c, out);
			out.push(H_CLOSE[c.extra]);
			break;
		}

		case K_PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K_LIST_ITEM) {
				_children(c, out);
			} else {
				out.push("<p>");
				_children(c, out);
				out.push("</p>");
			}
			break;

		case K_EMPHASIS:
			out.push("<em>");
			_children(c, out);
			out.push("</em>");
			break;

		case K_STRONG:
			out.push("<strong>");
			_children(c, out);
			out.push("</strong>");
			break;

		case K_CODE_SPAN:
			out.push("<code>", escape(c.text()).replace(/\n/g, " "), "</code>");
			break;

		case K_CODE_FENCE: {
			const meta = c.meta();
			// wire path: resolved 'info' string. treebuilder path: info_start/info_end byte offsets.
			let info = meta?.info as string | undefined;
			if (!info) {
				const info_start = meta?.info_start as number | undefined;
				const info_end = meta?.info_end as number | undefined;
				if (info_start != null && info_end != null)
					info = c.slice(info_start, info_end);
			}
			if (info) {
				out.push(
					'<pre><code class="language-',
					escape(info),
					'">',
					escape(c.text()),
					"</code></pre>",
				);
			} else {
				out.push("<pre><code>", escape(c.text()), "</code></pre>");
			}
			break;
		}

		case K_BLOCK_QUOTE:
			out.push("<blockquote>\n");
			_children(c, out);
			out.push("\n</blockquote>");
			break;

		case K_LINK: {
			const meta = c.meta();
			out.push("<a");
			if (meta?.href) out.push(' href="', escape(meta.href as string), '"');
			if (meta?.title) out.push(' title="', escape(meta.title as string), '"');
			out.push(">");
			_children(c, out);
			out.push("</a>");
			break;
		}

		case K_IMAGE: {
			const meta = c.meta();
			out.push("<img");
			if (meta?.src) out.push(' src="', escape(meta.src as string), '"');
			// alt text is in child text nodes, not value range
			out.push(' alt="', escape(_childrenRaw(c)), '"');
			if (meta?.title) out.push(' title="', escape(meta.title as string), '"');
			out.push(" />");
			break;
		}

		case K_LIST: {
			const meta = c.meta();
			const ordered = !!meta?.ordered;
			const tag = ordered ? "ol" : "ul";
			const start = meta?.start as number | undefined;
			out.push("<", tag);
			if (ordered && start != null && start !== 1)
				out.push(' start="', String(start), '"');
			out.push(">\n");
			_children(c, out);
			out.push("\n</", tag, ">");
			break;
		}

		case K_LIST_ITEM:
			out.push("<li>");
			_children(c, out);
			out.push("</li>\n");
			break;

		case K_THEMATIC_BREAK:
			out.push("<hr />");
			break;

		case K_HARD_BREAK:
			out.push("<br />\n");
			break;

		case K_SOFT_BREAK:
			out.push("\n");
			break;

		case K_STRIKETHROUGH:
			out.push("<del>");
			_children(c, out);
			out.push("</del>");
			break;

		case K_SUPERSCRIPT:
			out.push("<sup>");
			_children(c, out);
			out.push("</sup>");
			break;

		case K_SUBSCRIPT:
			out.push("<sub>");
			_children(c, out);
			out.push("</sub>");
			break;

		case K_HTML: {
			const meta = c.meta();
			const tag = meta?.tag as string;
			const htmlAttrs = meta?.attributes as
				| Record<string, string | boolean>
				| undefined;

			out.push("<", tag);
			if (htmlAttrs) {
				for (const k in htmlAttrs) {
					const v = htmlAttrs[k];
					if (v === true) {
						out.push(" ", k);
					} else {
						out.push(" ", k, '="', escape(v as string), '"');
					}
				}
			}
			if (meta?.self_closing && HTML_VOID_ELEMENTS.has(tag.toLowerCase())) {
				out.push(" />");
			} else {
				out.push(">");
				// raw-text elements: parser stores content as value range on
				// the html node itself (no child nodes). emit unescaped, the
				// browser does not parse script/style bodies as html.
				if (tag === "script" || tag === "style") {
					out.push(c.text());
				} else {
					_children(c, out);
				}
				out.push("</", tag, ">");
			}
			break;
		}

		case K_HTML_COMMENT:
			out.push("<!--", c.text(), "-->");
			break;

		case K_MUSTACHE:
			out.push("{", c.text(), "}");
			break;

		case K_SVELTE_TAG: {
			const meta = c.meta();
			const tag = meta?.tag as string;
			const text = c.text();
			out.push("{@", tag);
			if (text) out.push(" ", text);
			out.push("}");
			break;
		}

		case K_SVELTE_BLOCK: {
			// render branches; each branch handles its own opening tag
			const blockMeta = c.meta();
			const blockTag = blockMeta?.tag as string;
			if (c.gotoFirstChild()) {
				let isFirst = true;
				do {
					if (c.kind === K_SVELTE_BRANCH) {
						const branchMeta = c.meta();
						const branchTag = branchMeta?.tag as string;
						const branchExpr = c.text();
						if (isFirst) {
							out.push("{#", blockTag);
							if (branchExpr) out.push(" ", branchExpr);
							out.push("}\n");
							isFirst = false;
						} else {
							out.push("{:", branchTag);
							if (branchExpr) out.push(" ", branchExpr);
							out.push("}\n");
						}
						_children(c, out);
					} else if (c.kind !== K_LINE_BREAK) {
						_node(c, out);
					}
				} while (c.gotoNextSibling());
				c.gotoParent();
			}
			out.push("{/", blockTag, "}");
			break;
		}

		case K_TABLE:
			out.push("<table>\n");
			_tableContent(c, out);
			out.push("\n</table>");
			break;

		case K_LINE_BREAK:
			break;

		default:
			_children(c, out);
			break;
	}
}

function _tableContent(c: Cursor, out: string[]): void {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let inBody = false;

	if (!c.gotoFirstChild()) return;
	do {
		if (c.kind === K_TABLE_HEADER) {
			out.push("<thead>\n<tr>\n");
			_tableCells(c, "th", alignments, out);
			out.push("</tr>\n</thead>\n");
		} else if (c.kind === K_TABLE_ROW) {
			if (!inBody) {
				out.push("<tbody>\n");
				inBody = true;
			}
			out.push("<tr>\n");
			_tableCells(c, "td", alignments, out);
			out.push("</tr>\n");
		}
	} while (c.gotoNextSibling());
	c.gotoParent();

	if (inBody) out.push("</tbody>");
}

function _tableCells(
	c: Cursor,
	tag: string,
	alignments: string[],
	out: string[],
): void {
	let col = 0;
	if (!c.gotoFirstChild()) return;
	do {
		if (c.kind === K_TABLE_CELL) {
			const align = alignments[col];
			if (align && align !== "none") {
				out.push("<", tag, ' align="', align, '">');
			} else {
				out.push("<", tag, ">");
			}
			_children(c, out);
			out.push("</", tag, ">\n");
			col++;
		}
	} while (c.gotoNextSibling());
	c.gotoParent();
}

//  internal helpers

/** render the node at the current cursor position to html string. */
function _renderBlock(cursor: Cursor): string {
	const out: string[] = [];
	_node(cursor, out);
	return out.join("");
}

//  block entry

export interface CursorBlockEntry {
	/** node buffer index, use as keyed each key. */
	idx: number;
	/** rendered html string. */
	html: string;
}

//  cursorhtmlrenderer (incremental)

/**
 * incremental html renderer using the cursor over soa buffers.
 *
 * same caching strategy as htmlrenderer: walks root's children,
 * skips closed+cached blocks, re-renders only open blocks.
 * but uses cursor traversal, zero per-node allocations per render.
 *
 * usage:
 *
 *   const tree = new treebuilder(128);
 *   const parser = new pfmparser(tree);
 *   const renderer = new cursorhtmlrenderer();
 *
 *   parser.init();
 *   parser.feed(chunk);
 *   renderer.update(tree.get_buffer(), accumulated_source);
 *   // renderer.blocks has stable {idx, html} entries
 */
export class CursorHTMLRenderer {
	blocks: CursorBlockEntry[] = [];
	/** full document html (available after update, whether cached or not). */
	html = "";
	private closed: Set<number> | null = null;
	private cursor: Cursor | null = null;
	private cache: boolean;

	constructor(opts?: { cache?: boolean }) {
		this.cache = opts?.cache ?? true;
		if (this.cache) this.closed = new Set();
	}

	update(buf: node_buffer, source: string): CursorBlockEntry[] {
		// reuse or create cursor
		if (!this.cursor) {
			this.cursor = new Cursor(buf, source);
		} else {
			this.cursor.reinit(buf, source);
		}
		const c = this.cursor;
		c.reset();

		// no caching, single-pass full render
		if (!this.cache) {
			const out: string[] = [];
			_node(c, out);
			this.html = out.join("");
			return this.blocks;
		}

		// cached block-level rendering
		if (!c.gotoFirstChild()) return this.blocks;

		let blockIdx = 0;
		do {
			if (c.kind === K_LINE_BREAK) continue;

			const idx = c.index;

			if (blockIdx >= this.blocks.length) {
				this.blocks.push({ idx, html: _renderBlock(c) });
				if (c.closed) this.closed!.add(idx);
			} else if (!this.closed!.has(idx)) {
				this.blocks[blockIdx].html = _renderBlock(c);
				if (c.closed) this.closed!.add(idx);
			}

			blockIdx++;
		} while (c.gotoNextSibling());

		c.gotoParent();
		this.html = this.blocks.map((b) => b.html).join("");
		return this.blocks;
	}

	reset(): void {
		this.blocks.length = 0;
		this.closed?.clear();
		this.html = "";
	}
}
