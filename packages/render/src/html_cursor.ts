/**
 * cursor-based pfm html renderer
 *
 * renders html from a cursor over soa NodeBuffer.
 * zero per-node allocations, the cursor walks typed arrays directly,
 * text is lazily sliced from source only when needed.
 *
 * usage:
 *
 *   const cursor = new cursor(tree.get_buffer(), source);
 *   const html = rendercursor(cursor);
 */

import { Cursor } from '@mdsvex/parse/cursor';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import {
	MapSink,
	RECORD_SIZE,
	P_TEXT,
	P_CODE,
	P_SVELTE,
	P_STRUCTURE,
	record_data,
} from './mappings';
import type { Mapping, MappingData } from './mappings';
import { records_to_v3 } from './sourcemap';
import type { MapTrace, SourceMapV3 } from './sourcemap';

export type { Mapping, CodeInformation, MappingData } from './mappings';
export { MapSink } from './mappings';

//  html escaping

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
export function escape(text: string): string {
	if (!ESCAPE_TEST.test(text)) return text;
	return text.replace(ESCAPE_MATCH, escape_replace);
}

//  source escape index

// text nodes are visited in source order, so rather than testing every value
// with a regex, keep the next source position of each escapable char and move
// it forward with a native indexOf. each pointer then scans the source about
// once per render and a value needs escaping only when a pointer falls in it.
// the pointers are the first match at or after esc_lo, or esc_len for none.
let esc_src = '';
let esc_len = 0;
let esc_lo = 0;
let esc_amp = -1;
let esc_lt = -1;
let esc_gt = -1;
let esc_quot = -1;

function esc_reset(src: string): void {
	esc_src = src;
	esc_len = src.length;
	esc_lo = 0;
	esc_amp = -1;
	esc_lt = -1;
	esc_gt = -1;
	esc_quot = -1;
}

function esc_next(ch: string, from: number): number {
	const i = esc_src.indexOf(ch, from);
	return i === -1 ? esc_len : i;
}

/** escape(c.text()) for the current node, using the source index when the text is a source slice. */
export function escape_text(c: Cursor): string {
	const s = c.prebuilt;
	if (s !== undefined) return escape(s);
	const vs = c.value_start;
	let ve = c.value_end;
	// same empty cases as Cursor.text()
	if (vs === NONE || ve === NONE || ve <= vs) return '';
	const src = c.source;
	if (src !== esc_src) esc_reset(src);
	if (ve > esc_len) {
		ve = esc_len;
		if (ve <= vs) return '';
	}
	if (vs < esc_lo) esc_reset(src);
	if (esc_amp < vs) esc_amp = esc_next('&', vs);
	if (esc_lt < vs) esc_lt = esc_next('<', vs);
	if (esc_gt < vs) esc_gt = esc_next('>', vs);
	if (esc_quot < vs) esc_quot = esc_next('"', vs);
	esc_lo = vs;
	let m = esc_amp;
	if (esc_lt < m) m = esc_lt;
	if (esc_gt < m) m = esc_gt;
	if (esc_quot < m) m = esc_quot;
	if (m >= ve) return src.slice(vs, ve);
	return escape_hits(src, vs, ve, m);
}

/** build the escaped value from source slices and entities, m is the first hit. */
function escape_hits(src: string, vs: number, ve: number, m: number): string {
	let text = '';
	let pos = vs;
	while (m < ve) {
		const ch = src.charCodeAt(m);
		text += src.slice(pos, m);
		if (ch === 38) {
			text += '&amp;';
			esc_amp = esc_next('&', m + 1);
		} else if (ch === 60) {
			text += '&lt;';
			esc_lt = esc_next('<', m + 1);
		} else if (ch === 62) {
			text += '&gt;';
			esc_gt = esc_next('>', m + 1);
		} else {
			text += '&quot;';
			esc_quot = esc_next('"', m + 1);
		}
		pos = m + 1;
		m = esc_amp;
		if (esc_lt < m) m = esc_lt;
		if (esc_gt < m) m = esc_gt;
		if (esc_quot < m) m = esc_quot;
	}
	// every pointer is now at or past ve
	esc_lo = ve;
	return text + src.slice(pos, ve);
}

//  kind constants

export const K_ROOT = 0;
export const K_TEXT = 1;
export const K_HTML = 2;
export const K_HEADING = 3;
export const K_CODE_FENCE = 5;
export const K_LINE_BREAK = 6;
export const K_PARAGRAPH = 7;
export const K_CODE_SPAN = 8;
export const K_EMPHASIS = 9;
export const K_STRONG = 10;
export const K_THEMATIC_BREAK = 11;
export const K_LINK = 12;
export const K_IMAGE = 13;
export const K_BLOCK_QUOTE = 14;
export const K_LIST = 15;
export const K_LIST_ITEM = 16;
export const K_HARD_BREAK = 17;
export const K_SOFT_BREAK = 18;
export const K_STRIKETHROUGH = 19;
export const K_SUPERSCRIPT = 20;
export const K_SUBSCRIPT = 21;
export const K_TABLE = 22;
export const K_TABLE_HEADER = 23;
export const K_TABLE_ROW = 24;
export const K_TABLE_CELL = 25;
export const K_HTML_COMMENT = 26;
export const K_SVELTE_TAG = 27;
export const K_SVELTE_BLOCK = 28;
export const K_SVELTE_BRANCH = 29;
export const K_MUSTACHE = 4;
export const K_FRONTMATTER = 33;
export const K_IMPORT_STATEMENT = 34;

export const NONE = 0xffffffff;

//  pending mappings, numeric records resolved to Mapping<MappingData> after render

// record codes the renderer writes, record_code(preset, role) as literals
const TEXT_CONTENT = 1;
const CODE_CONTENT = 5;
const SVELTE_NODE = 8;
const SVELTE_CONTENT = 9;
const STRUCTURE_OPEN = 14;
const STRUCTURE_CLOSE = 15;

/** record a mapping. skips if generated range is empty. */
export function _emit(
	sink: MapSink,
	out_start: number,
	out_end: number,
	src_start: number,
	src_end: number,
	node_index: number,
	code: number
): void {
	if (out_end > out_start && src_start !== NONE) {
		let rec = sink.rec;
		const p = sink.n;
		if (p + RECORD_SIZE > rec.length) rec = sink.grow();
		rec[p] = out_start;
		rec[p + 1] = out_end - out_start;
		rec[p + 2] = src_start;
		rec[p + 3] = src_end > src_start ? src_end - src_start : 0;
		rec[p + 4] = node_index;
		rec[p + 5] = code;
		sink.n = p + RECORD_SIZE;
	}
}

/** emit node span + open_syntax + close_syntax for a rendered node. */
function _spans(
	sink: MapSink,
	pre: number,
	after_open: number,
	before_close: number,
	post: number,
	c: Cursor,
	preset: number
): void {
	const idx = c.index;
	const s = c.start,
		e = c.end;
	_emit(sink, pre, post, s, e, idx, preset << 2);
	if (!sink.syntax) return;
	const vs = c.value_start,
		ve = c.value_end;
	// value range is meaningful when ve > vs (same check as Cursor.text()).
	// Uint32Array defaults to 0 for unset slots, so ve !== NONE is not enough.
	const has_value = ve > vs;
	_emit(sink, pre, after_open, s, has_value ? vs : s, idx, STRUCTURE_OPEN);
	_emit(sink, before_close, post, has_value ? ve : e, e, idx, STRUCTURE_CLOSE);
}

//  precomputed tag strings

const H_TAG = ['', '<h1', '<h2', '<h3', '<h4', '<h5', '<h6'];
const H_OPEN = ['', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>'];
const H_CLOSE = ['', '</h1>', '</h2>', '</h3>', '</h4>', '</h5>', '</h6>'];

const HTML_VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

//  generic attribute emission

/**
 * metadata keys that are structural / internal and should never be
 * emitted as html attributes. everything else is fair game.
 */
const INTERNAL_KEYS = new Set([
	// list semantics
	'ordered',
	'tight',
	'start',
	// code fence info (transformed into class="language-X")
	'info',
	'info_start',
	'info_end',
	// raw html node internals
	'tag',
	'attributes',
	'self_closing',
	// table internals
	'alignments',
	'col_count',
	// image src (handled specially with alt ordering)
	'src',
]);

/**
 * emit all non-internal metadata as html attributes.
 * keys already handled by the caller are passed in `skip`.
 */
function _attrs(c: Cursor, out: string[], skip?: Set<string>): void {
	const meta = c.meta();
	if (!meta) return;
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		if (skip !== undefined && skip.has(key)) continue;
		const val = meta[key];
		if (val === true) {
			out.push(' ', key);
		} else if (val !== false && val != null) {
			if (typeof val === 'object' && (val as any).type === 'expression') {
				out.push(' ', key, '={', (val as any).value, '}');
			} else {
				out.push(' ', key, '="', escape(String(val)), '"');
			}
		}
	}
}

/**
 * push `head`, then any attributes, then `end`. with no attributes it pushes
 * the precomputed `folded` (head + end) instead, because the final join costs
 * per chunk rather than per char.
 */
function _open(
	c: Cursor,
	out: string[],
	head: string,
	folded: string,
	end: string
): void {
	const n = out.length;
	out.push(head);
	_attrs(c, out);
	if (out.length > n + 1) out.push(end);
	else out[n] = folded;
}

const LINK_HANDLED = new Set(['href', 'title']);
const IMAGE_HANDLED = new Set(['title']);

//  renderer

/** render children of the current cursor position, collecting escaped text and recursive node output. */
export function _children(c: Cursor, out: string[], sink?: MapSink): void {
	if (!c.goto_first_child()) return;
	do {
		const k = c.kind;
		if (k === K_TEXT) {
			const vs = c.value_start,
				ve = c.value_end;
			if (sink && vs !== NONE && ve > vs) {
				_emit(sink, out.length, out.length + 1, vs, ve, c.index, TEXT_CONTENT);
			}
			out.push(escape_text(c));
		} else if (k !== K_LINE_BREAK) {
			// line breaks render nothing, a fifth of visited nodes skip the call
			_node(c, out, sink);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
}

/** collect raw text from child text nodes (for image alt, link text fallback, etc.). */
function _children_raw(c: Cursor): string {
	if (!c.goto_first_child()) return '';
	let text = '';
	do {
		if (c.kind === K_TEXT) {
			text += c.text();
		} else {
			text += _children_raw(c);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return text;
}

/** render a single node at the current cursor position. */
export function _node(c: Cursor, out: string[], sink?: MapSink): void {
	switch (c.kind) {
		case K_ROOT:
			_children(c, out, sink);
			break;

		case K_HEADING: {
			const pre = out.length;
			_open(c, out, H_TAG[c.extra], H_OPEN[c.extra], '>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push(H_CLOSE[c.extra]);
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K_LIST_ITEM) {
				_children(c, out, sink);
			} else {
				const pre = out.length;
				_open(c, out, '<p', '<p>', '>');
				const ao = out.length;
				_children(c, out, sink);
				const bc = out.length;
				out.push('</p>');
				if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			}
			break;

		case K_EMPHASIS: {
			const pre = out.length;
			_open(c, out, '<em', '<em>', '>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('</em>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_STRONG: {
			const pre = out.length;
			_open(c, out, '<strong', '<strong>', '>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('</strong>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_CODE_SPAN: {
			const pre = out.length;
			_open(c, out, '<code', '<code>', '>');
			const ao = out.length;
			if (sink) {
				_emit(
					sink,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					c.index,
					CODE_CONTENT
				);
			}
			const code = escape_text(c);
			out.push(code.indexOf('\n') === -1 ? code : code.replace(/\n/g, ' '));
			const bc = out.length;
			out.push('</code>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_CODE);
			break;
		}

		case K_CODE_FENCE: {
			const pre = out.length;
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
				out.push('<pre><code class="language-', escape(info));
				_open(c, out, '"', '">', '>');
			} else {
				_open(c, out, '<pre><code', '<pre><code>', '>');
			}
			const ao = out.length;
			if (sink) {
				_emit(
					sink,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					c.index,
					CODE_CONTENT
				);
			}
			out.push(escape_text(c));
			const bc = out.length;
			out.push('</code></pre>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_CODE);
			break;
		}

		case K_BLOCK_QUOTE: {
			const pre = out.length;
			_open(c, out, '<blockquote', '<blockquote>\n', '>\n');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('\n</blockquote>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_LINK: {
			const pre = out.length;
			const meta = c.meta();
			out.push('<a');
			if (meta?.href) out.push(' href="', escape(meta.href as string), '"');
			if (meta?.title) out.push(' title="', escape(meta.title as string), '"');
			_attrs(c, out, LINK_HANDLED);
			out.push('>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('</a>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_IMAGE: {
			const pre = out.length;
			const meta = c.meta();
			out.push('<img');
			if (meta?.src) out.push(' src="', escape(meta.src as string), '"');
			out.push(' alt="', escape(_children_raw(c)), '"');
			if (meta?.title) out.push(' title="', escape(meta.title as string), '"');
			_attrs(c, out, IMAGE_HANDLED);
			out.push(' />');
			if (sink) _spans(sink, pre, pre, out.length, out.length, c, P_TEXT);
			break;
		}

		case K_LIST: {
			const pre = out.length;
			const meta = c.meta();
			const ordered = !!meta?.ordered;
			const start = meta?.start as number | undefined;
			if (ordered && start != null && start !== 1) {
				out.push('<ol start="', String(start));
				_open(c, out, '"', '">\n', '>\n');
			} else if (ordered) {
				_open(c, out, '<ol', '<ol>\n', '>\n');
			} else {
				_open(c, out, '<ul', '<ul>\n', '>\n');
			}
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push(ordered ? '\n</ol>' : '\n</ul>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_STRUCTURE);
			break;
		}

		case K_LIST_ITEM: {
			const pre = out.length;
			_open(c, out, '<li', '<li>', '>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('</li>\n');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_THEMATIC_BREAK: {
			const pre = out.length;
			out.push('<hr />');
			if (sink)
				_spans(sink, pre, out.length, out.length, out.length, c, P_STRUCTURE);
			break;
		}

		case K_HARD_BREAK:
			out.push('<br />\n');
			break;

		case K_SOFT_BREAK:
			out.push('\n');
			break;

		case K_STRIKETHROUGH: {
			const pre = out.length;
			_open(c, out, '<del', '<del>', '>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('</del>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_SUPERSCRIPT: {
			const pre = out.length;
			_open(c, out, '<sup', '<sup>', '>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('</sup>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_SUBSCRIPT: {
			const pre = out.length;
			_open(c, out, '<sub', '<sub>', '>');
			const ao = out.length;
			_children(c, out, sink);
			const bc = out.length;
			out.push('</sub>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_HTML: {
			const pre = out.length;
			const meta = c.meta();
			const tag = meta?.tag as string;
			const html_attrs = meta?.attributes as
				| Record<string, string | boolean>
				| undefined;

			out.push('<', tag);
			if (html_attrs) {
				for (const k in html_attrs) {
					const v = html_attrs[k];
					if (v === true) {
						out.push(' ', k);
					} else if (
						typeof v === 'object' &&
						(v as any).type === 'expression'
					) {
						out.push(' ', k, '={', (v as any).value, '}');
					} else {
						out.push(' ', k, '="', escape(v as string), '"');
					}
				}
			}
			if (meta?.self_closing) {
				// source passthrough: use exact source text to guarantee
				// identity mapping. reconstruction can differ from the
				// source (extra space before />, attribute escaping, quote
				// style) which makes the mapping non-identity and breaks
				// per-token precision in the PFM->Svelte->TS composition
				// pipeline.
				// falls back to reconstruction when source is unavailable
				// (e.g. wire/streaming renderer with empty source).
				const passthrough = c.end > c.start ? c.slice(c.start, c.end) : '';
				if (passthrough) {
					out.length = pre;
					out.push(passthrough);
				} else {
					out.push(' />');
				}
				if (sink) {
					_emit(sink, pre, out.length, c.start, c.end, c.index, SVELTE_CONTENT);
				}
			} else {
				out.push('>');
				const ao = out.length;
				// raw-text elements: parser stores content as value range on
				// the html node itself (no child nodes). emit unescaped, the
				// browser does not parse script/style bodies as html.
				if (tag === 'script' || tag === 'style') {
					if (sink) {
						_emit(
							sink,
							out.length,
							out.length + 1,
							c.value_start,
							c.value_end,
							c.index,
							SVELTE_CONTENT
						);
					}
					out.push(c.text());
				} else {
					_children(c, out, sink);
				}
				const bc = out.length;
				out.push('</', tag, '>');
				if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			}
			break;
		}

		case K_HTML_COMMENT: {
			const pre = out.length;
			out.push('<!--');
			const ao = out.length;
			if (sink) {
				_emit(
					sink,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					c.index,
					TEXT_CONTENT
				);
			}
			out.push(c.text());
			const bc = out.length;
			out.push('-->');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_TEXT);
			break;
		}

		case K_MUSTACHE: {
			const pre = out.length;
			out.push('{');
			const ao = out.length;
			if (sink) {
				_emit(
					sink,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					c.index,
					SVELTE_CONTENT
				);
			}
			out.push(c.text());
			const bc = out.length;
			out.push('}');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_SVELTE);
			break;
		}

		case K_SVELTE_TAG: {
			const pre = out.length;
			const meta = c.meta();
			const tag = meta?.tag as string;
			const text = c.text();
			out.push('{@', tag);
			if (text) out.push(' ');
			const ao = out.length;
			if (text && sink) {
				_emit(
					sink,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					c.index,
					SVELTE_CONTENT
				);
			}
			if (text) out.push(text);
			const bc = out.length;
			out.push('}');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_SVELTE);
			break;
		}

		case K_SVELTE_BLOCK: {
			const pre = out.length;
			// render branches; each branch handles its own opening tag
			const block_meta = c.meta();
			const block_tag = block_meta?.tag as string;
			if (c.goto_first_child()) {
				let is_first = true;
				do {
					if (c.kind === K_SVELTE_BRANCH) {
						const branch_meta = c.meta();
						const branch_tag = branch_meta?.tag as string;
						const branch_expr = c.text();
						if (is_first) {
							out.push('{#', block_tag);
							if (branch_expr) {
								out.push(' ');
								if (sink) {
									_emit(
										sink,
										out.length,
										out.length + 1,
										c.value_start,
										c.value_end,
										c.index,
										SVELTE_CONTENT
									);
								}
								out.push(branch_expr);
							}
							out.push('}\n');
							is_first = false;
						} else {
							out.push('{:', branch_tag);
							if (branch_expr) {
								out.push(' ');
								if (sink) {
									_emit(
										sink,
										out.length,
										out.length + 1,
										c.value_start,
										c.value_end,
										c.index,
										SVELTE_CONTENT
									);
								}
								out.push(branch_expr);
							}
							out.push('}\n');
						}
						_children(c, out, sink);
					} else if (c.kind !== K_LINE_BREAK) {
						_node(c, out, sink);
					}
				} while (c.goto_next_sibling());
				c.goto_parent();
			}
			out.push('{/', block_tag, '}');
			// node span for the whole block, use the block node (goto_parent already called)
			if (sink) {
				const idx = c.index;
				const s = c.start,
					e = c.end;
				_emit(sink, pre, out.length, s, e, idx, SVELTE_NODE);
			}
			break;
		}

		case K_TABLE: {
			const pre = out.length;
			_open(c, out, '<table', '<table>\n', '>\n');
			const ao = out.length;
			_table_content(c, out, sink);
			const bc = out.length;
			out.push('\n</table>');
			if (sink) _spans(sink, pre, ao, bc, out.length, c, P_STRUCTURE);
			break;
		}

		case K_LINE_BREAK:
			break;

		default:
			_children(c, out, sink);
			break;
	}
}

function _table_content(c: Cursor, out: string[], sink?: MapSink): void {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let in_body = false;

	if (!c.goto_first_child()) return;
	do {
		if (c.kind === K_TABLE_HEADER) {
			out.push('<thead>\n<tr>\n');
			_table_cells(c, 'th', alignments, out, sink);
			out.push('</tr>\n</thead>\n');
		} else if (c.kind === K_TABLE_ROW) {
			if (!in_body) {
				out.push('<tbody>\n');
				in_body = true;
			}
			out.push('<tr>\n');
			_table_cells(c, 'td', alignments, out, sink);
			out.push('</tr>\n');
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) out.push('</tbody>');
}

/** cell open tags (none, left, center, right), precomputed so each is one chunk. */
function _cell_opens(tag: string): string[] {
	return [
		`<${tag}>`,
		`<${tag} align="left">`,
		`<${tag} align="center">`,
		`<${tag} align="right">`,
	];
}
const TH_OPEN = _cell_opens('th');
const TD_OPEN = _cell_opens('td');

function _table_cells(
	c: Cursor,
	tag: string,
	alignments: string[],
	out: string[],
	sink?: MapSink
): void {
	const opens = tag === 'th' ? TH_OPEN : TD_OPEN;
	const close = tag === 'th' ? '</th>\n' : '</td>\n';
	let col = 0;
	if (!c.goto_first_child()) return;
	do {
		if (c.kind === K_TABLE_CELL) {
			const align = alignments[col];
			// the parser only emits these four values, anything else is built as before
			if (align === 'left') out.push(opens[1]);
			else if (align === 'center') out.push(opens[2]);
			else if (align === 'right') out.push(opens[3]);
			else if (align && align !== 'none') out.push(`<${tag} align="${align}">`);
			else out.push(opens[0]);
			_children(c, out, sink);
			out.push(close);
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
}

//  static chunk fold

// the final join costs about the same per chunk whatever its length, and a
// third of the chunks are static literals right after another static. every
// static literal gets a small id, and the unmapped render holds the last
// static in a one-slot register instead of pushing it. a static after a
// static looks the pair up in a table of precomputed composites, so the run
// reaches out as one flat string and nothing is allocated once the table is
// warm. a concat at runtime would build a cons string that join then walks.
// the mapped render records spans by chunk index around almost every static,
// so it could fold next to nothing and keeps its own register-free walk above.

/** static strings by id, base literals first and then composites. id 0 is the empty register. */
const FOLD_STR: string[] = [''];
const FOLD_IDS = new Map<string, number>();

function fold_base(s: string): number {
	let id = FOLD_IDS.get(s);
	if (id === undefined) {
		id = FOLD_STR.length;
		FOLD_STR.push(s);
		FOLD_IDS.set(s, id);
	}
	return id;
}

//  base literals

const S_SPACE = fold_base(' ');
const S_ATTR_EQ = fold_base('="');
const S_QUOTE = fold_base('"');
const S_EXPR_EQ = fold_base('={');
const S_BRACE_CLOSE = fold_base('}');
const S_GT = fold_base('>');
const S_GT_LF = fold_base('>\n');
const S_QUOTE_GT = fold_base('">');
const S_QUOTE_GT_LF = fold_base('">\n');
const S_LF = fold_base('\n');
const S_LT = fold_base('<');
const S_CODE = fold_base('<code');
const S_CODE_OPEN = fold_base('<code>');
const S_CODE_CLOSE = fold_base('</code>');
const S_PRE_CODE_LANG = fold_base('<pre><code class="language-');
const S_PRE_CODE = fold_base('<pre><code');
const S_PRE_CODE_OPEN = fold_base('<pre><code>');
const S_PRE_CODE_CLOSE = fold_base('</code></pre>');
const S_A = fold_base('<a');
const S_HREF = fold_base(' href="');
const S_TITLE = fold_base(' title="');
const S_A_CLOSE = fold_base('</a>');
const S_IMG = fold_base('<img');
const S_SRC = fold_base(' src="');
const S_ALT = fold_base(' alt="');
const S_SELF_CLOSE = fold_base(' />');
const S_OL_START = fold_base('<ol start="');
const S_OL = fold_base('<ol');
const S_OL_OPEN = fold_base('<ol>\n');
const S_OL_CLOSE = fold_base('\n</ol>');
const S_UL = fold_base('<ul');
const S_UL_OPEN = fold_base('<ul>\n');
const S_UL_CLOSE = fold_base('\n</ul>');
const S_HR = fold_base('<hr />');
const S_BR = fold_base('<br />\n');
const S_END_TAG = fold_base('</');
const S_COMMENT_OPEN = fold_base('<!--');
const S_COMMENT_CLOSE = fold_base('-->');
const S_BRACE_OPEN = fold_base('{');
const S_AT_OPEN = fold_base('{@');
const S_BLOCK_OPEN = fold_base('{#');
const S_BRANCH_OPEN = fold_base('{:');
const S_BLOCK_CLOSE = fold_base('{/');
const S_BRACE_CLOSE_LF = fold_base('}\n');
const S_TABLE = fold_base('<table');
const S_TABLE_OPEN = fold_base('<table>\n');
const S_TABLE_CLOSE = fold_base('\n</table>');
const S_THEAD_OPEN = fold_base('<thead>\n<tr>\n');
const S_THEAD_CLOSE = fold_base('</tr>\n</thead>\n');
const S_TBODY_OPEN = fold_base('<tbody>\n');
const S_TBODY_CLOSE = fold_base('</tbody>');
const S_TR_OPEN = fold_base('<tr>\n');
const S_TR_CLOSE = fold_base('</tr>\n');
const S_TH_CLOSE = fold_base('</th>\n');
const S_TD_CLOSE = fold_base('</td>\n');

/** cell open tag ids (none, left, center, right). */
function fold_cell_opens(tag: string): Uint8Array {
	return Uint8Array.of(
		fold_base(`<${tag}>`),
		fold_base(`<${tag} align="left">`),
		fold_base(`<${tag} align="center">`),
		fold_base(`<${tag} align="right">`)
	);
}
const TH_OPEN_ID = fold_cell_opens('th');
const TD_OPEN_ID = fold_cell_opens('td');

// wrapper nodes (open, children, close) render through one shared path. rows
// are node kinds, headings use rows past the kinds by depth, and the first
// heading row covers depths the parser never emits, which the unfolded
// render writes as empty tags because the tag arrays have no entry for them.
const WRAP_ROWS = 48;
const ROW_HEADING = 40;
const WRAP_HEAD = new Uint8Array(WRAP_ROWS);
const WRAP_FOLDED = new Uint8Array(WRAP_ROWS);
const WRAP_END = new Uint8Array(WRAP_ROWS);
const WRAP_CLOSE = new Uint8Array(WRAP_ROWS);

function wrap_row(
	row: number,
	head: string,
	folded: string,
	end: string,
	close: string
): void {
	WRAP_HEAD[row] = fold_base(head);
	WRAP_FOLDED[row] = fold_base(folded);
	WRAP_END[row] = fold_base(end);
	WRAP_CLOSE[row] = fold_base(close);
}

wrap_row(K_PARAGRAPH, '<p', '<p>', '>', '</p>');
wrap_row(K_EMPHASIS, '<em', '<em>', '>', '</em>');
wrap_row(K_STRONG, '<strong', '<strong>', '>', '</strong>');
wrap_row(K_STRIKETHROUGH, '<del', '<del>', '>', '</del>');
wrap_row(K_SUPERSCRIPT, '<sup', '<sup>', '>', '</sup>');
wrap_row(K_SUBSCRIPT, '<sub', '<sub>', '>', '</sub>');
wrap_row(K_LIST_ITEM, '<li', '<li>', '>', '</li>\n');
wrap_row(
	K_BLOCK_QUOTE,
	'<blockquote',
	'<blockquote>\n',
	'>\n',
	'\n</blockquote>'
);
wrap_row(ROW_HEADING, '', '', '>', '');
for (let depth = 1; depth <= 6; depth++) {
	wrap_row(
		ROW_HEADING + depth,
		`<h${depth}`,
		`<h${depth}>`,
		'>',
		`</h${depth}>`
	);
}

//  fold register

// the register is threaded through the fold functions as an argument and a
// return value rather than kept in module state, so turbofan holds it in a
// machine register and never loads or stores it through the module context.
// 0 is an empty register and any other value is the pending static id.

// composites stop at a fixed id count and length, so a document full of
// static runs cannot grow the table without bound. past either cap the
// register is pushed and restarted, which is what the unfolded render does.
const FOLD_BASE = FOLD_STR.length;
const FOLD_MAX_IDS = 1024;
const FOLD_MAX_LEN = 128;
// pair keys are (pending << 7) | static, so base ids must stay below 128
if (FOLD_BASE > 128) throw new Error('too many static literals');

/** composite id for each (pending << 7) | static pair, 0 when not built yet. */
const FOLD_PAIR = new Uint16Array(FOLD_MAX_IDS << 7);

/** hold a static literal in the register, folding it into any pending one. returns the register. */
function push_static(out: string[], p: number, id: number): number {
	if (p === 0) return id;
	const v = FOLD_PAIR[(p << 7) | id];
	return v !== 0 ? v : fold_miss(out, p, id);
}

/** push a dynamic chunk after whatever static is pending. returns the empty register. */
function push_dyn(out: string[], p: number, s: string): number {
	if (p !== 0) out.push(FOLD_STR[p]);
	out.push(s);
	return 0;
}

/** build the composite for a new pair, or push the pending static past the caps. returns the register. */
function fold_miss(out: string[], p: number, id: number): number {
	const a = FOLD_STR[p];
	const b = FOLD_STR[id];
	if (a.length + b.length > FOLD_MAX_LEN) {
		out.push(a);
		return id;
	}
	// flatten and internalize so join copies one sequential string
	const s = Object.keys({ [a + b]: 0 })[0];
	let v = FOLD_IDS.get(s);
	if (v === undefined) {
		if (FOLD_STR.length >= FOLD_MAX_IDS) {
			out.push(a);
			return id;
		}
		v = FOLD_STR.length;
		FOLD_STR.push(s);
		FOLD_IDS.set(s, v);
	}
	FOLD_PAIR[(p << 7) | id] = v;
	return v;
}

//  folding renderer, the unmapped twin of _node and _children

/** whether _attrs would emit anything for this metadata. */
function has_attrs(meta: Record<string, unknown>): boolean {
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		const val = meta[key];
		if (val !== false && val != null) return true;
	}
	return false;
}

/** fold twin of _attrs. */
function fold_attrs(
	meta: Record<string, unknown> | undefined,
	out: string[],
	p: number,
	skip?: Set<string>
): number {
	if (!meta) return p;
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		if (skip !== undefined && skip.has(key)) continue;
		const val = meta[key];
		if (val === true) {
			p = push_static(out, p, S_SPACE);
			p = push_dyn(out, p, key);
		} else if (val !== false && val != null) {
			p = push_static(out, p, S_SPACE);
			p = push_dyn(out, p, key);
			if (typeof val === 'object' && (val as any).type === 'expression') {
				p = push_static(out, p, S_EXPR_EQ);
				p = push_dyn(out, p, (val as any).value);
				p = push_static(out, p, S_BRACE_CLOSE);
			} else {
				p = push_static(out, p, S_ATTR_EQ);
				p = push_dyn(out, p, escape(String(val)));
				p = push_static(out, p, S_QUOTE);
			}
		}
	}
	return p;
}

/** fold twin of _open, taking static ids. */
function fold_open(
	c: Cursor,
	out: string[],
	p: number,
	head: number,
	folded: number,
	end: number
): number {
	const meta = c.meta();
	if (!meta || !has_attrs(meta)) return push_static(out, p, folded);
	p = push_static(out, p, head);
	p = fold_attrs(meta, out, p);
	return push_static(out, p, end);
}

function fold_children(c: Cursor, out: string[], p: number): number {
	if (!c.goto_first_child()) return p;
	do {
		const k = c.kind;
		if (k === K_TEXT) {
			p = push_dyn(out, p, escape_text(c));
		} else if (k !== K_LINE_BREAK) {
			// line breaks render nothing, a fifth of visited nodes skip the call
			p = fold_node(c, out, p);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
}

function fold_node(c: Cursor, out: string[], p: number): number {
	let row = c.kind;
	switch (row) {
		case K_ROOT:
			return fold_children(c, out, p);

		case K_PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K_LIST_ITEM) {
				return fold_children(c, out, p);
			}
		// falls through
		case K_HEADING:
		case K_EMPHASIS:
		case K_STRONG:
		case K_BLOCK_QUOTE:
		case K_LIST_ITEM:
		case K_STRIKETHROUGH:
		case K_SUPERSCRIPT:
		case K_SUBSCRIPT: {
			if (row === K_HEADING) {
				const depth = c.extra;
				row = depth >= 1 && depth <= 6 ? ROW_HEADING + depth : ROW_HEADING;
			}
			p = fold_open(c, out, p, WRAP_HEAD[row], WRAP_FOLDED[row], WRAP_END[row]);
			p = fold_children(c, out, p);
			return push_static(out, p, WRAP_CLOSE[row]);
		}

		case K_CODE_SPAN: {
			p = fold_open(c, out, p, S_CODE, S_CODE_OPEN, S_GT);
			const code = escape_text(c);
			p = push_dyn(
				out,
				p,
				code.indexOf('\n') === -1 ? code : code.replace(/\n/g, ' ')
			);
			return push_static(out, p, S_CODE_CLOSE);
		}

		case K_CODE_FENCE:
			return fold_code_fence(c, out, p);

		case K_LINK:
			return fold_link(c, out, p);

		case K_IMAGE:
			return fold_image(c, out, p);

		case K_LIST:
			return fold_list(c, out, p);

		case K_THEMATIC_BREAK:
			return push_static(out, p, S_HR);

		case K_HARD_BREAK:
			return push_static(out, p, S_BR);

		case K_SOFT_BREAK:
			return push_static(out, p, S_LF);

		case K_HTML:
			return fold_html(c, out, p);

		case K_HTML_COMMENT:
			p = push_static(out, p, S_COMMENT_OPEN);
			p = push_dyn(out, p, c.text());
			return push_static(out, p, S_COMMENT_CLOSE);

		case K_MUSTACHE:
			p = push_static(out, p, S_BRACE_OPEN);
			p = push_dyn(out, p, c.text());
			return push_static(out, p, S_BRACE_CLOSE);

		case K_SVELTE_TAG:
			return fold_svelte_tag(c, out, p);

		case K_SVELTE_BLOCK:
			return fold_svelte_block(c, out, p);

		case K_TABLE:
			p = fold_open(c, out, p, S_TABLE, S_TABLE_OPEN, S_GT_LF);
			p = fold_table_content(c, out, p);
			return push_static(out, p, S_TABLE_CLOSE);

		case K_LINE_BREAK:
			return p;

		default:
			return fold_children(c, out, p);
	}
}

function fold_code_fence(c: Cursor, out: string[], p: number): number {
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
		p = push_static(out, p, S_PRE_CODE_LANG);
		p = push_dyn(out, p, escape(info));
		p = fold_open(c, out, p, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = fold_open(c, out, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	p = push_dyn(out, p, escape_text(c));
	return push_static(out, p, S_PRE_CODE_CLOSE);
}

function fold_link(c: Cursor, out: string[], p: number): number {
	const meta = c.meta();
	p = push_static(out, p, S_A);
	if (meta?.href) {
		p = push_static(out, p, S_HREF);
		p = push_dyn(out, p, escape(meta.href as string));
		p = push_static(out, p, S_QUOTE);
	}
	if (meta?.title) {
		p = push_static(out, p, S_TITLE);
		p = push_dyn(out, p, escape(meta.title as string));
		p = push_static(out, p, S_QUOTE);
	}
	p = fold_attrs(meta, out, p, LINK_HANDLED);
	p = push_static(out, p, S_GT);
	p = fold_children(c, out, p);
	return push_static(out, p, S_A_CLOSE);
}

function fold_image(c: Cursor, out: string[], p: number): number {
	const meta = c.meta();
	p = push_static(out, p, S_IMG);
	if (meta?.src) {
		p = push_static(out, p, S_SRC);
		p = push_dyn(out, p, escape(meta.src as string));
		p = push_static(out, p, S_QUOTE);
	}
	p = push_static(out, p, S_ALT);
	p = push_dyn(out, p, escape(_children_raw(c)));
	p = push_static(out, p, S_QUOTE);
	if (meta?.title) {
		p = push_static(out, p, S_TITLE);
		p = push_dyn(out, p, escape(meta.title as string));
		p = push_static(out, p, S_QUOTE);
	}
	p = fold_attrs(meta, out, p, IMAGE_HANDLED);
	return push_static(out, p, S_SELF_CLOSE);
}

function fold_list(c: Cursor, out: string[], p: number): number {
	const meta = c.meta();
	const ordered = !!meta?.ordered;
	const start = meta?.start as number | undefined;
	if (ordered && start != null && start !== 1) {
		p = push_static(out, p, S_OL_START);
		p = push_dyn(out, p, String(start));
		p = fold_open(c, out, p, S_QUOTE, S_QUOTE_GT_LF, S_GT_LF);
	} else if (ordered) {
		p = fold_open(c, out, p, S_OL, S_OL_OPEN, S_GT_LF);
	} else {
		p = fold_open(c, out, p, S_UL, S_UL_OPEN, S_GT_LF);
	}
	p = fold_children(c, out, p);
	return push_static(out, p, ordered ? S_OL_CLOSE : S_UL_CLOSE);
}

/** push raw html attributes as parsed. */
function fold_html_attrs(
	html_attrs: Record<string, string | boolean>,
	out: string[],
	p: number
): number {
	for (const k in html_attrs) {
		const v = html_attrs[k];
		p = push_static(out, p, S_SPACE);
		p = push_dyn(out, p, k);
		if (v === true) continue;
		if (typeof v === 'object' && (v as any).type === 'expression') {
			p = push_static(out, p, S_EXPR_EQ);
			p = push_dyn(out, p, (v as any).value);
			p = push_static(out, p, S_BRACE_CLOSE);
		} else {
			p = push_static(out, p, S_ATTR_EQ);
			p = push_dyn(out, p, escape(v as string));
			p = push_static(out, p, S_QUOTE);
		}
	}
	return p;
}

function fold_html(c: Cursor, out: string[], p: number): number {
	const meta = c.meta();
	const tag = meta?.tag as string;
	const html_attrs = meta?.attributes as
		| Record<string, string | boolean>
		| undefined;

	if (meta?.self_closing) {
		// source passthrough, see _node. the unfolded render pushes the tag
		// and then truncates back, which a pending register cannot undo, so
		// the passthrough is decided before anything is pushed.
		const passthrough = c.end > c.start ? c.slice(c.start, c.end) : '';
		if (passthrough) return push_dyn(out, p, passthrough);
		p = push_static(out, p, S_LT);
		p = push_dyn(out, p, tag);
		if (html_attrs) p = fold_html_attrs(html_attrs, out, p);
		return push_static(out, p, S_SELF_CLOSE);
	}

	p = push_static(out, p, S_LT);
	p = push_dyn(out, p, tag);
	if (html_attrs) p = fold_html_attrs(html_attrs, out, p);
	p = push_static(out, p, S_GT);
	// raw-text elements keep their content as the node's value range, see _node
	if (tag === 'script' || tag === 'style') {
		p = push_dyn(out, p, c.text());
	} else {
		p = fold_children(c, out, p);
	}
	p = push_static(out, p, S_END_TAG);
	p = push_dyn(out, p, tag);
	return push_static(out, p, S_GT);
}

function fold_svelte_tag(c: Cursor, out: string[], p: number): number {
	const meta = c.meta();
	const tag = meta?.tag as string;
	const text = c.text();
	p = push_static(out, p, S_AT_OPEN);
	p = push_dyn(out, p, tag);
	if (text) {
		p = push_static(out, p, S_SPACE);
		p = push_dyn(out, p, text);
	}
	return push_static(out, p, S_BRACE_CLOSE);
}

function fold_svelte_block(c: Cursor, out: string[], p: number): number {
	// render branches; each branch handles its own opening tag
	const block_meta = c.meta();
	const block_tag = block_meta?.tag as string;
	if (c.goto_first_child()) {
		let is_first = true;
		do {
			if (c.kind === K_SVELTE_BRANCH) {
				const branch_expr = c.text();
				if (is_first) {
					p = push_static(out, p, S_BLOCK_OPEN);
					p = push_dyn(out, p, block_tag);
					is_first = false;
				} else {
					const branch_meta = c.meta();
					p = push_static(out, p, S_BRANCH_OPEN);
					p = push_dyn(out, p, branch_meta?.tag as string);
				}
				if (branch_expr) {
					p = push_static(out, p, S_SPACE);
					p = push_dyn(out, p, branch_expr);
				}
				p = push_static(out, p, S_BRACE_CLOSE_LF);
				p = fold_children(c, out, p);
			} else if (c.kind !== K_LINE_BREAK) {
				p = fold_node(c, out, p);
			}
		} while (c.goto_next_sibling());
		c.goto_parent();
	}
	p = push_static(out, p, S_BLOCK_CLOSE);
	p = push_dyn(out, p, block_tag);
	return push_static(out, p, S_BRACE_CLOSE);
}

function fold_table_content(c: Cursor, out: string[], p: number): number {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let in_body = false;

	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K_TABLE_HEADER) {
			p = push_static(out, p, S_THEAD_OPEN);
			p = fold_table_cells(c, TH_OPEN_ID, S_TH_CLOSE, 'th', alignments, out, p);
			p = push_static(out, p, S_THEAD_CLOSE);
		} else if (c.kind === K_TABLE_ROW) {
			if (!in_body) {
				p = push_static(out, p, S_TBODY_OPEN);
				in_body = true;
			}
			p = push_static(out, p, S_TR_OPEN);
			p = fold_table_cells(c, TD_OPEN_ID, S_TD_CLOSE, 'td', alignments, out, p);
			p = push_static(out, p, S_TR_CLOSE);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) p = push_static(out, p, S_TBODY_CLOSE);
	return p;
}

function fold_table_cells(
	c: Cursor,
	opens: Uint8Array,
	close: number,
	tag: string,
	alignments: string[],
	out: string[],
	p: number
): number {
	let col = 0;
	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K_TABLE_CELL) {
			const align = alignments[col];
			// the parser only emits these four values, anything else is built as before
			if (align === 'left') p = push_static(out, p, opens[1]);
			else if (align === 'center') p = push_static(out, p, opens[2]);
			else if (align === 'right') p = push_static(out, p, opens[3]);
			else if (align && align !== 'none')
				p = push_dyn(out, p, `<${tag} align="${align}">`);
			else p = push_static(out, p, opens[0]);
			p = fold_children(c, out, p);
			p = push_static(out, p, close);
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
}

/** render the node at the current cursor position into out, which is only joined. */
function render_folded(c: Cursor, out: string[]): void {
	const p = fold_node(c, out, 0);
	if (p !== 0) out.push(FOLD_STR[p]);
}

//  mapping resolution

// grow-only cumulative offset table shared by every render, resolution is
// synchronous so one table is enough and a fresh renderer allocates nothing.
let offsets_scratch = new Uint32Array(0);

/** generated offset of each out chunk, and of the end at out.length. */
export function _out_offsets(
	out: string[],
	scratch?: Uint32Array
): Uint32Array {
	const needed = out.length + 1;
	let offsets: Uint32Array;
	if (scratch !== undefined && scratch.length >= needed) {
		offsets = scratch;
	} else {
		if (offsets_scratch.length < needed) {
			let capacity = 16;
			while (capacity < needed) capacity <<= 1;
			offsets_scratch = new Uint32Array(capacity);
		}
		offsets = offsets_scratch;
	}
	offsets[0] = 0;
	for (let i = 0; i < out.length; i++) {
		// out holds seq, cons, sliced and internalized strings, so a plain
		// .length load is megamorphic. the concat tells turbofan it is a
		// string and the load becomes a direct length read.
		offsets[i + 1] = offsets[i] + (out[i] + '').length;
	}
	return offsets;
}

/** convert pending mapping records to volar-compatible Mapping[] using out[] offsets. */
export function _resolve_mappings(
	out: string[],
	sink: MapSink,
	scratch?: Uint32Array
): Mapping<MappingData>[] {
	const offsets = _out_offsets(out, scratch);
	const rec = sink.rec;
	const n = sink.n;
	const mappings: Mapping<MappingData>[] = [];
	for (let p = 0; p < n; p += RECORD_SIZE) {
		const out_idx = rec[p];
		const source_length = rec[p + 3];
		const gen_offset = offsets[out_idx];
		const gen_length = offsets[out_idx + rec[p + 1]] - gen_offset;
		const m: Mapping<MappingData> = {
			sourceOffsets: [rec[p + 2]],
			generatedOffsets: [gen_offset],
			lengths: [source_length],
			data: record_data(rec[p + 5], rec[p + 4] | 0),
		};
		if (gen_length !== source_length) {
			m.generatedLengths = [gen_length];
		}
		mappings.push(m);
	}
	return mappings;
}

// mapped renders resolve their records before they return, so every
// renderer shares one sink
const render_sink = new MapSink();

//  internal helpers

/** render the node at the current cursor position to html string. */
function _render_block(cursor: Cursor): string {
	const out: string[] = [];
	render_folded(cursor, out);
	return out.join('');
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
	html = '';
	private closed: Set<number> | null = null;
	private cursor: Cursor | null = null;
	private cache: boolean;
	private out: string[] = [];

	constructor(opts?: { cache?: boolean }) {
		this.cache = opts?.cache ?? true;
		if (this.cache) this.closed = new Set();
	}

	update(buf: NodeBuffer, source: string): CursorBlockEntry[] {
		// reuse or create cursor
		if (!this.cursor) {
			this.cursor = new Cursor(buf, source);
		} else {
			this.cursor.reinit(buf, source);
		}
		const c = this.cursor;
		c.reset();
		esc_reset(source);

		// no caching, single-pass full render
		if (!this.cache) {
			const out = this.out;
			// a fresh renderer has empty arrays and the length store is not free
			if (out.length !== 0) out.length = 0;
			render_folded(c, out);
			this.html = out.join('');
			return this.blocks;
		}

		// cached block-level rendering
		if (!c.goto_first_child()) return this.blocks;

		let block_idx = 0;
		do {
			if (c.kind === K_LINE_BREAK) continue;

			const idx = c.index;

			if (block_idx >= this.blocks.length) {
				this.blocks.push({ idx, html: _render_block(c) });
				if (c.closed) this.closed!.add(idx);
			} else if (!this.closed!.has(idx)) {
				this.blocks[block_idx].html = _render_block(c);
				if (c.closed) this.closed!.add(idx);
			}

			block_idx++;
		} while (c.goto_next_sibling());

		c.goto_parent();
		this.html = this.blocks.map((b) => b.html).join('');
		return this.blocks;
	}

	/** render the whole document into out with the cursor at the root. */
	private render_mapped(buf: NodeBuffer, source: string, sink: MapSink): void {
		if (!this.cursor) {
			this.cursor = new Cursor(buf, source);
		} else {
			this.cursor.reinit(buf, source);
		}
		const c = this.cursor;
		c.reset();
		esc_reset(source);

		const out = this.out;
		if (out.length !== 0) out.length = 0;
		_node(c, out, sink);
		this.html = out.join('');
	}

	/** render with source mapping. always full render (no caching). */
	update_mapped(
		buf: NodeBuffer,
		source: string
	): { blocks: CursorBlockEntry[]; mappings: Mapping<MappingData>[] } {
		const sink = render_sink;
		sink.begin(true);
		this.render_mapped(buf, source, sink);
		const mappings = _resolve_mappings(this.out, sink);
		sink.release();
		return { blocks: this.blocks, mappings };
	}

	/**
	 * render and encode the v3 map in one pass. the map equals
	 * mappings_to_v3(update_mapped(buf, source).mappings, raw, html, file)
	 * for a raw source that normalizes to source without collapsing any \r\n,
	 * but no Mapping objects are built and the syntax mappings a v3 map skips
	 * are never recorded.
	 */
	update_v3(
		buf: NodeBuffer,
		source: string,
		raw: string,
		file?: string
	): SourceMapV3 {
		const sink = render_sink;
		sink.begin(false);
		this.render_mapped(buf, source, sink);
		const map = records_to_v3(
			sink,
			_out_offsets(this.out),
			raw,
			this.html,
			file
		);
		sink.release();
		return map;
	}

	/**
	 * render and keep what update_v3 encodes, for a caller that may need
	 * only part of the map or none of it. trace_to_v3 over the trace with the
	 * same arguments gives update_v3's map.
	 */
	update_trace(buf: NodeBuffer, source: string): MapTrace {
		const sink = render_sink;
		sink.begin(false);
		this.render_mapped(buf, source, sink);
		const out = this.out;
		const trace: MapTrace = {
			rec: sink.rec.slice(0, sink.n),
			offsets: _out_offsets(out).slice(0, out.length + 1),
		};
		sink.release();
		return trace;
	}

	reset(): void {
		this.blocks.length = 0;
		this.closed?.clear();
		this.html = '';
	}

	/**
	 * drop the html and the chunks of the last render, and every reference
	 * to its source, so a renderer kept for reuse holds no document. update
	 * and update_mapped truncate these arrays anyway, so the next render pays
	 * nothing extra. the mapping sink releases itself after every render.
	 */
	release(): void {
		// length stores and clear are runtime calls even on an empty array or
		// set, and an uncached renderer never fills blocks or closed
		if (this.out.length !== 0) this.out.length = 0;
		this.html = '';
		if (this.blocks.length !== 0) this.blocks.length = 0;
		const closed = this.closed;
		if (closed !== null && closed.size !== 0) closed.clear();
		this.cursor?.release();
		// the escape index is module state and would keep the source alive
		esc_reset('');
	}
}
