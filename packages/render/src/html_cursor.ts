/**
 * cursor-based pfm html renderer
 *
 * renders html from a cursor over a NodeBuffer
 * zero per node allocations, the cursor reads node words directly,
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
	RecordMapping,
	record_data,
	record_mappings,
} from './mappings';
import type { Mapping, MappingData } from './mappings';
import { records_by_offset, records_to_v3, reserve_trace } from './sourcemap';
import type { MapTrace, SourceMapV3 } from './sourcemap';

export type { Mapping, CodeInformation, MappingData } from './mappings';
export { MapSink } from './mappings';

// must equal NONE in @mdsvex/parse
const enum Slot {
	NONE = 0xffffffff,
}

// code span values arrive as seq, cons and sliced strings, so an indexOf load
// on them goes megamorphic, calling through one function keeps it monomorphic
const string_index_of = String.prototype.indexOf;

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
function escape_html(text: string): string {
	if (!ESCAPE_TEST.test(text)) return text;
	return text.replace(ESCAPE_MATCH, escape_replace);
}

//  source escape index

// text nodes arrive in source order, so instead of a regex per value each
// escapable char keeps its next source position and advances it with indexOf,
// scanning the source about once per render
// each pointer is the first match at or after esc_lo, or esc_len for none
let esc_src = '';
let esc_len = 0;
let esc_lo = 0;
let esc_amp = -1;
let esc_lt = -1;
let esc_gt = -1;
let esc_quot = -1;
// false for a buffer with no prebuilt strings, so text skips the lookup
let esc_prebuilt = true;
// only nodes whose bit is set hold a prebuilt string, a late repair can turn
// the sparse strings array into a dictionary that hashes on every read
let esc_bits: Uint8Array | null = null;
const PREBUILT_BITS_MIN = 1024;

function prebuilt_bits(buf: NodeBuffer): Uint8Array {
	const bits = new Uint8Array((buf.size >>> 3) + 1);
	const strings = buf._strings;
	// for-in walks only the present keys, also of a dictionary array
	for (const k in strings) {
		const i = +k;
		bits[i >>> 3] |= 1 << (i & 7);
	}
	return bits;
}

/** the caller restores the prebuilt state after the render */
function prebuilt_begin(buf: NodeBuffer): void {
	const len = buf._strings.length;
	if (len === 0) esc_prebuilt = false;
	// a short array stays in fast elements, a direct read beats building the bitmap
	else if (len > PREBUILT_BITS_MIN) esc_bits = prebuilt_bits(buf);
}

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

/** equals escape_html of c.text, reading source slices through the escape index */
function escape_node_text(c: Cursor): string {
	return escape_text_at(c, c.index, c.value_start, c.value_end);
}

/** escape_node_text of node i, the cursor may sit elsewhere */
function escape_text_at(c: Cursor, i: number, vs: number, ve: number): string {
	if (esc_prebuilt) {
		const bits = esc_bits;
		if (bits === null || (bits[i >>> 3] & (1 << (i & 7))) !== 0) {
			const s = c.prebuilt_at(i);
			if (s !== undefined) return escape_html(s);
		}
	}
	// empty cases must match Cursor.text
	if (vs === Slot.NONE || ve === Slot.NONE || ve <= vs) return '';
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

/** m is the first escapable char at or after vs */
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

// the renderer is its own build entry, so exported consts stay module cells
// turbofan reloads on every use and a switch over them is a compare chain,
// local const enums build to literals that fold to immediates and a jump table
const enum K {
	ROOT = 0,
	TEXT = 1,
	HTML = 2,
	HEADING = 3,
	CODE_FENCE = 5,
	LINE_BREAK = 6,
	PARAGRAPH = 7,
	CODE_SPAN = 8,
	EMPHASIS = 9,
	STRONG = 10,
	THEMATIC_BREAK = 11,
	LINK = 12,
	IMAGE = 13,
	BLOCK_QUOTE = 14,
	LIST = 15,
	LIST_ITEM = 16,
	HARD_BREAK = 17,
	SOFT_BREAK = 18,
	STRIKETHROUGH = 19,
	SUPERSCRIPT = 20,
	SUBSCRIPT = 21,
	TABLE = 22,
	TABLE_HEADER = 23,
	TABLE_ROW = 24,
	TABLE_CELL = 25,
	HTML_COMMENT = 26,
	SVELTE_TAG = 27,
	SVELTE_BLOCK = 28,
	SVELTE_BRANCH = 29,
	MUSTACHE = 4,
	FRONTMATTER = 33,
	IMPORT_STATEMENT = 34,
}

export const K_ROOT = K.ROOT;
export const K_TEXT = K.TEXT;
export const K_HTML = K.HTML;
export const K_HEADING = K.HEADING;
export const K_CODE_FENCE = K.CODE_FENCE;
export const K_LINE_BREAK = K.LINE_BREAK;
export const K_PARAGRAPH = K.PARAGRAPH;
export const K_CODE_SPAN = K.CODE_SPAN;
export const K_EMPHASIS = K.EMPHASIS;
export const K_STRONG = K.STRONG;
export const K_THEMATIC_BREAK = K.THEMATIC_BREAK;
export const K_LINK = K.LINK;
export const K_IMAGE = K.IMAGE;
export const K_BLOCK_QUOTE = K.BLOCK_QUOTE;
export const K_LIST = K.LIST;
export const K_LIST_ITEM = K.LIST_ITEM;
export const K_HARD_BREAK = K.HARD_BREAK;
export const K_SOFT_BREAK = K.SOFT_BREAK;
export const K_STRIKETHROUGH = K.STRIKETHROUGH;
export const K_SUPERSCRIPT = K.SUPERSCRIPT;
export const K_SUBSCRIPT = K.SUBSCRIPT;
export const K_TABLE = K.TABLE;
export const K_TABLE_HEADER = K.TABLE_HEADER;
export const K_TABLE_ROW = K.TABLE_ROW;
export const K_TABLE_CELL = K.TABLE_CELL;
export const K_HTML_COMMENT = K.HTML_COMMENT;
export const K_SVELTE_TAG = K.SVELTE_TAG;
export const K_SVELTE_BLOCK = K.SVELTE_BLOCK;
export const K_SVELTE_BRANCH = K.SVELTE_BRANCH;
export const K_MUSTACHE = K.MUSTACHE;
export const K_FRONTMATTER = K.FRONTMATTER;
export const K_IMPORT_STATEMENT = K.IMPORT_STATEMENT;

export const NONE = Slot.NONE;

//  pending mapping records

// must match RECORD_SIZE and Preset in mappings, local for the same reason as K
const enum Rec {
	SIZE = 6,
}

const enum Preset {
	TEXT = 0,
	CODE = 1,
	SVELTE = 2,
	STRUCTURE = 3,
}

// record_code of preset and role, as literals
const enum Code {
	TEXT_CONTENT = 1,
	CODE_CONTENT = 5,
	SVELTE_NODE = 8,
	SVELTE_CONTENT = 9,
	STRUCTURE_OPEN = 14,
	STRUCTURE_CLOSE = 15,
}

function emit_record(
	sink: MapSink,
	out_start: number,
	out_end: number,
	src_start: number,
	src_end: number,
	node_index: number,
	code: number
): void {
	if (out_end > out_start && src_start !== Slot.NONE) {
		let rec = sink.rec;
		const p = sink.n;
		if (p + Rec.SIZE > rec.length) rec = sink.grow();
		rec[p] = out_start;
		rec[p + 1] = out_end - out_start;
		rec[p + 2] = src_start;
		rec[p + 3] = src_end > src_start ? src_end - src_start : 0;
		rec[p + 4] = node_index;
		rec[p + 5] = code;
		sink.n = p + Rec.SIZE;
	}
}

/**
 * offsets in html characters, every span the render records covers at least
 * one chunk, so none is dropped for its width
 */
function put_record(
	sink: MapSink,
	gen_start: number,
	gen_end: number,
	src_start: number,
	src_end: number,
	node_index: number,
	code: number
): void {
	if (src_start !== Slot.NONE) {
		let rec = sink.rec;
		const p = sink.n;
		if (p + Rec.SIZE > rec.length) rec = sink.grow();
		rec[p] = gen_start;
		rec[p + 1] = gen_end - gen_start;
		rec[p + 2] = src_start;
		rec[p + 3] = src_end > src_start ? src_end - src_start : 0;
		rec[p + 4] = node_index;
		rec[p + 5] = code;
		sink.n = p + Rec.SIZE;
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
	put_record(sink, pre, post, s, e, idx, preset << 2);
	if (!sink.syntax) return;
	const vs = c.value_start,
		ve = c.value_end;
	// value range is meaningful when ve > vs (same check as Cursor.text()).
	// Uint32Array defaults to 0 for unset slots, so ve !== NONE is not enough.
	const has_value = ve > vs;
	put_record(
		sink,
		pre,
		after_open,
		s,
		has_value ? vs : s,
		idx,
		Code.STRUCTURE_OPEN
	);
	put_record(
		sink,
		before_close,
		post,
		has_value ? ve : e,
		e,
		idx,
		Code.STRUCTURE_CLOSE
	);
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

function meta_str(v: unknown): string {
	return v == null ? '' : typeof v === 'string' ? v : `${v}`;
}

function _attrs(c: Cursor, skip?: Set<string>): string {
	const meta = c.meta();
	if (!meta) return '';
	let s = '';
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		if (skip !== undefined && skip.has(key)) continue;
		const val = meta[key];
		if (val === true) {
			s += ' ' + key;
		} else if (val !== false && val != null) {
			if (typeof val === 'object' && (val as any).type === 'expression') {
				s += ' ' + key + '={' + meta_str((val as any).value) + '}';
			} else {
				s += ' ' + key + '="' + escape_html(String(val)) + '"';
			}
		}
	}
	return s;
}

//  mapped renderer

// records of the mapped render take generated offsets from its length
let mo = '';

function _open(c: Cursor, head: string, folded: string, end: string): void {
	const a = _attrs(c);
	if (a.length !== 0) mo = mo + head + a + end;
	else mo += folded;
}

// node word offsets, must follow NodeField in @mdsvex/parse
const enum W {
	start = 1,
	end = 2,
	value_start = 3,
	value_end = 4,
	parent = 5,
	next = 6,
	first_child = 8,
	stride = 12,
}

const LINK_HANDLED = new Set(['href', 'title']);
const IMAGE_HANDLED = new Set(['title']);

/** render children of the current cursor position, collecting escaped text and recursive node output. */
function render_children(c: Cursor, sink?: MapSink): void {
	const n = c.words;
	let child = n[c.index * W.stride + W.first_child];
	if (child === Slot.NONE) return;
	// siblings share the parent word of the first child, as goto_next_sibling checks
	const parent = n[child * W.stride + W.parent];
	for (;;) {
		const b = child * W.stride;
		const k = n[b] & 0xff;
		if (k === K.TEXT) {
			const vs = n[b + W.value_start];
			const ve = n[b + W.value_end];
			const t = escape_text_at(c, child, vs, ve);
			if (sink) {
				if (vs !== Slot.NONE && ve > vs) {
					const at = mo.length;
					put_record(sink, at, at + t.length, vs, ve, child, Code.TEXT_CONTENT);
				}
			}
			mo += t;
		} else if (k !== K.LINE_BREAK) {
			// line breaks render nothing, a fifth of visited nodes skip the call
			c.move_to(child);
			render_node(c, sink);
		}
		const next = n[b + W.next];
		if (next === Slot.NONE || n[next * W.stride + W.parent] !== parent) break;
		child = next;
	}
	c.move_to(parent !== Slot.NONE ? parent : child);
}

/** collect raw text from child text nodes (for image alt, link text fallback, etc.). */
function _children_raw(c: Cursor): string {
	if (!c.goto_first_child()) return '';
	let text = '';
	do {
		if (c.kind === K.TEXT) {
			text += c.text();
		} else {
			text += _children_raw(c);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return text;
}

/** call before appending text to mo */
function content_record(
	sink: MapSink,
	c: Cursor,
	text: string,
	code: number
): void {
	const at = mo.length;
	put_record(
		sink,
		at,
		at + text.length,
		c.value_start,
		c.value_end,
		c.index,
		code
	);
}

/** render a single node at the current cursor position. */
function render_node(c: Cursor, sink?: MapSink): void {
	// as number, or the case labels narrow c.kind for the reads inside a case
	switch (c.kind as number) {
		case K.ROOT:
			render_children(c, sink);
			break;

		case K.HEADING: {
			const pre = mo.length;
			// depths the parser never emits render as empty tags
			const e = c.extra;
			const d = e >= 1 && e <= 6 ? e : 0;
			_open(c, H_TAG[d], H_OPEN[d], '>');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += H_CLOSE[d];
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K.LIST_ITEM) {
				render_children(c, sink);
			} else {
				const pre = mo.length;
				_open(c, '<p', '<p>', '>');
				const ao = mo.length;
				render_children(c, sink);
				const bc = mo.length;
				mo += '</p>';
				if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			}
			break;

		case K.EMPHASIS: {
			const pre = mo.length;
			_open(c, '<em', '<em>', '>');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '</em>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.STRONG: {
			const pre = mo.length;
			_open(c, '<strong', '<strong>', '>');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '</strong>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.CODE_SPAN: {
			const pre = mo.length;
			_open(c, '<code', '<code>', '>');
			const ao = mo.length;
			let code = escape_node_text(c);
			if (string_index_of.call(code, '\n') !== -1)
				code = code.replace(/\n/g, ' ');
			if (sink) content_record(sink, c, code, Code.CODE_CONTENT);
			mo += code;
			const bc = mo.length;
			mo += '</code>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.CODE);
			break;
		}

		case K.CODE_FENCE: {
			const pre = mo.length;
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
				mo += '<pre><code class="language-' + escape_html(info);
				_open(c, '"', '">', '>');
			} else {
				_open(c, '<pre><code', '<pre><code>', '>');
			}
			const ao = mo.length;
			const text = escape_node_text(c);
			if (sink) content_record(sink, c, text, Code.CODE_CONTENT);
			mo += text;
			const bc = mo.length;
			mo += '</code></pre>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.CODE);
			break;
		}

		case K.BLOCK_QUOTE: {
			const pre = mo.length;
			_open(c, '<blockquote', '<blockquote>\n', '>\n');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '\n</blockquote>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.LINK: {
			const pre = mo.length;
			const meta = c.meta();
			let s = '<a';
			if (meta?.href) s += ' href="' + escape_html(meta.href as string) + '"';
			if (meta?.title)
				s += ' title="' + escape_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, LINK_HANDLED) + '>';
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '</a>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.IMAGE: {
			const pre = mo.length;
			const meta = c.meta();
			let s = '<img';
			if (meta?.src) s += ' src="' + escape_html(meta.src as string) + '"';
			s += ' alt="' + escape_html(_children_raw(c)) + '"';
			if (meta?.title)
				s += ' title="' + escape_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, IMAGE_HANDLED) + ' />';
			// the syntax spans are empty, only the node is recorded
			if (sink) put_record(sink, pre, mo.length, c.start, c.end, c.index, 0);
			break;
		}

		case K.LIST: {
			const pre = mo.length;
			const meta = c.meta();
			const ordered = !!meta?.ordered;
			const start = meta?.start as number | undefined;
			if (ordered && start != null && start !== 1) {
				mo += '<ol start="' + String(start);
				_open(c, '"', '">\n', '>\n');
			} else if (ordered) {
				_open(c, '<ol', '<ol>\n', '>\n');
			} else {
				_open(c, '<ul', '<ul>\n', '>\n');
			}
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += ordered ? '\n</ol>' : '\n</ul>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.STRUCTURE);
			break;
		}

		case K.LIST_ITEM: {
			const pre = mo.length;
			_open(c, '<li', '<li>', '>');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '</li>\n';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.THEMATIC_BREAK: {
			const pre = mo.length;
			mo += '<hr />';
			// node and open syntax, the close syntax span is empty
			if (sink) {
				const post = mo.length;
				put_record(
					sink,
					pre,
					post,
					c.start,
					c.end,
					c.index,
					Preset.STRUCTURE << 2
				);
				if (sink.syntax) {
					const vs = c.value_start;
					put_record(
						sink,
						pre,
						post,
						c.start,
						c.value_end > vs ? vs : c.start,
						c.index,
						Code.STRUCTURE_OPEN
					);
				}
			}
			break;
		}

		case K.HARD_BREAK:
			mo += '<br />\n';
			break;

		case K.SOFT_BREAK:
			mo += '\n';
			break;

		case K.STRIKETHROUGH: {
			const pre = mo.length;
			_open(c, '<del', '<del>', '>');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '</del>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.SUPERSCRIPT: {
			const pre = mo.length;
			_open(c, '<sup', '<sup>', '>');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '</sup>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.SUBSCRIPT: {
			const pre = mo.length;
			_open(c, '<sub', '<sub>', '>');
			const ao = mo.length;
			render_children(c, sink);
			const bc = mo.length;
			mo += '</sub>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.HTML: {
			const pre = mo.length;
			const meta = c.meta();
			const tag = meta?.tag as string;

			// source passthrough: use exact source text to guarantee
			// identity mapping. reconstruction can differ from the
			// source (extra space before />, attribute escaping, quote
			// style) which makes the mapping non-identity and breaks
			// per-token precision in the PFM->Svelte->TS composition
			// pipeline.
			// falls back to reconstruction when source is unavailable
			// (e.g. wire/streaming renderer with empty source).
			const self_closing = !!meta?.self_closing;
			const passthrough =
				self_closing && c.end > c.start ? c.slice(c.start, c.end) : '';
			if (passthrough) {
				mo += passthrough;
			} else {
				let s = '<' + meta_str(tag);
				const html_attrs = meta?.attributes as
					| Record<string, string | boolean>
					| undefined;
				if (html_attrs) {
					for (const k in html_attrs) {
						const v = html_attrs[k];
						if (v === true) {
							s += ' ' + k;
						} else if (
							typeof v === 'object' &&
							(v as any).type === 'expression'
						) {
							s += ' ' + k + '={' + meta_str((v as any).value) + '}';
						} else {
							s += ' ' + k + '="' + escape_html(v as string) + '"';
						}
					}
				}
				mo += self_closing ? s + ' />' : s + '>';
			}
			if (self_closing) {
				if (sink) {
					put_record(
						sink,
						pre,
						mo.length,
						c.start,
						c.end,
						c.index,
						Code.SVELTE_CONTENT
					);
				}
			} else {
				const ao = mo.length;
				// raw-text elements: parser stores content as value range on
				// the html node itself (no child nodes). emit unescaped, the
				// browser does not parse script/style bodies as html.
				if (tag === 'script' || tag === 'style') {
					const text = c.text();
					if (sink) content_record(sink, c, text, Code.SVELTE_CONTENT);
					mo += text;
				} else {
					render_children(c, sink);
				}
				const bc = mo.length;
				mo = mo + '</' + meta_str(tag) + '>';
				if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			}
			break;
		}

		case K.HTML_COMMENT: {
			const pre = mo.length;
			mo += '<!--';
			const ao = mo.length;
			const text = c.text();
			if (sink) content_record(sink, c, text, Code.TEXT_CONTENT);
			mo += text;
			const bc = mo.length;
			mo += '-->';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.TEXT);
			break;
		}

		case K.MUSTACHE: {
			const pre = mo.length;
			mo += '{';
			const ao = mo.length;
			const text = c.text();
			if (sink) content_record(sink, c, text, Code.SVELTE_CONTENT);
			mo += text;
			const bc = mo.length;
			mo += '}';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.SVELTE);
			break;
		}

		case K.SVELTE_TAG: {
			const pre = mo.length;
			const meta = c.meta();
			const tag = meta?.tag as string;
			const text = c.text();
			mo = mo + '{@' + meta_str(tag);
			if (text) mo += ' ';
			const ao = mo.length;
			if (text) {
				if (sink) content_record(sink, c, text, Code.SVELTE_CONTENT);
				mo += text;
			}
			const bc = mo.length;
			mo += '}';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.SVELTE);
			break;
		}

		case K.SVELTE_BLOCK: {
			const pre = mo.length;
			// render branches; each branch handles its own opening tag
			const block_meta = c.meta();
			const block_tag = meta_str(block_meta?.tag);
			if (c.goto_first_child()) {
				let is_first = true;
				do {
					if (c.kind === K.SVELTE_BRANCH) {
						const branch_expr = c.text();
						if (is_first) {
							mo = mo + '{#' + block_tag;
							is_first = false;
						} else {
							mo = mo + '{:' + meta_str(c.meta()?.tag);
						}
						if (branch_expr) {
							mo += ' ';
							if (sink)
								content_record(sink, c, branch_expr, Code.SVELTE_CONTENT);
							mo += branch_expr;
						}
						mo += '}\n';
						render_children(c, sink);
					} else if (c.kind !== K.LINE_BREAK) {
						render_node(c, sink);
					}
				} while (c.goto_next_sibling());
				c.goto_parent();
			}
			mo = mo + '{/' + block_tag + '}';
			// node span for the whole block, use the block node (goto_parent already called)
			if (sink) {
				put_record(
					sink,
					pre,
					mo.length,
					c.start,
					c.end,
					c.index,
					Code.SVELTE_NODE
				);
			}
			break;
		}

		case K.TABLE: {
			const pre = mo.length;
			_open(c, '<table', '<table>\n', '>\n');
			const ao = mo.length;
			_table_content(c, sink);
			const bc = mo.length;
			mo += '\n</table>';
			if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.STRUCTURE);
			break;
		}

		case K.LINE_BREAK:
			break;

		default:
			render_children(c, sink);
			break;
	}
}

function _table_content(c: Cursor, sink?: MapSink): void {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let in_body = false;

	if (!c.goto_first_child()) return;
	do {
		if (c.kind === K.TABLE_HEADER) {
			mo += '<thead>\n<tr>\n';
			_table_cells(c, 'th', alignments, sink);
			mo += '</tr>\n</thead>\n';
		} else if (c.kind === K.TABLE_ROW) {
			if (!in_body) {
				mo += '<tbody>\n';
				in_body = true;
			}
			mo += '<tr>\n';
			_table_cells(c, 'td', alignments, sink);
			mo += '</tr>\n';
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) mo += '</tbody>';
}

/** open tags for none, left, center and right */
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
	sink?: MapSink
): void {
	const opens = tag === 'th' ? TH_OPEN : TD_OPEN;
	const close = tag === 'th' ? '</th>\n' : '</td>\n';
	let col = 0;
	if (!c.goto_first_child()) return;
	do {
		if (c.kind === K.TABLE_CELL) {
			const align = alignments[col];
			// the parser only emits these four values, others are built at runtime
			if (align === 'left') mo += opens[1];
			else if (align === 'center') mo += opens[2];
			else if (align === 'right') mo += opens[3];
			else if (align && align !== 'none') mo += `<${tag} align="${align}">`;
			else mo += opens[0];
			render_children(c, sink);
			mo += close;
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
}

//  static chunk fold

// the final join costs about the same per chunk whatever its length, and a
// third of chunks are a static right after a static, so the unmapped render
// holds the last static id in a one slot register and folds pairs through a
// table of precomputed flat composites, allocating nothing once warm where a
// runtime concat would build a cons string for join to walk
// the mapped render records spans around almost every static so it does not fold

/** base literals then composites, id 0 is the empty register */
const FOLD_STR: string[] = [''];
const FOLD_IDS = new Map<string, number>();
/** length of each FOLD_STR entry, so the trace render reads a position without a string load */
const FOLD_LEN = new Uint16Array(1024);

function fold_base(s: string): number {
	let id = FOLD_IDS.get(s);
	if (id === undefined) {
		id = FOLD_STR.length;
		FOLD_STR.push(s);
		FOLD_IDS.set(s, id);
		FOLD_LEN[id] = s.length;
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

/** indexed by alignment none, left, center, right */
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

// rows are node kinds, headings use ROW_HEADING plus depth, and ROW_HEADING
// alone covers depths the parser never emits, which render as empty tags
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

wrap_row(K.PARAGRAPH, '<p', '<p>', '>', '</p>');
wrap_row(K.EMPHASIS, '<em', '<em>', '>', '</em>');
wrap_row(K.STRONG, '<strong', '<strong>', '>', '</strong>');
wrap_row(K.STRIKETHROUGH, '<del', '<del>', '>', '</del>');
wrap_row(K.SUPERSCRIPT, '<sup', '<sup>', '>', '</sup>');
wrap_row(K.SUBSCRIPT, '<sub', '<sub>', '>', '</sub>');
wrap_row(K.LIST_ITEM, '<li', '<li>', '>', '</li>\n');
wrap_row(
	K.BLOCK_QUOTE,
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

// the register is passed and returned rather than kept in module state so
// turbofan keeps it in a machine register, 0 is empty, else a pending static id

// caps bound the composite table, past either the pending static is pushed as is
const FOLD_BASE = FOLD_STR.length;
const FOLD_MAX_IDS = 1024;
const FOLD_MAX_LEN = 128;
// pair keys shift the pending id by 7 bits, so base ids must stay below 128
if (FOLD_BASE > 128) throw new Error('too many static literals');
// FOLD_LEN is declared before the cap, it must cover every id
if (FOLD_LEN.length < FOLD_MAX_IDS)
	throw new Error('FOLD_LEN smaller than the fold table');

/** composite id per pair key, 0 when not built yet */
const FOLD_PAIR = new Uint16Array(FOLD_MAX_IDS << 7);

// a cons append is cheaper than an array push and one flatten beats a join
let fold_out = '';
// a char load flattens a cons string in place, a store to a typed array is
// observable so neither the minifier nor turbofan drops the load
const flat_sink = new Uint16Array(1);

/** fold a static into the register, returns the new register */
function push_static(p: number, id: number): number {
	if (p === 0) return id;
	const v = FOLD_PAIR[(p << 7) | id];
	return v !== 0 ? v : fold_miss(p, id);
}

/** flushes any pending static first, returns the empty register */
function push_dyn(p: number, s: string): number {
	if (p !== 0) fold_out += FOLD_STR[p];
	fold_out += s;
	return 0;
}

/** build the composite for a new pair, or push the pending static past the caps */
function fold_miss(p: number, id: number): number {
	const a = FOLD_STR[p];
	const b = FOLD_STR[id];
	// a full table would build, internalize and hash the composite on every later miss
	if (a.length + b.length > FOLD_MAX_LEN || FOLD_STR.length >= FOLD_MAX_IDS) {
		fold_out += a;
		return id;
	}
	// flatten and internalize so join copies one sequential string
	const s = Object.keys({ [a + b]: 0 })[0];
	let v = FOLD_IDS.get(s);
	if (v === undefined) {
		v = FOLD_STR.length;
		FOLD_STR.push(s);
		FOLD_IDS.set(s, v);
		FOLD_LEN[v] = s.length;
	}
	FOLD_PAIR[(p << 7) | id] = v;
	return v;
}

//  folding renderer, the unmapped twin of _node and _children

/** true when _attrs would emit anything */
function has_attrs(meta: Record<string, unknown>): boolean {
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		const val = meta[key];
		if (val !== false && val != null) return true;
	}
	return false;
}

/** fold twin of _attrs */
function fold_attrs(
	meta: Record<string, unknown> | undefined,
	p: number,
	skip?: Set<string>
): number {
	if (!meta) return p;
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		if (skip !== undefined && skip.has(key)) continue;
		const val = meta[key];
		if (val === true) {
			p = push_static(p, S_SPACE);
			p = push_dyn(p, key);
		} else if (val !== false && val != null) {
			p = push_static(p, S_SPACE);
			p = push_dyn(p, key);
			if (typeof val === 'object' && (val as any).type === 'expression') {
				p = push_static(p, S_EXPR_EQ);
				p = push_dyn(p, (val as any).value);
				p = push_static(p, S_BRACE_CLOSE);
			} else {
				p = push_static(p, S_ATTR_EQ);
				p = push_dyn(p, escape(String(val)));
				p = push_static(p, S_QUOTE);
			}
		}
	}
	return p;
}

/** fold twin of _open, taking static ids */
function fold_open(
	c: Cursor,
	p: number,
	head: number,
	folded: number,
	end: number
): number {
	const meta = c.meta();
	if (!meta || !has_attrs(meta)) return push_static(p, folded);
	p = push_static(p, head);
	p = fold_attrs(meta, p);
	return push_static(p, end);
}

// text and line breaks, over half of all nodes, are read without moving the cursor
function fold_children(c: Cursor, p: number): number {
	const n = c.words;
	let child = n[c.index * W.stride + W.first_child];
	if (child === Slot.NONE) return p;
	// siblings share the parent word of the first child, as goto_next_sibling checks
	const parent = n[child * W.stride + W.parent];
	for (;;) {
		const b = child * W.stride;
		const k = n[b] & 0xff;
		let next = n[b + W.next];
		if (k === K.TEXT) {
			const first = child;
			let ve = n[b + W.value_end];
			// a text sibling or soft break that continues this value in the source
			// renders as one slice with it, one rope piece instead of two or three
			if (next !== Slot.NONE && !esc_prebuilt) {
				const nk = n[next * W.stride] & 0xff;
				if (nk === K.TEXT || nk === K.SOFT_BREAK) {
					child = text_run_last(n, child, parent, c.source);
					const lb = child * W.stride;
					ve = n[lb + W.value_end];
					next = n[lb + W.next];
				}
			}
			p = push_dyn(p, escape_text_at(c, first, n[b + W.value_start], ve));
		} else if (k !== K.LINE_BREAK) {
			// line breaks render nothing, a fifth of visited nodes skip the call
			c.move_to(child);
			p = fold_node(c, p);
		}
		if (next === Slot.NONE || n[next * W.stride + W.parent] !== parent) break;
		child = next;
	}
	c.move_to(parent !== Slot.NONE ? parent : child);
	return p;
}

/**
 * the last text of a run from first whose output is the source slice, each text
 * continues the previous value and each soft break is the source newline
 */
function text_run_last(
	n: Uint32Array,
	first: number,
	parent: number,
	src: string
): number {
	let last = first;
	let b = first * W.stride;
	let ve = n[b + W.value_end];
	if (ve === Slot.NONE || ve < n[b + W.value_start]) return first;
	for (;;) {
		let next = n[b + W.next];
		if (next === Slot.NONE) return last;
		let nb = next * W.stride;
		if (n[nb + W.parent] !== parent) return last;
		let k = n[nb] & 0xff;
		if (k === K.SOFT_BREAK) {
			const s = n[nb + W.start];
			if (s !== ve || n[nb + W.end] !== s + 1 || src.charCodeAt(s) !== 10)
				return last;
			next = n[nb + W.next];
			if (next === Slot.NONE) return last;
			nb = next * W.stride;
			if (n[nb + W.parent] !== parent) return last;
			k = n[nb] & 0xff;
			if (k !== K.TEXT || n[nb + W.value_start] !== s + 1) return last;
		} else if (k !== K.TEXT || n[nb + W.value_start] !== ve) {
			return last;
		}
		const e = n[nb + W.value_end];
		if (e === Slot.NONE || e < n[nb + W.value_start]) return last;
		last = next;
		b = nb;
		ve = e;
	}
}

function fold_node(c: Cursor, p: number): number {
	let row = c.kind;
	switch (row) {
		case K.ROOT:
			return fold_children(c, p);

		case K.PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K.LIST_ITEM) {
				return fold_children(c, p);
			}
		// falls through
		case K.HEADING:
		case K.EMPHASIS:
		case K.STRONG:
		case K.BLOCK_QUOTE:
		case K.LIST_ITEM:
		case K.STRIKETHROUGH:
		case K.SUPERSCRIPT:
		case K.SUBSCRIPT: {
			if (row === K.HEADING) {
				const depth = c.extra;
				row = depth >= 1 && depth <= 6 ? ROW_HEADING + depth : ROW_HEADING;
			}
			p = fold_open(c, p, WRAP_HEAD[row], WRAP_FOLDED[row], WRAP_END[row]);
			p = fold_children(c, p);
			return push_static(p, WRAP_CLOSE[row]);
		}

		case K.CODE_SPAN: {
			p = fold_open(c, p, S_CODE, S_CODE_OPEN, S_GT);
			const code = escape_text(c);
			p = push_dyn(
				p,
				code.indexOf('\n') === -1 ? code : code.replace(/\n/g, ' ')
			);
			return push_static(p, S_CODE_CLOSE);
		}

		case K.CODE_FENCE:
			return fold_code_fence(c, p);

		case K.LINK:
			return fold_link(c, p);

		case K.IMAGE:
			return fold_image(c, p);

		case K.LIST:
			return fold_list(c, p);

		case K.THEMATIC_BREAK:
			return push_static(p, S_HR);

		case K.HARD_BREAK:
			return push_static(p, S_BR);

		case K.SOFT_BREAK:
			return push_static(p, S_LF);

		case K.HTML:
			return fold_html(c, p);

		case K.HTML_COMMENT:
			p = push_static(p, S_COMMENT_OPEN);
			p = push_dyn(p, c.text());
			return push_static(p, S_COMMENT_CLOSE);

		case K.MUSTACHE:
			p = push_static(p, S_BRACE_OPEN);
			p = push_dyn(p, c.text());
			return push_static(p, S_BRACE_CLOSE);

		case K.SVELTE_TAG:
			return fold_svelte_tag(c, p);

		case K.SVELTE_BLOCK:
			return fold_svelte_block(c, p);

		case K.TABLE:
			p = fold_open(c, p, S_TABLE, S_TABLE_OPEN, S_GT_LF);
			p = fold_table_content(c, p);
			return push_static(p, S_TABLE_CLOSE);

		case K.LINE_BREAK:
			return p;

		default:
			return fold_children(c, p);
	}
}

function fold_code_fence(c: Cursor, p: number): number {
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
		p = push_static(p, S_PRE_CODE_LANG);
		p = push_dyn(p, escape(info));
		p = fold_open(c, p, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = fold_open(c, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	p = push_dyn(p, escape_text(c));
	return push_static(p, S_PRE_CODE_CLOSE);
}

function fold_link(c: Cursor, p: number): number {
	const meta = c.meta();
	p = push_static(p, S_A);
	if (meta?.href) {
		p = push_static(p, S_HREF);
		p = push_dyn(p, escape(meta.href as string));
		p = push_static(p, S_QUOTE);
	}
	if (meta?.title) {
		p = push_static(p, S_TITLE);
		p = push_dyn(p, escape(meta.title as string));
		p = push_static(p, S_QUOTE);
	}
	p = fold_attrs(meta, p, LINK_HANDLED);
	p = push_static(p, S_GT);
	p = fold_children(c, p);
	return push_static(p, S_A_CLOSE);
}

function fold_image(c: Cursor, p: number): number {
	const meta = c.meta();
	p = push_static(p, S_IMG);
	if (meta?.src) {
		p = push_static(p, S_SRC);
		p = push_dyn(p, escape(meta.src as string));
		p = push_static(p, S_QUOTE);
	}
	p = push_static(p, S_ALT);
	p = push_dyn(p, escape(_children_raw(c)));
	p = push_static(p, S_QUOTE);
	if (meta?.title) {
		p = push_static(p, S_TITLE);
		p = push_dyn(p, escape(meta.title as string));
		p = push_static(p, S_QUOTE);
	}
	p = fold_attrs(meta, p, IMAGE_HANDLED);
	return push_static(p, S_SELF_CLOSE);
}

function fold_list(c: Cursor, p: number): number {
	const meta = c.meta();
	const ordered = !!meta?.ordered;
	const start = meta?.start as number | undefined;
	if (ordered && start != null && start !== 1) {
		p = push_static(p, S_OL_START);
		p = push_dyn(p, String(start));
		p = fold_open(c, p, S_QUOTE, S_QUOTE_GT_LF, S_GT_LF);
	} else if (ordered) {
		p = fold_open(c, p, S_OL, S_OL_OPEN, S_GT_LF);
	} else {
		p = fold_open(c, p, S_UL, S_UL_OPEN, S_GT_LF);
	}
	p = fold_children(c, p);
	return push_static(p, ordered ? S_OL_CLOSE : S_UL_CLOSE);
}

function fold_html_attrs(
	html_attrs: Record<string, string | boolean>,
	p: number
): number {
	for (const k in html_attrs) {
		const v = html_attrs[k];
		p = push_static(p, S_SPACE);
		p = push_dyn(p, k);
		if (v === true) continue;
		if (typeof v === 'object' && (v as any).type === 'expression') {
			p = push_static(p, S_EXPR_EQ);
			p = push_dyn(p, (v as any).value);
			p = push_static(p, S_BRACE_CLOSE);
		} else {
			p = push_static(p, S_ATTR_EQ);
			p = push_dyn(p, escape(v as string));
			p = push_static(p, S_QUOTE);
		}
	}
	return p;
}

function fold_html(c: Cursor, p: number): number {
	const meta = c.meta();
	const tag = meta?.tag as string;
	const html_attrs = meta?.attributes as
		| Record<string, string | boolean>
		| undefined;

	if (meta?.self_closing) {
		// source passthrough as in _node, decided before any push because a
		// pending register cannot be truncated back
		const passthrough = c.end > c.start ? c.slice(c.start, c.end) : '';
		if (passthrough) return push_dyn(p, passthrough);
		p = push_static(p, S_LT);
		p = push_dyn(p, tag);
		if (html_attrs) p = fold_html_attrs(html_attrs, p);
		return push_static(p, S_SELF_CLOSE);
	}

	p = push_static(p, S_LT);
	p = push_dyn(p, tag);
	if (html_attrs) p = fold_html_attrs(html_attrs, p);
	p = push_static(p, S_GT);
	// raw text elements keep their content as the node value range, see _node
	if (tag === 'script' || tag === 'style') {
		p = push_dyn(p, c.text());
	} else {
		p = fold_children(c, p);
	}
	p = push_static(p, S_END_TAG);
	p = push_dyn(p, tag);
	return push_static(p, S_GT);
}

function fold_svelte_tag(c: Cursor, p: number): number {
	const meta = c.meta();
	const tag = meta?.tag as string;
	const text = c.text();
	p = push_static(p, S_AT_OPEN);
	p = push_dyn(p, tag);
	if (text) {
		p = push_static(p, S_SPACE);
		p = push_dyn(p, text);
	}
	return push_static(p, S_BRACE_CLOSE);
}

function fold_svelte_block(c: Cursor, p: number): number {
	// render branches; each branch handles its own opening tag
	const block_meta = c.meta();
	const block_tag = block_meta?.tag as string;
	if (c.goto_first_child()) {
		let is_first = true;
		do {
			if (c.kind === K.SVELTE_BRANCH) {
				const branch_expr = c.text();
				if (is_first) {
					p = push_static(p, S_BLOCK_OPEN);
					p = push_dyn(p, block_tag);
					is_first = false;
				} else {
					const branch_meta = c.meta();
					p = push_static(p, S_BRANCH_OPEN);
					p = push_dyn(p, branch_meta?.tag as string);
				}
				if (branch_expr) {
					p = push_static(p, S_SPACE);
					p = push_dyn(p, branch_expr);
				}
				p = push_static(p, S_BRACE_CLOSE_LF);
				p = fold_children(c, p);
			} else if (c.kind !== K.LINE_BREAK) {
				p = fold_node(c, p);
			}
		} while (c.goto_next_sibling());
		c.goto_parent();
	}
	p = push_static(p, S_BLOCK_CLOSE);
	p = push_dyn(p, block_tag);
	return push_static(p, S_BRACE_CLOSE);
}

function fold_table_content(c: Cursor, p: number): number {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let in_body = false;

	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_HEADER) {
			p = push_static(p, S_THEAD_OPEN);
			p = fold_table_cells(c, TH_OPEN_ID, S_TH_CLOSE, 'th', alignments, p);
			p = push_static(p, S_THEAD_CLOSE);
		} else if (c.kind === K.TABLE_ROW) {
			if (!in_body) {
				p = push_static(p, S_TBODY_OPEN);
				in_body = true;
			}
			p = push_static(p, S_TR_OPEN);
			p = fold_table_cells(c, TD_OPEN_ID, S_TD_CLOSE, 'td', alignments, p);
			p = push_static(p, S_TR_CLOSE);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) p = push_static(p, S_TBODY_CLOSE);
	return p;
}

function fold_table_cells(
	c: Cursor,
	opens: Uint8Array,
	close: number,
	tag: string,
	alignments: string[],
	p: number
): number {
	let col = 0;
	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_CELL) {
			const align = alignments[col];
			// the parser only emits these four values, others are built at runtime
			if (align === 'left') p = push_static(p, opens[1]);
			else if (align === 'center') p = push_static(p, opens[2]);
			else if (align === 'right') p = push_static(p, opens[3]);
			else if (align && align !== 'none')
				p = push_dyn(p, `<${tag} align="${align}">`);
			else p = push_static(p, opens[0]);
			p = fold_children(c, p);
			p = push_static(p, close);
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
}

//  trace renderer, the mapped render without syntax records

// update_trace and update_v3 drop syntax records, so a node records only its
// whole span and text its content span, output must equal the mapped render
// a position is mo.length + FOLD_LEN[p]

/** push_static appending to mo */
function tr_push(p: number, id: number): number {
	if (p === 0) return id;
	const v = FOLD_PAIR[(p << 7) | id];
	return v !== 0 ? v : tr_miss(p, id);
}

/** fold_miss appending to mo */
function tr_miss(p: number, id: number): number {
	const a = FOLD_STR[p];
	const b = FOLD_STR[id];
	if (a.length + b.length > FOLD_MAX_LEN || FOLD_STR.length >= FOLD_MAX_IDS) {
		mo += a;
		return id;
	}
	const s = Object.keys({ [a + b]: 0 })[0];
	let v = FOLD_IDS.get(s);
	if (v === undefined) {
		v = FOLD_STR.length;
		FOLD_STR.push(s);
		FOLD_IDS.set(s, v);
		FOLD_LEN[v] = s.length;
	}
	FOLD_PAIR[(p << 7) | id] = v;
	return v;
}

/** _open as static ids, returns the new register */
function tr_open(
	c: Cursor,
	p: number,
	head: number,
	folded: number,
	end: number
): number {
	const a = _attrs(c);
	if (a.length === 0) return tr_push(p, folded);
	if (p !== 0) mo += FOLD_STR[p];
	mo = mo + FOLD_STR[head] + a;
	return end;
}

/** content_record after flushing the register */
function tr_content(
	c: Cursor,
	sink: MapSink,
	p: number,
	text: string,
	code: number
): number {
	if (p !== 0) mo += FOLD_STR[p];
	const at = mo.length;
	put_record(
		sink,
		at,
		at + text.length,
		c.value_start,
		c.value_end,
		c.index,
		code
	);
	mo += text;
	return 0;
}

function tr_children(c: Cursor, sink: MapSink, p: number): number {
	const n = c.words;
	let child = n[c.index * W.stride + W.first_child];
	if (child === Slot.NONE) return p;
	// siblings share the parent word of the first child, as goto_next_sibling checks
	const parent = n[child * W.stride + W.parent];
	for (;;) {
		const b = child * W.stride;
		const k = n[b] & 0xff;
		if (k === K.TEXT) {
			const vs = n[b + W.value_start];
			const ve = n[b + W.value_end];
			const t = escape_text_at(c, child, vs, ve);
			if (p !== 0) {
				mo += FOLD_STR[p];
				p = 0;
			}
			if (vs !== Slot.NONE && ve > vs) {
				const at = mo.length;
				put_record(sink, at, at + t.length, vs, ve, child, Code.TEXT_CONTENT);
			}
			mo += t;
		} else if (k !== K.LINE_BREAK) {
			// line breaks render nothing, a fifth of visited nodes skip the call
			c.move_to(child);
			p = tr_node(c, sink, p);
		}
		const next = n[b + W.next];
		if (next === Slot.NONE || n[next * W.stride + W.parent] !== parent) break;
		child = next;
	}
	c.move_to(parent !== Slot.NONE ? parent : child);
	return p;
}

function tr_node(c: Cursor, sink: MapSink, p: number): number {
	let row = c.kind;
	switch (row) {
		case K.ROOT:
			return tr_children(c, sink, p);

		case K.PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K.LIST_ITEM) {
				return tr_children(c, sink, p);
			}
		// falls through
		case K.HEADING:
		case K.EMPHASIS:
		case K.STRONG:
		case K.BLOCK_QUOTE:
		case K.LIST_ITEM:
		case K.STRIKETHROUGH:
		case K.SUPERSCRIPT:
		case K.SUBSCRIPT: {
			if (row === K.HEADING) {
				const depth = c.extra;
				row = depth >= 1 && depth <= 6 ? ROW_HEADING + depth : ROW_HEADING;
			}
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, WRAP_HEAD[row], WRAP_FOLDED[row], WRAP_END[row]);
			p = tr_children(c, sink, p);
			p = tr_push(p, WRAP_CLOSE[row]);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[p],
				c.start,
				c.end,
				c.index,
				Preset.TEXT << 2
			);
			return p;
		}

		case K.CODE_SPAN: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, S_CODE, S_CODE_OPEN, S_GT);
			let code = escape_node_text(c);
			if (string_index_of.call(code, '\n') !== -1)
				code = code.replace(/\n/g, ' ');
			tr_content(c, sink, p, code, Code.CODE_CONTENT);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_CODE_CLOSE],
				c.start,
				c.end,
				c.index,
				Preset.CODE << 2
			);
			return S_CODE_CLOSE;
		}

		case K.LIST: {
			const pre = mo.length + FOLD_LEN[p];
			const meta = c.meta();
			const ordered = !!meta?.ordered;
			const start = meta?.start as number | undefined;
			if (ordered && start != null && start !== 1) {
				if (p !== 0) mo += FOLD_STR[p];
				mo += '<ol start="' + String(start);
				p = tr_open(c, 0, S_QUOTE, S_QUOTE_GT_LF, S_GT_LF);
			} else if (ordered) {
				p = tr_open(c, p, S_OL, S_OL_OPEN, S_GT_LF);
			} else {
				p = tr_open(c, p, S_UL, S_UL_OPEN, S_GT_LF);
			}
			p = tr_children(c, sink, p);
			p = tr_push(p, ordered ? S_OL_CLOSE : S_UL_CLOSE);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[p],
				c.start,
				c.end,
				c.index,
				Preset.STRUCTURE << 2
			);
			return p;
		}

		case K.THEMATIC_BREAK: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_HR);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[p],
				c.start,
				c.end,
				c.index,
				Preset.STRUCTURE << 2
			);
			return p;
		}

		case K.HARD_BREAK:
			return tr_push(p, S_BR);

		case K.SOFT_BREAK:
			return tr_push(p, S_LF);

		case K.TABLE: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, S_TABLE, S_TABLE_OPEN, S_GT_LF);
			p = tr_table_content(c, sink, p);
			p = tr_push(p, S_TABLE_CLOSE);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[p],
				c.start,
				c.end,
				c.index,
				Preset.STRUCTURE << 2
			);
			return p;
		}

		case K.LINE_BREAK:
			return p;

		case K.HTML:
			return tr_html(c, sink, p);

		case K.SVELTE_BLOCK:
			return tr_svelte_block(c, sink, p);

		case K.CODE_FENCE:
			return tr_code_fence(c, sink, p);

		case K.LINK: {
			const pre = mo.length + FOLD_LEN[p];
			if (p !== 0) mo += FOLD_STR[p];
			const meta = c.meta();
			let s = '<a';
			if (meta?.href) s += ' href="' + escape_html(meta.href as string) + '"';
			if (meta?.title)
				s += ' title="' + escape_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, LINK_HANDLED);
			p = tr_children(c, sink, S_GT);
			p = tr_push(p, S_A_CLOSE);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[p],
				c.start,
				c.end,
				c.index,
				Preset.TEXT << 2
			);
			return p;
		}

		case K.IMAGE: {
			const pre = mo.length + FOLD_LEN[p];
			if (p !== 0) mo += FOLD_STR[p];
			const meta = c.meta();
			let s = '<img';
			if (meta?.src) s += ' src="' + escape_html(meta.src as string) + '"';
			s += ' alt="' + escape_html(_children_raw(c)) + '"';
			if (meta?.title)
				s += ' title="' + escape_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, IMAGE_HANDLED);
			// the syntax spans are empty, only the node is recorded
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_SELF_CLOSE],
				c.start,
				c.end,
				c.index,
				0
			);
			return S_SELF_CLOSE;
		}

		case K.HTML_COMMENT: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_COMMENT_OPEN);
			tr_content(c, sink, p, c.text(), Code.TEXT_CONTENT);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_COMMENT_CLOSE],
				c.start,
				c.end,
				c.index,
				Preset.TEXT << 2
			);
			return S_COMMENT_CLOSE;
		}

		case K.MUSTACHE: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_BRACE_OPEN);
			tr_content(c, sink, p, c.text(), Code.SVELTE_CONTENT);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_BRACE_CLOSE],
				c.start,
				c.end,
				c.index,
				Preset.SVELTE << 2
			);
			return S_BRACE_CLOSE;
		}

		case K.SVELTE_TAG: {
			if (p !== 0) mo += FOLD_STR[p];
			const pre = mo.length;
			const meta = c.meta();
			const tag = meta?.tag as string;
			const text = c.text();
			mo = mo + '{@' + meta_str(tag);
			if (text) tr_content(c, sink, S_SPACE, text, Code.SVELTE_CONTENT);
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_BRACE_CLOSE],
				c.start,
				c.end,
				c.index,
				Preset.SVELTE << 2
			);
			return S_BRACE_CLOSE;
		}

		default:
			return tr_children(c, sink, p);
	}
}

function tr_code_fence(c: Cursor, sink: MapSink, p: number): number {
	const pre = mo.length + FOLD_LEN[p];
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
		if (p !== 0) mo += FOLD_STR[p];
		mo += '<pre><code class="language-' + escape_html(info);
		p = tr_open(c, 0, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = tr_open(c, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	tr_content(c, sink, p, escape_node_text(c), Code.CODE_CONTENT);
	put_record(
		sink,
		pre,
		mo.length + FOLD_LEN[S_PRE_CODE_CLOSE],
		c.start,
		c.end,
		c.index,
		Preset.CODE << 2
	);
	return S_PRE_CODE_CLOSE;
}

/** the render_node html case with children folded */
function tr_html(c: Cursor, sink: MapSink, p: number): number {
	if (p !== 0) mo += FOLD_STR[p];
	const pre = mo.length;
	const meta = c.meta();
	const tag = meta?.tag as string;
	// source passthrough and reconstruction exactly as render_node
	const self_closing = !!meta?.self_closing;
	const passthrough =
		self_closing && c.end > c.start ? c.slice(c.start, c.end) : '';
	if (passthrough) {
		mo += passthrough;
	} else {
		let s = '<' + meta_str(tag);
		const html_attrs = meta?.attributes as
			| Record<string, string | boolean>
			| undefined;
		if (html_attrs) {
			for (const k in html_attrs) {
				const v = html_attrs[k];
				if (v === true) {
					s += ' ' + k;
				} else if (typeof v === 'object' && (v as any).type === 'expression') {
					s += ' ' + k + '={' + meta_str((v as any).value) + '}';
				} else {
					s += ' ' + k + '="' + escape_html(v as string) + '"';
				}
			}
		}
		if (self_closing) {
			mo += s;
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_SELF_CLOSE],
				c.start,
				c.end,
				c.index,
				Code.SVELTE_CONTENT
			);
			return S_SELF_CLOSE;
		}
		mo += s;
	}
	if (self_closing) {
		put_record(
			sink,
			pre,
			mo.length,
			c.start,
			c.end,
			c.index,
			Code.SVELTE_CONTENT
		);
		return 0;
	}
	if (tag === 'script' || tag === 'style') {
		tr_content(c, sink, S_GT, c.text(), Code.SVELTE_CONTENT);
	} else {
		const q = tr_children(c, sink, S_GT);
		if (q !== 0) mo += FOLD_STR[q];
	}
	mo = mo + '</' + meta_str(tag);
	put_record(
		sink,
		pre,
		mo.length + FOLD_LEN[S_GT],
		c.start,
		c.end,
		c.index,
		Preset.TEXT << 2
	);
	return S_GT;
}

/** the render_node svelte block case with branch children folded */
function tr_svelte_block(c: Cursor, sink: MapSink, p: number): number {
	if (p !== 0) mo += FOLD_STR[p];
	p = 0;
	const pre = mo.length;
	// render branches; each branch handles its own opening tag
	const block_meta = c.meta();
	const block_tag = meta_str(block_meta?.tag);
	if (c.goto_first_child()) {
		let is_first = true;
		do {
			if (c.kind === K.SVELTE_BRANCH) {
				const branch_expr = c.text();
				if (p !== 0) mo += FOLD_STR[p];
				if (is_first) {
					mo = mo + '{#' + block_tag;
					is_first = false;
				} else {
					mo = mo + '{:' + meta_str(c.meta()?.tag);
				}
				if (branch_expr) {
					mo += ' ';
					put_record(
						sink,
						mo.length,
						mo.length + branch_expr.length,
						c.value_start,
						c.value_end,
						c.index,
						Code.SVELTE_CONTENT
					);
					mo += branch_expr;
				}
				p = tr_children(c, sink, S_BRACE_CLOSE_LF);
			} else if (c.kind !== K.LINE_BREAK) {
				p = tr_node(c, sink, p);
			}
		} while (c.goto_next_sibling());
		c.goto_parent();
	}
	if (p !== 0) mo += FOLD_STR[p];
	mo = mo + '{/' + block_tag;
	// node span for the whole block, use the block node (goto_parent already called)
	put_record(
		sink,
		pre,
		mo.length + FOLD_LEN[S_BRACE_CLOSE],
		c.start,
		c.end,
		c.index,
		Code.SVELTE_NODE
	);
	return S_BRACE_CLOSE;
}

function tr_table_content(c: Cursor, sink: MapSink, p: number): number {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let in_body = false;

	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_HEADER) {
			p = tr_push(p, S_THEAD_OPEN);
			p = tr_table_cells(c, sink, TH_OPEN_ID, S_TH_CLOSE, 'th', alignments, p);
			p = tr_push(p, S_THEAD_CLOSE);
		} else if (c.kind === K.TABLE_ROW) {
			if (!in_body) {
				p = tr_push(p, S_TBODY_OPEN);
				in_body = true;
			}
			p = tr_push(p, S_TR_OPEN);
			p = tr_table_cells(c, sink, TD_OPEN_ID, S_TD_CLOSE, 'td', alignments, p);
			p = tr_push(p, S_TR_CLOSE);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) p = tr_push(p, S_TBODY_CLOSE);
	return p;
}

function tr_table_cells(
	c: Cursor,
	sink: MapSink,
	opens: Uint8Array,
	close: number,
	tag: string,
	alignments: string[],
	p: number
): number {
	let col = 0;
	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_CELL) {
			const align = alignments[col];
			// the parser only emits these four values, others are built at runtime
			if (align === 'left') p = tr_push(p, opens[1]);
			else if (align === 'center') p = tr_push(p, opens[2]);
			else if (align === 'right') p = tr_push(p, opens[3]);
			else if (align && align !== 'none') {
				if (p !== 0) mo += FOLD_STR[p];
				mo += `<${tag} align="${align}">`;
				p = 0;
			} else p = tr_push(p, opens[0]);
			p = tr_children(c, sink, p);
			p = tr_push(p, close);
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
}

//  folded mapped renderer, render_node with the fold register

// output and records equal render_node with a sink, syntax records included,
// a position is mo.length + FOLD_LEN[p] as in the trace render

function mp_children(c: Cursor, sink: MapSink, p: number): number {
	const n = c.words;
	let child = n[c.index * W.stride + W.first_child];
	if (child === Slot.NONE) return p;
	// siblings share the parent word of the first child, as goto_next_sibling checks
	const parent = n[child * W.stride + W.parent];
	for (;;) {
		const b = child * W.stride;
		const k = n[b] & 0xff;
		if (k === K.TEXT) {
			const vs = n[b + W.value_start];
			const ve = n[b + W.value_end];
			const t = escape_text_at(c, child, vs, ve);
			if (p !== 0) {
				mo += FOLD_STR[p];
				p = 0;
			}
			if (vs !== Slot.NONE && ve > vs) {
				const at = mo.length;
				put_record(sink, at, at + t.length, vs, ve, child, Code.TEXT_CONTENT);
			}
			mo += t;
		} else if (k !== K.LINE_BREAK) {
			// line breaks render nothing, a fifth of visited nodes skip the call
			c.move_to(child);
			p = mp_node(c, sink, p);
		}
		const next = n[b + W.next];
		if (next === Slot.NONE || n[next * W.stride + W.parent] !== parent) break;
		child = next;
	}
	c.move_to(parent !== Slot.NONE ? parent : child);
	return p;
}

function mp_node(c: Cursor, sink: MapSink, p: number): number {
	let row = c.kind;
	switch (row) {
		case K.ROOT:
			return mp_children(c, sink, p);

		case K.PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K.LIST_ITEM) {
				return mp_children(c, sink, p);
			}
		// falls through
		case K.HEADING:
		case K.EMPHASIS:
		case K.STRONG:
		case K.BLOCK_QUOTE:
		case K.LIST_ITEM:
		case K.STRIKETHROUGH:
		case K.SUPERSCRIPT:
		case K.SUBSCRIPT: {
			if (row === K.HEADING) {
				const depth = c.extra;
				row = depth >= 1 && depth <= 6 ? ROW_HEADING + depth : ROW_HEADING;
			}
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, WRAP_HEAD[row], WRAP_FOLDED[row], WRAP_END[row]);
			const ao = mo.length + FOLD_LEN[p];
			p = mp_children(c, sink, p);
			const bc = mo.length + FOLD_LEN[p];
			p = tr_push(p, WRAP_CLOSE[row]);
			_spans(sink, pre, ao, bc, mo.length + FOLD_LEN[p], c, Preset.TEXT);
			return p;
		}

		case K.CODE_SPAN: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, S_CODE, S_CODE_OPEN, S_GT);
			const ao = mo.length + FOLD_LEN[p];
			let code = escape_node_text(c);
			if (string_index_of.call(code, '\n') !== -1)
				code = code.replace(/\n/g, ' ');
			tr_content(c, sink, p, code, Code.CODE_CONTENT);
			const bc = mo.length;
			_spans(
				sink,
				pre,
				ao,
				bc,
				bc + FOLD_LEN[S_CODE_CLOSE],
				c,
				Preset.CODE
			);
			return S_CODE_CLOSE;
		}

		case K.LIST: {
			const pre = mo.length + FOLD_LEN[p];
			const meta = c.meta();
			const ordered = !!meta?.ordered;
			const start = meta?.start as number | undefined;
			if (ordered && start != null && start !== 1) {
				if (p !== 0) mo += FOLD_STR[p];
				mo += '<ol start="' + String(start);
				p = tr_open(c, 0, S_QUOTE, S_QUOTE_GT_LF, S_GT_LF);
			} else if (ordered) {
				p = tr_open(c, p, S_OL, S_OL_OPEN, S_GT_LF);
			} else {
				p = tr_open(c, p, S_UL, S_UL_OPEN, S_GT_LF);
			}
			const ao = mo.length + FOLD_LEN[p];
			p = mp_children(c, sink, p);
			const bc = mo.length + FOLD_LEN[p];
			p = tr_push(p, ordered ? S_OL_CLOSE : S_UL_CLOSE);
			_spans(sink, pre, ao, bc, mo.length + FOLD_LEN[p], c, Preset.STRUCTURE);
			return p;
		}

		case K.THEMATIC_BREAK: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_HR);
			const post = mo.length + FOLD_LEN[p];
			// node and open syntax, the close syntax span is empty
			put_record(
				sink,
				pre,
				post,
				c.start,
				c.end,
				c.index,
				Preset.STRUCTURE << 2
			);
			if (sink.syntax) {
				const vs = c.value_start;
				put_record(
					sink,
					pre,
					post,
					c.start,
					c.value_end > vs ? vs : c.start,
					c.index,
					Code.STRUCTURE_OPEN
				);
			}
			return p;
		}

		case K.HARD_BREAK:
			return tr_push(p, S_BR);

		case K.SOFT_BREAK:
			return tr_push(p, S_LF);

		case K.TABLE: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, S_TABLE, S_TABLE_OPEN, S_GT_LF);
			const ao = mo.length + FOLD_LEN[p];
			p = mp_table_content(c, sink, p);
			const bc = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_TABLE_CLOSE);
			_spans(sink, pre, ao, bc, mo.length + FOLD_LEN[p], c, Preset.STRUCTURE);
			return p;
		}

		case K.LINE_BREAK:
			return p;

		case K.HTML:
			return mp_html(c, sink, p);

		case K.SVELTE_BLOCK:
			return mp_svelte_block(c, sink, p);

		case K.CODE_FENCE:
			return mp_code_fence(c, sink, p);

		case K.LINK: {
			const pre = mo.length + FOLD_LEN[p];
			if (p !== 0) mo += FOLD_STR[p];
			const meta = c.meta();
			let s = '<a';
			if (meta?.href) s += ' href="' + escape_html(meta.href as string) + '"';
			if (meta?.title)
				s += ' title="' + escape_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, LINK_HANDLED);
			const ao = mo.length + FOLD_LEN[S_GT];
			p = mp_children(c, sink, S_GT);
			const bc = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_A_CLOSE);
			_spans(sink, pre, ao, bc, mo.length + FOLD_LEN[p], c, Preset.TEXT);
			return p;
		}

		case K.IMAGE: {
			const pre = mo.length + FOLD_LEN[p];
			if (p !== 0) mo += FOLD_STR[p];
			const meta = c.meta();
			let s = '<img';
			if (meta?.src) s += ' src="' + escape_html(meta.src as string) + '"';
			s += ' alt="' + escape_html(_children_raw(c)) + '"';
			if (meta?.title)
				s += ' title="' + escape_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, IMAGE_HANDLED);
			// the syntax spans are empty, only the node is recorded
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_SELF_CLOSE],
				c.start,
				c.end,
				c.index,
				0
			);
			return S_SELF_CLOSE;
		}

		case K.HTML_COMMENT: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_COMMENT_OPEN);
			const ao = mo.length + FOLD_LEN[p];
			tr_content(c, sink, p, c.text(), Code.TEXT_CONTENT);
			const bc = mo.length;
			_spans(
				sink,
				pre,
				ao,
				bc,
				bc + FOLD_LEN[S_COMMENT_CLOSE],
				c,
				Preset.TEXT
			);
			return S_COMMENT_CLOSE;
		}

		case K.MUSTACHE: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_BRACE_OPEN);
			const ao = mo.length + FOLD_LEN[p];
			tr_content(c, sink, p, c.text(), Code.SVELTE_CONTENT);
			const bc = mo.length;
			_spans(
				sink,
				pre,
				ao,
				bc,
				bc + FOLD_LEN[S_BRACE_CLOSE],
				c,
				Preset.SVELTE
			);
			return S_BRACE_CLOSE;
		}

		case K.SVELTE_TAG: {
			if (p !== 0) mo += FOLD_STR[p];
			const pre = mo.length;
			const meta = c.meta();
			const tag = meta?.tag as string;
			const text = c.text();
			mo = mo + '{@' + meta_str(tag);
			let ao = mo.length;
			if (text) {
				ao += 1;
				tr_content(c, sink, S_SPACE, text, Code.SVELTE_CONTENT);
			}
			const bc = mo.length;
			_spans(
				sink,
				pre,
				ao,
				bc,
				bc + FOLD_LEN[S_BRACE_CLOSE],
				c,
				Preset.SVELTE
			);
			return S_BRACE_CLOSE;
		}

		default:
			return mp_children(c, sink, p);
	}
}

function mp_code_fence(c: Cursor, sink: MapSink, p: number): number {
	const pre = mo.length + FOLD_LEN[p];
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
		if (p !== 0) mo += FOLD_STR[p];
		mo += '<pre><code class="language-' + escape_html(info);
		p = tr_open(c, 0, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = tr_open(c, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	const ao = mo.length + FOLD_LEN[p];
	tr_content(c, sink, p, escape_node_text(c), Code.CODE_CONTENT);
	const bc = mo.length;
	_spans(sink, pre, ao, bc, bc + FOLD_LEN[S_PRE_CODE_CLOSE], c, Preset.CODE);
	return S_PRE_CODE_CLOSE;
}

/** the render_node html case with children folded */
function mp_html(c: Cursor, sink: MapSink, p: number): number {
	if (p !== 0) mo += FOLD_STR[p];
	const pre = mo.length;
	const meta = c.meta();
	const tag = meta?.tag as string;
	// source passthrough and reconstruction exactly as render_node
	const self_closing = !!meta?.self_closing;
	const passthrough =
		self_closing && c.end > c.start ? c.slice(c.start, c.end) : '';
	if (passthrough) {
		mo += passthrough;
	} else {
		let s = '<' + meta_str(tag);
		const html_attrs = meta?.attributes as
			| Record<string, string | boolean>
			| undefined;
		if (html_attrs) {
			for (const k in html_attrs) {
				const v = html_attrs[k];
				if (v === true) {
					s += ' ' + k;
				} else if (typeof v === 'object' && (v as any).type === 'expression') {
					s += ' ' + k + '={' + meta_str((v as any).value) + '}';
				} else {
					s += ' ' + k + '="' + escape_html(v as string) + '"';
				}
			}
		}
		mo += s;
		if (self_closing) {
			put_record(
				sink,
				pre,
				mo.length + FOLD_LEN[S_SELF_CLOSE],
				c.start,
				c.end,
				c.index,
				Code.SVELTE_CONTENT
			);
			return S_SELF_CLOSE;
		}
	}
	if (self_closing) {
		put_record(
			sink,
			pre,
			mo.length,
			c.start,
			c.end,
			c.index,
			Code.SVELTE_CONTENT
		);
		return 0;
	}
	const ao = mo.length + FOLD_LEN[S_GT];
	if (tag === 'script' || tag === 'style') {
		tr_content(c, sink, S_GT, c.text(), Code.SVELTE_CONTENT);
	} else {
		const q = mp_children(c, sink, S_GT);
		if (q !== 0) mo += FOLD_STR[q];
	}
	const bc = mo.length;
	mo = mo + '</' + meta_str(tag);
	_spans(sink, pre, ao, bc, mo.length + FOLD_LEN[S_GT], c, Preset.TEXT);
	return S_GT;
}

/** the render_node svelte block case with branch children folded */
function mp_svelte_block(c: Cursor, sink: MapSink, p: number): number {
	if (p !== 0) mo += FOLD_STR[p];
	p = 0;
	const pre = mo.length;
	// render branches; each branch handles its own opening tag
	const block_meta = c.meta();
	const block_tag = meta_str(block_meta?.tag);
	if (c.goto_first_child()) {
		let is_first = true;
		do {
			if (c.kind === K.SVELTE_BRANCH) {
				const branch_expr = c.text();
				if (p !== 0) mo += FOLD_STR[p];
				if (is_first) {
					mo = mo + '{#' + block_tag;
					is_first = false;
				} else {
					mo = mo + '{:' + meta_str(c.meta()?.tag);
				}
				if (branch_expr) {
					mo += ' ';
					put_record(
						sink,
						mo.length,
						mo.length + branch_expr.length,
						c.value_start,
						c.value_end,
						c.index,
						Code.SVELTE_CONTENT
					);
					mo += branch_expr;
				}
				p = mp_children(c, sink, S_BRACE_CLOSE_LF);
			} else if (c.kind !== K.LINE_BREAK) {
				p = mp_node(c, sink, p);
			}
		} while (c.goto_next_sibling());
		c.goto_parent();
	}
	if (p !== 0) mo += FOLD_STR[p];
	mo = mo + '{/' + block_tag;
	// node span for the whole block, use the block node (goto_parent already called)
	put_record(
		sink,
		pre,
		mo.length + FOLD_LEN[S_BRACE_CLOSE],
		c.start,
		c.end,
		c.index,
		Code.SVELTE_NODE
	);
	return S_BRACE_CLOSE;
}

function mp_table_content(c: Cursor, sink: MapSink, p: number): number {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let in_body = false;

	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_HEADER) {
			p = tr_push(p, S_THEAD_OPEN);
			p = mp_table_cells(c, sink, TH_OPEN_ID, S_TH_CLOSE, 'th', alignments, p);
			p = tr_push(p, S_THEAD_CLOSE);
		} else if (c.kind === K.TABLE_ROW) {
			if (!in_body) {
				p = tr_push(p, S_TBODY_OPEN);
				in_body = true;
			}
			p = tr_push(p, S_TR_OPEN);
			p = mp_table_cells(c, sink, TD_OPEN_ID, S_TD_CLOSE, 'td', alignments, p);
			p = tr_push(p, S_TR_CLOSE);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) p = tr_push(p, S_TBODY_CLOSE);
	return p;
}

function mp_table_cells(
	c: Cursor,
	sink: MapSink,
	opens: Uint8Array,
	close: number,
	tag: string,
	alignments: string[],
	p: number
): number {
	let col = 0;
	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_CELL) {
			const align = alignments[col];
			// the parser only emits these four values, others are built at runtime
			if (align === 'left') p = tr_push(p, opens[1]);
			else if (align === 'center') p = tr_push(p, opens[2]);
			else if (align === 'right') p = tr_push(p, opens[3]);
			else if (align && align !== 'none') {
				if (p !== 0) mo += FOLD_STR[p];
				mo += `<${tag} align="${align}">`;
				p = 0;
			} else p = tr_push(p, opens[0]);
			p = mp_children(c, sink, p);
			p = tr_push(p, close);
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
}

/** flat so the caller never pays for a rope */
function render_folded(c: Cursor): string {
	fold_out = '';
	const p = fold_node(c, 0);
	let html = fold_out;
	fold_out = '';
	if (p !== 0) html += FOLD_STR[p];
	if (html.length !== 0) flat_sink[0] = html.charCodeAt(0);
	return html;
}

//  mapping resolution

// shared by every render, resolution is synchronous so one table is enough
let offsets_scratch = new Uint32Array(0);

/** generated offset of each out chunk, plus the end offset */
function out_offsets(out: string[], scratch?: Uint32Array): Uint32Array {
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
		// out mixes string representations so a plain length load is megamorphic,
		// the concat lets turbofan read the length directly
		offsets[i + 1] = offsets[i] + (out[i] + '').length;
	}
	return offsets;
}

/** a sink filled by out chunk index, as a sink of generated offsets */
function by_offset(sink: MapSink, out: string[]): MapSink {
	const copy = new MapSink();
	copy.syntax = sink.syntax;
	copy.rec = records_by_offset(sink.rec, sink.n, out_offsets(out));
	copy.n = sink.n;
	return copy;
}

/** a short record run is copied by hand since a subarray view costs more */
function capture_trace(sink: MapSink): MapTrace {
	const n = sink.n;
	const trace = reserve_trace(n, 0);
	const buf = trace.buf;
	const start = trace.start;
	const rec = sink.rec;
	if (n > 64) buf.set(rec.subarray(0, n), start);
	else for (let i = 0; i < n; i++) buf[start + i] = rec[i];
	return trace;
}

function resolve_mappings(sink: MapSink): Mapping<MappingData>[] {
	return record_mappings(sink.rec, sink.n);
}

/** collapsed \r\n before a normalized offset */
function rank_of(collapsed: readonly number[], offset: number): number {
	let lo = 0;
	let hi = collapsed.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (collapsed[mid] < offset) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * resolve_mappings with source offsets moved onto raw, collapsed holds the
 * normalized offset of each \n that was \r\n, an identity piece splits after
 * each collapsed \n so it stays identity with that \n on its \r, any other
 * piece widens its source length over the \r
 */
function resolve_raw_mappings(
	sink: MapSink,
	collapsed: readonly number[]
): Mapping<MappingData>[] {
	const rec = sink.rec;
	const n = sink.n;
	const count = collapsed.length;
	const mappings: Mapping<MappingData>[] = [];
	const data_of = record_data;
	for (let p = 0; p < n; p += Rec.SIZE) {
		const source_length = rec[p + 3];
		const gen_offset = rec[p];
		const gen_length = rec[p + 1];
		let start = rec[p + 2];
		const end = start + source_length;
		const identity = gen_length === source_length;
		let k = rank_of(collapsed, start);
		const code = rec[p + 5];
		const node_index = rec[p + 4] | 0;
		// one class for every mapping so readers stay monomorphic, only a piece
		// split around \r\n or whose widened length meets its generated length
		// keeps arrays
		if (identity) {
			if (k < count && collapsed[k] + 1 < end) {
				const src_offsets: number[] = [];
				const gen_offsets: number[] = [];
				const lengths: number[] = [];
				let gen_start = gen_offset;
				while (k < count && collapsed[k] + 1 < end) {
					const cut = collapsed[k] + 1;
					src_offsets.push(start + k);
					gen_offsets.push(gen_start);
					lengths.push(cut - start);
					gen_start += cut - start;
					start = cut;
					k++;
				}
				src_offsets.push(start + k);
				gen_offsets.push(gen_start);
				lengths.push(end - start);
				const m: Mapping<MappingData> = {
					sourceOffsets: src_offsets,
					generatedOffsets: gen_offsets,
					lengths,
					data: data_of(code, node_index),
				};
				mappings.push(new RecordMapping(0, 0, 0, 0, code, node_index, m));
			} else {
				mappings.push(
					new RecordMapping(
						start + k,
						gen_offset,
						source_length,
						source_length,
						code,
						node_index,
						null
					)
				);
			}
			continue;
		}
		let length = source_length;
		if (k < count && collapsed[k] < end) {
			length = end + rank_of(collapsed, end) - start - k;
		}
		if (length !== gen_length) {
			mappings.push(
				new RecordMapping(
					start + k,
					gen_offset,
					length,
					gen_length,
					code,
					node_index,
					null
				)
			);
		} else {
			const m: Mapping<MappingData> = {
				sourceOffsets: [start + k],
				generatedOffsets: [gen_offset],
				lengths: [length],
				data: data_of(code, node_index),
				generatedLengths: [gen_length],
			};
			mappings.push(new RecordMapping(0, 0, 0, 0, code, node_index, m));
		}
	}
	return mappings;
}

// exported functions are module cells too, so the walk calls the locals
export const escape = escape_html;
export const escape_text = escape_node_text;
export const _emit = emit_record;
export const _children = render_children;
export const _node = render_node;
export const _out_offsets = out_offsets;

/** @internal the trace of a sink filled by out chunk index */
export function _capture_trace(sink: MapSink, out: string[]): MapTrace {
	return capture_trace(by_offset(sink, out));
}

/** @internal the mappings of a sink filled by out chunk index */
export function _resolve_mappings(
	out: string[],
	sink: MapSink
): Mapping<MappingData>[] {
	return resolve_mappings(by_offset(sink, out));
}

// mapped renders resolve their records before they return, so every
// renderer shares one sink
const render_sink = new MapSink();

//  internal helpers

/** render the node at the current cursor position to html string. */
function _render_block(cursor: Cursor): string {
	return render_folded(cursor);
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
 * incremental html renderer using the cursor over node buffers
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
	/** unused, always empty */
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
			prebuilt_begin(buf);
			try {
				this.html = render_folded(c);
			} finally {
				esc_prebuilt = true;
				esc_bits = null;
			}
			return this.blocks;
		}

		// cached block-level rendering
		if (!c.goto_first_child()) return this.blocks;

		let block_idx = 0;
		do {
			if (c.kind === K.LINE_BREAK) continue;

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

	/** trace renders with no syntax records, see tr_node */
	private render_mapped(
		buf: NodeBuffer,
		source: string,
		sink: MapSink,
		trace: boolean
	): void {
		if (!this.cursor) {
			this.cursor = new Cursor(buf, source);
		} else {
			this.cursor.reinit(buf, source);
		}
		const c = this.cursor;
		c.reset();
		esc_reset(source);

		mo = '';
		prebuilt_begin(buf);
		let p = 0;
		try {
			if (trace) p = tr_node(c, sink, 0);
			else p = mp_node(c, sink, 0);
		} finally {
			esc_prebuilt = true;
			esc_bits = null;
		}
		// the module string would keep the document alive
		let html = mo;
		mo = '';
		if (p !== 0) html += FOLD_STR[p];
		// flat, so every later read of the html pays no rope walk
		if (html.length !== 0) flat_sink[0] = html.charCodeAt(0);
		this.html = html;
	}

	/**
	 * render with source mapping. always full render (no caching).
	 * collapsed moves the source offsets onto raw
	 */
	update_mapped(
		buf: NodeBuffer,
		source: string,
		collapsed?: readonly number[] | null
	): { blocks: CursorBlockEntry[]; mappings: Mapping<MappingData>[] } {
		const sink = render_sink;
		sink.begin(true);
		this.render_mapped(buf, source, sink, false);
		const mappings =
			collapsed == null || collapsed.length === 0
				? resolve_mappings(sink)
				: resolve_raw_mappings(sink, collapsed);
		sink.release();
		return { blocks: this.blocks, mappings };
	}

	/**
	 * equals mappings_to_v3 over update_mapped when raw normalizes to source
	 * without collapsing any crlf, but builds no Mapping objects
	 */
	update_v3(
		buf: NodeBuffer,
		source: string,
		raw: string,
		file?: string
	): SourceMapV3 {
		const sink = render_sink;
		sink.begin(false);
		this.render_mapped(buf, source, sink, true);
		const map = records_to_v3(sink, null, raw, this.html, file);
		sink.release();
		return map;
	}

	/** trace_to_v3 over the trace with the same arguments equals update_v3 */
	update_trace(buf: NodeBuffer, source: string): MapTrace {
		const sink = render_sink;
		sink.begin(false);
		this.render_mapped(buf, source, sink, true);
		const trace = capture_trace(sink);
		sink.release();
		return trace;
	}

	reset(): void {
		this.blocks.length = 0;
		this.closed?.clear();
		this.html = '';
	}

	/** drop every reference to the last render so a kept renderer holds no document */
	release(): void {
		// length stores and clear are runtime calls even when empty
		this.html = '';
		if (this.blocks.length !== 0) this.blocks.length = 0;
		const closed = this.closed;
		if (closed !== null && closed.size !== 0) closed.clear();
		this.cursor?.release();
		// the escape index is module state and would keep the source alive
		esc_reset('');
	}
}

// declared last so no module binding the walk reads moves to a higher slot

/** @internal starts a mapped render that _node appends to html, record offsets index the result */
export function _mapped_begin(
	buf: NodeBuffer,
	source: string,
	html: string
): void {
	esc_reset(source);
	prebuilt_begin(buf);
	mo = html;
}

/** @internal ends the mapped render started by _mapped_begin and returns its html */
export function _mapped_end(): string {
	esc_prebuilt = true;
	esc_bits = null;
	const html = mo;
	mo = '';
	return html;
}

/** @internal the mappings of a sink whose records hold html offsets */
export function _resolve_offset_mappings(
	sink: MapSink
): Mapping<MappingData>[] {
	return resolve_mappings(sink);
}
