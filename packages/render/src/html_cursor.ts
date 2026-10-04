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
import {
	records_by_offset,
	reserve_trace,
	trace_of_records,
	trace_records_to_v3,
	trace_free_at,
	trace_room,
	trace_take,
} from './sourcemap';
import type { MapTrace, SourceMapV3 } from './sourcemap';
import { ComponentScope, component_imports } from './scope';
import type { ComponentImport, ReplaceWarning } from './scope';
import { is_entity_name } from './entities';

export type { Mapping, CodeInformation, MappingData } from './mappings';
export { MapSink } from './mappings';
export { ComponentScope, component_imports } from './scope';
export type {
	ComponentImport,
	ComponentSource,
	DefaultImport,
	ReplaceWarning,
} from './scope';

/**
 * a fence the highlighter rendered, every string is markup svelte reads as
 * static text, braces in it are entities
 */
export interface HighlightedBlock {
	/** markup ahead of the <pre>, a figure and its title, a pre replacement drops it */
	before: string;
	/** the attribute text of the <pre> open tag, null when body is the whole block */
	attributes: string | null;
	/** what the <pre> holds */
	body: string;
	/** markup after the </pre>, a pre replacement drops it */
	after: string;
	/** the props a pre replacement takes ahead of code, title, caption and meta props */
	props: string;
	/** the text a reader sees, the code prop of a pre replacement */
	code: string;
	/**
	 * a template literal holding code with its live expressions interpolated,
	 * the code prop in place of code, null when the block has none
	 */
	code_template: string | null;
	/**
	 * the live expressions svelte reads in body, triples of their offset in
	 * body, their offset in the fence text and their length, null for none
	 */
	live: number[] | null;
	/** the messages of meta props a pre replacement drops */
	dropped: string[] | null;
}

/** a code span the highlighter rendered, braces in it are entities */
export interface HighlightedCode {
	/** the attribute text of the <code> open tag, null when body is the whole span */
	attributes: string | null;
	body: string;
}

export type HighlightWarningCode =
	| 'code_replacement_skipped'
	| 'meta_prop_ignored';

/** highlights the code of one render, start is the offset of the node in the source */
export interface CodeHighlighter {
	/** null renders the fence plain */
	block(
		code: string,
		lang: string,
		meta: string,
		start: number
	): HighlightedBlock | null;
	/** a code span with a #! hint, null renders it plain */
	inline(code: string, lang: string, start: number): HighlightedCode | null;
	warn(code: HighlightWarningCode, message: string, start: number): void;
}

/** reads the fence meta conventions for a pre replacement the highlighter left plain */
export interface PreMeta {
	/**
	 * the title, caption and meta props of a pre replacement as props text,
	 * it warns about the meta props it drops, start is the offset of the fence
	 */
	pre_props(meta: string, start: number): string;
}

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

/** the end of the character reference whose & is at m, or -1 */
function reference_end(s: string, m: number, end: number): number {
	let i = m + 1;
	if (i >= end) return -1;
	let ch = s.charCodeAt(i);
	if (ch === 35) {
		// a numeric reference, decimal or hex
		i++;
		let max = 7;
		let hex = false;
		if (i < end && (s.charCodeAt(i) | 32) === 120) {
			i++;
			max = 6;
			hex = true;
		}
		const digits = i;
		while (i < end && i - digits < max) {
			ch = s.charCodeAt(i);
			if (ch >= 48 && ch <= 57) i++;
			else if (hex && (ch | 32) >= 97 && (ch | 32) <= 102) i++;
			else break;
		}
		if (i === digits || i >= end || s.charCodeAt(i) !== 59) return -1;
		return i + 1;
	}
	// a named reference, the longest html5 name has 31 characters
	const name = i;
	while (i < end && i - name < 32) {
		ch = s.charCodeAt(i);
		if (
			((ch | 32) >= 97 && (ch | 32) <= 122) ||
			(i > name && ch >= 48 && ch <= 57)
		)
			i++;
		else break;
	}
	if (i - name < 2 || i >= end || s.charCodeAt(i) !== 59) return -1;
	return is_entity_name(s.slice(name, i)) ? i + 1 : -1;
}

/** escape_html that keeps character references, as text and link attributes have them */
function escape_text_html(text: string): string {
	if (!ESCAPE_TEST.test(text)) return text;
	let out = '';
	let pos = 0;
	const len = text.length;
	for (let i = 0; i < len; i++) {
		const ch = text.charCodeAt(i);
		let rep: string;
		if (ch === 38) {
			if (reference_end(text, i, len) !== -1) continue;
			rep = '&amp;';
		} else if (ch === 60) rep = '&lt;';
		else if (ch === 62) rep = '&gt;';
		else if (ch === 34) rep = '&quot;';
		else continue;
		out += text.slice(pos, i) + rep;
		pos = i + 1;
	}
	return pos === 0 ? text : out + text.slice(pos);
}

// code shows braces as text, svelte would read them as expressions
const CODE_TEST = /[&<>"{}]/;
const CODE_MATCH = /[&<>"{}]/g;
const CODE_TABLE: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	'{': '&#123;',
	'}': '&#125;',
};
function code_replace(ch: string): string {
	return CODE_TABLE[ch];
}
function escape_code(text: string): string {
	if (!CODE_TEST.test(text)) return text;
	return text.replace(CODE_MATCH, code_replace);
}

const BRACE_TEST = /[{}]/;
const BRACE_MATCH = /[{}]/g;

/** an info string is an attribute, braces as code has them */
function escape_info(info: string): string {
	if (!CODE_TEST.test(info)) return info;
	const s = escape_html(info);
	if (!BRACE_TEST.test(s)) return s;
	return s.replace(BRACE_MATCH, code_replace);
}

const QUOTE_MATCH = /"/g;

// a typed value is its source slice with entities as written, so only a
// quote needs escaping, a plugin node never closes and gets the full escape
function escape_attr(v: string, typed: boolean): string {
	if (!typed) return escape_html(v);
	if (string_index_of.call(v, '"') === -1) return v;
	return v.replace(QUOTE_MATCH, '&quot;');
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
// only code reads the brace pointers, so prose never scans for braces
let esc_lbrace = -1;
let esc_rbrace = -1;
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
	esc_lbrace = -1;
	esc_rbrace = -1;
}

function esc_next(ch: string, from: number): number {
	const i = esc_src.indexOf(ch, from);
	return i === -1 ? esc_len : i;
}

/**
 * equals escape_text_html of c.text, reading source slices through the escape
 * index, apart from an & a backslash escaped, which the slice no longer shows
 */
function escape_node_text(c: Cursor): string {
	return escape_text_at(c, c.index, c.value_start, c.value_end, false);
}

function bq_depth(n: Uint32Array, i: number): number {
	let depth = 0;
	for (
		let p = n[i * W.stride + W.parent];
		p !== Slot.NONE;
		p = n[p * W.stride + W.parent]
	)
		if ((n[p * W.stride] & 0xff) === K.BLOCK_QUOTE) depth++;
	return depth;
}

/** each value line keeps its quote markers, skipped as skip_bq_markers does */
function strip_bq(text: string, depth: number): string {
	const len = text.length;
	let out = '';
	let pos = 0;
	for (;;) {
		let mark = pos;
		for (let i = 0; i < depth; i++) {
			while (
				pos < len &&
				(text.charCodeAt(pos) === 32 || text.charCodeAt(pos) === 9)
			)
				pos++;
			if (pos >= len || text.charCodeAt(pos) !== 62) {
				// not a marker, keep the indent
				pos = mark;
				break;
			}
			pos++;
			if (pos < len && text.charCodeAt(pos) === 32) pos++;
			mark = pos;
		}
		let eol = pos;
		while (eol < len) {
			const ch = text.charCodeAt(eol);
			if (ch === 10) break;
			if (ch === 13) {
				if (eol + 1 < len && text.charCodeAt(eol + 1) === 10) eol++;
				break;
			}
			eol++;
		}
		if (eol >= len) return out + text.slice(pos);
		out += text.slice(pos, eol + 1);
		pos = eol + 1;
	}
}

function fence_text(c: Cursor): string {
	const depth = bq_depth(c.words, c.index);
	return depth === 0 ? c.text() : strip_bq(c.text(), depth);
}

/** equals escape_code of fence_text */
function escape_fence_text(c: Cursor): string {
	const depth = bq_depth(c.words, c.index);
	if (depth === 0) return escape_code_text(c);
	return escape_code(strip_bq(c.text(), depth));
}

/** equals escape_code of c.text, reading source slices through the escape index */
function escape_code_text(c: Cursor): string {
	return escape_text_at(c, c.index, c.value_start, c.value_end, true);
}

/** m is the first of & < > " at or after vs */
function escape_code_slice(
	src: string,
	vs: number,
	ve: number,
	m: number
): string {
	if (esc_lbrace < vs) esc_lbrace = esc_next('{', vs);
	if (esc_rbrace < vs) esc_rbrace = esc_next('}', vs);
	if (esc_lbrace < m) m = esc_lbrace;
	if (esc_rbrace < m) m = esc_rbrace;
	if (m >= ve) return src.slice(vs, ve);
	return escape_code_hits(src, vs, ve, m);
}

/** escape_hits for code, m is the first escapable char at or after vs */
function escape_code_hits(
	src: string,
	vs: number,
	ve: number,
	m: number
): string {
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
		} else if (ch === 34) {
			text += '&quot;';
			esc_quot = esc_next('"', m + 1);
		} else if (ch === 123) {
			text += '&#123;';
			esc_lbrace = esc_next('{', m + 1);
		} else {
			text += '&#125;';
			esc_rbrace = esc_next('}', m + 1);
		}
		pos = m + 1;
		m = esc_amp;
		if (esc_lt < m) m = esc_lt;
		if (esc_gt < m) m = esc_gt;
		if (esc_quot < m) m = esc_quot;
		if (esc_lbrace < m) m = esc_lbrace;
		if (esc_rbrace < m) m = esc_rbrace;
	}
	// every pointer is now at or past ve
	esc_lo = ve;
	return text + src.slice(pos, ve);
}

/** escape_node_text of node i, or escape_code_text for code, the cursor may sit elsewhere */
function escape_text_at(
	c: Cursor,
	i: number,
	vs: number,
	ve: number,
	code: boolean
): string {
	if (esc_prebuilt) {
		const bits = esc_bits;
		if (bits === null || (bits[i >>> 3] & (1 << (i & 7))) !== 0) {
			const s = c.prebuilt_at(i);
			if (s !== undefined) return code ? escape_code(s) : escape_text_html(s);
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
	if (code) return escape_code_slice(src, vs, ve, m);
	if (m >= ve) return src.slice(vs, ve);
	return escape_hits(src, vs, ve, m);
}

/** a reference in text stays as written, unless a backslash escaped its & */
function text_reference(
	src: string,
	vs: number,
	ve: number,
	m: number
): boolean {
	// an escape opens its text node at the escaped char
	if (m === vs && m > 0 && src.charCodeAt(m - 1) === 92) return false;
	return reference_end(src, m, ve) !== -1;
}

/** m is the first escapable char at or after vs */
function escape_hits(src: string, vs: number, ve: number, m: number): string {
	let text = '';
	let pos = vs;
	while (m < ve) {
		const ch = src.charCodeAt(m);
		text += src.slice(pos, m);
		pos = m + 1;
		if (ch === 38) {
			esc_amp = esc_next('&', m + 1);
			if (text_reference(src, vs, ve, m)) pos = m;
			else text += '&amp;';
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
	DIRECTIVE_INLINE = 30,
	DIRECTIVE_LEAF = 31,
	DIRECTIVE_CONTAINER = 32,
	FRONTMATTER = 33,
	IMPORT_STATEMENT = 34,
	DIRECTIVE_LABEL = 35,
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
export const K_DIRECTIVE_INLINE = K.DIRECTIVE_INLINE;
export const K_DIRECTIVE_LEAF = K.DIRECTIVE_LEAF;
export const K_DIRECTIVE_CONTAINER = K.DIRECTIVE_CONTAINER;
export const K_FRONTMATTER = K.FRONTMATTER;
export const K_IMPORT_STATEMENT = K.IMPORT_STATEMENT;
export const K_DIRECTIVE_LABEL = K.DIRECTIVE_LABEL;

export const NONE = Slot.NONE;

//  pending mapping records

// must match RECORD_SIZE and Preset in mappings, local for the same reason as K
const enum Rec {
	SIZE = 6,
}

// mirrors sourcemap.ts
const enum Trace {
	SIZE = 3,
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
	const s = c.start;
	const vs = c.value_start,
		ve = c.value_end;
	// value range is meaningful when ve > vs (same check as Cursor.text()).
	// Uint32Array defaults to 0 for unset slots, so ve !== NONE is not enough.
	const has_value = ve > vs;
	const e = c.end;
	const close_start = has_value ? ve : e;
	if (s === Slot.NONE || close_start === Slot.NONE || !sink.syntax) {
		_spans_some(sink, pre, after_open, before_close, post, c, preset);
		return;
	}
	const idx = c.index;
	const open_end = has_value ? vs : s;
	let rec = sink.rec;
	const p = sink.n;
	if (p + 3 * Rec.SIZE > rec.length) rec = sink.grow();
	rec[p] = pre;
	rec[p + 1] = post - pre;
	rec[p + 2] = s;
	rec[p + 3] = e > s ? e - s : 0;
	rec[p + 4] = idx;
	rec[p + 5] = preset << 2;
	rec[p + 6] = pre;
	rec[p + 7] = after_open - pre;
	rec[p + 8] = s;
	rec[p + 9] = open_end > s ? open_end - s : 0;
	rec[p + 10] = idx;
	rec[p + 11] = Code.STRUCTURE_OPEN;
	rec[p + 12] = before_close;
	rec[p + 13] = post - before_close;
	rec[p + 14] = close_start;
	rec[p + 15] = e > close_start ? e - close_start : 0;
	rec[p + 16] = idx;
	rec[p + 17] = Code.STRUCTURE_CLOSE;
	sink.n = p + 3 * Rec.SIZE;
}

/** _spans when a record is dropped or syntax is off */
function _spans_some(
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

// a shorthand the parser keys by its braced text, which is a name when it starts as one
const NAME_START = /^[A-Za-z_$]/;

/** true for a typed attribute that is only braces, a spread or an attachment */
function bare_expr(k: string, v: unknown): boolean {
	return (
		typeof v === 'object' &&
		v !== null &&
		(v as any).value === k &&
		!NAME_START.test(k)
	);
}

/** an expression attribute, a bare one keeps only its braces */
function expr_attr(k: string, value: string): string {
	return value === k && !NAME_START.test(k)
		? ' {' + k + '}'
		: ' ' + k + '={' + value + '}';
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
	meta = 11,
	stride = 12,
}

//  element replacement state

// which walk renders a replacement, set by comp_begin
const enum CM {
	FOLD = 0,
	TRACE = 1,
	MAPPED = 2,
}

/** false unless the document uses a replacement, every walk checks it once per node */
let has_components = false;
/** true when the document replaces a table part, which the table walks check */
let comp_table = false;
let comp_scope: ComponentScope | null = null;
/** directive replacements, a namespace apart from the elements of comp_scope */
let dir_scope: ComponentScope | null = null;
/** a directive no scope replaces throws, otherwise it renders as its children */
let dir_strict = false;
let comp_mode: number = CM.FOLD;
/** component_mode all, typed lowercase elements are replaced too */
let comp_all = false;
/** elements comp_scan kept for a directive, comp_begin hands them out */
const comp_warnings: ReplaceWarning[] = [];
const NO_WARNINGS: readonly ReplaceWarning[] = Object.freeze([]);
/** what the last comp_begin handed out */
let comp_last = NO_WARNINGS;
/** import lines of the used replacements, they join the instance script */
let comp_lines = '';
/** a script of comp_lines when the document has no script and no import to start one */
let comp_prefix = '';
/** used replacements in first use order */
const comp_used: ComponentImport[] = [];
const comp_seen = new Set<ComponentImport>();

//  top level scripts

// set by hoist_begin before a document render, hoist_reset for a render of parts

/** the instance script the import statements go into, -1 when there is none */
let hoist_script = -1;
/** the first import statement, it renders a script of every import when there is no instance script */
let hoist_at = -1;
/** import statement indices in document order */
const hoist_nodes: number[] = [];
/** code the module script starts with, '' for none */
let module_code = '';
/** the module script the module code goes into, -1 renders a new one in place of the frontmatter */
let hoist_module = -1;

function hoist_reset(): void {
	hoist_script = -1;
	hoist_at = -1;
	if (hoist_nodes.length !== 0) hoist_nodes.length = 0;
}

/**
 * find the import statements and, when there are some or replacements need
 * importing, the instance script
 */
function hoist_begin(buf: NodeBuffer): void {
	hoist_reset();
	const n = buf._n;
	let child = n[W.first_child];
	// imports come first, after any frontmatter and blank lines
	while (child !== Slot.NONE) {
		const b = child * W.stride;
		if (n[b + W.parent] !== 0) break;
		const kind = n[b] & 0xff;
		if (kind === K.IMPORT_STATEMENT) hoist_nodes.push(child);
		else if (kind !== K.LINE_BREAK && kind !== K.FRONTMATTER) break;
		child = n[b + W.next];
	}
	if (hoist_nodes.length === 0 && !has_components) return;
	while (child !== Slot.NONE) {
		const b = child * W.stride;
		if (n[b + W.parent] !== 0) break;
		if ((n[b] & 0xff) === K.HTML) {
			const slot = n[b + W.meta];
			const meta = slot === 0 ? undefined : buf._meta[slot - 1];
			if (
				meta !== undefined &&
				meta.tag === 'script' &&
				!meta.self_closing &&
				!is_other_script(meta.attributes as Record<string, unknown> | undefined)
			) {
				hoist_script = child;
				return;
			}
		}
		child = n[b + W.next];
	}
	if (hoist_nodes.length !== 0) hoist_at = hoist_nodes[0];
	// no script and no import to start one, the render starts with one
	else comp_prefix = '<script>\n' + comp_lines + '</script>';
}

/** the import statements, returns the root child after them */
function hoist_imports(buf: NodeBuffer): number {
	hoist_reset();
	const n = buf._n;
	let child = n[W.first_child];
	// imports come first, after any frontmatter and blank lines
	while (child !== Slot.NONE) {
		const b = child * W.stride;
		if (n[b + W.parent] !== 0) break;
		const kind = n[b] & 0xff;
		if (kind === K.IMPORT_STATEMENT) hoist_nodes.push(child);
		else if (kind !== K.LINE_BREAK && kind !== K.FRONTMATTER) break;
		child = n[b + W.next];
	}
	return child;
}

/** the instance script from child on, or the first import that starts one */
function hoist_script_from(buf: NodeBuffer, child: number): void {
	const n = buf._n;
	while (child !== Slot.NONE) {
		const b = child * W.stride;
		if (n[b + W.parent] !== 0) break;
		if ((n[b] & 0xff) === K.HTML) {
			const slot = n[b + W.meta];
			const meta = slot === 0 ? undefined : buf._meta[slot - 1];
			if (
				meta !== undefined &&
				meta.tag === 'script' &&
				!meta.self_closing &&
				!is_other_script(meta.attributes as Record<string, unknown> | undefined)
			) {
				hoist_script = child;
				return;
			}
		}
		child = n[b + W.next];
	}
	if (hoist_nodes.length !== 0) hoist_at = hoist_nodes[0];
}

/**
 * hoist_begin for a wrapped render, the instance script starts with the
 * replacement imports, the template import and the props it forwards
 */
function wrap_hoist_begin(c: Cursor, buf: NodeBuffer): void {
	hoist_script_from(buf, hoist_imports(buf));
	let props = WRAP_PROPS;
	let declare = true;
	if (hoist_script !== -1) {
		const b = hoist_script * W.stride;
		const n = c.words;
		const body = c.slice(n[b + W.value_start], n[b + W.value_end]);
		// $props() is allowed once, a document that calls it forwards a whole binding
		if (body.indexOf('$props') !== -1 && PROPS_CALL.test(body)) {
			declare = false;
			const named = PROPS_NAME.exec(body);
			props = named === null ? '' : named[1];
		}
	}
	comp_lines = component_imports(comp_used, {
		specifier: wrap_spec,
		local: WRAP_LOCAL,
	});
	if (declare) comp_lines += 'let ' + WRAP_PROPS + ' = $props();\n';
	wrap_open =
		'<' +
		WRAP_LOCAL +
		(wrap_metadata ? ' {...metadata}' : '') +
		(props === '' ? '' : ' {...' + props + '}') +
		'>';
	// no script and no import to start one, the render starts with one
	if (hoist_script === -1 && hoist_at === -1)
		comp_prefix = '<script>\n' + comp_lines + '</script>';
}

/**
 * find the top level module script the module code goes into, a render with
 * module code ends with module_end so a render without any reads no state
 */
function module_begin(buf: NodeBuffer, code: string): void {
	module_code = code;
	const n = buf._n;
	let child = n[W.first_child];
	while (child !== Slot.NONE) {
		const b = child * W.stride;
		if (n[b + W.parent] !== 0) return;
		if ((n[b] & 0xff) === K.HTML) {
			const slot = n[b + W.meta];
			const meta = slot === 0 ? undefined : buf._meta[slot - 1];
			const attrs = meta?.attributes as Record<string, unknown> | undefined;
			if (
				meta !== undefined &&
				meta.tag === 'script' &&
				!meta.self_closing &&
				attrs !== undefined &&
				attrs.src === undefined &&
				(attrs.module !== undefined || attrs.context === 'module')
			) {
				hoist_module = child;
				return;
			}
		}
		child = n[b + W.next];
	}
}

function module_end(): void {
	module_code = '';
	hoist_module = -1;
}

/** the module script with the module code, for a document with none */
function module_script(): string {
	if (hoist_module !== -1) return '';
	return '<script module>\n' + module_code + '\n</script>';
}

/** a module script or an external one, not the instance script */
function is_other_script(attrs: Record<string, unknown> | undefined): boolean {
	return (
		attrs !== undefined &&
		(attrs.src !== undefined ||
			attrs.module !== undefined ||
			attrs.context === 'module')
	);
}

/**
 * a top level script with a src and no body, svelte would read it as the
 * component script, a browser ignores the body of an external script
 */
function is_embed_script(c: Cursor, tag: string): boolean {
	if (tag !== 'script' || c.parent_kind !== K.ROOT) return false;
	const attrs = c.meta()!.attributes as Record<string, unknown> | undefined;
	return (
		attrs !== undefined && attrs.src !== undefined && c.text().trim() === ''
	);
}

/** an external script as a svelte:element, which svelte leaves in the markup */
function embed_html(c: Cursor): string {
	let s = '<svelte:element this={"script"}';
	const attrs = c.meta()!.attributes as Record<string, string | boolean>;
	const typed = c.end !== Slot.NONE;
	for (const k in attrs) {
		const v = attrs[k];
		if (v === true) s += ' ' + k;
		else if (typeof v === 'object' && (v as any).type === 'expression') {
			s += expr_attr(k, meta_str((v as any).value));
		} else s += ' ' + k + '="' + escape_attr(v as string, typed) + '"';
	}
	return s + '></svelte:element>';
}

/** append each import statement as a line, mapped to its source when sink is given */
function mo_imports(
	c: Cursor,
	sink: MapSink | undefined,
	trace: boolean
): void {
	const n = c.words;
	for (let i = 0; i < hoist_nodes.length; i++) {
		const idx = hoist_nodes[i];
		const b = idx * W.stride;
		const vs = n[b + W.value_start];
		const ve = n[b + W.value_end];
		const text = c.prebuilt_at(idx) ?? c.slice(vs, ve);
		if (sink !== undefined) {
			const at = mo.length;
			if (trace) tr_run(sink, at, at + text.length, vs, ve);
			else if (vs !== Slot.NONE && ve > vs)
				put_record(
					sink,
					at,
					at + text.length,
					vs,
					ve,
					idx,
					Code.SVELTE_CONTENT
				);
		}
		mo = mo + text + '\n';
	}
	mo += comp_lines;
}

/** the import statements as script lines */
function import_lines(c: Cursor): string {
	const n = c.words;
	let s = '';
	for (let i = 0; i < hoist_nodes.length; i++) {
		const idx = hoist_nodes[i];
		const b = idx * W.stride;
		s =
			s +
			(c.prebuilt_at(idx) ??
				c.slice(n[b + W.value_start], n[b + W.value_end])) +
			'\n';
	}
	return s + comp_lines;
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
			const t = escape_text_at(c, child, vs, ve, false);
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
			if (hl !== null) {
				const h = hl_span(c);
				if (h !== null) {
					render_hl(c, sink, hl_span_head(c, h), h.body, hl_span_tail(h), null);
					break;
				}
			}
			const pre = mo.length;
			_open(c, '<code', '<code>', '>');
			const ao = mo.length;
			let code = escape_code_text(c);
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
			const info = fence_info(c, c.meta());
			if (hl !== null) {
				const b = hl_block(c, info);
				if (b !== null) {
					render_hl(c, sink, hl_head(c, b), b.body, hl_tail(b), b.live);
					break;
				}
			}
			const pre = mo.length;
			if (info) {
				mo += '<pre><code class="language-' + escape_info(info_lang(info));
				_open(c, '"', '">', '>');
			} else {
				_open(c, '<pre><code', '<pre><code>', '>');
			}
			const ao = mo.length;
			const text = escape_fence_text(c);
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
			if (meta?.href)
				s += ' href="' + escape_text_html(meta.href as string) + '"';
			if (meta?.title)
				s += ' title="' + escape_text_html(meta.title as string) + '"';
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
			if (meta?.src) s += ' src="' + escape_text_html(meta.src as string) + '"';
			s += ' alt="' + escape_text_html(_children_raw(c)) + '"';
			if (meta?.title)
				s += ' title="' + escape_text_html(meta.title as string) + '"';
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
			if (is_embed_script(c, tag)) {
				mo += embed_html(c);
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
				break;
			}

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
					const typed = c.end !== Slot.NONE;
					for (const k in html_attrs) {
						const v = html_attrs[k];
						if (v === true) {
							s += ' ' + k;
						} else if (
							typeof v === 'object' &&
							(v as any).type === 'expression'
						) {
							s += expr_attr(k, meta_str((v as any).value));
						} else {
							s += ' ' + k + '="' + escape_attr(v as string, typed) + '"';
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
					if (c.index === hoist_script) {
						mo += '\n';
						mo_imports(c, sink, false);
					} else if (c.index === hoist_module) {
						mo = mo + '\n' + module_code + '\n';
					}
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

		case K.IMPORT_STATEMENT:
			if (c.index === hoist_at) {
				mo += '<script>\n';
				mo_imports(c, sink, false);
				mo += '</script>';
			}
			break;

		case K.FRONTMATTER:
			if (module_code !== '') mo += module_script();
			break;

		default:
			// a label renders only as the snippet of a replaced directive
			if (c.kind !== K.DIRECTIVE_LABEL) render_children(c, sink);
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
			p = push_dyn(
				p,
				escape_text_at(c, first, n[b + W.value_start], ve, false)
			);
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
	if (has_components) {
		const ref = comp_ref(c);
		if (ref !== null) return comp_node(c, undefined, p, ref);
	}
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
			if (hl !== null) {
				const h = hl_span(c);
				if (h !== null)
					return fold_hl(p, hl_span_head(c, h), h.body, hl_span_tail(h));
			}
			p = fold_open(c, p, S_CODE, S_CODE_OPEN, S_GT);
			const code = escape_code_text(c);
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

		// only a root child renders alone, its parent renders text in fold_children
		case K.TEXT:
			return push_dyn(
				p,
				escape_text_at(c, c.index, c.value_start, c.value_end, false)
			);

		case K.IMPORT_STATEMENT:
			if (c.index !== hoist_at) return p;
			return push_dyn(p, '<script>\n' + import_lines(c) + '</script>');

		case K.FRONTMATTER:
			if (module_code === '') return p;
			return push_dyn(p, module_script());

		default:
			// a label renders only as the snippet of a replaced directive
			if (c.kind === K.DIRECTIVE_LABEL) return p;
			// a replaced directive never gets here, see comp_ref
			if (dir_strict) dir_check(c);
			return fold_children(c, p);
	}
}

function fold_code_fence(c: Cursor, p: number): number {
	const info = fence_info(c, c.meta());
	if (hl !== null) {
		const b = hl_block(c, info);
		if (b !== null) return fold_hl(p, hl_head(c, b), b.body, hl_tail(b));
	}
	if (info) {
		p = push_static(p, S_PRE_CODE_LANG);
		p = push_dyn(p, escape_info(info_lang(info)));
		p = fold_open(c, p, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = fold_open(c, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	p = push_dyn(p, escape_fence_text(c));
	return push_static(p, S_PRE_CODE_CLOSE);
}

function fold_link(c: Cursor, p: number): number {
	const meta = c.meta();
	p = push_static(p, S_A);
	if (meta?.href) {
		p = push_static(p, S_HREF);
		p = push_dyn(p, escape_text_html(meta.href as string));
		p = push_static(p, S_QUOTE);
	}
	if (meta?.title) {
		p = push_static(p, S_TITLE);
		p = push_dyn(p, escape_text_html(meta.title as string));
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
		p = push_dyn(p, escape_text_html(meta.src as string));
		p = push_static(p, S_QUOTE);
	}
	p = push_static(p, S_ALT);
	p = push_dyn(p, escape_text_html(_children_raw(c)));
	p = push_static(p, S_QUOTE);
	if (meta?.title) {
		p = push_static(p, S_TITLE);
		p = push_dyn(p, escape_text_html(meta.title as string));
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
	typed: boolean,
	p: number
): number {
	for (const k in html_attrs) {
		const v = html_attrs[k];
		if (bare_expr(k, v)) {
			p = push_dyn(p, ' {' + k + '}');
			continue;
		}
		p = push_static(p, S_SPACE);
		p = push_dyn(p, k);
		if (v === true) continue;
		if (typeof v === 'object' && (v as any).type === 'expression') {
			p = push_static(p, S_EXPR_EQ);
			p = push_dyn(p, (v as any).value);
			p = push_static(p, S_BRACE_CLOSE);
		} else {
			p = push_static(p, S_ATTR_EQ);
			p = push_dyn(p, escape_attr(v as string, typed));
			p = push_static(p, S_QUOTE);
		}
	}
	return p;
}

function fold_html(c: Cursor, p: number): number {
	const meta = c.meta();
	const tag = meta?.tag as string;
	if (is_embed_script(c, tag)) return push_dyn(p, embed_html(c));
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
		if (html_attrs) p = fold_html_attrs(html_attrs, c.end !== Slot.NONE, p);
		return push_static(p, S_SELF_CLOSE);
	}

	p = push_static(p, S_LT);
	p = push_dyn(p, tag);
	if (html_attrs) p = fold_html_attrs(html_attrs, c.end !== Slot.NONE, p);
	p = push_static(p, S_GT);
	// raw text elements keep their content as the node value range, see _node
	if (tag === 'script' || tag === 'style') {
		if (c.index === hoist_script) p = push_dyn(p, '\n' + import_lines(c));
		else if (c.index === hoist_module)
			p = push_dyn(p, '\n' + module_code + '\n');
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
	if (comp_table) return cm_table(c, undefined, p);
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

// a trace record is generated offset, source offset and identity run length,
// 1 for a point, all the v3 encoding reads of a span

/** the start of a node span */
function tr_point(sink: MapSink, gen: number, src: number): void {
	if (src !== Slot.NONE) {
		let rec = sink.rec;
		const p = sink.n;
		if (p + Trace.SIZE > rec.length) rec = sink.grow();
		rec[p] = gen;
		rec[p + 1] = src;
		rec[p + 2] = 1;
		sink.n = p + Trace.SIZE;
	}
}

/** a content span, a run when it copies the source, empty spans map nothing */
function tr_run(
	sink: MapSink,
	gen_start: number,
	gen_end: number,
	src_start: number,
	src_end: number
): void {
	if (src_start !== Slot.NONE) {
		const src_len = src_end > src_start ? src_end - src_start : 0;
		let len = 1;
		if (gen_end - gen_start === src_len) {
			if (src_len === 0) return;
			len = src_len;
		}
		let rec = sink.rec;
		const p = sink.n;
		if (p + Trace.SIZE > rec.length) rec = sink.grow();
		rec[p] = gen_start;
		rec[p + 1] = src_start;
		rec[p + 2] = len;
		sink.n = p + Trace.SIZE;
	}
}

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
	// most nodes have no meta, _attrs is too large to inline
	const meta = c.meta();
	if (meta === undefined || !has_attrs(meta)) return tr_push(p, folded);
	if (p !== 0) mo += FOLD_STR[p];
	mo = mo + FOLD_STR[head] + _attrs(c);
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

/** tr_content writing a trace record */
function tr_text(c: Cursor, sink: MapSink, p: number, text: string): number {
	if (p !== 0) mo += FOLD_STR[p];
	const at = mo.length;
	tr_run(sink, at, at + text.length, c.value_start, c.value_end);
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
			const t = escape_text_at(c, child, vs, ve, false);
			if (p !== 0) {
				mo += FOLD_STR[p];
				p = 0;
			}
			if (vs !== Slot.NONE && ve > vs) {
				const at = mo.length;
				tr_run(sink, at, at + t.length, vs, ve);
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
	if (has_components) {
		const ref = comp_ref(c);
		if (ref !== null) return comp_node(c, sink, p, ref);
	}
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
			tr_point(sink, pre, c.start);
			return p;
		}

		case K.CODE_SPAN: {
			if (hl !== null) {
				const h = hl_span(c);
				if (h !== null)
					return tr_hl(
						c,
						sink,
						p,
						hl_span_head(c, h),
						h.body,
						hl_span_tail(h),
						null
					);
			}
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, S_CODE, S_CODE_OPEN, S_GT);
			let code = escape_code_text(c);
			if (string_index_of.call(code, '\n') !== -1)
				code = code.replace(/\n/g, ' ');
			tr_text(c, sink, p, code);
			tr_point(sink, pre, c.start);
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
			tr_point(sink, pre, c.start);
			return p;
		}

		case K.THEMATIC_BREAK: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_HR);
			tr_point(sink, pre, c.start);
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
			tr_point(sink, pre, c.start);
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
			if (meta?.href)
				s += ' href="' + escape_text_html(meta.href as string) + '"';
			if (meta?.title)
				s += ' title="' + escape_text_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, LINK_HANDLED);
			p = tr_children(c, sink, S_GT);
			p = tr_push(p, S_A_CLOSE);
			tr_point(sink, pre, c.start);
			return p;
		}

		case K.IMAGE: {
			const pre = mo.length + FOLD_LEN[p];
			if (p !== 0) mo += FOLD_STR[p];
			const meta = c.meta();
			let s = '<img';
			if (meta?.src) s += ' src="' + escape_text_html(meta.src as string) + '"';
			s += ' alt="' + escape_text_html(_children_raw(c)) + '"';
			if (meta?.title)
				s += ' title="' + escape_text_html(meta.title as string) + '"';
			mo = mo + s + _attrs(c, IMAGE_HANDLED);
			// the syntax spans are empty, only the node is recorded
			tr_point(sink, pre, c.start);
			return S_SELF_CLOSE;
		}

		case K.HTML_COMMENT: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_COMMENT_OPEN);
			tr_text(c, sink, p, c.text());
			tr_point(sink, pre, c.start);
			return S_COMMENT_CLOSE;
		}

		case K.MUSTACHE: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_BRACE_OPEN);
			tr_text(c, sink, p, c.text());
			tr_point(sink, pre, c.start);
			return S_BRACE_CLOSE;
		}

		case K.SVELTE_TAG: {
			if (p !== 0) mo += FOLD_STR[p];
			const pre = mo.length;
			const meta = c.meta();
			const tag = meta?.tag as string;
			const text = c.text();
			mo = mo + '{@' + meta_str(tag);
			if (text) tr_text(c, sink, S_SPACE, text);
			tr_point(sink, pre, c.start);
			return S_BRACE_CLOSE;
		}

		case K.IMPORT_STATEMENT:
			if (c.index !== hoist_at) return p;
			if (p !== 0) mo += FOLD_STR[p];
			mo += '<script>\n';
			mo_imports(c, sink, true);
			mo += '</script>';
			return 0;

		default:
			// a label renders only as the snippet of a replaced directive
			if (c.kind === K.DIRECTIVE_LABEL) return p;
			// a replaced directive never gets here, see comp_ref
			if (dir_strict) dir_check(c);
			return tr_children(c, sink, p);
	}
}

function tr_code_fence(c: Cursor, sink: MapSink, p: number): number {
	const info = fence_info(c, c.meta());
	if (hl !== null) {
		const b = hl_block(c, info);
		if (b !== null)
			return tr_hl(c, sink, p, hl_head(c, b), b.body, hl_tail(b), b.live);
	}
	const pre = mo.length + FOLD_LEN[p];
	if (info) {
		if (p !== 0) mo += FOLD_STR[p];
		mo += '<pre><code class="language-' + escape_info(info_lang(info));
		p = tr_open(c, 0, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = tr_open(c, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	tr_text(c, sink, p, escape_fence_text(c));
	tr_point(sink, pre, c.start);
	return S_PRE_CODE_CLOSE;
}

/** the render_node html case with children folded */
function tr_html(c: Cursor, sink: MapSink, p: number): number {
	if (p !== 0) mo += FOLD_STR[p];
	const pre = mo.length;
	const meta = c.meta();
	const tag = meta?.tag as string;
	if (is_embed_script(c, tag)) {
		mo += embed_html(c);
		tr_run(sink, pre, mo.length, c.start, c.end);
		return 0;
	}
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
			const typed = c.end !== Slot.NONE;
			for (const k in html_attrs) {
				const v = html_attrs[k];
				if (v === true) {
					s += ' ' + k;
				} else if (typeof v === 'object' && (v as any).type === 'expression') {
					s += expr_attr(k, meta_str((v as any).value));
				} else {
					s += ' ' + k + '="' + escape_attr(v as string, typed) + '"';
				}
			}
		}
		if (self_closing) {
			mo += s;
			tr_run(sink, pre, mo.length + FOLD_LEN[S_SELF_CLOSE], c.start, c.end);
			return S_SELF_CLOSE;
		}
		mo += s;
	}
	if (self_closing) {
		tr_run(sink, pre, mo.length, c.start, c.end);
		return 0;
	}
	if (tag === 'script' || tag === 'style') {
		if (c.index === hoist_script) {
			mo = mo + FOLD_STR[S_GT] + '\n';
			mo_imports(c, sink, true);
			tr_text(c, sink, 0, c.text());
		} else if (c.index === hoist_module) {
			mo = mo + FOLD_STR[S_GT] + '\n' + module_code + '\n';
			tr_text(c, sink, 0, c.text());
		} else tr_text(c, sink, S_GT, c.text());
	} else {
		const q = tr_children(c, sink, S_GT);
		if (q !== 0) mo += FOLD_STR[q];
	}
	mo = mo + '</' + meta_str(tag);
	tr_point(sink, pre, c.start);
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
					tr_run(
						sink,
						mo.length,
						mo.length + branch_expr.length,
						c.value_start,
						c.value_end
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
	tr_point(sink, pre, c.start);
	return S_BRACE_CLOSE;
}

function tr_table_content(c: Cursor, sink: MapSink, p: number): number {
	if (comp_table) return cm_table(c, sink, p);
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
			const t = escape_text_at(c, child, vs, ve, false);
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
	if (has_components) {
		const ref = comp_ref(c);
		if (ref !== null) return comp_node(c, sink, p, ref);
	}
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
			if (hl !== null) {
				const h = hl_span(c);
				if (h !== null)
					return mp_hl(
						c,
						sink,
						p,
						hl_span_head(c, h),
						h.body,
						hl_span_tail(h),
						null
					);
			}
			const pre = mo.length + FOLD_LEN[p];
			p = tr_open(c, p, S_CODE, S_CODE_OPEN, S_GT);
			const ao = mo.length + FOLD_LEN[p];
			let code = escape_code_text(c);
			if (string_index_of.call(code, '\n') !== -1)
				code = code.replace(/\n/g, ' ');
			tr_content(c, sink, p, code, Code.CODE_CONTENT);
			const bc = mo.length;
			_spans(sink, pre, ao, bc, bc + FOLD_LEN[S_CODE_CLOSE], c, Preset.CODE);
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
			if (meta?.href)
				s += ' href="' + escape_text_html(meta.href as string) + '"';
			if (meta?.title)
				s += ' title="' + escape_text_html(meta.title as string) + '"';
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
			if (meta?.src) s += ' src="' + escape_text_html(meta.src as string) + '"';
			s += ' alt="' + escape_text_html(_children_raw(c)) + '"';
			if (meta?.title)
				s += ' title="' + escape_text_html(meta.title as string) + '"';
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
			_spans(sink, pre, ao, bc, bc + FOLD_LEN[S_COMMENT_CLOSE], c, Preset.TEXT);
			return S_COMMENT_CLOSE;
		}

		case K.MUSTACHE: {
			const pre = mo.length + FOLD_LEN[p];
			p = tr_push(p, S_BRACE_OPEN);
			const ao = mo.length + FOLD_LEN[p];
			tr_content(c, sink, p, c.text(), Code.SVELTE_CONTENT);
			const bc = mo.length;
			_spans(sink, pre, ao, bc, bc + FOLD_LEN[S_BRACE_CLOSE], c, Preset.SVELTE);
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
			_spans(sink, pre, ao, bc, bc + FOLD_LEN[S_BRACE_CLOSE], c, Preset.SVELTE);
			return S_BRACE_CLOSE;
		}

		case K.IMPORT_STATEMENT:
			if (c.index !== hoist_at) return p;
			if (p !== 0) mo += FOLD_STR[p];
			mo += '<script>\n';
			mo_imports(c, sink, false);
			mo += '</script>';
			return 0;

		default:
			// a label renders only as the snippet of a replaced directive
			if (c.kind === K.DIRECTIVE_LABEL) return p;
			// a replaced directive never gets here, see comp_ref
			if (dir_strict) dir_check(c);
			return mp_children(c, sink, p);
	}
}

function mp_code_fence(c: Cursor, sink: MapSink, p: number): number {
	const info = fence_info(c, c.meta());
	if (hl !== null) {
		const b = hl_block(c, info);
		if (b !== null)
			return mp_hl(c, sink, p, hl_head(c, b), b.body, hl_tail(b), b.live);
	}
	const pre = mo.length + FOLD_LEN[p];
	if (info) {
		if (p !== 0) mo += FOLD_STR[p];
		mo += '<pre><code class="language-' + escape_info(info_lang(info));
		p = tr_open(c, 0, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = tr_open(c, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	const ao = mo.length + FOLD_LEN[p];
	tr_content(c, sink, p, escape_fence_text(c), Code.CODE_CONTENT);
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
	if (is_embed_script(c, tag)) {
		mo += embed_html(c);
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
			const typed = c.end !== Slot.NONE;
			for (const k in html_attrs) {
				const v = html_attrs[k];
				if (v === true) {
					s += ' ' + k;
				} else if (typeof v === 'object' && (v as any).type === 'expression') {
					s += expr_attr(k, meta_str((v as any).value));
				} else {
					s += ' ' + k + '="' + escape_attr(v as string, typed) + '"';
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
		if (c.index === hoist_script) {
			mo = mo + FOLD_STR[S_GT] + '\n';
			mo_imports(c, sink, false);
			tr_content(c, sink, 0, c.text(), Code.SVELTE_CONTENT);
		} else if (c.index === hoist_module) {
			mo = mo + FOLD_STR[S_GT] + '\n' + module_code + '\n';
			tr_content(c, sink, 0, c.text(), Code.SVELTE_CONTENT);
		} else tr_content(c, sink, S_GT, c.text(), Code.SVELTE_CONTENT);
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
	if (comp_table) return cm_table(c, sink, p);
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
	fold_out = comp_prefix;
	const p = fold_node(c, 0);
	let html = fold_out;
	fold_out = '';
	if (p !== 0) html += FOLD_STR[p];
	if (html.length !== 0) flat_sink[0] = html.charCodeAt(0);
	return html;
}

//  element replacement

// a document that uses no replacement renders with has_components false,
// one walker below serves the fold, trace and mapped renders

const H_NAME = ['', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const CHECKED = new Set(['checked']);
const TABLE_PARTS = ['thead', 'tbody', 'tr', 'th', 'td'];

/** the element a markdown node renders as, empty when it is not replaceable */
function comp_name(c: Cursor): string {
	switch (c.kind as number) {
		case K.PARAGRAPH:
			// see the paragraph case of fold_node
			return c.pending && c.parent_kind === K.LIST_ITEM ? '' : 'p';
		case K.HEADING: {
			const d = c.extra;
			return d >= 1 && d <= 6 ? H_NAME[d] : '';
		}
		case K.EMPHASIS:
			return 'em';
		case K.STRONG:
			return 'strong';
		case K.STRIKETHROUGH:
			return 'del';
		case K.SUPERSCRIPT:
			return 'sup';
		case K.SUBSCRIPT:
			return 'sub';
		case K.BLOCK_QUOTE:
			return 'blockquote';
		case K.LIST:
			return c.meta()?.ordered ? 'ol' : 'ul';
		case K.LIST_ITEM:
			return 'li';
		case K.CODE_SPAN:
			return 'code';
		case K.CODE_FENCE:
			return 'pre';
		case K.LINK:
			return 'a';
		case K.IMAGE:
			return 'img';
		case K.THEMATIC_BREAK:
			return 'hr';
		case K.HARD_BREAK:
			return 'br';
		case K.TABLE:
			return 'table';
		case K.HTML:
			return comp_all ? html_tag(c) : plugin_tag(c);
		default:
			return '';
	}
}

/** lowercase elements only, never svelte tags or components */
const ELEMENT_NAME = /^[a-z][a-z0-9-]*$/;

/** the tag of an element a parse plugin created, empty for typed html, which has a source span */
function plugin_tag(c: Cursor): string {
	const e = c.end;
	return e !== Slot.NONE && e > c.start ? '' : html_tag(c);
}

/** the tag of an element, typed or from a plugin */
function html_tag(c: Cursor): string {
	const tag = c.meta()?.tag;
	if (typeof tag !== 'string' || tag === 'script' || tag === 'style') return '';
	return ELEMENT_NAME.test(tag) ? tag : '';
}

const ELEMENT_DIRECTIVES = [
	'bind:',
	'on:',
	'use:',
	'class:',
	'style:',
	'transition:',
	'in:',
	'out:',
	'animate:',
	'let:',
];

/** the first svelte directive of an element, which a component can not take, empty for none */
function element_directive(c: Cursor): string {
	const attrs = c.meta()?.attributes as Record<string, unknown> | undefined;
	if (attrs === undefined) return '';
	for (const k in attrs) {
		const colon = string_index_of.call(k, ':');
		if (colon === -1) continue;
		for (let i = 0; i < ELEMENT_DIRECTIVES.length; i++) {
			const d = ELEMENT_DIRECTIVES[i];
			if (d.length === colon + 1 && k.startsWith(d)) return k;
		}
	}
	return '';
}

function comp_ref(c: Cursor): ComponentImport | null {
	const k = c.kind as number;
	if (k >= K.DIRECTIVE_INLINE && k <= K.DIRECTIVE_CONTAINER)
		return dir_scope!.get(dir_name(c)) ?? null;
	const name = comp_name(c);
	if (name === '') return null;
	const ref = comp_scope!.get(name);
	if (ref === undefined) return null;
	// comp_scan warned about it
	if (comp_all && c.kind === K.HTML && element_directive(c) !== '') return null;
	return ref;
}

function dir_name(c: Cursor): string {
	const name = c.meta()?.name;
	return typeof name === 'string' ? name : '';
}

function note_use(ref: ComponentImport): void {
	if (!comp_seen.has(ref)) {
		comp_seen.add(ref);
		comp_used.push(ref);
	}
}

function comp_use(name: string): ComponentImport | undefined {
	const ref = comp_scope!.get(name);
	if (ref !== undefined) note_use(ref);
	return ref;
}

/** comp_use for an element, one with a directive stays an element and is warned about */
function comp_use_html(c: Cursor, name: string): void {
	if (comp_scope!.get(name) === undefined) return;
	const directive = element_directive(c);
	if (directive === '') comp_use(name);
	else comp_warnings.push({ tag: name, directive, start: c.start });
}

/** walk what the render walks below c and note each replacement it will use */
function comp_scan(c: Cursor): void {
	if (!c.goto_first_child()) return;
	do {
		const k = c.kind as number;
		if (k === K.TEXT || k === K.LINE_BREAK) continue;
		if (k >= K.DIRECTIVE_INLINE && k <= K.DIRECTIVE_CONTAINER) {
			const ref = dir_scope!.get(dir_name(c));
			if (ref !== undefined) note_use(ref);
		} else {
			const name = comp_name(c);
			if (name !== '') {
				if (comp_all && k === K.HTML) comp_use_html(c, name);
				else comp_use(name);
			}
		}
		if (k === K.TABLE) comp_scan_table(c);
		// image children are its alt text, code has none
		else if (k !== K.IMAGE && k !== K.CODE_SPAN && k !== K.CODE_FENCE)
			comp_scan(c);
	} while (c.goto_next_sibling());
	c.goto_parent();
}

function comp_scan_table(c: Cursor): void {
	if (!c.goto_first_child()) return;
	let body = false;
	do {
		const k = c.kind as number;
		if (k === K.TABLE_HEADER) {
			comp_use('thead');
			comp_use('tr');
			comp_scan_cells(c, 'th');
		} else if (k === K.TABLE_ROW) {
			if (!body) {
				comp_use('tbody');
				body = true;
			}
			comp_use('tr');
			comp_scan_cells(c, 'td');
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
}

function comp_scan_cells(c: Cursor, tag: string): void {
	if (!c.goto_first_child()) return;
	do {
		if (c.kind === K.TABLE_CELL) {
			comp_use(tag);
			comp_scan(c);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
}

/** neither scope is ever null while a walk renders replacements */
const NO_SCOPE = new ComponentScope([], '');

/**
 * c is at the root, the walk that follows renders in mode, all also replaces
 * typed elements, returns the warnings about elements that stay
 */
function comp_begin(
	c: Cursor,
	scope: ComponentScope | null,
	directives: ComponentScope | null,
	mode: number,
	all: boolean
): readonly ReplaceWarning[] {
	comp_scope = scope ?? NO_SCOPE;
	dir_scope = directives ?? NO_SCOPE;
	comp_mode = mode;
	comp_all = all;
	comp_scan(c);
	const warnings =
		comp_warnings.length === 0 ? NO_WARNINGS : comp_warnings.splice(0);
	if (comp_used.length === 0) return warnings;
	has_components = true;
	for (let i = 0; i < TABLE_PARTS.length; i++) {
		const ref = comp_scope.get(TABLE_PARTS[i]);
		if (ref !== undefined && comp_seen.has(ref)) comp_table = true;
	}
	comp_lines = component_imports(comp_used);
	return warnings;
}

function comp_end(): void {
	has_components = false;
	comp_table = false;
	comp_scope = null;
	dir_scope = null;
	comp_mode = CM.FOLD;
	comp_all = false;
	comp_lines = '';
	comp_prefix = '';
	// a scan that threw leaves its warnings
	if (comp_warnings.length !== 0) comp_warnings.length = 0;
	if (comp_used.length !== 0) {
		comp_used.length = 0;
		comp_seen.clear();
	}
}

/** append s, returns the register, in the mapped walks mo then holds everything */
function cm_put(p: number, s: string): number {
	if (comp_mode === CM.FOLD) return push_dyn(p, s);
	if (p !== 0) mo += FOLD_STR[p];
	mo += s;
	return 0;
}

function cm_children(c: Cursor, sink: MapSink | undefined, p: number): number {
	if (comp_mode === CM.FOLD) return fold_children(c, p);
	const q =
		comp_mode === CM.TRACE
			? tr_children(c, sink!, p)
			: mp_children(c, sink!, p);
	if (q !== 0) mo += FOLD_STR[q];
	return 0;
}

/** content text of c, mapped as the code cases of the walks map it */
function cm_text(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	text: string
): number {
	if (comp_mode === CM.FOLD) return push_dyn(p, text);
	if (p !== 0) mo += FOLD_STR[p];
	const at = mo.length;
	if (comp_mode === CM.TRACE)
		tr_run(sink!, at, at + text.length, c.value_start, c.value_end);
	else
		put_record(
			sink!,
			at,
			at + text.length,
			c.value_start,
			c.value_end,
			c.index,
			Code.CODE_CONTENT
		);
	mo += text;
	return 0;
}

function cm_spans(
	c: Cursor,
	sink: MapSink | undefined,
	pre: number,
	ao: number,
	bc: number,
	post: number,
	preset: number
): void {
	if (comp_mode === CM.TRACE) tr_point(sink!, pre, c.start);
	else if (comp_mode === CM.MAPPED) _spans(sink!, pre, ao, bc, post, c, preset);
}

/** a void replacement records the node, hr also its open syntax, as the walks do */
function cm_void(
	c: Cursor,
	sink: MapSink | undefined,
	pre: number,
	preset: number
): void {
	if (comp_mode === CM.TRACE) tr_point(sink!, pre, c.start);
	else if (comp_mode === CM.MAPPED) {
		const post = mo.length;
		put_record(sink!, pre, post, c.start, c.end, c.index, preset << 2);
		if (preset === Preset.STRUCTURE && sink!.syntax) {
			const vs = c.value_start;
			put_record(
				sink!,
				pre,
				post,
				c.start,
				c.value_end > vs ? vs : c.start,
				c.index,
				Code.STRUCTURE_OPEN
			);
		}
	}
}

// end of the attributes open_tag_end found, before the space ahead of > or />
let tag_attrs_end = 0;

function skip_space(src: string, p: number): number {
	for (;;) {
		const ch = src.charCodeAt(p);
		if (ch !== 32 && ch !== 9 && ch !== 10) return p;
		p++;
	}
}

/**
 * past the > of the typed open tag at c, -1 when its attributes do not spell
 * it, as when a plugin changed them, sets tag_attrs_end
 */
function open_tag_end(
	c: Cursor,
	tag: string,
	attrs: Record<string, unknown> | undefined
): number {
	const src = c.source;
	let p = c.start + 1;
	if (!src.startsWith(tag, p)) return -1;
	p += tag.length;
	// each attribute in the order the parser met them, values are source slices
	if (attrs !== undefined)
		for (const k in attrs) {
			const v = attrs[k];
			const q = skip_space(src, p);
			if (q === p) return -1;
			p = q;
			if (src.charCodeAt(p) === 123) {
				// {name}, {...spread} or {@attach f}, keyed by the text in braces
				if (typeof v !== 'object' || v === null || (v as any).value !== k)
					return -1;
				if (
					!src.startsWith(k, p + 1) ||
					src.charCodeAt(p + 1 + k.length) !== 125
				)
					return -1;
				p += k.length + 2;
				continue;
			}
			if (!src.startsWith(k, p)) return -1;
			p += k.length;
			if (v === true) continue;
			p = skip_space(src, p);
			if (src.charCodeAt(p) !== 61) return -1;
			p = skip_space(src, p + 1);
			let value: string;
			let open = -1;
			let shut = -1;
			if (typeof v === 'string') {
				value = v;
				const ch = src.charCodeAt(p);
				if (ch === 34 || ch === 39) open = shut = ch;
			} else if (typeof v === 'object' && v !== null) {
				value = meta_str((v as any).value);
				open = 123;
				shut = 125;
			} else return -1;
			if (open !== -1) {
				if (src.charCodeAt(p) !== open) return -1;
				p++;
			}
			if (!src.startsWith(value, p)) return -1;
			p += value.length;
			if (shut !== -1) {
				if (src.charCodeAt(p) !== shut) return -1;
				p++;
			}
		}
	tag_attrs_end = p;
	p = skip_space(src, p);
	const ch = src.charCodeAt(p);
	if (ch === 62) return p + 1;
	if (ch === 47 && src.charCodeAt(p + 1) === 62) return p + 2;
	return -1;
}

/** the per kind extras of a typed element, those the author wrote are kept */
function typed_extras(
	tag: string,
	attrs: Record<string, unknown> | undefined
): string {
	if (tag.length === 2 && tag.charCodeAt(0) === 104) {
		const d = tag.charCodeAt(1) - 48;
		if (d >= 1 && d <= 6 && (attrs === undefined || !('level' in attrs)))
			return ' level={' + d + '}';
	} else if (tag === 'ol' && (attrs === undefined || !('start' in attrs)))
		return ' start={1}';
	return '';
}

/**
 * the attributes of a typed tag, copied from source, and what follows them up
 * to > or />, which maps as identity only when it is as long
 */
function cm_tag(
	c: Cursor,
	sink: MapSink | undefined,
	at: number,
	from: number,
	to: number,
	tail: number,
	end: number
): void {
	if (comp_mode === CM.FOLD) return;
	const mid = at + (to - from);
	if (comp_mode === CM.TRACE) {
		tr_run(sink!, at, mid, from, to);
		tr_run(sink!, mid, tail, to, end);
	} else {
		if (to > from)
			put_record(sink!, at, mid, from, to, c.index, Code.SVELTE_CONTENT);
		put_record(sink!, mid, tail, to, end, c.index, Code.SVELTE_CONTENT);
	}
}

/** a js string expression, attribute text would read braces as expressions */
function js_prop(key: string, value: string): string {
	return ' ' + key + '={' + JSON.stringify(value) + '}';
}

/**
 * the info string of a fence or the #! hint of a code span, the wire path
 * resolves it, the tree builder path keeps byte offsets
 */
function fence_info(c: Cursor, meta: Record<string, unknown> | undefined) {
	let info = meta?.info as string | undefined;
	if (!info) {
		const info_start = meta?.info_start as number | undefined;
		const info_end = meta?.info_end as number | undefined;
		if (info_start != null && info_end != null)
			info = c.slice(info_start, info_end);
	}
	return info;
}

/**
 * render the node at c as the replacement ref, with the attributes as props,
 * children unless void and the extras of its kind
 */
function comp_node(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	ref: ComponentImport
): number {
	if (comp_mode !== CM.FOLD && p !== 0) {
		mo += FOLD_STR[p];
		p = 0;
	}
	const kind = c.kind as number;
	if (kind >= K.DIRECTIVE_INLINE && kind <= K.DIRECTIVE_CONTAINER)
		return dir_node(c, sink, p, ref);
	const pre = mo.length;
	const local = ref.local;
	let open = '<' + local;
	// newlines inside the tags, kept as the element renders them
	let lead = '';
	let close = '</' + local + '>';
	let preset: number = Preset.TEXT;

	switch (kind) {
		case K.HEADING:
			open += _attrs(c) + ' level={' + c.extra + '}';
			break;

		case K.LINK: {
			const meta = c.meta();
			if (meta?.href)
				open += ' href="' + escape_text_html(meta.href as string) + '"';
			if (meta?.title)
				open += ' title="' + escape_text_html(meta.title as string) + '"';
			open += _attrs(c, LINK_HANDLED);
			break;
		}

		case K.IMAGE: {
			const meta = c.meta();
			if (meta?.src)
				open += ' src="' + escape_text_html(meta.src as string) + '"';
			open += ' alt="' + escape_text_html(_children_raw(c)) + '"';
			if (meta?.title)
				open += ' title="' + escape_text_html(meta.title as string) + '"';
			p = cm_put(p, open + _attrs(c, IMAGE_HANDLED) + ' />');
			cm_void(c, sink, pre, Preset.TEXT);
			return p;
		}

		case K.THEMATIC_BREAK:
			p = cm_put(p, open + _attrs(c) + ' />');
			cm_void(c, sink, pre, Preset.STRUCTURE);
			return p;

		case K.HARD_BREAK:
			return cm_put(p, open + _attrs(c) + ' />\n');

		case K.LIST: {
			const meta = c.meta();
			open += _attrs(c);
			if (meta?.ordered) {
				const start = meta.start;
				open += ' start={' + (typeof start === 'number' ? start : 1) + '}';
			}
			lead = '\n';
			close = '\n' + close;
			preset = Preset.STRUCTURE;
			break;
		}

		case K.LIST_ITEM: {
			const checked = c.meta()?.checked;
			if (typeof checked === 'boolean')
				open += _attrs(c, CHECKED) + ' checked={' + checked + '}';
			else open += _attrs(c);
			close += '\n';
			break;
		}

		case K.BLOCK_QUOTE:
			open += _attrs(c);
			lead = '\n';
			close = '\n' + close;
			break;

		case K.TABLE:
			open += _attrs(c);
			lead = '\n';
			close = '\n' + close;
			preset = Preset.STRUCTURE;
			break;

		case K.CODE_SPAN: {
			if (hl !== null) {
				const h = hl_span(c);
				if (h !== null) return comp_hl_code(c, sink, p, h, open, close);
			}
			p = cm_put(p, open + _attrs(c) + '>');
			const ao = mo.length;
			let code = escape_code_text(c);
			if (string_index_of.call(code, '\n') !== -1)
				code = code.replace(/\n/g, ' ');
			p = cm_text(c, sink, p, code);
			const bc = mo.length;
			p = cm_put(p, close);
			cm_spans(c, sink, pre, ao, bc, mo.length, Preset.CODE);
			return p;
		}

		case K.CODE_FENCE: {
			const info = fence_info(c, c.meta());
			if (hl !== null) {
				const b = hl_block(c, info);
				if (b !== null) return comp_hl_pre(c, sink, p, b, info, open, close);
			}
			open += _attrs(c);
			let inner = '<code>';
			if (info) {
				const lang = info_lang(info);
				const rest = info_meta(info);
				open += js_prop('lang', lang);
				if (rest) {
					open += js_prop('meta', rest);
					if (pm !== null) open += pm.pre_props(rest, c.start);
				}
				inner = '<code class="language-' + escape_info(lang) + '">';
			}
			// children are the element, svelte keeps whitespace only inside a <pre>
			// it can see, code is the raw text
			p = cm_put(p, open + js_prop('code', fence_text(c)) + '><pre>' + inner);
			const ao = mo.length;
			p = cm_text(c, sink, p, escape_fence_text(c));
			const bc = mo.length;
			p = cm_put(p, '</code></pre>' + close);
			cm_spans(c, sink, pre, ao, bc, mo.length, Preset.CODE);
			return p;
		}

		case K.HTML: {
			const meta = c.meta()!;
			const tag = meta.tag as string;
			const attrs = meta.attributes as Record<string, unknown> | undefined;
			const typed = c.end !== Slot.NONE && c.end > c.start;
			const end = typed ? open_tag_end(c, tag, attrs) : -1;
			// a typed tag keeps its attributes as written, they map as identity
			const from = c.start + 1 + tag.length;
			const at = pre + open.length;
			if (end !== -1) open += c.slice(from, tag_attrs_end);
			else if (attrs) {
				for (const k in attrs) {
					const v = attrs[k];
					if (v === true) open += ' ' + k;
					else if (typeof v === 'object' && (v as any).type === 'expression')
						open += expr_attr(k, meta_str((v as any).value));
					else open += ' ' + k + '="' + escape_attr(meta_str(v), typed) + '"';
				}
			}
			if (typed) open += typed_extras(tag, attrs);
			const shut = meta.self_closing ? ' />' : '>';
			if (end !== -1)
				cm_tag(
					c,
					sink,
					at,
					from,
					tag_attrs_end,
					pre + open.length + shut.length,
					end
				);
			if (meta.self_closing) {
				p = cm_put(p, open + shut);
				cm_void(c, sink, pre, Preset.TEXT);
				return p;
			}
			break;
		}

		default:
			open += _attrs(c);
	}

	p = cm_put(p, open + '>' + lead);
	const ao = mo.length;
	p = kind === K.TABLE ? cm_table(c, sink, p) : cm_children(c, sink, p);
	const bc = mo.length;
	p = cm_put(p, close);
	cm_spans(c, sink, pre, ao, bc, mo.length, preset);
	return p;
}

//  directives

/** a directive the compile cannot render, start indexes the source */
export class DirectiveError extends Error {
	readonly directive: string;
	readonly start: number;
	readonly line: number;
	readonly column: number;

	constructor(c: Cursor, message: string) {
		const start = c.start;
		const src = c.source;
		let line = 1;
		let from = 0;
		for (
			let i = src.indexOf('\n');
			i !== -1 && i < start;
			i = src.indexOf('\n', i + 1)
		) {
			line++;
			from = i + 1;
		}
		const column = start - from + 1;
		const directive = dir_syntax(c);
		super(message.replace('%', directive + ' at ' + line + ':' + column));
		this.name = 'DirectiveError';
		this.directive = directive;
		this.start = start;
		this.line = line;
		this.column = column;
	}
}

/** the colons and name, as the directive is written */
function dir_syntax(c: Cursor): string {
	const k = c.kind as number;
	const colons =
		k === K.DIRECTIVE_INLINE ? ':' : k === K.DIRECTIVE_LEAF ? '::' : ':::';
	return colons + dir_name(c);
}

/** throws for a directive, the walks reach it only from their default case */
function dir_check(c: Cursor): void {
	const k = c.kind as number;
	if (k >= K.DIRECTIVE_INLINE && k <= K.DIRECTIVE_CONTAINER) dir_unknown(c);
}

function dir_unknown(c: Cursor): never {
	const k = c.kind as number;
	const kind =
		k === K.DIRECTIVE_INLINE
			? 'directive_inline'
			: k === K.DIRECTIVE_LEAF
				? 'directive_leaf'
				: 'directive_container';
	throw new DirectiveError(
		c,
		'no component renders the directive %. Export a component named ' +
			JSON.stringify(dir_name(c)) +
			" from a directives module (export * as directives from './directives.ts'), " +
			'or replace the ' +
			kind +
			' node in a parse plugin'
	);
}

/** args as string props, children and label are the snippets */
function dir_props(c: Cursor, kind: number): string {
	const args = c.meta()?.args as Record<string, string> | undefined;
	if (args === undefined) return '';
	let s = '';
	for (const key in args) {
		if (
			key === 'children' ||
			(key === 'label' && kind !== K.DIRECTIVE_INLINE)
		) {
			throw new DirectiveError(
				c,
				'the directive % has an argument named ' +
					key +
					', which its component receives as a snippet'
			);
		}
		const v = args[key];
		// braces in attribute text would read as an expression
		s +=
			v.indexOf('{') === -1 && v.indexOf('}') === -1
				? ' ' + key + '="' + escape_html(v) + '"'
				: js_prop(key, v);
	}
	return s;
}

/** true when a child other than the label renders, a container keeps its line breaks */
function dir_has_body(c: Cursor): boolean {
	const n = c.words;
	let child = n[c.index * W.stride + W.first_child];
	if (child === Slot.NONE) return false;
	const parent = c.index;
	do {
		const b = child * W.stride;
		if (n[b + W.parent] !== parent) return false;
		const k = n[b] & 0xff;
		if (k !== K.LINE_BREAK && k !== K.DIRECTIVE_LABEL) return true;
		child = n[b + W.next];
	} while (child !== Slot.NONE);
	return false;
}

/** the directive_label of a leaf or container, its first child, or NONE */
function dir_label_of(c: Cursor): number {
	const n = c.words;
	const child = n[c.index * W.stride + W.first_child];
	if (child === Slot.NONE) return Slot.NONE;
	const b = child * W.stride;
	return n[b + W.parent] === c.index && (n[b] & 0xff) === K.DIRECTIVE_LABEL
		? child
		: Slot.NONE;
}

/** the label inline content as a snippet, mapped as the walks map it */
function dir_label(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	label: number
): number {
	p = cm_put(p, '{#snippet label()}');
	const at = c.index;
	c.move_to(label);
	p = cm_children(c, sink, p);
	c.move_to(at);
	return cm_put(p, '{/snippet}');
}

/**
 * a directive as the component ref, args as props, the directive_label of a
 * leaf or container as the label snippet, inline text and container body as
 * children, the walks skip the label among them
 */
function dir_node(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	ref: ComponentImport
): number {
	const pre = mo.length;
	const kind = c.kind as number;
	const local = ref.local;
	const open = '<' + local + dir_props(c, kind);
	const label_at = kind === K.DIRECTIVE_INLINE ? Slot.NONE : dir_label_of(c);
	const label = label_at !== Slot.NONE;
	const body =
		kind === K.DIRECTIVE_INLINE
			? c.words[c.index * W.stride + W.first_child] !== Slot.NONE
			: kind === K.DIRECTIVE_CONTAINER && dir_has_body(c);

	if (!label && !body) {
		p = cm_put(p, open + ' />');
		cm_void(c, sink, pre, Preset.STRUCTURE);
		return p;
	}
	p = cm_put(p, open + '>');
	if (label) p = dir_label(c, sink, p, label_at);
	const ao = mo.length;
	if (body) {
		// a container renders its blocks as a blockquote does
		if (kind === K.DIRECTIVE_CONTAINER) p = cm_put(p, '\n');
		p = cm_children(c, sink, p);
		if (kind === K.DIRECTIVE_CONTAINER) p = cm_put(p, '\n');
	}
	const bc = mo.length;
	p = cm_put(p, '</' + local + '>');
	cm_spans(
		c,
		sink,
		pre,
		ao,
		bc,
		mo.length,
		kind === K.DIRECTIVE_INLINE ? Preset.TEXT : Preset.STRUCTURE
	);
	return p;
}

/** table content where a part may be replaced */
function cm_table(c: Cursor, sink: MapSink | undefined, p: number): number {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	const head = comp_scope!.get('thead');
	const body = comp_scope!.get('tbody');
	const row = comp_scope!.get('tr');
	const row_open = row ? '<' + row.local + '>\n' : '<tr>\n';
	const row_close = row ? '</' + row.local + '>\n' : '</tr>\n';
	let in_body = false;

	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_HEADER) {
			p = cm_put(p, (head ? '<' + head.local + '>\n' : '<thead>\n') + row_open);
			p = cm_cells(c, sink, p, 'th', alignments);
			p = cm_put(
				p,
				row_close + (head ? '</' + head.local + '>\n' : '</thead>\n')
			);
		} else if (c.kind === K.TABLE_ROW) {
			let s = row_open;
			if (!in_body) {
				s = (body ? '<' + body.local + '>\n' : '<tbody>\n') + s;
				in_body = true;
			}
			p = cm_put(p, s);
			p = cm_cells(c, sink, p, 'td', alignments);
			p = cm_put(p, row_close);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) p = cm_put(p, body ? '</' + body.local + '>' : '</tbody>');
	return p;
}

function cm_cells(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	tag: string,
	alignments: string[]
): number {
	const ref = comp_scope!.get(tag);
	const name = ref ? ref.local : tag;
	let col = 0;
	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K.TABLE_CELL) {
			const align = alignments[col];
			p = cm_put(
				p,
				align && align !== 'none'
					? '<' + name + ' align="' + align + '">'
					: '<' + name + '>'
			);
			p = cm_children(c, sink, p);
			p = cm_put(p, '</' + name + '>\n');
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
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
function capture_trace(sink: MapSink, out: MapTrace): MapTrace {
	const n = sink.n;
	const trace = reserve_trace(n, 0, out);
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

/**
 * the count of collapsed below offset, galloping from hint, records come in
 * document order with parents after children so most end near the hint
 */
function rank_near(
	collapsed: readonly number[],
	offset: number,
	hint: number
): number {
	const count = collapsed.length;
	let lo: number;
	let hi: number;
	if (hint < count && collapsed[hint] < offset) {
		// gallop forward, the rank is above hint and at most count
		lo = hint + 1;
		let step = 1;
		for (;;) {
			hi = hint + step;
			if (hi >= count) {
				hi = count;
				break;
			}
			if (collapsed[hi] >= offset) break;
			lo = hi + 1;
			step += step;
		}
	} else if (hint > 0 && collapsed[hint - 1] >= offset) {
		// gallop backward, the rank is below hint
		hi = hint - 1;
		let step = 1;
		for (;;) {
			lo = hint - 1 - step;
			if (lo <= 0) {
				lo = 0;
				break;
			}
			if (collapsed[lo] < offset) {
				lo++;
				break;
			}
			hi = lo;
			step += step;
		}
	} else {
		return hint;
	}
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
	const mappings: Mapping<MappingData>[] = new Array(n / Rec.SIZE);
	let at = 0;
	const data_of = record_data;
	let k = 0;
	for (let p = 0; p < n; p += Rec.SIZE) {
		const source_length = rec[p + 3];
		const gen_offset = rec[p];
		const gen_length = rec[p + 1];
		let start = rec[p + 2];
		const end = start + source_length;
		const identity = gen_length === source_length;
		k = rank_near(collapsed, start, k);
		const code = rec[p + 5];
		const node_index = rec[p + 4] | 0;
		const key = (node_index + 1) * 16 + code;
		// one class for every mapping keeps readers monomorphic
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
				mappings[at++] = new RecordMapping(0, 0, 0, 0, key, m);
			} else {
				mappings[at++] = new RecordMapping(
					start + k,
					gen_offset,
					source_length,
					source_length,
					key,
					null
				);
			}
			continue;
		}
		let length = source_length;
		if (k < count && collapsed[k] < end) {
			length = end + rank_near(collapsed, end, k) - start - k;
		}
		if (length !== gen_length) {
			mappings[at++] = new RecordMapping(
				start + k,
				gen_offset,
				length,
				gen_length,
				key,
				null
			);
		} else {
			const m: Mapping<MappingData> = {
				sourceOffsets: [start + k],
				generatedOffsets: [gen_offset],
				lengths: [length],
				data: data_of(code, node_index),
				generatedLengths: [gen_length],
			};
			mappings[at++] = new RecordMapping(0, 0, 0, 0, key, m);
		}
	}
	return mappings;
}

// exported functions are module cells too, so the walk calls the locals
export const escape = escape_html;
export const escape_text = escape_node_text;
export const _escape_code = escape_code;
export const _escape_code_text = escape_code_text;
export const _escape_text_html = escape_text_html;
export const _emit = emit_record;
export const _children = render_children;
export const _node = render_node;
export const _out_offsets = out_offsets;

/** @internal the trace of a sink filled by out chunk index */
export function _capture_trace(sink: MapSink, out: string[]): MapTrace {
	const rec = by_offset(sink, out);
	const trace = new MapSink();
	trace.rec = trace_of_records(rec.rec, rec.n);
	trace.n = trace.rec.length;
	return capture_trace(trace, { buf: trace.rec, start: 0, split: 0, end: 0 });
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
// half a trace slab, see reserve_trace
const TRACE_DIRECT_WORDS = 16384;

//  template wrapper

/** wraps a document, the template module and whether the metadata export spreads into it */
export interface TemplateWrapper {
	/** emitted verbatim as the import specifier */
	specifier: string;
	/** true spreads the module script metadata export as props */
	metadata: boolean;
}

const WRAP_LOCAL = 'Template_MDSVEX';
const WRAP_PROPS = '__mdsvex_props';
const PROPS_CALL = /\$props\s*\(\s*\)/;
const PROPS_NAME =
	/\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*\$props\s*\(\s*\)/;
/** top level elements svelte only allows outside markup, or that belong to the document */
const WRAP_HOISTED = new Set([
	'script',
	'style',
	'svelte:head',
	'svelte:window',
	'svelte:body',
	'svelte:document',
	'svelte:options',
]);

// set by wrap_begin, '' when the render wraps nothing
let wrap_spec = '';
let wrap_metadata = false;
let wrap_open = '';
let wrap_mode: number = CM.FOLD;

function wrap_begin(wrapper: TemplateWrapper, mode: number): void {
	wrap_spec = wrapper.specifier;
	wrap_metadata = wrapper.metadata;
	wrap_mode = mode;
}

function wrap_end(): void {
	wrap_spec = '';
	wrap_metadata = false;
	wrap_open = '';
	wrap_mode = CM.FOLD;
	comp_lines = '';
	comp_prefix = '';
}

/** a root child that renders before the wrapper rather than inside it */
function wrap_hoists(c: Cursor, kind: number): boolean {
	if (kind === K.IMPORT_STATEMENT || kind === K.FRONTMATTER) return true;
	if (kind !== K.HTML) return false;
	const tag = c.meta()?.tag;
	return (
		typeof tag === 'string' &&
		WRAP_HOISTED.has(tag) &&
		// an external script renders as an element, it is markup
		!is_embed_script(c, tag)
	);
}

/** the root children that hoist, or the rest, in document order */
function wrap_pass(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	hoisted: boolean
): number {
	const n = c.words;
	let child = n[W.first_child];
	while (child !== Slot.NONE) {
		const b = child * W.stride;
		if (n[b + W.parent] !== 0) break;
		const k = n[b] & 0xff;
		if (k !== K.LINE_BREAK) {
			c.move_to(child);
			if (wrap_hoists(c, k) === hoisted) {
				if (wrap_mode === CM.FOLD) p = fold_node(c, p);
				else if (k === K.TEXT) {
					// the mapped walks render text in their children loops
					const vs = n[b + W.value_start];
					const ve = n[b + W.value_end];
					const t = escape_text_at(c, child, vs, ve, false);
					if (p !== 0) mo += FOLD_STR[p];
					p = 0;
					if (vs !== Slot.NONE && ve > vs) {
						const at = mo.length;
						if (wrap_mode === CM.TRACE)
							tr_run(sink!, at, at + t.length, vs, ve);
						else
							put_record(
								sink!,
								at,
								at + t.length,
								vs,
								ve,
								child,
								Code.TEXT_CONTENT
							);
					}
					mo += t;
				} else if (wrap_mode === CM.TRACE) p = tr_node(c, sink!, p);
				else p = mp_node(c, sink!, p);
			}
		}
		child = n[b + W.next];
	}
	c.move_to(0);
	return p;
}

/** c is at the root, the hoisted children then the rest inside the wrapper */
function wrap_root(c: Cursor, sink: MapSink | undefined, p: number): number {
	p = wrap_pass(c, sink, p, true);
	p = cm_wrap(p, wrap_open);
	p = wrap_pass(c, sink, p, false);
	return cm_wrap(p, '</' + WRAP_LOCAL + '>');
}

function cm_wrap(p: number, s: string): number {
	if (wrap_mode === CM.FOLD) return push_dyn(p, s);
	if (p !== 0) mo += FOLD_STR[p];
	mo += s;
	return 0;
}

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
	/**
	 * element replacements for the next renders, closest scope first, the
	 * cached render of update ignores it as a replacement needs a document import
	 */
	scope: ComponentScope | null = null;
	/** also replace the lowercase elements the author typed, component_mode all */
	replace_typed = false;
	/** elements the last render with a scope kept for a directive, a render without one stores nothing */
	get warnings(): readonly ReplaceWarning[] {
		return comp_last;
	}
	/** directive replacements, a namespace apart from scope */
	directives: ComponentScope | null = null;
	/** highlights fences and code spans with a #! hint, null renders them plain */
	highlight: CodeHighlighter | null = null;
	/** title, caption and meta props for a pre replacement rendered plain, null gives it none */
	pre_meta: PreMeta | null = null;
	/**
	 * a directive no scope replaces throws a DirectiveError, otherwise it
	 * renders as its children, which suits a preview
	 */
	strict_directives = false;
	/**
	 * the template the next render wraps the document in, hoisting its scripts,
	 * styles and top level svelte elements, that render clears it, the cached
	 * render of update ignores it
	 */
	// declared, so a renderer that never wraps builds and keeps no field
	declare template?: TemplateWrapper;

	constructor(opts?: { cache?: boolean }) {
		this.cache = opts?.cache ?? true;
		if (this.cache) this.closed = new Set();
	}

	/**
	 * @param code code the module script starts with, it goes into the top
	 * level module script or a new one in place of the frontmatter
	 */
	update(buf: NodeBuffer, source: string, code?: string): CursorBlockEntry[] {
		// reuse or create cursor
		if (!this.cursor) {
			this.cursor = new Cursor(buf, source);
		} else {
			this.cursor.reinit(buf, source);
		}
		const c = this.cursor;
		c.reset();
		esc_reset(source);
		hl = this.highlight;
		pm = this.pre_meta;

		// no caching, single-pass full render
		if (!this.cache) {
			const scope = this.scope;
			const directives = this.directives;
			if (this.template !== undefined) {
				this.html = this.render_wrapped(c, buf, null, false, code);
				return this.blocks;
			}
			try {
				if (
					(scope !== null && scope.size !== 0) ||
					(directives !== null && directives.size !== 0)
				)
					comp_last = comp_begin(
						c,
						scope,
						directives,
						CM.FOLD,
						this.replace_typed
					);
				if (this.strict_directives) dir_strict = true;
				hoist_begin(buf);
				if (code) module_begin(buf, code);
				prebuilt_begin(buf);
				this.html = render_folded(c);
			} finally {
				hl = null;
				pm = null;
				esc_prebuilt = true;
				esc_bits = null;
				if (dir_strict) dir_strict = false;
				if (comp_scope !== null) comp_end();
				if (code) module_end();
			}
			return this.blocks;
		}

		try {
			hoist_begin(buf);
			if (code) module_begin(buf, code);
			this.update_blocks(c);
		} finally {
			hl = null;
			pm = null;
			if (code) module_end();
		}
		return this.blocks;
	}

	/** the cached render, block by block */
	private update_blocks(c: Cursor): void {
		if (!c.goto_first_child()) return;

		let block_idx = 0;
		do {
			if (c.kind === K.LINE_BREAK) continue;

			const idx = c.index;

			// imports, frontmatter and top level scripts render from document state, never cached
			const keep =
				c.closed &&
				c.kind !== K.IMPORT_STATEMENT &&
				c.kind !== K.FRONTMATTER &&
				idx !== hoist_script &&
				idx !== hoist_module;
			if (block_idx >= this.blocks.length) {
				this.blocks.push({ idx, html: _render_block(c) });
				if (keep) this.closed!.add(idx);
			} else if (!this.closed!.has(idx)) {
				this.blocks[block_idx].html = _render_block(c);
				if (keep) this.closed!.add(idx);
			}

			block_idx++;
		} while (c.goto_next_sibling());

		c.goto_parent();
		this.html = this.blocks.map((b) => b.html).join('');
	}

	/** trace renders with no syntax records, see tr_node */
	private render_mapped(
		buf: NodeBuffer,
		source: string,
		sink: MapSink,
		trace: boolean,
		code: string | undefined
	): void {
		if (!this.cursor) {
			this.cursor = new Cursor(buf, source);
		} else {
			this.cursor.reinit(buf, source);
		}
		const c = this.cursor;
		c.reset();
		esc_reset(source);
		hl = this.highlight;
		pm = this.pre_meta;

		if (this.template !== undefined) {
			this.html = this.render_wrapped(c, buf, sink, trace, code);
			return;
		}
		const scope = this.scope;
		const directives = this.directives;
		let p = 0;
		try {
			if (
				(scope !== null && scope.size !== 0) ||
				(directives !== null && directives.size !== 0)
			)
				comp_last = comp_begin(
					c,
					scope,
					directives,
					trace ? CM.TRACE : CM.MAPPED,
					this.replace_typed
				);
			if (this.strict_directives) dir_strict = true;
			hoist_begin(buf);
			mo = comp_prefix;
			if (code) {
				module_begin(buf, code);
				// the frontmatter is the first node, the mapped walk has no case for it
				mo += module_script();
			}
			prebuilt_begin(buf);
			if (trace) p = tr_node(c, sink, 0);
			else p = mp_node(c, sink, 0);
		} finally {
			hl = null;
			pm = null;
			esc_prebuilt = true;
			esc_bits = null;
			if (dir_strict) dir_strict = false;
			if (comp_scope !== null) comp_end();
			if (code) module_end();
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
	 * a render wrapped in the template, kept apart so a plain render pays one
	 * check, sink null for the fold walk
	 */
	private render_wrapped(
		c: Cursor,
		buf: NodeBuffer,
		sink: MapSink | null,
		trace: boolean,
		code: string | undefined
	): string {
		const scope = this.scope;
		const directives = this.directives;
		const mode = sink === null ? CM.FOLD : trace ? CM.TRACE : CM.MAPPED;
		let html: string;
		try {
			if (
				(scope !== null && scope.size !== 0) ||
				(directives !== null && directives.size !== 0)
			)
				comp_last = comp_begin(c, scope, directives, mode, this.replace_typed);
			if (this.strict_directives) dir_strict = true;
			wrap_begin(this.template!, mode);
			wrap_hoist_begin(c, buf);
			if (code) module_begin(buf, code);
			prebuilt_begin(buf);
			if (sink === null) {
				fold_out = comp_prefix;
				const p = wrap_root(c, undefined, 0);
				html = fold_out;
				fold_out = '';
				if (p !== 0) html += FOLD_STR[p];
			} else {
				mo = comp_prefix;
				// the frontmatter is the first node, the mapped walk has no case for it
				if (code) mo += module_script();
				const p = wrap_root(c, sink, 0);
				html = mo;
				mo = '';
				if (p !== 0) html += FOLD_STR[p];
			}
		} finally {
			hl = null;
			pm = null;
			esc_prebuilt = true;
			esc_bits = null;
			if (dir_strict) dir_strict = false;
			if (comp_scope !== null) comp_end();
			wrap_end();
			if (code) module_end();
			this.template = undefined;
		}
		// flat, so every later read of the html pays no rope walk
		if (html.length !== 0) flat_sink[0] = html.charCodeAt(0);
		return html;
	}

	/**
	 * render with source mapping. always full render (no caching).
	 * collapsed moves the source offsets onto raw
	 */
	update_mapped(
		buf: NodeBuffer,
		source: string,
		collapsed?: readonly number[] | null,
		module_code?: string
	): { blocks: CursorBlockEntry[]; mappings: Mapping<MappingData>[] } {
		const sink = render_sink;
		sink.begin(true);
		this.render_mapped(buf, source, sink, false, module_code);
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
		file?: string,
		module_code?: string
	): SourceMapV3 {
		const sink = render_sink;
		sink.begin(false);
		this.render_mapped(buf, source, sink, true, module_code);
		const map = trace_records_to_v3(sink, raw, this.html, file);
		sink.release();
		return map;
	}

	/** trace_to_v3 over the trace with the same arguments equals update_v3 */
	update_trace(
		buf: NodeBuffer,
		source: string,
		module_code?: string
	): MapTrace {
		const trace: MapTrace = {
			buf: render_sink.rec,
			start: 0,
			split: 0,
			end: 0,
		};
		this.update_trace_into(buf, source, trace, module_code);
		return trace;
	}

	/** update_trace filling out instead of a new trace */
	update_trace_into(
		buf: NodeBuffer,
		source: string,
		out: MapTrace,
		module_code?: string
	): void {
		const sink = render_sink;
		// a node writes at most two records, so a small render writes straight into the slab
		const bound = buf.size * (2 * Trace.SIZE);
		if (bound <= TRACE_DIRECT_WORDS) {
			const own = sink.rec;
			sink.rec = trace_room(bound);
			const start = trace_free_at();
			sink.n = start;
			sink.syntax = false;
			try {
				this.render_mapped(buf, source, sink, true, module_code);
				trace_take(sink.rec, start, sink.n, out);
				return;
			} finally {
				// the slab holds live traces, the next sink write must not land there
				sink.rec = own;
				sink.n = 0;
			}
		}
		sink.begin(false);
		this.render_mapped(buf, source, sink, true, module_code);
		capture_trace(sink, out);
		sink.release();
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
		this.scope = null;
		this.directives = null;
		this.highlight = null;
		this.pre_meta = null;
		this.replace_typed = false;
		// a tag is a slice that would keep the source alive
		comp_last = NO_WARNINGS;
		if (this.template !== undefined) this.template = undefined;
		// the escape index is module state and would keep the source alive,
		// every render resets it, a zero length clamps any text of '' to empty
		esc_src = '';
		esc_len = 0;
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
	// callers render parts, they place imports and scripts themselves
	hoist_reset();
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

// highlighting is cold beside the walks, so its bindings sit last

/** the highlighter of the render in progress, null renders code plain */
let hl: CodeHighlighter | null = null;
/** the meta conventions of the render in progress for a plain pre replacement */
let pm: PreMeta | null = null;

/** the first space or tab of an info string, -1 for none */
function info_space(info: string): number {
	for (let i = 0; i < info.length; i++) {
		const ch = info.charCodeAt(i);
		if (ch === 32 || ch === 9) return i;
	}
	return -1;
}

/** the language of an info string, its first word */
function info_lang(info: string): string {
	const space = info_space(info);
	return space === -1 ? info : info.slice(0, space);
}

/** the info string after the language */
function info_meta(info: string): string {
	const space = info_space(info);
	return space === -1 ? '' : info.slice(space).trim();
}

/** the fence at c through the highlighter, null renders it plain */
function hl_block(
	c: Cursor,
	info: string | undefined
): HighlightedBlock | null {
	return hl!.block(
		fence_text(c),
		info ? info_lang(info) : '',
		info ? info_meta(info) : '',
		c.start
	);
}

/** the code span at c through the highlighter when it has a #! hint */
function hl_span(c: Cursor): HighlightedCode | null {
	const lang = fence_info(c, c.meta());
	if (!lang) return null;
	let code = c.text();
	if (string_index_of.call(code, '\n') !== -1) code = code.replace(/\n/g, ' ');
	return hl!.inline(code, lang, c.start);
}

/** a highlighted block up to its body, plugin attributes go on the <pre> */
function hl_head(c: Cursor, b: HighlightedBlock): string {
	if (b.attributes === null) return b.before;
	return b.before + '<pre' + b.attributes + _attrs(c) + '>';
}

function hl_tail(b: HighlightedBlock): string {
	return b.attributes === null ? b.after : '</pre>' + b.after;
}

function hl_span_head(c: Cursor, s: HighlightedCode): string {
	return s.attributes === null ? '' : '<code' + s.attributes + _attrs(c) + '>';
}

function hl_span_tail(s: HighlightedCode): string {
	return s.attributes === null ? '' : '</code>';
}

/**
 * render_node for a highlighted fence or code span, the body is one content
 * record, split around any live expressions
 */
function render_hl(
	c: Cursor,
	sink: MapSink | undefined,
	head: string,
	body: string,
	tail: string,
	live: number[] | null
): void {
	const pre = mo.length;
	mo += head;
	const ao = mo.length;
	if (sink) {
		if (live === null) content_record(sink, c, body, Code.CODE_CONTENT);
		else hl_live_records(sink, c, ao, body, live);
	}
	mo += body;
	const bc = mo.length;
	mo += tail;
	if (sink) _spans(sink, pre, ao, bc, mo.length, c, Preset.CODE);
}

/** fold_node for a highlighted fence or code span */
function fold_hl(p: number, head: string, body: string, tail: string): number {
	return push_dyn(p, head + body + tail);
}

/** tr_node for a highlighted fence or code span, a point as the body never copies the source */
function tr_hl(
	c: Cursor,
	sink: MapSink,
	p: number,
	head: string,
	body: string,
	tail: string,
	live: number[] | null
): number {
	if (p !== 0) mo += FOLD_STR[p];
	const pre = mo.length;
	mo += head;
	if (live !== null) hl_live_trace(sink, c, mo.length, body, live);
	else if (body.length !== 0) tr_point(sink, mo.length, c.value_start);
	mo += body + tail;
	tr_point(sink, pre, c.start);
	return 0;
}

/** mp_node for a highlighted fence or code span */
function mp_hl(
	c: Cursor,
	sink: MapSink,
	p: number,
	head: string,
	body: string,
	tail: string,
	live: number[] | null
): number {
	if (p !== 0) mo += FOLD_STR[p];
	render_hl(c, sink, head, body, tail, live);
	return 0;
}

/** the content of a highlighted fence or span, mapped as the code cases of the walks map it */
function cm_hl(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	pre: number,
	head: string,
	body: string,
	tail: string,
	live: number[] | null
): number {
	p = cm_put(p, head);
	const ao = mo.length;
	if (live === null || comp_mode === CM.FOLD) p = cm_text(c, sink, p, body);
	else {
		// cm_put left nothing folded outside the fold walk
		if (comp_mode === CM.TRACE) hl_live_trace(sink!, c, ao, body, live);
		else hl_live_records(sink!, c, ao, body, live);
		mo += body;
	}
	const bc = mo.length;
	p = cm_put(p, tail);
	cm_spans(c, sink, pre, ao, bc, mo.length, Preset.CODE);
	return p;
}

/**
 * a highlighted fence as the pre replacement, the children are the <pre> as
 * svelte keeps whitespace only inside a <pre> it can see, the replacement
 * draws any figure
 */
function comp_hl_pre(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	b: HighlightedBlock,
	info: string | undefined,
	open: string,
	close: string
): number {
	const pre = mo.length;
	if (info) {
		open += js_prop('lang', info_lang(info));
		const meta = info_meta(info);
		if (meta) open += js_prop('meta', meta);
	}
	const dropped = b.dropped;
	if (dropped !== null)
		for (let i = 0; i < dropped.length; i++)
			hl!.warn('meta_prop_ignored', dropped[i], c.start);
	open +=
		b.props +
		(b.code_template === null
			? js_prop('code', b.code)
			: ' code={' + b.code_template + '}') +
		_attrs(c) +
		'>';
	if (b.attributes === null)
		return cm_hl(c, sink, p, pre, open, b.body, close, b.live);
	return cm_hl(
		c,
		sink,
		p,
		pre,
		open + '<pre' + b.attributes + '>',
		b.body,
		'</pre>' + close,
		b.live
	);
}

/** a highlighted code span as the code replacement, which also takes lang */
function comp_hl_code(
	c: Cursor,
	sink: MapSink | undefined,
	p: number,
	h: HighlightedCode,
	open: string,
	close: string
): number {
	const pre = mo.length;
	if (h.attributes === null) {
		hl!.warn(
			'code_replacement_skipped',
			'the highlighter output is not a single <code> element, so the code component does not replace it',
			c.start
		);
		return cm_hl(c, sink, p, pre, '', h.body, '', null);
	}
	open +=
		js_prop('lang', fence_info(c, c.meta())!) + h.attributes + _attrs(c) + '>';
	return cm_hl(c, sink, p, pre, open, h.body, close, null);
}

/**
 * the source offset of the live expression at offset at of the fence text,
 * a fence line is the end of its source line once quote markers and indent
 * go, -1 when the source there holds other text
 */
function hl_source(c: Cursor, text: string, at: number, len: number): number {
	const vs = c.value_start;
	if (c.prebuilt === undefined && bq_depth(c.words, c.index) === 0)
		return vs + at;
	const src = c.source;
	const ve = c.value_end;
	let line_start = vs;
	for (
		let i = string_index_of.call(text, '\n');
		i !== -1 && i < at;
		i = string_index_of.call(text, '\n', i + 1)
	) {
		line_start = string_index_of.call(src, '\n', line_start) + 1;
		if (line_start === 0 || line_start > ve) return -1;
	}
	let text_end = string_index_of.call(text, '\n', at);
	if (text_end === -1) text_end = text.length;
	let line_end = string_index_of.call(src, '\n', line_start);
	if (line_end === -1 || line_end > ve) line_end = ve;
	const s = line_end - (text_end - at);
	if (s < line_start || src.slice(s, s + len) !== text.slice(at, at + len))
		return -1;
	return s;
}

/**
 * the content records of a highlighted body with live expressions, each
 * expression maps one to one as svelte content, the code between them as code
 */
function hl_live_records(
	sink: MapSink,
	c: Cursor,
	at: number,
	body: string,
	live: number[]
): void {
	const text = fence_text(c);
	const idx = c.index;
	let gen = at;
	let src = c.value_start;
	for (let i = 0; i < live.length; i += 3) {
		const len = live[i + 2];
		const s = hl_source(c, text, live[i + 1], len);
		if (s === -1 || s < src) continue;
		const g = at + live[i];
		if (g > gen) put_record(sink, gen, g, src, s, idx, Code.CODE_CONTENT);
		put_record(sink, g, g + len, s, s + len, idx, Code.SVELTE_CONTENT);
		gen = g + len;
		src = s + len;
	}
	const end = at + body.length;
	if (end > gen)
		put_record(sink, gen, end, src, c.value_end, idx, Code.CODE_CONTENT);
}

/** hl_live_records for the trace walk, a record becomes what the v3 encoding keeps of it */
function hl_live_trace(
	sink: MapSink,
	c: Cursor,
	at: number,
	body: string,
	live: number[]
): void {
	const text = fence_text(c);
	let gen = at;
	let src = c.value_start;
	for (let i = 0; i < live.length; i += 3) {
		const len = live[i + 2];
		const s = hl_source(c, text, live[i + 1], len);
		if (s === -1 || s < src) continue;
		const g = at + live[i];
		if (g > gen) tr_run(sink, gen, g, src, s);
		tr_run(sink, g, g + len, s, s + len);
		gen = g + len;
		src = s + len;
	}
	const end = at + body.length;
	if (end > gen) tr_run(sink, gen, end, src, c.value_end);
}
