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
import { data_text, data_code, data_svelte, data_structure } from './mappings';
import type { Mapping, MappingData, MappingRole } from './mappings';

export type { Mapping, CodeInformation, MappingData } from './mappings';

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

//  pending mapping entry (resolved to Mapping<MappingData> after render)

export interface PendingMapping {
	out_idx: number;
	out_count: number;
	source_offset: number;
	source_length: number;
	data: MappingData;
}

/** emit a mapping entry. skips if generated range is empty. */
export function _emit(
	entries: PendingMapping[],
	out_start: number,
	out_end: number,
	src_start: number,
	src_end: number,
	data: MappingData
): void {
	if (out_end > out_start && src_start !== NONE) {
		entries.push({
			out_idx: out_start,
			out_count: out_end - out_start,
			source_offset: src_start,
			source_length: src_end > src_start ? src_end - src_start : 0,
			data,
		});
	}
}

/** emit node span + open_syntax + close_syntax for a rendered node. */
function _spans(
	entries: PendingMapping[],
	pre: number,
	after_open: number,
	before_close: number,
	post: number,
	c: Cursor,
	data: (node_index: number, role: MappingRole) => MappingData
): void {
	const idx = c.index;
	const s = c.start,
		e = c.end,
		vs = c.value_start,
		ve = c.value_end;
	// value range is meaningful when ve > vs (same check as Cursor.text()).
	// Uint32Array defaults to 0 for unset slots, so ve !== NONE is not enough.
	const has_value = ve > vs;
	_emit(entries, pre, post, s, e, data(idx, 'node'));
	_emit(
		entries,
		pre,
		after_open,
		s,
		has_value ? vs : s,
		data_structure(idx, 'open_syntax')
	);
	_emit(
		entries,
		before_close,
		post,
		has_value ? ve : e,
		e,
		data_structure(idx, 'close_syntax')
	);
}

//  static chunk fold

// the final join costs about the same per chunk whatever its length, and a
// third of the chunks are static literals right after another static. every
// static literal gets a small id, and an unmapped render holds the last static
// in a one-slot register instead of pushing it. a static after a static looks
// the pair up in a table of precomputed composites, so the run reaches out as
// one flat string and nothing is allocated once the table is warm. a concat
// at runtime would build a cons string that join then has to walk.
// the mapped render indexes out by chunk, so it pushes every chunk as before.

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

/** cell open tags (none, left, center, right), precomputed so each is one chunk. */
function _cell_opens(tag: string): Uint8Array {
	return Uint8Array.of(
		fold_base(`<${tag}>`),
		fold_base(`<${tag} align="left">`),
		fold_base(`<${tag} align="center">`),
		fold_base(`<${tag} align="right">`)
	);
}
const TH_OPEN = _cell_opens('th');
const TD_OPEN = _cell_opens('td');

// wrapper nodes (open, children, close) render through one shared path. rows
// are node kinds, headings use rows past the kinds by depth, and the first
// heading row covers depths the parser never emits.
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

// the register is threaded through the render functions as an argument and
// a return value rather than kept in module state, so turbofan holds it in a
// machine register and never loads or stores it through the module context.
// NO_FOLD marks a mapped render, where every chunk is pushed as it comes,
// 0 is an empty register and any other value is the pending static id.
const NO_FOLD = -1;

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

/** push a static literal, or hold it in the register. returns the register. */
function push_static(out: string[], p: number, id: number): number {
	if (p > 0) {
		const v = FOLD_PAIR[(p << 7) | id];
		return v !== 0 ? v : fold_miss(out, p, id);
	}
	if (p === 0) return id;
	out.push(FOLD_STR[id]);
	return p;
}

/** push a dynamic chunk after whatever static is pending. returns the register. */
function push_dyn(out: string[], p: number, s: string): number {
	if (p > 0) {
		out.push(FOLD_STR[p]);
		p = 0;
	}
	out.push(s);
	return p;
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

//  generic attribute emission

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
function _attrs(
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

/** whether _attrs would emit anything for this metadata. */
function _has_attrs(meta: Record<string, unknown>): boolean {
	for (const key in meta) {
		if (INTERNAL_KEYS.has(key)) continue;
		const val = meta[key];
		if (val !== false && val != null) return true;
	}
	return false;
}

/**
 * push `head`, then any attributes, then `end`. with no attributes it pushes
 * the precomputed `folded` (head + end) instead, because the final join costs
 * per chunk rather than per char.
 */
function _open(
	c: Cursor,
	out: string[],
	p: number,
	head: number,
	folded: number,
	end: number
): number {
	const meta = c.meta();
	if (!meta || !_has_attrs(meta)) return push_static(out, p, folded);
	p = push_static(out, p, head);
	p = _attrs(meta, out, p);
	return push_static(out, p, end);
}

const LINK_HANDLED = new Set(['href', 'title']);
const IMAGE_HANDLED = new Set(['title']);

//  renderer

/** render children of the current cursor position, collecting escaped text and recursive node output. */
export function _children(
	c: Cursor,
	out: string[],
	entries?: PendingMapping[]
): void {
	// external callers may index out by chunk, so they never fold
	render_children(c, out, entries, NO_FOLD);
}

/** render a single node at the current cursor position. */
export function _node(
	c: Cursor,
	out: string[],
	entries?: PendingMapping[]
): void {
	render_node(c, out, entries, NO_FOLD);
}

function render_children(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	if (!c.goto_first_child()) return p;
	do {
		const k = c.kind;
		if (k === K_TEXT) {
			const vs = c.value_start,
				ve = c.value_end;
			if (entries && vs !== NONE && ve > vs) {
				_emit(
					entries,
					out.length,
					out.length + 1,
					vs,
					ve,
					data_text(c.index, 'content')
				);
			}
			p = push_dyn(out, p, escape_text(c));
		} else if (k !== K_LINE_BREAK) {
			// line breaks render nothing, a fifth of visited nodes skip the call
			p = render_node(c, out, entries, p);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
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

function render_node(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	let row = c.kind;
	switch (row) {
		case K_ROOT:
			return render_children(c, out, entries, p);

		case K_PARAGRAPH:
			// pending paragraphs inside list_items are speculative tight-list
			// wrappers, render their children transparently until the list
			// closes (commit keeps the wrapper, revoke drops it).
			if (c.pending && c.parent_kind === K_LIST_ITEM) {
				return render_children(c, out, entries, p);
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
			const pre = out.length;
			p = _open(c, out, p, WRAP_HEAD[row], WRAP_FOLDED[row], WRAP_END[row]);
			const ao = out.length;
			p = render_children(c, out, entries, p);
			const bc = out.length;
			p = push_static(out, p, WRAP_CLOSE[row]);
			if (entries) _spans(entries, pre, ao, bc, out.length, c, data_text);
			return p;
		}

		case K_CODE_SPAN: {
			const pre = out.length;
			p = _open(c, out, p, S_CODE, S_CODE_OPEN, S_GT);
			const ao = out.length;
			if (entries) {
				_emit(
					entries,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					data_code(c.index, 'content')
				);
			}
			const code = escape_text(c);
			p = push_dyn(
				out,
				p,
				code.indexOf('\n') === -1 ? code : code.replace(/\n/g, ' ')
			);
			const bc = out.length;
			p = push_static(out, p, S_CODE_CLOSE);
			if (entries) _spans(entries, pre, ao, bc, out.length, c, data_code);
			return p;
		}

		case K_CODE_FENCE:
			return _code_fence(c, out, entries, p);

		case K_LINK:
			return _link(c, out, entries, p);

		case K_IMAGE:
			return _image(c, out, entries, p);

		case K_LIST:
			return _list(c, out, entries, p);

		case K_THEMATIC_BREAK: {
			const pre = out.length;
			p = push_static(out, p, S_HR);
			if (entries)
				_spans(
					entries,
					pre,
					out.length,
					out.length,
					out.length,
					c,
					data_structure
				);
			return p;
		}

		case K_HARD_BREAK:
			return push_static(out, p, S_BR);

		case K_SOFT_BREAK:
			return push_static(out, p, S_LF);

		case K_HTML:
			return _html(c, out, entries, p);

		case K_HTML_COMMENT: {
			const pre = out.length;
			p = push_static(out, p, S_COMMENT_OPEN);
			const ao = out.length;
			if (entries) {
				_emit(
					entries,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					data_text(c.index, 'content')
				);
			}
			p = push_dyn(out, p, c.text());
			const bc = out.length;
			p = push_static(out, p, S_COMMENT_CLOSE);
			if (entries) _spans(entries, pre, ao, bc, out.length, c, data_text);
			return p;
		}

		case K_MUSTACHE: {
			const pre = out.length;
			p = push_static(out, p, S_BRACE_OPEN);
			const ao = out.length;
			if (entries) {
				_emit(
					entries,
					out.length,
					out.length + 1,
					c.value_start,
					c.value_end,
					data_svelte(c.index, 'content')
				);
			}
			p = push_dyn(out, p, c.text());
			const bc = out.length;
			p = push_static(out, p, S_BRACE_CLOSE);
			if (entries) _spans(entries, pre, ao, bc, out.length, c, data_svelte);
			return p;
		}

		case K_SVELTE_TAG:
			return _svelte_tag(c, out, entries, p);

		case K_SVELTE_BLOCK:
			return _svelte_block(c, out, entries, p);

		case K_TABLE: {
			const pre = out.length;
			p = _open(c, out, p, S_TABLE, S_TABLE_OPEN, S_GT_LF);
			const ao = out.length;
			p = _table_content(c, out, entries, p);
			const bc = out.length;
			p = push_static(out, p, S_TABLE_CLOSE);
			if (entries) _spans(entries, pre, ao, bc, out.length, c, data_structure);
			return p;
		}

		case K_LINE_BREAK:
			return p;

		default:
			return render_children(c, out, entries, p);
	}
}

function _code_fence(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
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
		p = push_static(out, p, S_PRE_CODE_LANG);
		p = push_dyn(out, p, escape(info));
		p = _open(c, out, p, S_QUOTE, S_QUOTE_GT, S_GT);
	} else {
		p = _open(c, out, p, S_PRE_CODE, S_PRE_CODE_OPEN, S_GT);
	}
	const ao = out.length;
	if (entries) {
		_emit(
			entries,
			out.length,
			out.length + 1,
			c.value_start,
			c.value_end,
			data_code(c.index, 'content')
		);
	}
	p = push_dyn(out, p, escape_text(c));
	const bc = out.length;
	p = push_static(out, p, S_PRE_CODE_CLOSE);
	if (entries) _spans(entries, pre, ao, bc, out.length, c, data_code);
	return p;
}

function _link(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const pre = out.length;
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
	p = _attrs(meta, out, p, LINK_HANDLED);
	p = push_static(out, p, S_GT);
	const ao = out.length;
	p = render_children(c, out, entries, p);
	const bc = out.length;
	p = push_static(out, p, S_A_CLOSE);
	if (entries) _spans(entries, pre, ao, bc, out.length, c, data_text);
	return p;
}

function _image(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const pre = out.length;
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
	p = _attrs(meta, out, p, IMAGE_HANDLED);
	p = push_static(out, p, S_SELF_CLOSE);
	if (entries) _spans(entries, pre, pre, out.length, out.length, c, data_text);
	return p;
}

function _list(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const pre = out.length;
	const meta = c.meta();
	const ordered = !!meta?.ordered;
	const start = meta?.start as number | undefined;
	if (ordered && start != null && start !== 1) {
		p = push_static(out, p, S_OL_START);
		p = push_dyn(out, p, String(start));
		p = _open(c, out, p, S_QUOTE, S_QUOTE_GT_LF, S_GT_LF);
	} else if (ordered) {
		p = _open(c, out, p, S_OL, S_OL_OPEN, S_GT_LF);
	} else {
		p = _open(c, out, p, S_UL, S_UL_OPEN, S_GT_LF);
	}
	const ao = out.length;
	p = render_children(c, out, entries, p);
	const bc = out.length;
	p = push_static(out, p, ordered ? S_OL_CLOSE : S_UL_CLOSE);
	if (entries) _spans(entries, pre, ao, bc, out.length, c, data_structure);
	return p;
}

/** push raw html attributes as parsed. */
function _html_attrs(
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

function _html(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const pre = out.length;
	const meta = c.meta();
	const tag = meta?.tag as string;
	const html_attrs = meta?.attributes as
		| Record<string, string | boolean>
		| undefined;

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
			p = push_dyn(out, p, passthrough);
		} else {
			p = push_static(out, p, S_LT);
			p = push_dyn(out, p, tag);
			if (html_attrs) p = _html_attrs(html_attrs, out, p);
			p = push_static(out, p, S_SELF_CLOSE);
		}
		if (entries) {
			_emit(
				entries,
				pre,
				out.length,
				c.start,
				c.end,
				data_svelte(c.index, 'content')
			);
		}
		return p;
	}

	p = push_static(out, p, S_LT);
	p = push_dyn(out, p, tag);
	if (html_attrs) p = _html_attrs(html_attrs, out, p);
	p = push_static(out, p, S_GT);
	const ao = out.length;
	// raw-text elements: parser stores content as value range on
	// the html node itself (no child nodes). emit unescaped, the
	// browser does not parse script/style bodies as html.
	if (tag === 'script' || tag === 'style') {
		if (entries) {
			_emit(
				entries,
				out.length,
				out.length + 1,
				c.value_start,
				c.value_end,
				data_svelte(c.index, 'content')
			);
		}
		p = push_dyn(out, p, c.text());
	} else {
		p = render_children(c, out, entries, p);
	}
	const bc = out.length;
	p = push_static(out, p, S_END_TAG);
	p = push_dyn(out, p, tag);
	p = push_static(out, p, S_GT);
	if (entries) _spans(entries, pre, ao, bc, out.length, c, data_text);
	return p;
}

function _svelte_tag(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const pre = out.length;
	const meta = c.meta();
	const tag = meta?.tag as string;
	const text = c.text();
	p = push_static(out, p, S_AT_OPEN);
	p = push_dyn(out, p, tag);
	if (text) p = push_static(out, p, S_SPACE);
	const ao = out.length;
	if (text && entries) {
		_emit(
			entries,
			out.length,
			out.length + 1,
			c.value_start,
			c.value_end,
			data_svelte(c.index, 'content')
		);
	}
	if (text) p = push_dyn(out, p, text);
	const bc = out.length;
	p = push_static(out, p, S_BRACE_CLOSE);
	if (entries) _spans(entries, pre, ao, bc, out.length, c, data_svelte);
	return p;
}

function _svelte_block(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const pre = out.length;
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
					if (entries) {
						_emit(
							entries,
							out.length,
							out.length + 1,
							c.value_start,
							c.value_end,
							data_svelte(c.index, 'content')
						);
					}
					p = push_dyn(out, p, branch_expr);
				}
				p = push_static(out, p, S_BRACE_CLOSE_LF);
				p = render_children(c, out, entries, p);
			} else if (c.kind !== K_LINE_BREAK) {
				p = render_node(c, out, entries, p);
			}
		} while (c.goto_next_sibling());
		c.goto_parent();
	}
	p = push_static(out, p, S_BLOCK_CLOSE);
	p = push_dyn(out, p, block_tag);
	p = push_static(out, p, S_BRACE_CLOSE);
	// node span for the whole block, use the block node (goto_parent already called)
	if (entries) {
		const idx = c.index;
		const s = c.start,
			e = c.end;
		_emit(entries, pre, out.length, s, e, data_svelte(idx, 'node'));
	}
	return p;
}

function _table_content(
	c: Cursor,
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const meta = c.meta();
	const alignments = (meta?.alignments as string[]) ?? [];
	let in_body = false;

	if (!c.goto_first_child()) return p;
	do {
		if (c.kind === K_TABLE_HEADER) {
			p = push_static(out, p, S_THEAD_OPEN);
			p = _table_cells(c, 'th', alignments, out, entries, p);
			p = push_static(out, p, S_THEAD_CLOSE);
		} else if (c.kind === K_TABLE_ROW) {
			if (!in_body) {
				p = push_static(out, p, S_TBODY_OPEN);
				in_body = true;
			}
			p = push_static(out, p, S_TR_OPEN);
			p = _table_cells(c, 'td', alignments, out, entries, p);
			p = push_static(out, p, S_TR_CLOSE);
		}
	} while (c.goto_next_sibling());
	c.goto_parent();

	if (in_body) p = push_static(out, p, S_TBODY_CLOSE);
	return p;
}

function _table_cells(
	c: Cursor,
	tag: string,
	alignments: string[],
	out: string[],
	entries: PendingMapping[] | undefined,
	p: number
): number {
	const opens = tag === 'th' ? TH_OPEN : TD_OPEN;
	const close = tag === 'th' ? S_TH_CLOSE : S_TD_CLOSE;
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
			p = render_children(c, out, entries, p);
			p = push_static(out, p, close);
			col++;
		}
	} while (c.goto_next_sibling());
	c.goto_parent();
	return p;
}

//  mapping resolution

// grow-only cumulative offset table shared by every render, resolution is
// synchronous so one table is enough and a fresh renderer allocates nothing.
let offsets_scratch = new Uint32Array(0);

/** convert pending mapping entries to volar-compatible Mapping[] using out[] offsets. */
export function _resolve_mappings(
	out: string[],
	entries: PendingMapping[],
	scratch?: Uint32Array
): Mapping<MappingData>[] {
	// build cumulative offset table
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

	const mappings: Mapping<MappingData>[] = [];
	for (let i = 0; i < entries.length; i++) {
		const e = entries[i];
		const gen_offset = offsets[e.out_idx];
		const gen_length = offsets[e.out_idx + e.out_count] - gen_offset;
		const m: Mapping<MappingData> = {
			sourceOffsets: [e.source_offset],
			generatedOffsets: [gen_offset],
			lengths: [e.source_length],
			data: e.data,
		};
		if (gen_length !== e.source_length) {
			m.generatedLengths = [gen_length];
		}
		mappings.push(m);
	}
	return mappings;
}

//  internal helpers

/** render the node at the current cursor position into out, which is only joined. */
function render_folded(c: Cursor, out: string[]): void {
	const p = render_node(c, out, undefined, 0);
	if (p > 0) out.push(FOLD_STR[p]);
}

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
	private entries: PendingMapping[] = [];

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

	/** render with source mapping. always full render (no caching). */
	update_mapped(
		buf: NodeBuffer,
		source: string
	): { blocks: CursorBlockEntry[]; mappings: Mapping<MappingData>[] } {
		if (!this.cursor) {
			this.cursor = new Cursor(buf, source);
		} else {
			this.cursor.reinit(buf, source);
		}
		const c = this.cursor;
		c.reset();
		esc_reset(source);

		const out = this.out;
		const entries = this.entries;
		if (out.length !== 0) out.length = 0;
		if (entries.length !== 0) entries.length = 0;
		render_node(c, out, entries, NO_FOLD);
		this.html = out.join('');
		const mappings = _resolve_mappings(out, entries);
		return { blocks: this.blocks, mappings };
	}

	reset(): void {
		this.blocks.length = 0;
		this.closed?.clear();
		this.html = '';
	}
}
