import {
	BACKTICK,
	CARET,
	CLOSE_BRACE,
	TILDE,
	LINEFEED,
	OCTOTHERP,
	OPEN_ANGLE_BRACKET,
	OPEN_BRACE,
	SPACE,
	TAB,
	CLOSE_ANGLE_BRACKET,
	BACKSLASH,
	EXCLAMATION_MARK,
	AT,
	ASTERISK,
	DASH,
	UNDERSCORE,
	OPEN_SQUARE_BRACKET,
	CLOSE_SQUARE_BRACKET,
	OPEN_PAREN,
	CLOSE_PAREN,
	COLON,
	PLUS,
	DOT,
	PIPE,
	SLASH,
	QUOTE,
	APOSTROPHE,
	EQUALS,
	COMMA,
} from './constants';

import type { ParseOptions } from './types';

import type { Emitter } from './opcodes';
import { NodeKind } from './utils';
import { NodeBuffer, ErrorCollector } from './utils';
import { TreeBuilder } from './tree_builder';
import { PluginDispatcher } from './plugin_dispatch';
import { SourceTextSource } from './node_view';
export type { ParseOptions, ParseResult } from './types';
export type { ParsePlugin } from './plugin_types';
export { NodeKind, NodeBuffer } from './utils';
export { PluginDispatcher } from './plugin_dispatch';
export { SourceTextSource, WireTextSource } from './node_view';

export { WireEmitter, WireOp } from './wire_emitter';
export type { Emitter } from './opcodes';

// a method load on the source goes megamorphic across its string maps, a call through the builtin still inlines
const char_code_at = String.prototype.charCodeAt;
const string_slice = String.prototype.slice;
const string_index_of = String.prototype.indexOf;
const string_starts_with = String.prototype.startsWith;
const string_last_index_of = String.prototype.lastIndexOf;

const enum CharMask {
	whitespace = 1 << 0,
	punctuation = 1 << 1,
	word = 1 << 2,
}

const CHAR_CLASS_TABLE = new Uint8Array(128);

for (let i = 0; i < CHAR_CLASS_TABLE.length; i += 1) {
	let mask = 0;

	if (i <= 0x20) {
		mask |= CharMask.whitespace;
	}

	// ascii punctuation per commonmark spec:
	// u+0021 to 002f, u+003a to 0040, u+005b to 0060, u+007b to 007e
	if (
		(i >= 0x21 && i <= 0x2f) ||
		(i >= 0x3a && i <= 0x40) ||
		(i >= 0x5b && i <= 0x60) ||
		(i >= 0x7b && i <= 0x7e)
	) {
		mask |= CharMask.punctuation;
	}

	if (mask === 0) {
		mask = CharMask.word;
	}

	CHAR_CLASS_TABLE[i] = mask;
}

// unicode whitespace code points (zs category + u+0009 to 000d already handled above)
const is_unicode_whitespace = (code: number): boolean =>
	code === 0xa0 ||
	code === 0x1680 ||
	(code >= 0x2000 && code <= 0x200a) ||
	code === 0x2028 ||
	code === 0x2029 ||
	code === 0x202f ||
	code === 0x205f ||
	code === 0x3000;

const classify = (code: number): CharMask =>
	// common case first: ascii (code < 128). nan < 128 is false, so
	// nan falls through to the second branch where code !== code catches it.
	code < 128
		? CHAR_CLASS_TABLE[code]
		: code !== code
			? // nan means charcodeat read past the buffer. return a mask that
				// satisfies all flanking checks so both openers and closers
				// commit speculatively. revocation corrects if wrong.
				CharMask.whitespace | CharMask.punctuation | CharMask.word
			: is_unicode_whitespace(code)
				? CharMask.whitespace
				: CharMask.word;

/**
 * lookup table for characters that break out of text scanning.
 * any character that requires the text state to yield control
 * (delimiters, escapes, line breaks, table pipes).
 */
/** shared empty error collector - avoids allocation when no errors are recorded. */
const EMPTY_ERRORS = new ErrorCollector(1);

/** never written, most documents define no references so a parser swaps in its own map at the first definition */
const NO_REFS: Map<string, { url: string; title: string }> = new Map();

/** an ascii label with no uppercase, no control chars and single inner spaces is already normal */
function normalize_label(label: string): string {
	const n = label.length;
	let prev = SPACE;
	for (let i = 0; i < n; i++) {
		const c = char_code_at.call(label, i);
		if (
			c <= SPACE
				? c !== SPACE || prev === SPACE
				: c >= 65 && (c <= 90 || c >= 128)
		)
			return normalize_label_slow(label);
		prev = c;
	}
	return prev === SPACE ? normalize_label_slow(label) : label;
}

function normalize_label_slow(label: string): string {
	return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

// a leaked list_depth can leave the stack short, blocks then read the padding hole as their parent
function truncate_stack(stack: number[], base: number): void {
	while (stack.length > base) stack.pop();
	if (stack.length < base) stack.length = base;
}

const WAIT_NONE = 0;
const WAIT_FENCE = 1;
const WAIT_RAW = 2;
const WAIT_BRACE = 3;
const WAIT_NEEDLE = 4;
// a const enum adds no module binding, a new one shifts later context slots and can widen batch path bytecode
const enum FeedWait {
	// an unclosed code span past the trim gap, a chunk with no backtick and no possibly blank line cannot end it
	code_span = 5,
	// a block quote fence, a chunk with no backtick whose lines all carry the quote markers decides nothing
	bq_fence = 6,
}

// resumable brace probe states, one char at a time so a scan cut at the input end resumes exactly
const BM_CODE = 0;
const BM_SLASH = 1;
const BM_STR = 2;
const BM_STR_ESC = 3;
const BM_TPL = 4;
const BM_TPL_ESC = 5;
const BM_TPL_DOLLAR = 6;
const BM_LINE = 7;
const BM_BLOCK = 8;
const BM_BLOCK_STAR = 9;

const ID_KIND_MASK = 0x7f;
const ID_CLOSED = 0x80;
// sixteen entries is 64 bytes, the largest typed array v8 keeps on heap
const ID_MIN_CAPACITY = 16;
const ID_POOL_CAP = 1 << 16;
const EMPTY_IDS = new Int32Array(0);
/** placeholder for rarely used stacks until their first push, never written */
const NO_STACK: any[] = [];

// shared by every parser, a parser drops its references when it hands them back so no two hold the same table
let spare_ids: Int32Array | null = null;
let spare_slots: Int32Array = EMPTY_IDS;

// a node stack hole is an undefined id, closing it stores an undefined property on the id table
type HoleIds = { undefined?: number };

const JOIN_PAIR: string[] = ['', ''];

/** join rather than concat, a cons string window costs about twice as much per charCodeAt */
function append_flat(head: string, tail: string): string {
	if (tail.length === 0) return head;
	if (head.length === 0) return tail;
	JOIN_PAIR[0] = head;
	JOIN_PAIR[1] = tail;
	const joined = JOIN_PAIR.join('');
	JOIN_PAIR[0] = '';
	JOIN_PAIR[1] = '';
	return joined;
}

/**
 * normalize line endings to `\n`. per commonmark 2.1, a line ending is
 * `\n`, `\r`, or `\r\n`. the state machine only recognizes `\n`, so we
 * collapse the others at the input boundary. fast path: no allocation
 * when the input has no `\r`.
 */
export function normalize_newlines(source: string): string {
	let cr = string_index_of.call(source, '\r');
	if (cr === -1) return source;
	// join builds one flat string, a += rope would leave a cons every later charCodeAt has to unwrap
	const lines: string[] = [];
	let from = 0;
	let lone = false;
	while (cr !== -1) {
		lines.push(string_slice.call(source, from, cr));
		from = cr + 1;
		if (char_code_at.call(source, from) === 0x0a) from++;
		else lone = true;
		cr = string_index_of.call(source, '\r', from);
	}
	lines.push(string_slice.call(source, from));
	// take_collapsed reads the offsets off these lines, a lone \r does not collapse so those inputs rescan
	crlf_raw = lone ? null : source;
	crlf_lines = lone ? null : lines;
	return lines.join('\n');
}

let crlf_raw: string | null = null;
let crlf_lines: string[] | null = null;

/**
 * collapsed offsets from the lines the last normalize_newlines split, undefined unless that
 * call was for raw and saw no lone \r, clears them so raw is not kept alive
 */
export function take_collapsed(raw: string): number[] | undefined {
	const lines = crlf_lines;
	const last = crlf_raw;
	crlf_raw = null;
	crlf_lines = null;
	if (lines === null || last !== raw) return undefined;
	// every line but the last ended in a \r\n that became one \n
	const n = lines.length - 1;
	const collapsed: number[] = new Array(n);
	let at = 0;
	for (let i = 0; i < n; i++) {
		at += lines[i].length;
		collapsed[i] = at;
		at++;
	}
	return collapsed;
}

/** maps parser offsets back to the raw source, a collapsed \n maps to its \r */
export class RawOffsets {
	/** normalized offsets of each \n that was \r\n, ascending */
	readonly collapsed: number[];

	constructor(collapsed: number[]) {
		this.collapsed = collapsed;
	}

	/** collapsed line endings before offset */
	rank(offset: number): number {
		const collapsed = this.collapsed;
		let lo = 0;
		let hi = collapsed.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (collapsed[mid] < offset) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	to_raw(offset: number): number {
		return offset + this.rank(offset);
	}
}

/** null when raw has no \r\n */
export function raw_offsets(raw: string): RawOffsets | null {
	const collapsed: number[] = [];
	let i = raw.indexOf('\r\n');
	while (i !== -1) {
		collapsed.push(i - collapsed.length);
		i = raw.indexOf('\r\n', i + 2);
	}
	return collapsed.length === 0 ? null : new RawOffsets(collapsed);
}

const BRACE_STOP = new Uint8Array(128);
BRACE_STOP[OPEN_BRACE] = 1;
BRACE_STOP[CLOSE_BRACE] = 1;
BRACE_STOP[QUOTE] = 1;
BRACE_STOP[APOSTROPHE] = 1;
BRACE_STOP[BACKTICK] = 1;
BRACE_STOP[SLASH] = 1;

const TEXT_BREAK = new Uint8Array(128);
TEXT_BREAK[LINEFEED] = 1;
TEXT_BREAK[BACKSLASH] = 1;
TEXT_BREAK[ASTERISK] = 1;
TEXT_BREAK[UNDERSCORE] = 1;
TEXT_BREAK[TILDE] = 1;
TEXT_BREAK[CARET] = 1;
TEXT_BREAK[OPEN_ANGLE_BRACKET] = 1;
TEXT_BREAK[OPEN_SQUARE_BRACKET] = 1;
TEXT_BREAK[CLOSE_SQUARE_BRACKET] = 1;
TEXT_BREAK[EXCLAMATION_MARK] = 1;
TEXT_BREAK[BACKTICK] = 1;
TEXT_BREAK[PIPE] = 1;
TEXT_BREAK[OPEN_BRACE] = 1;
TEXT_BREAK[COLON] = 1;

export const enum StateKind {
	root = 0,
	text = 1,
	heading_marker = 2,
	code_fence_start = 3,
	code_fence_info = 4,
	code_fence_content = 5,
	code_fence_text_end = 6,
	paragraph = 7,
	inline = 8,
	code_span_start = 9,
	code_span_info = 10,
	code_span_content_leading_space = 11,
	code_span_leading_space_end = 12,
	code_span_end = 13,
	strong_emphasis = 14,
	emphasis = 15,
	autolink = 16,
	block_quote = 17,
	list_item = 18,
	strikethrough = 19,
	superscript = 20,
	subscript = 21,
	link_text = 22,
	table_body = 23,
	table_row_content = 24,
	html_element = 25,
	html_block_element = 26,
	svelte_branch = 27,
	directive_container = 28,
	frontmatter = 29,
	raw_text = 30,
}

interface MarkerResult {
	indent: number;
	marker_char: number;
	ordered: boolean;
	start_num: number;
	content_start: number;
	content_offset: number;
}

interface LinkResult {
	text_start: number;
	text_end: number;
	url_start: number;
	url_end: number;
	title_start: number;
	title_end: number;
	end: number;
}

// feed trims inside paragraphs and containers once the window holds this much before the cursor
const TRIM_GAP = 1024;

/** containers whose states reread nothing before the current line except an html opener line */
function is_trim_container(kind: number): boolean {
	return (
		kind === NodeKind.block_quote ||
		kind === NodeKind.list ||
		kind === NodeKind.list_item ||
		kind === NodeKind.svelte_block ||
		kind === NodeKind.svelte_branch ||
		kind === NodeKind.html
	);
}

function is_ascii_letter(c: number): boolean {
	return (c | 32) >= 97 && (c | 32) <= 122;
}

// positions just past braces a find_matching_brace_memo scan opened and has not closed, empty between scans
const brace_open: number[] = [];

// open tag scan record, the name end then kind, name start, name end, value start, value end per attribute
let tag_rec = new Int32Array(80);
let tag_rec_n = 0;
let tag_name_end = 0;

function tag_rec_put(
	kind: number,
	a: number,
	b: number,
	c: number,
	d: number
): void {
	let rec = tag_rec;
	const n = tag_rec_n;
	if (n + 5 > rec.length) {
		const grown = new Int32Array(rec.length * 2);
		grown.set(rec);
		rec = tag_rec = grown;
	}
	rec[n] = kind;
	rec[n + 1] = a;
	rec[n + 2] = b;
	rec[n + 3] = c;
	rec[n + 4] = d;
	tag_rec_n = n + 5;
}
// token starts a memo backed open tag scan passed through
const tag_marks: number[] = [];
let tag_fail_p = 0;
// in feed mode what a scan that ran off the end waits for, a closing quote, brace or angle bracket
let tag_need = '>';
let tag_self_closing = false;
const TAG_ATTR_BOOL = 0;
const TAG_ATTR_VALUE = 1;
const TAG_ATTR_SHORTHAND = 2;
const TAG_ATTR_EXPR = 3;
// failed scans shorter than this never start the open tag memo
const TAG_MEMO_MIN = 256;

/**
 * find_matching_brace from p at depth for strings, comments and long scans
 * -1 when the input runs out, -2 when a nested template brace did
 * a module function so find_matching_brace stays small
 */
function find_matching_brace_far(
	parser: PFMParser,
	source: string,
	base: number,
	length: number,
	p: number,
	depth: number
): number {
	// a scan still going after this window finds its stops with indexOf
	const lim = length - p > 4096 ? p + 4096 : length;
	while (p < lim) {
		const ch = char_code_at.call(source, p - base);
		if (ch >= 128 || BRACE_STOP[ch] === 0) {
			p++;
			continue;
		}

		switch (ch) {
			case OPEN_BRACE:
				depth++;
				p++;
				break;
			case CLOSE_BRACE:
				depth--;
				if (depth === 0) return p + 1;
				p++;
				break;
			case QUOTE:
			case APOSTROPHE: {
				const needle = ch === QUOTE ? '"' : "'";
				let r = p + 1 - base;
				p = length;
				for (;;) {
					const q = string_index_of.call(source, needle, r);
					if (q === -1) break;
					let k = q;
					while (k > r && char_code_at.call(source, k - 1) === BACKSLASH) k--;
					if (((q - k) & 1) === 0) {
						p = q + 1 + base;
						break;
					}
					r = q + 1;
				}
				break;
			}
			case BACKTICK: {
				p++;
				while (p < length && char_code_at.call(source, p - base) !== BACKTICK) {
					if (char_code_at.call(source, p - base) === BACKSLASH) {
						p++;
					} else if (
						char_code_at.call(source, p - base) === 36 /* $ */ &&
						p + 1 < length &&
						char_code_at.call(source, p + 1 - base) === OPEN_BRACE
					) {
						p += 2;
						const inner_end = parser.find_matching_brace(p);
						if (inner_end === -1) return -2;
						p = inner_end;
						continue;
					}
					p++;
				}
				if (p < length) p++;
				break;
			}
			case SLASH: {
				if (
					p + 1 < length &&
					char_code_at.call(source, p + 1 - base) === SLASH
				) {
					p += 2;
					while (p < length && char_code_at.call(source, p - base) !== LINEFEED)
						p++;
					break;
				}
				if (
					p + 1 < length &&
					char_code_at.call(source, p + 1 - base) === ASTERISK
				) {
					p += 2;
					while (p < length) {
						if (
							char_code_at.call(source, p - base) === ASTERISK &&
							p + 1 < length &&
							char_code_at.call(source, p + 1 - base) === SLASH
						) {
							p += 2;
							break;
						}
						p++;
					}
					break;
				}
				p++;
				break;
			}
			default:
				p++;
		}
	}

	if (p < length)
		return find_matching_brace_jump(parser, source, base, length, p, depth);
	return -1;
}

/**
 * find_matching_brace_far for scans that run thousands of chars, like a stray brace in prose
 * each stop char has its own indexOf cursor, advanced only once passed, same result
 */
function find_matching_brace_jump(
	parser: PFMParser,
	source: string,
	base: number,
	length: number,
	p: number,
	depth: number
): number {
	const end = length - base;
	let c_open = -1;
	let c_close = -1;
	let c_quote = -1;
	let c_apos = -1;
	let c_tick = -1;
	let c_slash = -1;
	let c_bs = -1;
	let c_dollar = -1;
	for (;;) {
		const r = p - base;
		if (c_open < r) {
			c_open = string_index_of.call(source, '{', r);
			if (c_open === -1 || c_open > end) c_open = end;
		}
		if (c_close < r) {
			c_close = string_index_of.call(source, '}', r);
			if (c_close === -1 || c_close > end) c_close = end;
		}
		if (c_quote < r) {
			c_quote = string_index_of.call(source, '"', r);
			if (c_quote === -1 || c_quote > end) c_quote = end;
		}
		if (c_apos < r) {
			c_apos = string_index_of.call(source, "'", r);
			if (c_apos === -1 || c_apos > end) c_apos = end;
		}
		if (c_tick < r) {
			c_tick = string_index_of.call(source, '`', r);
			if (c_tick === -1 || c_tick > end) c_tick = end;
		}
		if (c_slash < r) {
			c_slash = string_index_of.call(source, '/', r);
			if (c_slash === -1 || c_slash > end) c_slash = end;
		}
		let q = c_open;
		if (c_close < q) q = c_close;
		if (c_quote < q) q = c_quote;
		if (c_apos < q) q = c_apos;
		if (c_tick < q) q = c_tick;
		if (c_slash < q) q = c_slash;
		if (q >= end) return -1;
		const ch = char_code_at.call(source, q);
		p = q + base;

		switch (ch) {
			case OPEN_BRACE:
				depth++;
				p++;
				break;
			case CLOSE_BRACE:
				depth--;
				if (depth === 0) return p + 1;
				p++;
				break;
			case QUOTE:
			case APOSTROPHE: {
				const needle = ch === QUOTE ? '"' : "'";
				let r = p + 1 - base;
				p = length;
				for (;;) {
					const q = string_index_of.call(source, needle, r);
					if (q === -1) break;
					let k = q;
					while (k > r && char_code_at.call(source, k - 1) === BACKSLASH) k--;
					if (((q - k) & 1) === 0) {
						p = q + 1 + base;
						break;
					}
					r = q + 1;
				}
				break;
			}
			case BACKTICK: {
				p++;
				for (;;) {
					const t = p - base;
					if (c_tick < t) {
						c_tick = string_index_of.call(source, '`', t);
						if (c_tick === -1 || c_tick > end) c_tick = end;
					}
					if (c_bs < t) {
						c_bs = string_index_of.call(source, '\\', t);
						if (c_bs === -1 || c_bs > end) c_bs = end;
					}
					if (c_dollar < t) {
						c_dollar = string_index_of.call(source, '$', t);
						if (c_dollar === -1 || c_dollar > end) c_dollar = end;
					}
					let u = c_tick;
					if (c_bs < u) u = c_bs;
					if (c_dollar < u) u = c_dollar;
					if (u >= end) {
						p = length;
						break;
					}
					p = u + base;
					const c = char_code_at.call(source, u);
					if (c === BACKTICK) {
						p++;
						break;
					}
					if (c === BACKSLASH) {
						p += 2;
						continue;
					}
					if (
						p + 1 < length &&
						char_code_at.call(source, u + 1) === OPEN_BRACE
					) {
						p += 2;
						const inner_end = parser.find_matching_brace(p);
						if (inner_end === -1) return -2;
						p = inner_end;
						continue;
					}
					p++;
				}
				break;
			}
			case SLASH: {
				if (p + 1 < length) {
					const n = char_code_at.call(source, p + 1 - base);
					if (n === SLASH) {
						const nl = string_index_of.call(source, '\n', p + 2 - base);
						p = nl === -1 || nl >= end ? length : nl + base;
						break;
					}
					if (n === ASTERISK) {
						const close = string_index_of.call(source, '*/', p + 2 - base);
						p = close === -1 || close + 1 >= end ? length : close + 2 + base;
						break;
					}
				}
				p++;
				break;
			}
			default:
				p++;
		}
	}
}

interface ColdState {
	// raw text holds no markup so raw text elements never nest
	raw_node: number;
	raw_needle: string;
	raw_scan: number;
	// saved brace probe scan, start or -1, resume point, state, quote and frames of brace depth or 0 for a template
	bp_start: number;
	bp_p: number;
	bp_mode: number;
	bp_quote: number;
	bp_end: number;
	bp_frames: number[] | null;
	// finished input only, positions past braces known never to close, set by the first brace scan that runs out
	brace_memo: Set<number> | null;
	// finished input only, attribute token starts from which an open tag scan fails
	tag_memo: Uint8Array | null;
	tag_memo_base: number;
	wait_needle: string;
	wait_cursor: number;
	// the stalled block quote fence scan, fence cursor or -1 and the first line it has not passed
	bqf_at: number;
	bqf_line: number;
	// the cut, window base and kept html openers of the last trim_keeping_html, an equal trim keeps the window
	kept_cut: number;
	kept_base: number;
	kept_count: number;
	// a table start's header cell bounds as start, end pairs, allocated by the first table start
	table_bounds: Int32Array | null;
	// pending html nodes of an incremental parse, the feed trim skips the kept html scan at none
	pending_html: number;
	// pending slots below it hold only paragraphs, see revoke_stale_pending
	np_floor: number;
}

/**
 * pfm parser - state machine that emits opcodes via an emitter interface.
 */
export class PFMParser {
	// window starting at source_base so feed does not flatten the whole input, positions stay absolute
	private source: string = '';
	private source_base: number = 0;
	// source_base plus source length, a field read avoids a megamorphic length load
	private source_end: number = 0;
	// last line start with only containers open and nothing pending that rereads the source
	private trim_point: number = 0;
	// next line start to check for a closing fence, earlier lines cannot close it
	private fence_scan: number = 0;
	// a line start lf_ends_inline found to interrupt, so the paragraph close on that linefeed skips a rescan
	// valid within one _run while the list and svelte depths it was taken under hold
	private interrupt_pos: number = -1;
	private interrupt_list_depth: number = 0;
	// the list marker an interrupt check parsed at this position, only valid within one _run
	private interrupt_marker_pos: number = -1;
	private interrupt_marker: MarkerResult | null = null;
	private interrupt_svelte_depth: number = 0;
	// chunks fed while waiting on a brace, joined onto the window once it closes
	private wait_chunks: string[] = NO_STACK;
	// rare path state in one literal clone keeps the constructor small enough to inline
	private cold: ColdState = {
		raw_node: 0,
		raw_needle: '',
		raw_scan: 0,
		bp_start: -1,
		bp_p: 0,
		bp_mode: 0,
		bp_quote: 0,
		bp_end: -1,
		bp_frames: null,
		brace_memo: null,
		tag_memo: null,
		tag_memo_base: 0,
		wait_needle: '',
		wait_cursor: -1,
		bqf_at: -1,
		bqf_line: 0,
		kept_cut: -1,
		kept_base: 0,
		kept_count: 0,
		table_bounds: null,
		pending_html: 0,
		np_floor: 0,
	};
	// these stalls emit nothing until their close arrives, so feed can skip a chunk that cannot hold it
	private wait_kind: number = 0;
	private cursor: number = 0;
	private finished: boolean = false;
	// set by parse, a repair may then drop a delimiter string that slices the source at the node start
	// incremental trees keep theirs
	private one_shot: boolean = false;
	// deferred \r at the end of a feed() chunk: we can't tell whether it's
	// a bare \r (line ending) or the first half of a \r\n until we see the
	// next chunk's first char.
	private pending_cr: boolean = false;

	// state machine
	private states: StateKind[] = [StateKind.root];
	private node_stack: number[] = [0]; // stack of opcode ids

	// id generation
	private next_id: number = 1; // 0 is reserved for root
	private pending_ids: number[] = [];
	private id_info: Int32Array = EMPTY_IDS;
	// index of each pending id in pending_ids, stale unless pending_ids at that index matches
	private id_slots: Int32Array = EMPTY_IDS;
	// ids below this were closed by a finish that handed the id tables back
	private finalized_below: number = 0;
	private pending_starts: number[] = [];
	private pending_count: number = 0;
	// pending tight list paragraphs, they commit or revoke without reading the source
	private pending_para_count: number = 0;

	// the char before class_floor reads as whitespace, at document start or an inline range start
	private class_floor: number = 0;
	// the char after an inline range start, classed against the whole source not the range slice
	private range_next_class: number = 0;

	// block state
	private block_quote_depth: number = 0;
	private emphasis_has_content: boolean = false;
	// set by try_parse_html_open_tag in feed mode when the tag may still close and a wait for its end is set
	private tag_wait: boolean = false;
	private list_depth: number = 0;
	private list_marker: number = 0;
	private list_ordered: boolean = false;
	private list_start_num: number = 0;
	private list_node_id: number = 0;
	private list_is_loose: boolean = false;
	private list_content_offset: number = 0;
	private list_marker_indent: number = 0;
	private list_state_stack: {
		marker: number;
		ordered: boolean;
		start_num: number;
		node_idx: number;
		is_loose: boolean;
		content_offset: number;
		marker_indent: number;
		pending_paras: number[];
	}[] = NO_STACK;

	// tight-list speculation:  every list_item's content paragraph is
	// emitted as pending. at list close we finalize the collection,
	// committing them all if the list became loose, or revoking (unwrap)
	// them all if it stayed tight.
	private list_pending_paras: number[] = NO_STACK;

	// table
	private table_col_count: number = 0;
	private table_node_id: number = 0;
	private table_row_id: number = 0;
	private table_cell_id: number = 0;
	private table_cell_col: number = 0;

	private in_table: boolean = false;
	private in_heading: boolean = false;
	private inline_range_parse: boolean = false;
	private table_cell_has_content: boolean = false;

	// html state
	private html_tag_stack: { id: number; tag: string }[] = [];
	private html_block_depth: number = 0;

	// a paragraph opened at a tag stays pending, it keeps its wrapper only with
	// text outside tags and no block level tag
	private spec_para: number = -1;
	// source before spec_scan is scanned, spec_depth tags are open there
	private spec_scan: number = 0;
	private spec_depth: number = 0;
	private spec_text: boolean = false;
	private spec_block: boolean = false;
	// in a phrasing element, the wrapper always goes
	private spec_never: boolean = false;

	// svelte block state
	private svelte_block_depth: number = 0;
	private svelte_block_tag: string = '';
	private svelte_branch_id: number = 0;
	private svelte_block_id: number = 0;
	private svelte_block_stack: {
		block_id: number;
		branch_id: number;
		tag: string;
	}[] = NO_STACK;

	private frontmatter_failed: boolean = false;
	private imports_allowed: boolean = true;

	// link reference definitions
	private ref_map: Map<string, { url: string; title: string }> = NO_REFS;
	private link_text_start: number = 0;

	// directive container state
	private directive_colon_counts: number[] = NO_STACK;

	// open inline directives whose [text] is being parsed. ids and
	// literal bracket depths are parallel stacks - a non-empty stack
	// means links/images must not open, and the top depth tracks
	// unmatched literal `[` so the closing `]` can be found.
	private directive_text_ids: number[] = [];
	private directive_text_brackets: number[] = [];

	private extra: number = 0;
	private info_start_pos: number = 0;
	private info_end_pos: number = 0;
	private checkpoint_cursor: number = 0;
	private code_span_open_pos: number = 0;
	private prev_cursor: number = 0;
	// the lowest state stack depth sampled since the cursor last moved
	private prev_depth: number = 0;
	private loop_without_progress: number = 0;

	private out: Emitter;
	private errors: ErrorCollector;

	private tab_size: number;

	constructor(emitter: Emitter, tab_size: number = 2) {
		this.out = emitter;
		this.errors = EMPTY_ERRORS;
		this.tab_size = tab_size;
	}

	/**
	 * parse a complete source string.
	 * @param source the markdown source to parse.
	 * @returns object with error collector.
	 */
	/**
	 * parse a complete source string (batch mode). equivalent to
	 * init() + feed(source) + finish().
	 */
	parse(source: string): { errors: ErrorCollector } {
		return { errors: this.parse_normalized(normalize_newlines(source)) };
	}

	/**
	 * parse for a source normalize_newlines already returned, so the input is not scanned for \r twice
	 * @internal
	 */
	parse_normalized(src: string): ErrorCollector {
		const n = src.length;
		// documents run well above 8 chars a node, so this rarely grows
		this._init(n >> 3);
		this.source = src;
		this.source_end = n;
		this.errors = EMPTY_ERRORS;
		this.finished = true;
		this.one_shot = true;

		this._run();
		this._finalize();

		return this.errors;
	}

	/**
	 * initialize the parser for incremental feeding. must be called
	 * before the first feed() call.
	 */
	init(): void {
		// a parser that never ran still holds its constructor state
		if (this.id_info === EMPTY_IDS && this.finalized_below === 0) {
			this.take_ids(ID_MIN_CAPACITY);
			this.out.open(0, NodeKind.root, 0, -1, 0, false);
		} else this._init(ID_MIN_CAPACITY);
		this.cold.kept_cut = -1;
		this.cold.bqf_at = -1;
		this.finished = false;
		this.one_shot = false;
	}

	/**
	 * feed a chunk of source text. the parser advances as far as it
	 * can, stalling at line boundaries when lookahead is insufficient.
	 * call init() before the first feed().
	 *
	 * line-ending normalization: \r\n and bare \r are collapsed to \n
	 * before reaching the state machine. a trailing \r is deferred
	 * across feed() boundaries so a \r\n pair split across chunks is
	 * handled correctly.
	 */
	feed(chunk: string): void {
		// a length load on the chunk goes megamorphic once sliced and cons strings are fed
		let len = chunk.length;
		if (len === 0) return;

		if (this.pending_cr) {
			// prepend the lf for a bare cr so the window is still built in one join
			if (char_code_at.call(chunk, 0) !== 0x0a) {
				chunk = '\n' + chunk;
				len++;
			}
			this.pending_cr = false;
		}

		// defer a trailing \r in case the next chunk starts with \n
		if (len > 0 && char_code_at.call(chunk, len - 1) === 0x0d) {
			this.pending_cr = true;
			chunk = string_slice.call(chunk, 0, -1);
			len--;
		}

		if (string_index_of.call(chunk, '\r') !== -1) {
			chunk = chunk.replace(/\r\n?/g, '\n');
			len = chunk.length;
		}

		if (this.wait_kind !== WAIT_NONE && this.skip_wait(chunk, len)) {
			this.out.cursor(this.cursor);
			return;
		}
		this.wait_kind = WAIT_NONE;

		// keep one char before trim_point for the previous char lookbehind
		let head = this.source;
		const pending = this.wait_chunks;
		if (this.trim_point - 1 > this.source_base) {
			this.trim_before_indent();
		}
		// the scan rereads from spec_scan at the paragraph close
		if (this.spec_para !== -1 && this.trim_point > this.spec_scan)
			this.trim_point = this.spec_scan;
		if (this.trim_point - 1 > this.source_base) {
			if (
				this.pending_count !== this.pending_para_count &&
				this.cold.pending_html !== 0
			) {
				// the kept html lines are read from a whole window
				if (pending.length !== 0) head = this.join_held(head);
				head = this.trim_keeping_html(head);
			} else {
				head = string_slice.call(head, this.trim_point - 1 - this.source_base);
				this.source_base = this.trim_point - 1;
			}
		}

		let src: string;
		if (pending.length === 0) src = append_flat(head, chunk);
		else {
			pending.unshift(head);
			pending.push(chunk);
			src = pending.join('');
			pending.length = 0;
		}
		this.source = src;
		this.source_end += len;
		this._run();
		if (this.spec_para !== -1) this.spec_scan_to(this.cursor);
		// the root trims between blocks itself, this trims inside paragraphs and containers
		if (this.cursor - this.trim_point > TRIM_GAP) this.trim_at_stall();
		// a fence stall leaves the cursor at its content start while its scan line moves on
		else if (this.fence_scan - this.trim_point > TRIM_GAP) this.trim_fence();
		this.out.cursor(this.cursor);
	}

	/**
	 * trim the window to the start of the cursor line when _run stopped in a paragraph
	 * with only delimiters open, in a table body row, or at a line start right inside
	 * a container, with every ancestor a trim container
	 * pending html openers are reread on revoke, trim_keeping_html keeps them
	 * an unclosed code span sets a wait instead, a batch parse never calls this
	 */
	private trim_at_stall(): void {
		const stack = this.node_stack;
		let top = stack.length - 1;
		if (top < 1) return;
		if (this.states[this.states.length - 1] === StateKind.code_fence_content) {
			this.trim_fence();
			return;
		}
		const base = this.source_base;
		const source = this.source;
		const cursor = this.cursor;
		let kind = this.kind_of(stack[top]);
		if (kind === NodeKind.text) kind = this.kind_of(stack[--top]);
		while (this.is_trim_delimiter(kind)) kind = this.kind_of(stack[--top]);
		let line: number;
		if (kind === NodeKind.paragraph) {
			if (
				cursor === this.source_end &&
				cursor > base &&
				this.states[this.states.length - 1] === StateKind.text &&
				this.kind_of(stack[stack.length - 1]) === NodeKind.text
			) {
				// a stalled text run rereads only the char before the cursor, unless a backward whitespace scan could pass it
				const prev = char_code_at.call(source, cursor - 1 - base);
				line = prev === SPACE || prev === TAB ? -1 : cursor;
			} else line = -1;
			if (line === -1) {
				const lf = string_last_index_of.call(source, '\n', cursor - 1 - base);
				if (lf === -1) return;
				line = lf + 1 + base;
			}
		} else if (kind === NodeKind.table_cell || kind === NodeKind.table) {
			// a table body row is one line and reads nothing of the rows before it
			if (kind === NodeKind.table_cell) {
				if (this.kind_of(stack[--top]) !== NodeKind.table) return;
				const states = this.states;
				let si = states.length - 1;
				while (si > 1 && states[si] !== StateKind.table_row_content) si--;
				if (
					states[si] !== StateKind.table_row_content ||
					states[si - 1] !== StateKind.table_body
				)
					return;
				// cursor minus two so a row whose lf was just read is the current line
				const lf = string_last_index_of.call(source, '\n', cursor - 2 - base);
				if (lf === -1) return;
				line = lf + 1 + base;
			} else {
				if (this.states[this.states.length - 1] !== StateKind.table_body)
					return;
				if (
					cursor <= base ||
					char_code_at.call(source, cursor - 1 - base) !== LINEFEED
				)
					return;
				line = cursor;
			}
		} else {
			if (kind === NodeKind.code_span) {
				this.wait_code_span();
				return;
			}
			if (!is_trim_container(kind)) return;
			if (
				cursor <= base ||
				char_code_at.call(source, cursor - 1 - base) !== LINEFEED
			)
				return;
			line = cursor;
			top++;
		}
		if (line <= this.trim_point) return;
		if (this.can_trim_to(line, top)) this.trim_point = line;
	}

	/** inline delimiters, a revoke needs no source text and nothing rescans from their opener */
	private is_trim_delimiter(kind: number): boolean {
		return (
			kind === NodeKind.strong_emphasis ||
			kind === NodeKind.emphasis ||
			kind === NodeKind.strikethrough ||
			kind === NodeKind.superscript ||
			kind === NodeKind.subscript
		);
	}

	/**
	 * trim at the fence scan line for a fence in html or svelte containers, where can_trim declines
	 * no fence wait, its window skip would drop kept html lines
	 */
	private trim_fence(): void {
		const states = this.states;
		if (
			states[states.length - 1] !== StateKind.code_fence_content ||
			this.wait_kind !== WAIT_NONE
		)
			return;
		const line = this.fence_scan;
		if (
			line > this.trim_point &&
			this.can_trim_to(line, this.node_stack.length - 1)
		)
			this.trim_point = line;
	}

	/**
	 * true when the node stack below top holds only trim containers and every pending node
	 * is a paragraph, a delimiter, a revoked link or an open html container whose open tag ends before line
	 */
	private can_trim_to(line: number, top: number): boolean {
		const stack = this.node_stack;
		for (let i = 1; i < top; i++) {
			if (!is_trim_container(this.kind_of(stack[i]))) return false;
		}
		const base = this.source_base;
		const source = this.source;
		for (let pi = this.pending_floor(); pi < this.pending_count; pi++) {
			const id = this.pending_ids[pi];
			const pkind = this.kind_of(id);
			if (pkind === NodeKind.paragraph || this.is_trim_delimiter(pkind))
				continue;
			if (pkind !== NodeKind.html) {
				// a bracket the link text state revoked stays pending off the stack, its later revoke reads no source
				if (
					(pkind === NodeKind.link || pkind === NodeKind.image) &&
					stack.indexOf(id) === -1
				)
					continue;
				return false;
			}
			if (stack.indexOf(id) === -1) return false;
			const start = this.pending_starts[pi];
			if (start < base) return false;
			// the revoke rereads the open tag, which may span lines
			const lf = string_index_of.call(
				source,
				'\n',
				this.html_open_tag_end(start) - base
			);
			if (lf === -1 || lf + base >= line - 1) return false;
		}
		return true;
	}

	/**
	 * an unclosed code span cannot end until a chunk may hold a backtick or a blank line
	 * so feed holds chunks back instead of rejoining the window
	 */
	private wait_code_span(): void {
		if (this.in_table || this.wait_kind !== WAIT_NONE) return;
		if (this.states[this.states.length - 1] !== StateKind.code_span_end) return;
		// a backtick run at the window end may still grow into the closer
		if (
			string_index_of.call(this.source, '`', this.cursor - this.source_base) !==
			-1
		)
			return;
		this.wait_kind = FeedWait.code_span;
		this.cold.wait_cursor = this.cursor;
	}

	/** bq_fence_scan for unfinished input, resumes at the first line the last stalled scan of this fence did not pass */
	private bq_fence_feed(
		start_pos: number,
		fence_len: number,
		depth: number
	): number {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const cold = this.cold;
		let line = start_pos;
		if (cold.bqf_at === this.cursor && cold.bqf_line > line)
			line = cold.bqf_line;
		for (;;) {
			let marked = false;
			if (line < length) {
				let pos = line;
				let i = 0;
				for (; i < depth; i++) {
					while (pos < length) {
						const c = char_code_at.call(source, pos - base);
						if (c !== SPACE && c !== TAB) break;
						pos++;
					}
					if (pos >= length) break;
					if (char_code_at.call(source, pos - base) !== CLOSE_ANGLE_BRACKET) {
						cold.bqf_at = -1;
						return -1;
					}
					pos++;
					if (pos < length && char_code_at.call(source, pos - base) === SPACE)
						pos++;
				}
				if (i === depth) {
					marked = true;
					while (pos < length) {
						const c = char_code_at.call(source, pos - base);
						if (c !== SPACE && c !== TAB) break;
						pos++;
					}
					let bt = 0;
					while (
						pos < length &&
						char_code_at.call(source, pos - base) === BACKTICK
					) {
						bt++;
						pos++;
					}
					if (bt >= fence_len) {
						cold.bqf_at = -1;
						return 1;
					}
					const nl = string_index_of.call(source, '\n', pos - base);
					if (nl !== -1) {
						line = nl + base + 1;
						continue;
					}
				}
			}
			cold.bqf_at = this.cursor;
			cold.bqf_line = line;
			// the next chunk decides nothing without a backtick or an unmarked line
			if (line >= length || marked) {
				this.wait_kind = FeedWait.bq_fence;
				cold.wait_cursor = this.cursor;
			}
			return 0;
		}
	}

	/** false only when the chunk has no backtick and every line starting in it starts with all the quote markers */
	private bq_fence_may_decide(chunk: string, len: number): boolean {
		if (string_index_of.call(chunk, '`') !== -1) return true;
		const depth = this.block_quote_depth;
		const pending = this.wait_chunks;
		const prev =
			pending.length !== 0 ? pending[pending.length - 1] : this.source;
		let line = char_code_at.call(prev, prev.length - 1) === LINEFEED ? 0 : -1;
		if (line === -1) {
			const lf = string_index_of.call(chunk, '\n');
			if (lf === -1) return false;
			line = lf + 1;
		}
		while (line < len) {
			let pos = line;
			for (let i = 0; i < depth; i++) {
				while (pos < len) {
					const c = char_code_at.call(chunk, pos);
					if (c !== SPACE && c !== TAB) break;
					pos++;
				}
				// markers cut by the chunk end, let _run look
				if (pos >= len || char_code_at.call(chunk, pos) !== CLOSE_ANGLE_BRACKET)
					return true;
				pos++;
				if (pos < len && char_code_at.call(chunk, pos) === SPACE) pos++;
			}
			const lf = string_index_of.call(chunk, '\n', pos);
			if (lf === -1) return false;
			line = lf + 1;
		}
		return false;
	}

	/** false only when the chunk has no backtick and no line starting in it starts with a space, tab or linefeed */
	private code_span_may_end(chunk: string, len: number): boolean {
		if (len === 0 || string_index_of.call(chunk, '`') !== -1) return true;
		const pending = this.wait_chunks;
		const prev =
			pending.length !== 0 ? pending[pending.length - 1] : this.source;
		let c = char_code_at.call(chunk, 0);
		if (
			char_code_at.call(prev, prev.length - 1) === LINEFEED &&
			(c === SPACE || c === TAB || c === LINEFEED)
		)
			return true;
		let lf = string_index_of.call(chunk, '\n');
		while (lf !== -1 && lf + 1 < len) {
			c = char_code_at.call(chunk, lf + 1);
			if (c === SPACE || c === TAB || c === LINEFEED) return true;
			lf = string_index_of.call(chunk, '\n', lf + 1);
		}
		return false;
	}

	/**
	 * revoke pending nodes that will never close, keeping tight list paragraphs and nodes on the node stack
	 * slots below np_floor hold only paragraphs while the paragraph count agrees, a swap remove can break that
	 */
	private revoke_stale_pending(): void {
		const cold = this.cold;
		const count = this.pending_count;
		let write = cold.np_floor;
		if (write > count) write = 0;
		else if (write !== 0) {
			let paras = 0;
			for (let pi = write; pi < count; pi++) {
				if (this.kind_of(this.pending_ids[pi]) === NodeKind.paragraph) paras++;
			}
			if (this.pending_para_count - paras !== write) write = 0;
		}
		let floor = -1;
		for (let pi = write; pi < this.pending_count; pi++) {
			const pid = this.pending_ids[pi];
			const pkind = this.kind_of(pid);
			if (pkind === NodeKind.paragraph) {
				// preserve - finalize_list_pending_para owns this one.
				this.pending_ids[write] = pid;
				this.pending_starts[write] = this.pending_starts[pi];
				this.id_slots[pid] = write;
				write++;
				continue;
			}
			if (this.node_stack.indexOf(pid) !== -1) {
				// still on the node stack - this frame is open above us.
				if (floor < 0) floor = write;
				this.pending_ids[write] = pid;
				this.pending_starts[write] = this.pending_starts[pi];
				this.id_slots[pid] = write;
				write++;
				continue;
			}
			if (pkind === NodeKind.html) {
				cold.pending_html--;
				const pstart = this.pending_starts[pi];
				this.out.revoke(
					pid,
					this.html_open_tag_text(pstart),
					this.one_shot ? pstart : undefined
				);
			} else {
				this.out.revoke(pid);
				if (pkind === NodeKind.directive_inline) {
					this.directive_text_pop(pid);
				}
			}
		}
		this.pending_count = write;
		cold.np_floor = floor < 0 ? write : floor;
	}

	/** the first pending slot that may hold a non paragraph, feed trims scan pending nodes from it */
	private pending_floor(): number {
		const cold = this.cold;
		const count = this.pending_count;
		let floor = cold.np_floor;
		if (floor > count) floor = 0;
		for (;;) {
			let paras = 0;
			let first = -1;
			for (let pi = floor; pi < count; pi++) {
				if (this.kind_of(this.pending_ids[pi]) === NodeKind.paragraph) paras++;
				else if (first < 0) first = pi;
			}
			if (floor !== 0 && this.pending_para_count - paras !== floor) {
				floor = 0;
				continue;
			}
			floor = first < 0 ? count : first;
			cold.np_floor = floor;
			return floor;
		}
	}

	/**
	 * move a trim point inside a whitespace run back to keep the char before the run,
	 * lead_columns rereads the run and that char
	 */
	private trim_before_indent(): void {
		const source = this.source;
		const base = this.source_base;
		let p = this.trim_point - 1;
		while (p >= base) {
			const ch = char_code_at.call(source, p - base);
			if (ch !== SPACE && ch !== TAB) {
				this.trim_point = p + 1;
				return;
			}
			p--;
		}
		// the run opens the document
		if (p < 0) this.trim_point = 0;
	}

	/**
	 * feed window trim when non paragraph nodes are pending, keeps the open tag lines of
	 * pending html containers before the cut and moves their pending starts onto them
	 * so a revoke repair reads the same open tag
	 */
	private trim_keeping_html(head: string): string {
		const base = this.source_base;
		const cut = this.trim_point - 1;
		// the window already holds the kept lines while no kept opener closed,
		// html opens only after the trim point so only a close changes the set before cut
		const floor = this.pending_floor();
		if (cut === this.cold.kept_cut && base === this.cold.kept_base) {
			let kept = 0;
			for (let pi = floor; pi < this.pending_count; pi++) {
				if (
					this.pending_starts[pi] < cut &&
					this.kind_of(this.pending_ids[pi]) === NodeKind.html
				)
					kept++;
			}
			if (kept === this.cold.kept_count) return head;
		}
		let prefix = '';
		const offsets: number[] = [];
		const slots: number[] = [];
		for (let pi = floor; pi < this.pending_count; pi++) {
			const start = this.pending_starts[pi];
			if (start >= cut || this.kind_of(this.pending_ids[pi]) !== NodeKind.html)
				continue;
			const lf = string_index_of.call(
				head,
				'\n',
				this.html_open_tag_end(start) - base
			);
			offsets.push(prefix.length);
			slots.push(pi);
			prefix += string_slice.call(head, start - base, lf + 1);
		}
		const new_base = cut - prefix.length;
		for (let i = 0; i < slots.length; i++) {
			this.pending_starts[slots[i]] = new_base + offsets[i];
		}
		this.source_base = new_base;
		this.cold.kept_cut = cut;
		this.cold.kept_base = new_base;
		this.cold.kept_count = slots.length;
		return prefix + string_slice.call(head, cut - base);
	}

	private join_held(head: string): string {
		const pending = this.wait_chunks;
		pending.unshift(head);
		const joined = pending.join('');
		pending.length = 0;
		this.source = joined;
		return joined;
	}

	private fence_close_may_start(chunk: string, bt: number): boolean {
		for (let i = bt - 1; i >= 0; i--) {
			const c = char_code_at.call(chunk, i);
			if (c === LINEFEED) return true;
			if (c !== SPACE && c !== TAB) return false;
		}
		const source = this.source;
		const base = this.source_base;
		// a backtick run cut by the window end continues into the chunk
		for (let p = this.fence_scan; p < this.source_end; p++) {
			const c = char_code_at.call(source, p - base);
			if (c !== SPACE && c !== TAB && c !== BACKTICK) return false;
		}
		return true;
	}

	/** leaves scan, trim point and window where _run would, false when the chunk might hold the close */
	private skip_wait(chunk: string, len: number): boolean {
		const end = this.source_end;
		const kind = this.wait_kind;
		if (kind >= WAIT_BRACE) {
			const pending = this.wait_chunks;
			// the probe set the wait, it holds only if _run stopped there
			if (this.cursor === this.cold.wait_cursor) {
				// the saved brace scan stopped at the end of the input, the chunk continues it
				if (
					kind === WAIT_BRACE
						? !this.brace_scan(chunk, end, end + len)
						: kind === WAIT_NEEDLE
							? !this.needle_in(chunk, len)
							: kind === FeedWait.code_span
								? !this.code_span_may_end(chunk, len)
								: !this.bq_fence_may_decide(chunk, len)
				) {
					if (pending === NO_STACK) this.wait_chunks = [chunk];
					else pending.push(chunk);
					this.source_end = end + len;
					return true;
				}
			}
			// feed joins the held chunks with this one
			return false;
		}
		if (kind === WAIT_FENCE) {
			// only a backtick led by nothing but spaces and tabs on its line can close
			let bt = string_index_of.call(chunk, '`');
			while (bt !== -1) {
				if (this.fence_close_may_start(chunk, bt)) return false;
				const nl = string_index_of.call(chunk, '\n', bt);
				if (nl === -1) break;
				bt = string_index_of.call(chunk, '`', nl + 1);
			}
			// the last char that is no space, tab or backtick, after an lf the next line stays open,
			// after any other char no close can follow on its line so the scan starts there
			let m = len - 1;
			let c = char_code_at.call(chunk, m);
			while (m > 0 && (c === SPACE || c === TAB || c === BACKTICK))
				c = char_code_at.call(chunk, --m);
			let line: number;
			if (c === LINEFEED) {
				line = end + m + 1;
				// the lf stays as the lookbehind char before trim_point
				this.source = string_slice.call(chunk, m);
			} else {
				if (m <= 0) return false;
				line = end + m;
				this.source = string_slice.call(chunk, m - 1);
			}
			this.fence_scan = line;
			this.trim_point = line;
			this.source_base = line - 1;
		} else {
			// a close tag needs a less than sign, keep the last needle length chars as _run does
			const keep = this.cold.raw_needle.length;
			if (len < keep) return false;
			if (string_index_of.call(chunk, '<') !== -1) return false;
			if (
				string_index_of.call(
					this.source,
					'<',
					this.cold.raw_scan - this.source_base
				) !== -1
			)
				return false;
			const scan = end + len - keep + 1;
			this.cold.raw_scan = scan;
			this.trim_point = scan;
			this.source = string_slice.call(chunk, len - keep);
			this.source_base = scan - 1;
		}
		this.source_end = end + len;
		return true;
	}

	/**
	 * signal end-of-input. finalizes all open nodes and revokes
	 * pending speculation.
	 */
	finish(): { errors: ErrorCollector } {
		const pending = this.wait_chunks;
		if (pending.length !== 0) {
			pending.unshift(this.source);
			this.source = pending.join('');
			pending.length = 0;
		}
		if (this.pending_cr) {
			this.source = append_flat(this.source, '\n');
			this.source_end++;
			this.pending_cr = false;
		}
		this.wait_kind = WAIT_NONE;
		this.finished = true;
		this._run();
		this._finalize();
		const out = this.out;
		out.cursor(this.cursor);
		if (out.end !== undefined) out.end();
		return { errors: this.errors };
	}

	/** @internal */
	bind(emitter: Emitter, tab_size: number = 2): void {
		this.out = emitter;
		this.tab_size = tab_size;
	}

	/** drop strings of the last document so a reused parser does not pin them */
	release(): void {
		this.source = '';
		if (this.wait_chunks.length !== 0) this.wait_chunks.length = 0;
		if (this.ref_map.size !== 0) this.ref_map.clear();
		if (this.html_tag_stack.length !== 0) this.html_tag_stack = [];
		this.svelte_block_tag = '';
		if (this.svelte_block_stack.length !== 0)
			this.svelte_block_stack = NO_STACK;
		this.errors = EMPTY_ERRORS;
	}

	private _init(id_capacity: number): void {
		this.source = '';
		this.source_base = 0;
		this.source_end = 0;
		this.trim_point = 0;
		this.fence_scan = 0;
		const cold = this.cold;
		cold.bp_start = -1;
		if (cold.brace_memo !== null) cold.brace_memo = null;
		if (cold.tag_memo !== null) cold.tag_memo = null;
		if (this.wait_chunks.length !== 0) this.wait_chunks.length = 0;
		cold.raw_node = 0;
		cold.raw_needle = '';
		cold.raw_scan = 0;
		this.wait_kind = WAIT_NONE;
		this.cursor = 0;
		this.finished = false;
		this.pending_cr = false;
		// pop rather than reallocate, a fresh array would regrow every document
		const states = this.states;
		while (states.length > 1) states.pop();
		if (states.length === 0) states.push(StateKind.root);
		else states[0] = StateKind.root;
		const node_stack = this.node_stack;
		while (node_stack.length > 1) node_stack.pop();
		if (node_stack.length === 0) node_stack.push(0);
		else node_stack[0] = 0;
		this.next_id = 1;
		// pending_ids is only read below pending_count, like pending_starts
		this.pending_count = 0;
		this.pending_para_count = 0;
		this.cold.pending_html = 0;
		this.cold.np_floor = 0;
		this.take_ids(id_capacity);
		this.class_floor = 0;
		this.range_next_class = 0;
		this.block_quote_depth = 0;
		this.emphasis_has_content = false;
		this.in_heading = false;
		this.list_depth = 0;
		this.list_marker = 0;
		this.list_ordered = false;
		this.list_start_num = 0;
		this.list_node_id = 0;
		this.list_is_loose = false;
		this.list_content_offset = 0;
		this.list_marker_indent = 0;
		// replace nonempty stacks so no frame of the last document survives
		if (this.list_state_stack.length !== 0) this.list_state_stack = NO_STACK;
		if (this.list_pending_paras.length !== 0)
			this.list_pending_paras = NO_STACK;
		this.table_col_count = 0;
		this.table_node_id = 0;
		this.table_row_id = 0;
		this.table_cell_id = 0;
		this.table_cell_col = 0;
		this.in_table = false;
		this.inline_range_parse = false;
		this.table_cell_has_content = false;
		if (this.html_tag_stack.length !== 0) this.html_tag_stack = [];
		this.html_block_depth = 0;
		this.spec_para = -1;
		this.svelte_block_depth = 0;
		this.svelte_block_tag = '';
		this.svelte_branch_id = 0;
		this.svelte_block_id = 0;
		if (this.svelte_block_stack.length !== 0)
			this.svelte_block_stack = NO_STACK;
		this.extra = 0;
		this.info_start_pos = 0;
		this.info_end_pos = 0;
		this.checkpoint_cursor = 0;
		this.code_span_open_pos = 0;
		this.prev_cursor = 0;
		this.prev_depth = 0;
		this.loop_without_progress = 0;
		this.frontmatter_failed = false;
		this.imports_allowed = true;
		if (this.ref_map.size !== 0) this.ref_map.clear();
		this.link_text_start = 0;
		if (this.directive_colon_counts.length !== 0) {
			this.directive_colon_counts = NO_STACK;
		}
		if (this.directive_text_ids.length !== 0) this.directive_text_ids = [];
		if (this.directive_text_brackets.length !== 0) {
			this.directive_text_brackets = [];
		}
		this.errors = EMPTY_ERRORS;

		// emit the root node open
		this.out.open(0, NodeKind.root, 0, -1, 0, false);
	}

	// opcode helpers

	/** inlined at every open site, so it stays small, pending opens call their own */
	private emit_open(
		kind: NodeKind,
		start: number,
		parent: number,
		extra = 0,
		pending?: boolean
	): number {
		if (pending === true) {
			return this.emit_open_pending(kind, start, parent, extra);
		}
		const id = this.next_id++;
		if (id >= this.id_info.length) this.grow_ids(id);
		this.out.open(id, kind, start, parent, extra, false);
		this.id_info[id] = kind;
		return id;
	}

	private emit_leaf(
		kind: NodeKind,
		start: number,
		parent: number,
		value_start: number,
		value_end: number,
		end: number
	): void {
		const id = this.next_id++;
		if (id >= this.id_info.length) this.grow_ids(id);
		const out = this.out;
		if (out.leaf !== undefined) {
			out.leaf(id, kind, start, parent, value_start, value_end, end);
		} else {
			this.emit_leaf_ops(id, kind, start, parent, value_start, value_end, end);
		}
		this.id_info[id] = kind | ID_CLOSED;
	}

	private emit_bare_leaf(
		kind: NodeKind,
		start: number,
		parent: number,
		end: number
	): void {
		const id = this.next_id++;
		if (id >= this.id_info.length) this.grow_ids(id);
		const out = this.out;
		// a fresh node has value words of 0, as leaf writes them
		if (out.leaf !== undefined) out.leaf(id, kind, start, parent, 0, 0, end);
		else this.emit_bare_ops(id, kind, start, parent, end);
		this.id_info[id] = kind | ID_CLOSED;
	}

	private emit_bare_ops(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		end: number
	): void {
		const out = this.out;
		out.open(id, kind, start, parent, 0, false);
		out.close(id, end, kind);
	}

	private emit_leaf_ops(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		value_start: number,
		value_end: number,
		end: number
	): void {
		const out = this.out;
		out.open(id, kind, start, parent, 0, false);
		out.set_value_start(id, value_start);
		out.set_value_end(id, value_end);
		out.close(id, end, kind);
	}

	private emit_open_pending(
		kind: NodeKind,
		start: number,
		parent: number,
		extra = 0
	): number {
		const id = this.next_id++;
		if (id >= this.id_info.length) this.grow_ids(id);
		this.out.open(id, kind, start, parent, extra, true);
		const slot = this.pending_count;
		this.pending_starts[slot] = start;
		this.pending_ids[slot] = id;
		this.pending_count = slot + 1;
		if (kind === NodeKind.paragraph) this.pending_para_count++;
		else if (kind === NodeKind.html) this.cold.pending_html++;
		this.id_slots[id] = slot;
		this.id_info[id] = kind;
		return id;
	}

	private emit_close(id: number, end: number): void {
		const info = this.id_info[id];
		// the builder needs the kind at open, a revoke may have rewritten its node
		this.out.close(id, end, (info & ID_KIND_MASK) as NodeKind);
		this.id_info[id] = info | ID_CLOSED;
		if (id === this.spec_para) this.end_spec_para(end);
	}

	/** open writes an id state before any read, so spare tables need no clearing */
	private take_ids(needed: number): void {
		const spare = spare_ids;
		if (spare !== null && spare.length >= needed) {
			spare_ids = null;
			this.id_info = spare;
			this.id_slots = spare_slots;
			spare_slots = EMPTY_IDS;
		} else {
			let capacity = ID_MIN_CAPACITY;
			while (capacity < needed) capacity <<= 1;
			this.id_info = new Int32Array(capacity);
			this.id_slots = new Int32Array(capacity);
		}
		this.id_info[0] = NodeKind.root;
		this.finalized_below = 0;
	}

	private grow_ids(id: number): void {
		const old = this.id_info;
		let capacity = old.length > 0 ? old.length << 1 : ID_MIN_CAPACITY;
		while (capacity <= id) capacity <<= 1;
		const next = new Int32Array(capacity);
		next.set(old);
		// carry over the closed flag a hole id stored, only a misused released parser puts one on the empty table
		const hole = (old as unknown as HoleIds).undefined;
		if (hole !== undefined && old.length > 0)
			(next as unknown as HoleIds).undefined = hole;
		this.id_info = next;
		const slots = new Int32Array(capacity);
		slots.set(this.id_slots);
		this.id_slots = slots;
	}

	/**
	 * drop the tables here so this parser never writes one another parser took,
	 * finalized_below stops a repeated finish closing these ids again
	 */
	private give_back_ids(): void {
		const ids = this.id_info;
		const slots = this.id_slots;
		this.id_info = EMPTY_IDS;
		this.id_slots = EMPTY_IDS;
		this.finalized_below = this.next_id;
		// a closed hole id would read as closed in the next document
		if (
			ids.length === 0 ||
			ids.length > ID_POOL_CAP ||
			(ids as unknown as HoleIds).undefined !== undefined
		)
			return;
		const spare = spare_ids;
		if (spare === null || spare.length < ids.length) {
			spare_ids = ids;
			spare_slots = slots;
		}
	}

	private kind_of(id: number): NodeKind {
		return (this.id_info[id] & ID_KIND_MASK) as NodeKind;
	}

	private is_closed(id: number): boolean {
		return (this.id_info[id] & ID_CLOSED) !== 0;
	}

	/** swap-remove an id from the  pending_ids array. */
	private pending_remove(id: number): void {
		if (!this.pending_has(id)) return;
		const ids = this.pending_ids;
		const slots = this.id_slots;
		const i = slots[id];
		const last = this.pending_count - 1;
		const moved = ids[last];
		ids[i] = moved;
		this.pending_starts[i] = this.pending_starts[last];
		slots[moved] = i;
		this.pending_count = last;
		const kind = this.kind_of(id);
		if (kind === NodeKind.paragraph) this.pending_para_count--;
		else if (kind === NodeKind.html) this.cold.pending_html--;
	}

	/**
	 * outer was opened at the cursor before another asterisk, a word char after it opens the inner
	 * strong and its first run as the states would, false leaves the states as they were
	 */
	private open_inner_strong(outer: number): boolean {
		const p = this.cursor + 2;
		if (p >= this.source_end) return false;
		if (
			classify(char_code_at.call(this.source, p - this.source_base)) !==
			CharMask.word
		)
			return false;
		this.states.push(StateKind.inline);
		const n_id = this.emit_open_pending(NodeKind.strong_emphasis, p - 1, outer);
		this.out.set_value_start(n_id, p);
		this.node_stack.push(n_id);
		this.states.push(StateKind.strong_emphasis);
		this.emphasis_has_content = true;
		this.states.push(StateKind.inline);
		this.open_text_run(p, n_id);
		return true;
	}

	/** close the strong n_id at the cursor, and the enclosing strong too when its closing asterisk follows */
	private close_strong(n_id: number): void {
		const states = this.states;
		const node_stack = this.node_stack;
		for (;;) {
			this.out.set_value_end(n_id, this.cursor);
			this.emit_close(n_id, this.cursor + 1);
			this.pending_remove(n_id);
			states.pop();
			node_stack.pop();
			const p = ++this.cursor;
			// pop trailing inline so parent state sees next char directly
			if (states[states.length - 1] === StateKind.inline) states.pop();
			if (
				states[states.length - 1] !== StateKind.strong_emphasis ||
				!this.emphasis_has_content ||
				p + 1 >= this.source_end
			)
				return;
			// the close test of the strong state, the char before p is the asterisk just closed
			const base = this.source_base;
			if (
				char_code_at.call(this.source, p - base) !== ASTERISK ||
				(classify(char_code_at.call(this.source, p + 1 - base)) &
					(CharMask.whitespace | CharMask.punctuation)) ===
					0
			)
				return;
			n_id = node_stack[node_stack.length - 1];
		}
	}

	/**
	 * the inline backtick case for a one or two backtick span with plain content closing on its line
	 * and the plain run after it, false leaves everything to code_span_start
	 */
	private line_code_span(current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let q = this.cursor + 1;
		if (q < length && char_code_at.call(source, q - base) === BACKTICK) q++;
		const run_n = q - this.cursor;
		if (q >= length) return false;
		const c0 = char_code_at.call(source, q - base);
		// in a table cell a pipe ends the span, so one before the closer takes the slow path
		const cs_pipe = this.in_table ? PIPE : LINEFEED;
		if (
			c0 === BACKTICK ||
			c0 === SPACE ||
			c0 === OCTOTHERP ||
			c0 === LINEFEED ||
			c0 === cs_pipe
		)
			return false;
		let e = q + 1;
		while (e < length) {
			const ch = char_code_at.call(source, e - base);
			if (ch === BACKTICK || ch === LINEFEED || ch === cs_pipe) break;
			e++;
		}
		if (e >= length || char_code_at.call(source, e - base) !== BACKTICK)
			return false;
		let r = e + 1;
		while (r < length && char_code_at.call(source, r - base) === BACKTICK) r++;
		if (r - e !== run_n || r >= length) return false;
		this.emit_leaf(NodeKind.code_span, this.cursor, current_node, q, e, r);
		this.extra = run_n;
		this.code_span_open_pos = this.cursor;
		// the inline default text run, r is below length here
		const c = char_code_at.call(source, r - base);
		if (c !== 0 && (c >= 128 || TEXT_BREAK[c] === 0))
			this.open_text_run(r, current_node);
		else this.cursor = r;
		return true;
	}

	private open_text_run(p0: number, parent: number): void {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const t_id = this.emit_open(NodeKind.text, p0, parent);
		this.out.set_value_start(t_id, p0);
		this.node_stack.push(t_id);
		this.states.push(StateKind.text);
		// as in the inline default, a nul or break char right after p0 is left for the text state
		let p = p0 + 1;
		if (p < length) {
			const c1 = char_code_at.call(source, p - base);
			if (c1 !== 0 && (c1 >= 128 || TEXT_BREAK[c1] === 0)) {
				const text_break = TEXT_BREAK;
				p++;
				while (p < length) {
					const ch = char_code_at.call(source, p - base);
					if (ch < 128 && text_break[ch] !== 0) break;
					p++;
				}
			}
		}
		this.cursor = p;
	}

	/** check if an id is in the pending_ids array. */
	private pending_has(id: number): boolean {
		const i = this.id_slots[id];
		return i < this.pending_count && this.pending_ids[i] === id;
	}

	/**
	 * only containers below depth and only closed tight list paragraphs pending,
	 * containers read back one char at most, paragraphs and html revokes reread from their start
	 */
	private can_trim(depth: number): boolean {
		if (this.pending_count !== this.pending_para_count) return false;
		const stack = this.node_stack;
		for (let i = 1; i < depth; i++) {
			const kind = this.kind_of(stack[i]);
			if (
				kind !== NodeKind.block_quote &&
				kind !== NodeKind.list &&
				kind !== NodeKind.list_item
			)
				return false;
		}
		return true;
	}

	/**
	 * check if a character code is valid in a directive name.
	 * valid: [a-za-z0-9_-]
	 */
	private is_directive_name_char(ch: number): boolean {
		return (
			(ch >= 97 && ch <= 122) || // a-z
			(ch >= 65 && ch <= 90) || // a-z
			(ch >= 48 && ch <= 57) || // 0-9
			ch === UNDERSCORE || // _
			ch === DASH
		); // -
	}

	/**
	 * remove the directive text frame for `id` if present. idempotent -
	 * close and revoke paths can race on the same node (a revoked id may
	 * stay in pending_ids and be revoked again at block level).
	 */
	private directive_text_pop(id: number): void {
		const ids = this.directive_text_ids;
		for (let i = ids.length - 1; i >= 0; i--) {
			if (ids[i] === id) {
				if (i === ids.length - 1) {
					ids.pop();
					this.directive_text_brackets.pop();
				} else {
					ids.splice(i, 1);
					this.directive_text_brackets.splice(i, 1);
				}
				return;
			}
		}
	}

	/**
	 * try to parse a directive argument list at `pos`, which must point
	 * at `(`. arguments are named only - no positional values:
	 *
	 *   ( key=value, key="quoted value", key='quoted' )
	 *
	 * key: [a-za-z_][a-za-z0-9_-]*
	 * value: bare (no whitespace, comma, parens, quotes, or backslash)
	 *        or single/double quoted (backslash escapes, kept raw).
	 * duplicate keys and trailing commas are malformed. no newlines.
	 *
	 * returns:
	 *   - `{ args, end }` on success (`args === null` for an empty list)
	 *   - `null` if malformed
	 *   - `false` if more input is needed (stall)
	 */
	private try_parse_directive_args(
		pos: number
	): { args: Record<string, string> | null; end: number } | null | false {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos + 1; // skip (
		let args: Record<string, string> | null = null;

		// skip spaces and tabs
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;
		if (p >= length) return this.finished ? null : false;

		// empty list: ()
		if (char_code_at.call(source, p - base) === CLOSE_PAREN) {
			return { args: null, end: p + 1 };
		}

		for (;;) {
			// key must start with a letter or underscore
			const kc = char_code_at.call(source, p - base);
			if (
				!(
					(kc >= 97 && kc <= 122) ||
					(kc >= 65 && kc <= 90) ||
					kc === UNDERSCORE
				)
			) {
				return null;
			}
			const key_start = p;
			while (
				p < length &&
				this.is_directive_name_char(char_code_at.call(source, p - base))
			)
				p++;
			if (p >= length) return this.finished ? null : false;
			const key = string_slice.call(source, key_start - base, p - base);

			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB)
			)
				p++;
			if (p >= length) return this.finished ? null : false;
			if (char_code_at.call(source, p - base) !== EQUALS) return null;
			p++;
			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB)
			)
				p++;
			if (p >= length) return this.finished ? null : false;

			let value: string;
			const vc = char_code_at.call(source, p - base);
			if (vc === QUOTE || vc === APOSTROPHE) {
				p++;
				const value_start = p;
				while (p < length) {
					const ch = char_code_at.call(source, p - base);
					if (ch === BACKSLASH && p + 1 < length) {
						p += 2;
						continue;
					}
					if (ch === vc || ch === LINEFEED) break;
					p++;
				}
				if (p >= length) return this.finished ? null : false;
				if (char_code_at.call(source, p - base) !== vc) return null;
				value = string_slice.call(source, value_start - base, p - base);
				p++;
			} else {
				const value_start = p;
				while (p < length) {
					const ch = char_code_at.call(source, p - base);
					if (
						ch === SPACE ||
						ch === TAB ||
						ch === LINEFEED ||
						ch === COMMA ||
						ch === OPEN_PAREN ||
						ch === CLOSE_PAREN ||
						ch === QUOTE ||
						ch === APOSTROPHE ||
						ch === BACKSLASH
					)
						break;
					p++;
				}
				if (p >= length && !this.finished) return false;
				if (p === value_start) return null; // empty bare value
				value = string_slice.call(source, value_start - base, p - base);
			}

			if (args === null) args = {};
			else if (Object.prototype.hasOwnProperty.call(args, key)) return null; // duplicate key is ambiguous
			args[key] = value;

			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB)
			)
				p++;
			if (p >= length) return this.finished ? null : false;

			const sep = char_code_at.call(source, p - base);
			if (sep === CLOSE_PAREN) {
				return { args, end: p + 1 };
			}
			if (sep !== COMMA) return null;
			p++;
			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB)
			)
				p++;
			if (p >= length) return this.finished ? null : false;
			if (char_code_at.call(source, p - base) === CLOSE_PAREN) return null;
		}
	}

	/**
	 * try to parse a top-level import statement at `pos`.
	 * returns:
	 *   - `{ value_start, value_end, end }` on success
	 *   - `null` if not an import
	 *   - `false` if we need more input (stall)
	 */
	private try_parse_import(pos: number):
		| {
				value_start: number;
				value_end: number;
				end: number;
		  }
		| null
		| false {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;

		// must match "import " or "import{" at pos
		// "import" = [105, 109, 112, 111, 114, 116]
		if (pos + 6 >= length && !this.finished) return false; // stall - need at least "import " + something

		if (
			char_code_at.call(source, pos + 1 - base) !== 109 /* m */ ||
			char_code_at.call(source, pos + 2 - base) !== 112 /* p */ ||
			char_code_at.call(source, pos + 3 - base) !== 111 /* o */ ||
			char_code_at.call(source, pos + 4 - base) !== 114 /* r */ ||
			char_code_at.call(source, pos + 5 - base) !== 116 /* t */
		)
			return null;

		const after_import = char_code_at.call(source, pos + 6 - base);
		if (after_import !== SPACE && after_import !== OPEN_BRACE) return null;

		// scan to end of line
		let p = pos + 6;
		while (p < length && char_code_at.call(source, p - base) !== LINEFEED) {
			p++;
		}

		// stall if at end of buffer without newline and not finished
		if (p >= length && !this.finished) return false;

		const value_start = pos;
		const value_end = p; // exclude newline from value
		const end = p < length ? p + 1 : p; // consume newline if present

		return { value_start, value_end, end };
	}

	/**
	 * try to parse a block-level directive at `pos`. the `[content]`
	 * brackets are required - empty text must be explicit (`::name[]`).
	 * an optional argument list may follow the brackets immediately:
	 * `::name[content](key=val, key2=val2)`.
	 * returns:
	 *   - `{ kind: 'leaf' | 'container', colons, name, content_start, content_end, args, end }`
	 *     on success
	 *   - `null` if not a directive
	 *   - `false` if we need more input (stall)
	 */
	private try_parse_block_directive(pos: number):
		| {
				kind: 'leaf' | 'container';
				colons: number;
				name: string;
				content_start: number;
				content_end: number;
				args: Record<string, string> | null;
				end: number;
		  }
		| null
		| false {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;

		// count colons
		let colon_count = 0;
		while (p < length && char_code_at.call(source, p - base) === COLON) {
			colon_count++;
			p++;
		}

		// stall if the colon run reaches the end of the buffer - more
		// colons may come, so even a single colon is not decidable yet
		if (p >= length && !this.finished) return false;

		// need at least 2 colons for block directive
		if (colon_count < 2) return null;

		// must be followed by a letter (start of name)
		if (p >= length) return null;
		const first = char_code_at.call(source, p - base);
		if (!((first >= 97 && first <= 122) || (first >= 65 && first <= 90))) {
			return null;
		}

		// scan name
		const name_start = p;
		while (
			p < length &&
			this.is_directive_name_char(char_code_at.call(source, p - base))
		) {
			p++;
		}

		// stall if name extends to end of buffer
		if (p >= length && !this.finished) return false;

		const name = string_slice.call(source, name_start - base, p - base);
		const kind = colon_count >= 3 ? ('container' as const) : ('leaf' as const);

		// [content] is required - empty text must be explicit
		if (
			p >= length ||
			char_code_at.call(source, p - base) !== OPEN_SQUARE_BRACKET
		) {
			return null;
		}

		p++; // skip [
		const content_start = p;
		let bracket_depth = 1;
		while (p < length && bracket_depth > 0) {
			const ch = char_code_at.call(source, p - base);
			if (ch === OPEN_SQUARE_BRACKET) bracket_depth++;
			else if (ch === CLOSE_SQUARE_BRACKET) bracket_depth--;
			else if (ch === BACKSLASH && p + 1 < length) {
				p++;
			} // skip escaped char
			else if (ch === LINEFEED) break; // no line breaks in content bracket
			if (bracket_depth > 0) p++;
		}
		if (bracket_depth !== 0) {
			if (p >= length && !this.finished) return false;
			// unmatched bracket - not a valid directive
			return null;
		}
		const content_end = p;
		p++; // skip ]

		// optional argument list must follow the brackets immediately
		if (p >= length && !this.finished) return false;
		let args: Record<string, string> | null = null;
		if (p < length && char_code_at.call(source, p - base) === OPEN_PAREN) {
			const parsed = this.try_parse_directive_args(p);
			if (parsed === false) return false;
			// malformed args make the whole line a paragraph
			if (parsed === null) return null;
			args = parsed.args;
			p = parsed.end;
		}

		// skip trailing whitespace
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		) {
			p++;
		}

		// in incremental mode, stall until we see the end of line
		if (p >= length && !this.finished) return false;

		// must be at end of line (or end of input)
		if (p < length && char_code_at.call(source, p - base) !== LINEFEED) {
			return null;
		}

		// consume the newline
		if (p < length) p++;

		return {
			kind,
			colons: colon_count,
			name,
			content_start,
			content_end,
			args,
			end: p,
		};
	}

	/**
	 * open a block directive node from a successful
	 * try_parse_block_directive result. leaf directives close
	 * immediately, containers push their state and colon count.
	 */
	private start_block_directive(
		dir: {
			kind: 'leaf' | 'container';
			colons: number;
			name: string;
			content_start: number;
			content_end: number;
			args: Record<string, string> | null;
			end: number;
		},
		parent: number
	): void {
		const d_id = this.emit_open(
			dir.kind === 'leaf'
				? NodeKind.directive_leaf
				: NodeKind.directive_container,
			this.cursor,
			parent
		);
		this.out.attr(d_id, 'name', dir.name);
		if (dir.args) this.out.attr(d_id, 'args', dir.args);
		if (dir.content_start >= 0) {
			this.out.set_value_start(d_id, dir.content_start);
			this.out.set_value_end(d_id, dir.content_end);
		}
		if (dir.kind === 'leaf') {
			this.emit_close(d_id, dir.end);
		} else {
			this.node_stack.push(d_id);
			this.states.push(StateKind.directive_container);
			const counts = this.directive_colon_counts;
			if (counts === NO_STACK) this.directive_colon_counts = [dir.colons];
			else counts.push(dir.colons);
		}
		this.chomp(dir.end, true);
	}

	/**
	 * check if position starts a block directive closing fence.
	 * returns the end position (after newline) or -1 if not a closing fence.
	 * returns -2 if more input needed.
	 */
	private try_parse_directive_close(pos: number, min_colons: number): number {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;

		// count colons
		let colon_count = 0;
		while (p < length && char_code_at.call(source, p - base) === COLON) {
			colon_count++;
			p++;
		}

		// stall if the colon run reaches the end of the buffer - more
		// colons may still arrive
		if (p >= length && !this.finished) return -2;

		if (colon_count < min_colons) return -1;

		// skip trailing whitespace
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		) {
			p++;
		}

		// in incremental mode, stall until we see the end of line
		if (p >= length && !this.finished) return -2;

		// must be at end of line or end of input
		if (p < length && char_code_at.call(source, p - base) !== LINEFEED)
			return -1;
		if (p < length) p++; // consume newline

		return p;
	}

	private chomp(count: number, replace: boolean = false): void {
		if (replace) {
			this.cursor = count;
			// a jump reads the real char before it, even back at the floor
			this.class_floor = -1;
		} else {
			this.cursor += count;
		}
	}

	/** reads outside the window, including a jump to cursor 0, give the nan wildcard mask */
	private prev_class(): number {
		const c = this.cursor;
		if (c === this.class_floor) return CharMask.whitespace;
		const i = c - 1 - this.source_base;
		return classify(
			i >>> 0 < this.source_end - this.source_base
				? char_code_at.call(this.source, i)
				: NaN
		);
	}

	private next_class(): number {
		const c = this.cursor;
		if (c === this.class_floor && this.inline_range_parse) {
			return this.range_next_class;
		}
		const i = c + 1 - this.source_base;
		return classify(
			i >>> 0 < this.source_end - this.source_base
				? char_code_at.call(this.source, i)
				: NaN
		);
	}

	/**
	 * count leading whitespace columns starting at `pos`.
	 * spaces count as 1 column, tabs count as `tab_size` columns.
	 * returns total columns and the position after the whitespace.
	 */
	private count_indent(pos: number): { columns: number; end: number } {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const ts = this.tab_size;
		let columns = 0;
		while (pos < length) {
			const ch = char_code_at.call(source, pos - base);
			if (ch === SPACE) {
				columns++;
				pos++;
			} else if (ch === TAB) {
				columns += ts;
				pos++;
			} else {
				break;
			}
		}
		return { columns, end: pos };
	}

	/**
	 * columns of whitespace before pos when it indents its line, counted from the line
	 * start or from where skip_bq_markers leaves a block quote line, 0 otherwise
	 */
	private lead_columns(pos: number): number {
		const source = this.source;
		const base = this.source_base;
		let p = pos;
		let columns = 0;
		while (p > base) {
			const ch = char_code_at.call(source, p - 1 - base);
			if (ch === SPACE) columns++;
			else if (ch === TAB) columns += this.tab_size;
			else break;
			p--;
		}
		if (columns === 0 || p === 0) return columns;
		// a trim never cuts a whitespace run, so the window holds the char before it
		const before = char_code_at.call(source, p - 1 - base);
		if (before === LINEFEED) return columns;
		if (before === CLOSE_ANGLE_BRACKET && this.block_quote_depth > 0) {
			// the space after the marker belongs to it
			return char_code_at.call(source, p - base) === SPACE
				? columns - 1
				: columns;
		}
		return 0;
	}

	/**
	 * skip enough whitespace characters starting at `pos` to consume
	 * at least `target` columns. returns the position after skipping.
	 */
	private skip_columns(pos: number, target: number): number {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const ts = this.tab_size;
		let columns = 0;
		while (pos < length && columns < target) {
			const ch = char_code_at.call(source, pos - base);
			if (ch === SPACE) {
				columns++;
				pos++;
			} else if (ch === TAB) {
				columns += ts;
				pos++;
			} else {
				break;
			}
		}
		return pos;
	}

	/**
	 * check if there's enough input after a linefeed at `pos` to make
	 * a block-level decision. in block quote contexts we need to see the
	 * complete next line (its `>` markers and content). outside of block
	 * quotes we decide eagerly for any first non-whitespace char that
	 * unambiguously continues a paragraph or unambiguously starts a known
	 * block - only genuinely ambiguous leading chars (`-`, `*`, `_`, `[`,
	 * `|`, `:`, `<`, digits) still wait for the full next line.
	 */
	private can_decide_after_lf(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;

		// inside a block quote the paragraph boundary depends on the `>`
		// markers and the space that follows them. until the full prefix
		// is visible, skip_bq_markers can mis-strip. require the complete
		// next line to avoid under-reading the continuation prefix.
		// the window runs to exactly length, so any lf found lies within it
		if (this.block_quote_depth > 0) {
			if (
				pos + 1 < length &&
				string_index_of.call(source, '\n', pos + 1 - base) !== -1
			)
				return true;
			// hold chunks for a long partial line instead of rescanning it every feed, a short one ends within a chunk or two
			if (length - pos > 128) this.wait_for('\n');
			return false;
		}

		let p = pos + 1;
		// skip leading whitespace on the next line.
		while (p < length) {
			const ch = char_code_at.call(source, p - base);
			if (ch !== SPACE && ch !== TAB) break;
			p++;
		}
		if (p >= length) {
			// whole next line is whitespace-to-eob: need more input unless
			// the source is finished (in which case it's a blank line).
			return this.finished;
		}
		const ch = char_code_at.call(source, p - base);
		// blank line is an immediate decision.
		if (ch === LINEFEED) return true;
		// a visible linefeed decides either way, so settle on the first char before scanning the line
		switch (ch) {
			case OCTOTHERP: {
				// a heading needs the char after the whole # run
				let q = p + 1;
				while (q < length && char_code_at.call(source, q - base) === OCTOTHERP)
					q++;
				if (q < length || q - p > 6) return true;
				break;
			}
			case CLOSE_ANGLE_BRACKET:
				// block quote - immediate.
				return true;
			case BACKTICK:
				// code fence needs three backticks visible.
				if (
					p + 2 < length &&
					char_code_at.call(source, p + 1 - base) === BACKTICK &&
					char_code_at.call(source, p + 2 - base) === BACKTICK
				)
					return true;
				break;
			case DASH:
			case ASTERISK:
				// could be a list marker or a thematic break. inside a list,
				// scan the visible next-line prefix: as soon as we find a
				// char that isn't marker/space/tab we know it's not a tb
				// and can commit (list sibling or paragraph continuation).
				// if we only see marker/ws chars, it could still become a
				// thematic break - keep stalling.
				if (this.list_depth > 0) {
					for (let q = p + 1; q < length; q++) {
						const qch = char_code_at.call(source, q - base);
						if (qch === LINEFEED) return true;
						if (qch !== ch && qch !== SPACE && qch !== TAB) return true;
					}
					return false;
				}
				break;
			case PLUS:
				// plus is only ever a list marker - no thematic break ambiguity.
				if (this.list_depth > 0 && !this.plus_marker_pending(p)) return true;
				break;
			case UNDERSCORE:
			case OPEN_ANGLE_BRACKET:
			case OPEN_SQUARE_BRACKET:
			case PIPE:
			case OPEN_BRACE:
			case COLON:
				// genuinely ambiguous - need to see the rest of the line.
				break;
			default:
				// digits may start an ordered list marker. inside a list we
				// decide once the marker and the start of its content are visible
				if (ch >= 48 && ch <= 57) {
					if (this.list_depth === 0) break;
					if (!this.plus_marker_pending(p)) return true;
					break;
				}
				// everything else (letters, punctuation, etc.) cannot
				// start a block - the paragraph continues.
				return true;
		}
		return (
			p + 1 < length && string_index_of.call(source, '\n', p + 1 - base) !== -1
		);
	}

	private is_heading_start(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		while (
			pos < length &&
			(char_code_at.call(source, pos - base) === SPACE ||
				char_code_at.call(source, pos - base) === TAB)
		) {
			pos++;
		}
		if (pos >= length || char_code_at.call(source, pos - base) !== OCTOTHERP)
			return false;
		let count = 0;
		while (
			pos < length &&
			char_code_at.call(source, pos - base) === OCTOTHERP
		) {
			count++;
			pos++;
		}
		if (count > 6) return false;
		const ch = char_code_at.call(source, pos - base);
		return pos >= length || ch === SPACE || ch === TAB || ch === LINEFEED;
	}

	private is_blank_line_after(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos + 1;
		while (p < length && char_code_at.call(source, p - base) !== LINEFEED) {
			const ch = char_code_at.call(source, p - base);
			if (ch !== SPACE && ch !== TAB) return false;
			p++;
		}
		// hit end-of-buffer without \n, not a confirmed blank line in feed mode
		if (p >= length && !this.finished) return false;
		return true;
	}

	/** in feed mode, true while the line from `pos` holds only its marker and whitespace so far */
	private could_be_thematic_break(pos: number, marker: number): boolean {
		if (this.finished) return false;
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		for (let p = pos + 1; p < length; p++) {
			const ch = char_code_at.call(source, p - base);
			if (ch !== marker && ch !== SPACE && ch !== TAB) return false;
		}
		return true;
	}

	private is_thematic_break_start(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let spaces = 0;
		while (pos < length && char_code_at.call(source, pos - base) === SPACE) {
			spaces++;
			pos++;
		}
		if (spaces > 3) return false;

		if (pos >= length) return false;

		const marker = char_code_at.call(source, pos - base);
		if (marker !== ASTERISK && marker !== DASH && marker !== UNDERSCORE)
			return false;

		let count = 0;
		while (pos < length && char_code_at.call(source, pos - base) !== LINEFEED) {
			const ch = char_code_at.call(source, pos - base);
			if (ch === marker) {
				count++;
			} else if (ch !== SPACE && ch !== TAB) {
				return false;
			}
			pos++;
		}

		// in incremental mode, don't confirm a thematic break until
		// we can see the line ending - more chars may follow.
		if (pos >= length && !this.finished) return false;

		return count >= 3;
	}

	private is_ascii_punctuation(code: number): boolean {
		return (
			(code >= 33 && code <= 47) ||
			(code >= 58 && code <= 64) ||
			(code >= 91 && code <= 96) ||
			(code >= 123 && code <= 126)
		);
	}

	private skip_bq_markers(pos: number, depth: number): number {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		for (let i = 0; i < depth; i++) {
			while (
				pos < length &&
				(char_code_at.call(source, pos - base) === SPACE ||
					char_code_at.call(source, pos - base) === TAB)
			) {
				pos++;
			}
			if (
				pos >= length ||
				char_code_at.call(source, pos - base) !== CLOSE_ANGLE_BRACKET
			)
				return -1;
			pos++;
			if (pos < length && char_code_at.call(source, pos - base) === SPACE)
				pos++;
		}
		return pos;
	}

	private is_block_quote_start(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		while (
			pos < length &&
			(char_code_at.call(source, pos - base) === SPACE ||
				char_code_at.call(source, pos - base) === TAB)
		) {
			pos++;
		}
		return (
			pos < length &&
			char_code_at.call(source, pos - base) === CLOSE_ANGLE_BRACKET
		);
	}

	/**
	 * check whether a code fence opening inside a blockquote can close
	 * cleanly (whether every line up to the closing fence has matching
	 * `>` markers). returns:
	 *   1  - fence is valid (closing fence found, or eof in finished mode)
	 *   0  - more input needed (stall)
	 *  -1  - fence is invalid (unmarked line encountered before closing fence)
	 *
	 * `start_pos` is the position of the first character of the first content
	 * line (past the info line's linefeed). `fence_len` is the number of
	 * backticks in the opener.
	 */
	private bq_fence_scan(
		start_pos: number,
		fence_len: number,
		bq_depth: number
	): number {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let line_start = start_pos;
		while (line_start <= length) {
			if (line_start >= length) {
				// reached eof. in finished mode, treat as valid (unclosed
				// fence at eof is acceptable). in streaming mode, stall.
				return this.finished ? 1 : 0;
			}
			const stripped = this.skip_bq_markers(line_start, bq_depth);
			if (stripped === -1) {
				// can't strip markers. in streaming mode, the absence of
				// markers might be because the line is incomplete - but
				// `>` detection only needs the first few chars, so if the
				// first non-whitespace char is not `>`, we can commit to
				// "unmarked" even without seeing the full line.
				return -1;
			}
			// closing fence: optional whitespace then >= fence_len backticks.
			let fp = stripped;
			while (
				fp < length &&
				(char_code_at.call(source, fp - base) === SPACE ||
					char_code_at.call(source, fp - base) === TAB)
			)
				fp++;
			let bt = 0;
			while (fp < length && char_code_at.call(source, fp - base) === BACKTICK) {
				bt++;
				fp++;
			}
			if (bt >= fence_len) return 1;
			// advance to next line.
			let nl = stripped;
			while (nl < length && char_code_at.call(source, nl - base) !== LINEFEED)
				nl++;
			if (nl >= length) {
				// reached eof mid-line. in finished mode, no close found -
				// treat as valid (unclosed at eof). in streaming mode, stall.
				return this.finished ? 1 : 0;
			}
			line_start = nl + 1;
		}
		return this.finished ? 1 : 0;
	}

	private is_blank_at_pos(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		while (pos < length && char_code_at.call(source, pos - base) !== LINEFEED) {
			const ch = char_code_at.call(source, pos - base);
			if (ch !== SPACE && ch !== TAB) return false;
			pos++;
		}
		if (pos >= length && !this.finished) return false;
		return true;
	}

	/**
	 * single-pass lookahead: does a block-level construct start at `pos`?
	 * skips whitespace once, checks the first meaningful character, then
	 * dispatches to the specific predicate only when the char could start
	 * a block construct. for continuation lines (most common case) this
	 * returns false after one whitespace scan + one char check.
	 */
	private is_block_interrupt(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;

		// skip leading whitespace once
		while (p < length) {
			const ch = char_code_at.call(source, p - base);
			if (ch !== SPACE && ch !== TAB) break;
			p++;
		}

		// end of buffer -> blank line only if finished
		if (p >= length) return this.finished;

		const ch = char_code_at.call(source, p - base);

		// blank line
		if (ch === LINEFEED) return true;

		// svelte block boundary ({: or {/) interrupts paragraphs
		if (ch === OPEN_BRACE && this.is_svelte_block_boundary(p)) return true;
		if (
			ch === OPEN_BRACE &&
			char_code_at.call(source, p + 1 - base) === OCTOTHERP &&
			is_ascii_letter(char_code_at.call(source, p + 2 - base))
		)
			return true;

		// fast exit: first non-ws char can't start any block construct
		switch (ch) {
			case OCTOTHERP:
				return this.is_heading_start(pos);
			case CLOSE_ANGLE_BRACKET:
				return true;
			case BACKTICK:
				return (
					p + 2 < length &&
					char_code_at.call(source, p + 1 - base) === BACKTICK &&
					char_code_at.call(source, p + 2 - base) === BACKTICK
				);
			case ASTERISK:
			case DASH:
			case UNDERSCORE:
				return (
					this.is_thematic_break_start(pos) ||
					(ch !== UNDERSCORE && this.is_list_item_start_interrupt(pos))
				);
			case PLUS:
				return this.is_list_item_start_interrupt(pos);
			case OPEN_ANGLE_BRACKET: {
				// block-level html tag (`<ul>`, `</p>`, etc.) at line start
				// interrupts an open paragraph.
				let q = p + 1;
				const closing =
					q < length && char_code_at.call(source, q - base) === SLASH;
				if (closing) q++;
				if (
					q >= length ||
					!this.is_tag_name_start(char_code_at.call(source, q - base))
				) {
					return false;
				}
				const name_start = q;
				while (
					q < length &&
					this.is_tag_name_char(char_code_at.call(source, q - base))
				)
					q++;
				const name = string_slice.call(source, name_start - base, q - base);
				if (this.is_block_html_tag(name)) return true;
				return closing && this.closes_container(name);
			}
			case COLON:
				// :: or ::: starts a block directive
				return (
					p + 1 < length && char_code_at.call(source, p + 1 - base) === COLON
				);
			default:
				if (ch >= 48 && ch <= 57) return this.is_list_item_start_interrupt(pos);
				return false;
		}
	}

	/**
	 * a list marker (`-`, `*`, `+`, or `1.`) only opens a list when the
	 * marker line carries actual content. a bare marker on its own line is
	 * just text - this prevents stray dashes (e.g. a `-` glyph used as a
	 * button label inside a custom html element) from spuriously starting
	 * a list with an empty item.
	 */
	private marker_line_has_content(content_start: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = content_start;
		while (p < length) {
			const ch = char_code_at.call(source, p - base);
			if (ch === LINEFEED) return false;
			if (ch !== SPACE && ch !== TAB) return true;
			p++;
		}
		// reached end of buffer without finding content. in incremental mode
		// more input may follow, so withhold judgement until finished.
		return !this.finished ? true : false;
	}

	/**
	 * feed mode, the marker at pos is undecided while its prefix or the blank rest of its line arrives
	 * a marker line with no content is a paragraph, taking the list early would differ from batch
	 */
	private plus_marker_pending(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos + 1;
		if (char_code_at.call(source, pos - base) !== PLUS) {
			while (
				p < length &&
				char_code_at.call(source, p - base) >= 48 &&
				char_code_at.call(source, p - base) <= 57
			)
				p++;
			if (p >= length) return true;
			const d = char_code_at.call(source, p - base);
			if (d !== DOT && d !== CLOSE_PAREN) return false;
			p++;
		}
		if (p >= length) return true;
		let c = char_code_at.call(source, p - base);
		if (c !== SPACE && c !== TAB) return false;
		do {
			p++;
		} while (
			p < length &&
			((c = char_code_at.call(source, p - base)) === SPACE || c === TAB)
		);
		return p >= length;
	}

	private try_parse_list_marker(pos: number): MarkerResult | null {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		if (pos >= length) return null;
		const start = pos;
		const ws = this.count_indent(pos);
		// later lines measure from the line start, so count whitespace a state already skipped
		let indent = this.lead_columns(pos) + ws.columns;
		pos = ws.end;
		// no indent limit (commonmark limits to 0-3 because 4+ is indented code,
		// but pfm removes indented code blocks, indentation is insignificant)

		if (pos >= length) return null;
		const ch = char_code_at.call(source, pos - base);

		// unordered: -, *, +
		if (ch === DASH || ch === ASTERISK || ch === PLUS) {
			// in incremental mode, don't accept a marker at end of buffer -
			// more characters may follow (e.g. `---` thematic break)
			if (pos + 1 >= length && !this.finished) return null;
			const after = char_code_at.call(source, pos + 1 - base);
			if (
				pos + 1 >= length ||
				after === SPACE ||
				after === TAB ||
				after === LINEFEED
			) {
				let content_start = pos + 1;
				let content_columns = indent + 1; // marker char = 1 column
				if (content_start < length && (after === SPACE || after === TAB)) {
					content_columns += after === TAB ? this.tab_size : 1;
					content_start++;
				}
				if (!this.marker_line_has_content(content_start)) return null;
				return {
					indent,
					marker_char: ch,
					ordered: false,
					start_num: 0,
					content_start,
					content_offset: content_columns,
				};
			}
			return null;
		}

		// ordered: digits followed by . or )
		if (ch >= 48 && ch <= 57) {
			const num_start = pos;
			while (
				pos < length &&
				char_code_at.call(source, pos - base) >= 48 &&
				char_code_at.call(source, pos - base) <= 57
			) {
				pos++;
			}
			if (pos - num_start > 9) return null;

			if (pos >= length) return null;
			const delimiter = char_code_at.call(source, pos - base);
			if (delimiter !== DOT && delimiter !== CLOSE_PAREN) return null;

			// in incremental mode, don't accept a marker at end of buffer
			if (pos + 1 >= length && !this.finished) return null;
			const after = char_code_at.call(source, pos + 1 - base);
			if (
				pos + 1 >= length ||
				after === SPACE ||
				after === TAB ||
				after === LINEFEED
			) {
				let content_start = pos + 1;
				// columns: indent + digits + delimiter
				let content_columns = indent + (pos - num_start) + 1;
				if (content_start < length && (after === SPACE || after === TAB)) {
					content_columns += after === TAB ? this.tab_size : 1;
					content_start++;
				}
				if (!this.marker_line_has_content(content_start)) return null;
				const num = parseInt(
					string_slice.call(source, num_start - base, pos - base),
					10
				);
				return {
					indent,
					marker_char: delimiter,
					ordered: true,
					start_num: num,
					content_start,
					content_offset: content_columns,
				};
			}
			return null;
		}

		return null;
	}

	private is_list_item_start_interrupt(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const marker = this.try_parse_list_marker(pos);
		if (!marker) return false;
		// callers checked for a thematic break at pos first, the list item lf reuses both answers
		this.interrupt_marker_pos = pos;
		this.interrupt_marker = marker;
		if (this.list_depth > 0) return true;
		if (marker.ordered && marker.start_num !== 1) return false;
		let p = marker.content_start;
		while (p < length && char_code_at.call(source, p - base) !== LINEFEED) {
			if (
				char_code_at.call(source, p - base) !== SPACE &&
				char_code_at.call(source, p - base) !== TAB
			)
				return true;
			p++;
		}
		return false;
	}

	private start_list(marker: MarkerResult, parent: number): void {
		// save current list state for nesting
		if (this.list_depth > 0) {
			let stack = this.list_state_stack;
			if (stack === NO_STACK) stack = this.list_state_stack = [];
			stack.push({
				marker: this.list_marker,
				ordered: this.list_ordered,
				start_num: this.list_start_num,
				node_idx: this.list_node_id,
				is_loose: this.list_is_loose,
				content_offset: this.list_content_offset,
				marker_indent: this.list_marker_indent,
				pending_paras: this.list_pending_paras,
			});
		}

		this.list_depth++;
		this.list_ordered = marker.ordered;
		this.list_marker = marker.marker_char;
		this.list_start_num = marker.start_num;
		this.list_is_loose = false;
		this.list_content_offset = marker.content_offset;
		this.list_marker_indent = marker.indent;
		this.list_pending_paras = NO_STACK;

		const list_id = this.emit_open(NodeKind.list, this.cursor, parent);
		this.node_stack.push(list_id);
		this.list_node_id = list_id;
		// emit ordered/start immediately so renderers pick the right tag
		// (<ol> vs <ul>) from the first frame instead of flipping at close.
		this.out.attr(list_id, 'ordered', marker.ordered);
		this.out.attr(list_id, 'start', marker.start_num);

		const item_id = this.emit_open(NodeKind.list_item, this.cursor, list_id);
		this.node_stack.push(item_id);

		this.states.push(StateKind.list_item);
		this.chomp(marker.content_start, true);
		this.item_para(item_id);
	}

	/**
	 * a letter or non ascii char can only open a paragraph, so open it and take its plain run here
	 * instead of a list_item trip, a feed sets the trim point as that trip would
	 */
	private item_para(item_id: number): void {
		const c = char_code_at.call(this.source, this.cursor - this.source_base);
		if (!(c >= 128 || ((c | 32) >= 97 && (c | 32) <= 122))) {
			if (c === ASTERISK && this.finished) this.item_strong(item_id);
			return;
		}
		if (!this.finished) {
			if (this.pending_count !== this.pending_para_count) return;
			if (this.can_trim(this.node_stack.length)) this.trim_point = this.cursor;
		}
		this.states.push(StateKind.paragraph);
		const para_id = this.emit_open_pending(
			NodeKind.paragraph,
			this.cursor,
			item_id
		);
		this.track_list_pending_para(para_id);
		this.node_stack.push(para_id);
		this.para_text(para_id);
	}

	/**
	 * finished parse, item content of one or two asterisks then a word char is no break or marker,
	 * open the paragraph, the strongs and the first run as their states would
	 */
	private item_strong(item_id: number): void {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const p = this.cursor + 1;
		if (p + 1 >= length) return;
		let c1 = char_code_at.call(source, p - base);
		const double = c1 === ASTERISK;
		if (double) {
			if (p + 2 >= length) return;
			c1 = char_code_at.call(source, p + 1 - base);
		}
		if (classify(c1) !== CharMask.word) return;
		if (!(this.prev_class() & (CharMask.whitespace | CharMask.punctuation)))
			return;
		this.states.push(StateKind.paragraph);
		const para_id = this.emit_open_pending(
			NodeKind.paragraph,
			this.cursor,
			item_id
		);
		this.track_list_pending_para(para_id);
		this.node_stack.push(para_id);
		this.states.push(StateKind.inline);
		const n_id = this.emit_open_pending(
			NodeKind.strong_emphasis,
			this.cursor,
			para_id
		);
		this.out.set_value_start(n_id, p);
		this.node_stack.push(n_id);
		this.states.push(StateKind.strong_emphasis);
		if (double) {
			this.open_inner_strong(n_id);
			return;
		}
		this.emphasis_has_content = true;
		this.states.push(StateKind.inline);
		this.open_text_run(p, n_id);
	}

	/**
	 * eegister a pending paragraph that was opened inside a list_item -
	 * the wrapper is speculative until the list closes (tight -> unwrap,
	 * loose -> commit).
	 */
	private track_list_pending_para(id: number): void {
		const paras = this.list_pending_paras;
		if (paras === NO_STACK) this.list_pending_paras = [id];
		else paras.push(id);
	}

	/**
	 * promote all pending list-item paragraphs in the current list to
	 * committed. called when a blank line makes the list loose - the
	 * wrappers are now real paragraphs that renderers should show.
	 */
	private commit_list_pending_paras(): void {
		const paras = this.list_pending_paras;
		for (let i = 0; i < paras.length; i++) {
			const pid = paras[i];
			this.out.commit(pid);
			this.pending_remove(pid);
		}
		// the generic length setter is slow and the list is short
		while (paras.length > 0) paras.pop();
	}

	/**
	 * at list close, resolve every pending paragraph collected for this
	 * list. tight -> revoke (unwrap wrapper, text becomes direct child of
	 * list_item). loose -> commit (wrapper stays).
	 */
	private finalize_list_pending_paras(): void {
		const loose = this.list_is_loose;
		const paras = this.list_pending_paras;
		for (let i = 0; i < paras.length; i++) {
			const pid = paras[i];
			if (loose) {
				this.out.commit(pid);
			} else {
				this.out.revoke(pid);
			}
			this.pending_remove(pid);
		}
		while (paras.length > 0) paras.pop();
	}

	private end_list(): void {
		this.close_list_nodes();
		this.states.pop();
	}

	// leaves the state stack alone, the caller pops it
	private close_list_nodes(): void {
		// finalize every pending list-item paragraph for this list.
		this.finalize_list_pending_paras();

		// close list_item
		const item_id = this.node_stack[this.node_stack.length - 1];
		this.emit_close(item_id, this.cursor);
		this.node_stack.pop();

		// set list metadata and close. ordered/start were emitted at
		// start_list - only tightness is known here.
		const list_id = this.node_stack[this.node_stack.length - 1];
		this.out.attr(list_id, 'tight', !this.list_is_loose);
		this.emit_close(list_id, this.cursor);
		this.node_stack.pop();

		this.list_depth--;

		// restore outer list state if nested
		if (this.list_depth > 0 && this.list_state_stack.length > 0) {
			const prev = this.list_state_stack.pop()!;
			this.list_marker = prev.marker;
			this.list_ordered = prev.ordered;
			this.list_start_num = prev.start_num;
			this.list_node_id = prev.node_idx;
			this.list_is_loose = prev.is_loose;
			this.list_content_offset = prev.content_offset;
			this.list_marker_indent = prev.marker_indent;
			this.list_pending_paras = prev.pending_paras;
		} else {
			this.list_pending_paras = NO_STACK;
		}
	}

	private leave_svelte_block(): void {
		this.svelte_block_depth--;
		if (this.svelte_block_depth > 0 && this.svelte_block_stack.length > 0) {
			const prev = this.svelte_block_stack.pop()!;
			this.svelte_block_id = prev.block_id;
			this.svelte_branch_id = prev.branch_id;
			this.svelte_block_tag = prev.tag;
		}
	}

	/**
	 * open a svelte_block + first svelte_branch from a {#tag expr} token.
	 */
	private start_svelte_block(
		token: {
			kind: '#' | ':' | '/';
			tag: string;
			expr_start: number;
			expr_end: number;
			end: number;
		},
		parent: number
	): void {
		// save current svelte block state for nesting
		if (this.svelte_block_depth > 0) {
			let stack = this.svelte_block_stack;
			if (stack === NO_STACK) stack = this.svelte_block_stack = [];
			stack.push({
				block_id: this.svelte_block_id,
				branch_id: this.svelte_branch_id,
				tag: this.svelte_block_tag,
			});
		}

		this.svelte_block_depth++;
		this.svelte_block_tag = token.tag;

		// open svelte_block
		const block_id = this.emit_open(NodeKind.svelte_block, this.cursor, parent);
		this.out.attr(block_id, 'tag', token.tag);
		this.svelte_block_id = block_id;
		this.node_stack.push(block_id);

		// open first svelte_branch
		const branch_id = this.emit_open(
			NodeKind.svelte_branch,
			this.cursor,
			block_id
		);
		this.out.attr(branch_id, 'tag', token.tag);
		if (token.expr_start !== 0 || token.expr_end !== 0) {
			this.out.set_value_start(branch_id, token.expr_start);
			this.out.set_value_end(branch_id, token.expr_end);
		}
		this.svelte_branch_id = branch_id;
		this.node_stack.push(branch_id);

		this.states.push(StateKind.svelte_branch);
		this.chomp(token.end, true);
	}

	private try_parse_uri_autolink(pos: number): number {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;
		let ch = char_code_at.call(source, p - base);

		if (!((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122))) return -1;
		p++;

		let scheme_len = 1;
		while (p < length && scheme_len <= 32) {
			ch = char_code_at.call(source, p - base);
			if (
				(ch >= 65 && ch <= 90) ||
				(ch >= 97 && ch <= 122) ||
				(ch >= 48 && ch <= 57) ||
				ch === 43 ||
				ch === 45 ||
				ch === 46
			) {
				p++;
				scheme_len++;
			} else {
				break;
			}
		}

		if (scheme_len < 2 || char_code_at.call(source, p - base) !== COLON)
			return -1;
		// svelte elements like svelte:head are not autolinks
		if (
			scheme_len === 6 &&
			string_slice.call(source, pos - base, p - base) === 'svelte'
		)
			return -1;
		p++;

		while (p < length) {
			ch = char_code_at.call(source, p - base);
			if (ch === CLOSE_ANGLE_BRACKET) {
				return p + 1;
			}
			if (ch <= 0x20 || ch === OPEN_ANGLE_BRACKET) {
				return -1;
			}
			p++;
		}

		return -1;
	}

	// html  helpers

	/**
	 * check if character code is a valid tag name start (letter or underscore).
	 */
	private is_tag_name_start(ch: number): boolean {
		return (
			(ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === UNDERSCORE
		);
	}

	/**
	 * check if character code is a valid tag name continuation
	 * (letter, digit, hyphen, dot, colon, underscore).
	 */
	private is_tag_name_char(ch: number): boolean {
		return (
			(ch >= 65 && ch <= 90) ||
			(ch >= 97 && ch <= 122) ||
			(ch >= 48 && ch <= 57) ||
			ch === DASH ||
			ch === DOT ||
			ch === COLON ||
			ch === UNDERSCORE
		);
	}

	/**
	 * check if character is valid in an unquoted attribute value.
	 * invalid: whitespace, ", ', =, <, >, `
	 */
	private is_unquoted_attr_char(ch: number): boolean {
		return (
			ch > 0x20 &&
			ch !== QUOTE &&
			ch !== APOSTROPHE &&
			ch !== EQUALS &&
			ch !== OPEN_ANGLE_BRACKET &&
			ch !== CLOSE_ANGLE_BRACKET &&
			ch !== BACKTICK
		);
	}

	/**
	 * returns true for html "raw text" elements whose content should not be
	 * parsed - just scanned for the matching close tag.
	 */
	private is_raw_text_tag(tag: string): boolean {
		return tag === 'script' || tag === 'style';
	}

	/**
	 * html void elements - never have content or a close tag.
	 * matches the html living standard set.
	 */
	private is_void_tag(tag: string): boolean {
		switch (tag) {
			case 'area':
			case 'base':
			case 'br':
			case 'col':
			case 'embed':
			case 'hr':
			case 'img':
			case 'input':
			case 'link':
			case 'meta':
			case 'source':
			case 'track':
			case 'wbr':
				return true;
			default:
				return false;
		}
	}

	/**
	 * html block-level tags. an opening (or closing) tag from this set at
	 * the start of a line interrupts an open paragraph - matches commonmark
	 * "html block type 6". keeps wrapping markup like `<ul>` from being
	 * absorbed into a preceding paragraph and producing a `<p><ul>...</p>`
	 * tree that downstream renderers (e.g. svelte) reject.
	 */
	private is_block_html_tag(tag: string): boolean {
		switch (tag) {
			case 'address':
			case 'article':
			case 'aside':
			case 'base':
			case 'basefont':
			case 'blockquote':
			case 'body':
			case 'caption':
			case 'center':
			case 'col':
			case 'colgroup':
			case 'dd':
			case 'details':
			case 'dialog':
			case 'dir':
			case 'div':
			case 'dl':
			case 'dt':
			case 'fieldset':
			case 'figcaption':
			case 'figure':
			case 'footer':
			case 'form':
			case 'frame':
			case 'frameset':
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6':
			case 'head':
			case 'header':
			case 'hr':
			case 'html':
			case 'iframe':
			case 'legend':
			case 'li':
			case 'link':
			case 'main':
			case 'menu':
			case 'menuitem':
			case 'nav':
			case 'noframes':
			case 'ol':
			case 'optgroup':
			case 'option':
			case 'p':
			case 'param':
			case 'section':
			case 'source':
			case 'summary':
			case 'table':
			case 'tbody':
			case 'td':
			case 'tfoot':
			case 'th':
			case 'thead':
			case 'title':
			case 'tr':
			case 'track':
			case 'ul':
				return true;
			default:
				return false;
		}
	}

	/** opens once the open tag is whole so later feeds scan only new chars for the close tag */
	private open_raw_text(
		open_tag: {
			tag: string;
			attributes: object;
			end: number;
			has_attrs: boolean;
		},
		parent: number
	): void {
		const html_id = this.emit_open(NodeKind.html, this.cursor, parent);
		this.out.attr(html_id, 'tag', open_tag.tag);
		if (open_tag.has_attrs) {
			this.out.attr(html_id, 'attributes', open_tag.attributes);
		}
		this.out.set_value_start(html_id, open_tag.end);
		this.cold.raw_node = html_id;
		this.cold.raw_needle = '</' + open_tag.tag + '>';
		this.cold.raw_scan = open_tag.end;
		this.states.push(StateKind.raw_text);
		this.chomp(open_tag.end, true);
	}

	/**
	 * try to parse an html opening tag starting at pos (the char after `<`).
	 * returns null if not a valid tag.
	 */
	private try_parse_html_open_tag(pos: number): {
		tag: string;
		attributes: Record<
			string,
			string | boolean | { type: 'expression'; value: string }
		>;
		self_closing: boolean;
		end: number;
		has_attrs: boolean;
	} | null {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;

		this.tag_wait = false;
		// tag name must start with a letter or underscore
		if (
			pos >= length ||
			!this.is_tag_name_start(char_code_at.call(source, pos - base))
		)
			return null;

		let memo = this.cold.tag_memo;
		if (
			memo !== null &&
			(this.cold.tag_memo_base !== base || memo.length !== length - base)
		)
			memo = this.cold.tag_memo = null;
		const end = this.scan_open_tag(pos, memo);
		if (end < 0) {
			// feed mode, the scan ran off the end so the tag may still close
			if (!this.finished && tag_fail_p >= length) {
				this.tag_wait = true;
				this.wait_for(tag_need);
				return null;
			}
			this.open_tag_failed(pos);
			return null;
		}

		const rec = tag_rec;
		const tag = string_slice.call(source, pos - base, tag_name_end - base);
		const attributes: Record<
			string,
			string | boolean | { type: 'expression'; value: string }
		> = {};
		const n = tag_rec_n;
		for (let i = 0; i < n; i += 5) {
			const kind = rec[i];
			const name = string_slice.call(
				source,
				rec[i + 1] - base,
				rec[i + 2] - base
			);
			if (kind === TAG_ATTR_BOOL) attributes[name] = true;
			else if (kind === TAG_ATTR_VALUE)
				attributes[name] = string_slice.call(
					source,
					rec[i + 3] - base,
					rec[i + 4] - base
				);
			else if (kind === TAG_ATTR_SHORTHAND)
				attributes[name] = { type: 'expression', value: name };
			else
				attributes[name] = {
					type: 'expression',
					value: string_slice.call(
						source,
						rec[i + 3] - base,
						rec[i + 4] - base
					),
				};
		}
		return {
			tag,
			attributes,
			self_closing: tag_self_closing,
			end,
			has_attrs: n > 0,
		};
	}

	/**
	 * on finished input a scan is a pure function of where each attribute token starts
	 * so a later scan reaching a token start a failed one passed through fails too
	 * without the memo every stray tag opener in prose rescans to the next close bracket
	 */
	private open_tag_failed(pos: number): void {
		let memo = this.cold.tag_memo;
		if (memo === null) {
			if (
				!this.finished ||
				this.inline_range_parse ||
				tag_fail_p - pos < TAG_MEMO_MIN
			)
				return;
			const base = this.source_base;
			this.cold.tag_memo_base = base;
			memo = this.cold.tag_memo = new Uint8Array(this.source_end - base);
			this.scan_open_tag(pos, memo);
		}
		const marks = tag_marks;
		const base = this.cold.tag_memo_base;
		for (let i = 0; i < marks.length; i++) memo[marks[i] - base] = 1;
	}

	/**
	 * scan an open tag at pos without allocating, the end or -1 when it does not parse, -2 on a memo hit
	 * fills tag_rec, and tag_marks when given a memo
	 */
	private scan_open_tag(pos: number, memo: Uint8Array | null): number {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const marks = tag_marks;
		if (memo !== null) marks.length = 0;
		tag_rec_n = 0;
		tag_need = '>';
		let p = pos + 1;
		while (
			p < length &&
			this.is_tag_name_char(char_code_at.call(source, p - base))
		)
			p++;
		tag_name_end = p;

		while (p < length) {
			// skip whitespace
			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB ||
					char_code_at.call(source, p - base) === LINEFEED)
			)
				p++;

			if (p >= length) break;

			if (memo !== null) {
				if (memo[p - base] === 1) return -2;
				marks.push(p);
			}

			// check for end of tag
			if (char_code_at.call(source, p - base) === SLASH) {
				if (
					p + 1 < length &&
					char_code_at.call(source, p + 1 - base) === CLOSE_ANGLE_BRACKET
				) {
					tag_self_closing = true;
					return p + 2;
				}
				// a slash at the input end may still get its close bracket
				tag_fail_p = p + 1 >= length ? length : p;
				return -1; // stray /
			}

			if (char_code_at.call(source, p - base) === CLOSE_ANGLE_BRACKET) {
				tag_self_closing = false;
				return p + 1;
			}

			// svelte shorthand attribute: {name}
			if (char_code_at.call(source, p - base) === OPEN_BRACE) {
				const expr_end = this.find_matching_brace(p + 1);
				if (expr_end === -1) {
					tag_fail_p = length;
					tag_need = '}';
					return -1;
				}
				tag_rec_put(TAG_ATTR_SHORTHAND, p + 1, expr_end - 1, 0, 0);
				p = expr_end;
				continue;
			}

			// parse attribute name
			const attr_name_start = p;
			const ch = char_code_at.call(source, p - base);
			// attribute name: anything that's not whitespace, =, >, /
			if (ch === EQUALS || ch === CLOSE_ANGLE_BRACKET || ch === SLASH) {
				tag_fail_p = p;
				return -1; // invalid attribute start
			}

			while (p < length) {
				const c = char_code_at.call(source, p - base);
				if (
					c <= CLOSE_ANGLE_BRACKET &&
					(c === SPACE ||
						c === TAB ||
						c === LINEFEED ||
						c === EQUALS ||
						c === CLOSE_ANGLE_BRACKET ||
						c === SLASH)
				)
					break;
				p++;
			}

			if (p === attr_name_start) {
				tag_fail_p = p;
				return -1;
			}
			const attr_name_end = p;

			// skip whitespace before potential =
			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB ||
					char_code_at.call(source, p - base) === LINEFEED)
			)
				p++;

			if (p < length && char_code_at.call(source, p - base) === EQUALS) {
				p++; // skip =
				// skip whitespace after =
				while (
					p < length &&
					(char_code_at.call(source, p - base) === SPACE ||
						char_code_at.call(source, p - base) === TAB ||
						char_code_at.call(source, p - base) === LINEFEED)
				)
					p++;

				if (p >= length) break;

				const quote = char_code_at.call(source, p - base);
				if (quote === OPEN_BRACE) {
					// svelte expression attribute value: attr={expr}
					const expr_end = this.find_matching_brace(p + 1);
					if (expr_end === -1) {
						tag_fail_p = length;
						tag_need = '}';
						return -1;
					}
					tag_rec_put(
						TAG_ATTR_EXPR,
						attr_name_start,
						attr_name_end,
						p + 1,
						expr_end - 1
					);
					p = expr_end;
				} else if (quote === QUOTE || quote === APOSTROPHE) {
					// quoted value
					p++; // skip opening quote
					const value_start = p;
					while (p < length && char_code_at.call(source, p - base) !== quote)
						p++;
					if (p >= length) {
						tag_need = quote === QUOTE ? '"' : "'";
						break; // unclosed quote
					}
					tag_rec_put(
						TAG_ATTR_VALUE,
						attr_name_start,
						attr_name_end,
						value_start,
						p
					);
					p++; // skip closing quote
				} else {
					// unquoted value
					const value_start = p;
					while (
						p < length &&
						this.is_unquoted_attr_char(char_code_at.call(source, p - base))
					)
						p++;
					if (p === value_start) {
						tag_fail_p = p;
						return -1; // empty unquoted value
					}
					tag_rec_put(
						TAG_ATTR_VALUE,
						attr_name_start,
						attr_name_end,
						value_start,
						p
					);
				}
			} else {
				// boolean attribute
				tag_rec_put(TAG_ATTR_BOOL, attr_name_start, attr_name_end, 0, 0);
			}
		}

		tag_fail_p = length;
		return -1; // ran off end of input
	}

	/**
	 * try to parse an html closing tag starting at pos (the char after `<`).
	 * pos should point to the `/` in `</tag>`.
	 * returns the tag name and end position, or null.
	 */
	private try_parse_html_close_tag(
		pos: number
	): { tag: string; end: number } | null {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;

		// must start with /
		if (p >= length || char_code_at.call(source, p - base) !== SLASH)
			return null;
		p++;

		// optional whitespace after /
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;

		// tag name
		if (
			p >= length ||
			!this.is_tag_name_start(char_code_at.call(source, p - base))
		)
			return null;
		const tag_start = p;
		p++;
		while (
			p < length &&
			this.is_tag_name_char(char_code_at.call(source, p - base))
		)
			p++;
		const tag = string_slice.call(source, tag_start - base, p - base);

		// optional whitespace before >
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;

		// must end with >
		if (
			p >= length ||
			char_code_at.call(source, p - base) !== CLOSE_ANGLE_BRACKET
		)
			return null;
		return { tag, end: p + 1 };
	}

	/**
	 * ty to parse an html comment starting at pos (the char after `<`).
	 * pos should point to the `!` in `<!--`.
	 * returns the content start, content end, and end position.
	 */
	private try_parse_html_comment(
		pos: number
	):
		| { content_start: number; content_end: number; end: number }
		| null
		| false {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;

		// must be <!--
		if (
			char_code_at.call(source, p - base) !== EXCLAMATION_MARK ||
			char_code_at.call(source, p + 1 - base) !== DASH ||
			char_code_at.call(source, p + 2 - base) !== DASH
		) {
			if (p + 2 >= length && !this.finished) return false;
			return null;
		}
		p += 3;
		const content_start = p;

		// source runs to exactly source_end, so any match lies within it
		const close = string_index_of.call(source, '-->', p - base);
		if (close !== -1) {
			const content_end = close + base;
			return { content_start, content_end, end: content_end + 3 };
		}

		if (!this.finished) return false; // need more input
		return null; // no closing -->
	}

	/**
	 * whether a close tag named tag closes an html container around the open
	 * paragraph, or around the cursor when none is open
	 */
	private closes_container(tag: string): boolean {
		if (this.html_block_depth === 0) return false;
		const idx = this.find_html_opener(tag);
		if (idx === -1) return false;
		const id = this.html_tag_stack[idx].id;
		const stack = this.node_stack;
		for (let i = stack.length - 1; i > 0; i--) {
			const n = stack[i];
			if (n === id) {
				// opened inside a paragraph the close is inline, with none open it closes a container
				for (let j = i - 1; j > 0; j--) {
					if (this.kind_of(stack[j]) === NodeKind.paragraph) return false;
				}
				return true;
			}
			if (this.kind_of(n) === NodeKind.paragraph)
				return stack.lastIndexOf(id, i - 1) !== -1;
		}
		return false;
	}

	/** open a paragraph at the cursor whose wrapper is decided at its close */
	private open_spec_para(parent: number, never: boolean): void {
		const id = this.emit_open_pending(NodeKind.paragraph, this.cursor, parent);
		this.spec_para = id;
		this.spec_scan = this.cursor;
		this.spec_depth = 0;
		this.spec_text = false;
		this.spec_block = false;
		this.spec_never = never;
		this.states.push(StateKind.paragraph);
		this.node_stack.push(id);
	}

	/**
	 * open a spec paragraph at a tag the caller parsed, whose element closes at
	 * close_end on its line, and the tag in it as the inline state would
	 */
	private open_spec_tag(
		tag: {
			tag: string;
			attributes: object;
			self_closing: boolean;
			end: number;
			has_attrs: boolean;
		},
		close_end: number,
		parent: number,
		never: boolean
	): void {
		const leaf = tag.self_closing || this.is_void_tag(tag.tag);
		// a paragraph of just this element keeps no wrapper, so it gets none
		const alone = this.line_ends_block(close_end);
		let para = parent;
		if (!alone) {
			this.open_spec_para(parent, never);
			para = this.spec_para;
			// the scan skips the element, a block level one cannot sit in a <p>
			this.spec_scan = close_end;
			if (this.is_block_html_tag(tag.tag)) this.spec_block = true;
		}
		if (leaf) {
			const html_id = this.emit_open(NodeKind.html, this.cursor, para);
			this.out.attr(html_id, 'tag', tag.tag);
			if (tag.has_attrs) this.out.attr(html_id, 'attributes', tag.attributes);
			this.out.attr(html_id, 'self_closing', true);
			this.emit_close(html_id, tag.end);
			this.chomp(tag.end, true);
			return;
		}
		this.states.push(StateKind.inline);
		const html_id = this.emit_open_pending(NodeKind.html, this.cursor, para);
		this.out.attr(html_id, 'tag', tag.tag);
		if (tag.has_attrs) this.out.attr(html_id, 'attributes', tag.attributes);
		this.html_tag_stack.push({ id: html_id, tag: tag.tag });
		this.node_stack.push(html_id);
		this.states.push(StateKind.html_element);
		this.chomp(tag.end, true);
	}

	/**
	 * only whitespace follows pos on its line and the next line is blank, starts a
	 * block or is missing, false when that line is not whole yet
	 */
	private line_ends_block(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;
		while (p < length) {
			const ch = char_code_at.call(source, p - base);
			if (ch === LINEFEED) break;
			if (ch !== SPACE && ch !== TAB) return false;
			p++;
		}
		if (p >= length) return this.finished;
		p++;
		if (
			!this.finished &&
			(p >= length || string_index_of.call(source, '\n', p - base) === -1)
		)
			return false;
		return this.is_block_interrupt(p);
	}

	/** the paragraph keeps its wrapper only with text outside tags and no block level tag */
	private end_spec_para(end: number): void {
		const id = this.spec_para;
		this.spec_para = -1;
		this.spec_scan_to(end);
		// an element still open becomes its literal open tag
		if (this.spec_depth > 0) this.spec_text = true;
		this.pending_remove(id);
		if (this.spec_never || !this.spec_text || this.spec_block)
			this.out.revoke(id);
	}

	/**
	 * scan the spec paragraph up to limit for text outside tags and block level tags,
	 * stopping before a construct that is not whole below limit
	 */
	private spec_scan_to(limit: number): void {
		// either decides the paragraph already
		if (this.spec_never || this.spec_block) return;
		const source = this.source;
		const base = this.source_base;
		let p = this.spec_scan;
		scan: while (p < limit) {
			const ch = char_code_at.call(source, p - base);
			switch (ch) {
				case SPACE:
				case TAB:
					p++;
					break;
				case LINEFEED: {
					p++;
					if (this.block_quote_depth > 0 && p < limit) {
						const q = this.skip_bq_markers(p, this.block_quote_depth);
						if (q !== -1 && q <= limit) p = q;
					}
					break;
				}
				case OPEN_ANGLE_BRACKET: {
					const end = this.spec_tag(p, limit);
					if (end === -1) break scan;
					if (end === -2) {
						if (this.spec_depth === 0) this.spec_text = true;
						p++;
					} else p = end;
					if (this.spec_block) {
						p = limit;
						break scan;
					}
					break;
				}
				case OPEN_BRACE: {
					const end = this.find_matching_brace(p + 1);
					if (end === -1 && !this.finished) break scan;
					if (end > limit) break scan;
					if (this.spec_depth === 0) {
						// a plain expression renders text, {@tag {# {: {/ are structure
						const n = char_code_at.call(source, p + 1 - base);
						if (
							end === -1 ||
							(n === AT
								? !is_ascii_letter(char_code_at.call(source, p + 2 - base))
								: n !== OCTOTHERP && n !== COLON && n !== SLASH)
						)
							this.spec_text = true;
					}
					p = end === -1 ? p + 1 : end;
					break;
				}
				case BACKTICK: {
					if (this.spec_depth === 0) this.spec_text = true;
					// a code span holds no markup, a run with no closer is literal
					let q = p + 1;
					while (q < limit && char_code_at.call(source, q - base) === BACKTICK)
						q++;
					const run = q - p;
					p = q;
					let r = q;
					while (r < limit) {
						const i = string_index_of.call(source, '`', r - base);
						if (i === -1 || i + base >= limit) break;
						let k = i + base + 1;
						while (
							k < limit &&
							char_code_at.call(source, k - base) === BACKTICK
						)
							k++;
						if (k - i - base === run) {
							p = k;
							break;
						}
						r = k;
					}
					break;
				}
				case BACKSLASH:
					if (this.spec_depth === 0) this.spec_text = true;
					p = p + 2 < limit ? p + 2 : limit;
					break;
				default:
					if (this.spec_depth === 0) this.spec_text = true;
					p++;
			}
		}
		this.spec_scan = p;
	}

	/**
	 * the end of a comment or tag at p for spec_scan_to, tracking spec_depth and
	 * spec_block, -1 when not whole below limit, -2 when not markup
	 */
	private spec_tag(p: number, limit: number): number {
		const source = this.source;
		const base = this.source_base;
		if (p + 1 >= limit) return -2;
		const c1 = char_code_at.call(source, p + 1 - base);
		if (c1 === EXCLAMATION_MARK) {
			const comment = this.try_parse_html_comment(p + 1);
			if (comment === false) return -1;
			if (comment === null) return -2;
			return comment.end > limit ? -1 : comment.end;
		}
		if (c1 === SLASH) {
			const close = this.try_parse_html_close_tag(p + 1);
			if (close === null) return -2;
			if (close.end > limit) return -1;
			if (this.spec_depth > 0) this.spec_depth--;
			return close.end;
		}
		if (!this.is_tag_name_start(c1)) return -2;
		if (this.try_parse_uri_autolink(p + 1) !== -1) return -2;
		const end = this.scan_open_tag(p + 1, null);
		if (end < 0) {
			return !this.finished && tag_fail_p >= this.source_end ? -1 : -2;
		}
		if (end > limit) return -1;
		const tag = string_slice.call(source, p + 1 - base, tag_name_end - base);
		// a block level element cannot sit in a <p>
		if (this.spec_depth === 0 && this.is_block_html_tag(tag)) {
			this.spec_block = true;
			return end;
		}
		if (tag_self_closing || this.is_void_tag(tag)) return end;
		if (this.is_raw_text_tag(tag)) {
			const close = string_index_of.call(source, '</' + tag, end - base);
			if (close === -1) return -1;
			const gt = string_index_of.call(source, '>', close);
			if (gt === -1 || gt + base + 1 > limit) return -1;
			return gt + base + 1;
		}
		this.spec_depth++;
		return end;
	}

	/**
	 * the end of the close tag when the element whose open tag ends at from closes on
	 * that line, 0 when it stays open past it, -1 when the line is not whole yet
	 */
	private closes_on_line(tag: string, from: number): number {
		const source = this.source;
		const base = this.source_base;
		const lf = string_index_of.call(source, '\n', from - base);
		if (lf === -1 && !this.finished) return -1;
		const line_end = lf === -1 ? this.source_end : lf + base;
		const n = tag.length;
		let depth = 1;
		let p = from;
		for (;;) {
			const i = string_index_of.call(source, '<', p - base);
			if (i === -1) return 0;
			const q = i + base;
			if (q >= line_end) return 0;
			const closing = char_code_at.call(source, q + 1 - base) === SLASH;
			const name = closing ? q + 2 : q + 1;
			if (
				name + n <= line_end &&
				string_starts_with.call(source, tag, name - base)
			) {
				const after = char_code_at.call(source, name + n - base);
				if (
					after === CLOSE_ANGLE_BRACKET ||
					after === SPACE ||
					after === TAB ||
					after === SLASH ||
					after === LINEFEED
				) {
					if (!closing) depth++;
					else if (--depth === 0) {
						const gt = string_index_of.call(source, '>', name + n - base);
						return gt === -1 || gt + base >= line_end ? 0 : gt + base + 1;
					}
				}
			}
			p = q + 1;
		}
	}

	/** whether node is an html element whose content is phrasing only */
	private in_phrasing(node: number): boolean {
		const stack = this.html_tag_stack;
		if (stack.length === 0) return false;
		const top = stack[stack.length - 1];
		return top.id === node && this.is_phrasing_tag(top.tag);
	}

	/** a {@tag at the cursor, structure like an element */
	private at_svelte_tag(code: number): boolean {
		const base = this.source_base;
		return (
			code === OPEN_BRACE &&
			char_code_at.call(this.source, this.cursor + 1 - base) === AT &&
			is_ascii_letter(char_code_at.call(this.source, this.cursor + 2 - base))
		);
	}

	/** elements whose content is phrasing only, a paragraph inside one keeps no wrapper */
	private is_phrasing_tag(tag: string): boolean {
		switch (tag) {
			case 'p':
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6':
			case 'a':
			case 'abbr':
			case 'b':
			case 'bdi':
			case 'bdo':
			case 'button':
			case 'cite':
			case 'code':
			case 'data':
			case 'dfn':
			case 'em':
			case 'i':
			case 'kbd':
			case 'label':
			case 'legend':
			case 'mark':
			case 'output':
			case 'q':
			case 's':
			case 'samp':
			case 'small':
			case 'span':
			case 'strong':
			case 'sub':
			case 'summary':
			case 'sup':
			case 'time':
			case 'u':
			case 'var':
				return true;
			default:
				return false;
		}
	}

	/**
	 * find the matching html opener on the html_tag_stack for a closing tag.
	 * returns the stack index or -1 if not found.
	 */
	private find_html_opener(tag: string): number {
		for (let i = this.html_tag_stack.length - 1; i >= 0; i--) {
			if (this.html_tag_stack[i].tag === tag) return i;
		}
		return -1;
	}

	/** open tag source for a revoke, the parsed children stay after it */
	private html_open_tag_text(start: number): string {
		const base = this.source_base;
		return string_slice.call(
			this.source,
			start - base,
			this.html_open_tag_end(start) - base
		);
	}

	/** end of the text html_open_tag_text takes, a tag may span lines */
	private html_open_tag_end(start: number): number {
		const tag = this.try_parse_html_open_tag(start + 1);
		if (tag !== null) return tag.end;
		const source = this.source;
		const base = this.source_base;
		let end = start + 1;
		while (
			end < this.source_end &&
			char_code_at.call(source, end - base) !== LINEFEED
		)
			end++;
		return end;
	}

	/**
	 * close an inline html element by unwinding state/node stacks.
	 */
	private close_html_inline(html_id: number, end: number): void {
		if (this.node_stack.lastIndexOf(html_id) <= 0) {
			// the opener is no longer on the node stack
			while (this.node_stack.length > 1) {
				const top_id = this.node_stack[this.node_stack.length - 1];
				if (!this.is_closed(top_id)) {
					this.out.set_value_end(top_id, this.cursor);
					this.emit_close(top_id, this.cursor);
				}
				this.node_stack.pop();
				this.states.pop();
			}
			return;
		}

		// node and state frames do not pair up one to one, a list owns two
		// nodes but one state and inline owns none, so close the nodes first
		// and then drain states down to the owning html frame
		while (this.node_stack[this.node_stack.length - 1] !== html_id) {
			this.close_node_inside_html();
		}
		this.pending_remove(html_id);
		this.emit_close(html_id, end);
		this.node_stack.pop();
		while (this.states.length > 0) {
			const popped = this.states.pop()!;
			if (popped === StateKind.html_element) break;
			if (popped === StateKind.html_block_element) {
				this.html_block_depth--;
				break;
			}
		}
		// pop trailing inline state if present
		if (this.states[this.states.length - 1] === StateKind.inline) {
			this.states.pop();
		}
	}

	// containers also unwind their depth counters, paragraph close truncates
	// the node stack to a base computed from them
	private close_node_inside_html(): void {
		const id = this.node_stack[this.node_stack.length - 1];
		switch (this.kind_of(id)) {
			case NodeKind.list_item:
				this.close_list_nodes();
				return;
			case NodeKind.table_cell:
				this.emit_close(id, this.cursor);
				this.node_stack.pop();
				this.table_cell_col++;
				return;
			case NodeKind.table:
				// the row is not on the node stack
				if (this.table_row_id !== 0 && !this.is_closed(this.table_row_id)) {
					this.pad_and_close_row();
				}
				this.close_table_node();
				return;
			case NodeKind.block_quote:
				this.emit_close(id, this.cursor);
				this.node_stack.pop();
				this.block_quote_depth--;
				return;
			case NodeKind.svelte_branch:
				this.emit_close(id, this.cursor);
				this.node_stack.pop();
				return;
			case NodeKind.svelte_block:
				this.emit_close(id, this.cursor);
				this.node_stack.pop();
				this.leave_svelte_block();
				return;
			case NodeKind.directive_container:
				this.emit_close(id, this.cursor);
				this.node_stack.pop();
				this.directive_colon_counts.pop();
				return;
			case NodeKind.heading:
				this.in_heading = false;
				break;
			case NodeKind.directive_inline:
				this.directive_text_pop(id);
				break;
		}
		if (this.kind_of(id) !== NodeKind.paragraph && this.pending_has(id)) {
			// an unclosed delimiter becomes literal text now, revoking it only at
			// finalize would come after a tight list has already unwrapped its
			// paragraph
			this.out.revoke(id);
			this.pending_remove(id);
		} else if (!this.is_closed(id)) {
			this.out.set_value_end(id, this.cursor);
			this.emit_close(id, this.cursor);
		}
		this.node_stack.pop();
	}

	/**
	 * try to parse a svelte block token at `pos` (pointing at `{`).
	 * returns null if not a svelte block token.
	 * recognizes: {#tag expr}, {:tag expr}, {/tag}
	 */
	private try_parse_svelte_block_token(pos: number): {
		kind: '#' | ':' | '/';
		tag: string;
		expr_start: number;
		expr_end: number;
		end: number;
	} | null {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		if (pos >= length || char_code_at.call(source, pos - base) !== OPEN_BRACE)
			return null;
		let p = pos + 1;
		if (p >= length) return null;
		const sigil = char_code_at.call(source, p - base);
		if (sigil !== OCTOTHERP && sigil !== COLON && sigil !== SLASH) return null;
		const kind_ch = sigil === OCTOTHERP ? '#' : sigil === COLON ? ':' : '/';
		p++;

		// tag name
		const tag_start = p;
		while (
			p < length &&
			char_code_at.call(source, p - base) !== SPACE &&
			char_code_at.call(source, p - base) !== TAB &&
			char_code_at.call(source, p - base) !== CLOSE_BRACE
		)
			p++;
		if (p === tag_start) return null;
		let tag = string_slice.call(source, tag_start - base, p - base);

		// handle {:else if expr} - "else if" is a compound tag name
		if (kind_ch === ':' && tag === 'else') {
			const save = p;
			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB)
			)
				p++;
			if (
				p + 1 < length &&
				char_code_at.call(source, p - base) === 105 /* i */ &&
				char_code_at.call(source, p + 1 - base) === 102 /* f */ &&
				(p + 2 >= length ||
					char_code_at.call(source, p + 2 - base) === SPACE ||
					char_code_at.call(source, p + 2 - base) === TAB ||
					char_code_at.call(source, p + 2 - base) === CLOSE_BRACE)
			) {
				tag = 'else if';
				p += 2;
			} else {
				p = save;
			}
		}

		if (kind_ch === '/') {
			// {/tag} - no expression
			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB)
			)
				p++;
			if (p >= length || char_code_at.call(source, p - base) !== CLOSE_BRACE)
				return null;
			return { kind: kind_ch, tag, expr_start: 0, expr_end: 0, end: p + 1 };
		}

		// skip whitespace after tag name
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;

		if (p < length && char_code_at.call(source, p - base) === CLOSE_BRACE) {
			// no expression: {#tag} or {:tag}
			return { kind: kind_ch, tag, expr_start: 0, expr_end: 0, end: p + 1 };
		}

		// expression content: find the matching }
		const expr_start = p;
		const brace_end = this.find_matching_brace(expr_start);
		if (brace_end === -1) return null;
		// brace_end points past the }, expr_end is just before it
		return {
			kind: kind_ch,
			tag,
			expr_start,
			expr_end: brace_end - 1,
			end: brace_end,
		};
	}

	/**
	 * check if position starts with a svelte block continuation ({:...}) or
	 * closer ({/...}) that would interrupt the current block content.
	 */
	private is_svelte_block_boundary(pos: number): boolean {
		if (this.svelte_block_depth === 0) return false;
		const source = this.source;
		const base = this.source_base;
		if (
			pos >= this.source_end ||
			char_code_at.call(source, pos - base) !== OPEN_BRACE
		)
			return false;
		const next = char_code_at.call(source, pos + 1 - base);
		return next === COLON || next === SLASH;
	}

	/**
	 * find the matching closing brace for a svelte expression.
	 * pos should point to the char after the opening `{`.
	 * tracks nested braces and skips over string literals and template literals.
	 * returns the position just past the closing `}`, or -1 if not found.
	 */
	find_matching_brace(pos: number): number {
		if (this.cold.brace_memo !== null)
			return this.find_matching_brace_memo(pos);
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let depth = 1;
		let p = pos;
		// short plain expressions stay in this small loop, the rest goes to find_matching_brace_far
		const lim = length - pos > 256 ? pos + 256 : length;

		while (p < lim) {
			const ch = char_code_at.call(source, p - base);
			if (ch === CLOSE_BRACE) {
				if (--depth === 0) return p + 1;
			} else if (ch === OPEN_BRACE) {
				depth++;
			} else if (ch < 128 && BRACE_STOP[ch] !== 0) {
				break;
			}
			p++;
		}

		if (p < length) {
			const end = find_matching_brace_far(this, source, base, length, p, depth);
			return end >= 0 ? end : end === -1 ? this.brace_failed(pos) : -1;
		}
		return this.brace_failed(pos);
	}

	/**
	 * on finished input a scan that ran out never closes, later scans go through
	 * find_matching_brace_memo so k unclosed braces cost two scans to the end, not k
	 */
	private brace_failed(pos: number): number {
		if (this.finished && !this.inline_range_parse) {
			const memo = (this.cold.brace_memo = new Set());
			memo.add(pos);
		}
		return -1;
	}

	/** a scan from just past a brace this one opened and left open fails too, so those are remembered */
	private find_matching_brace_memo(pos: number): number {
		const memo = this.cold.brace_memo!;
		if (memo.has(pos)) return -1;
		const open = brace_open;
		const floor = open.length;
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let depth = 1;
		let p = pos;

		while (p < length) {
			const ch = char_code_at.call(source, p - base);
			if (ch >= 128 || BRACE_STOP[ch] === 0) {
				p++;
				continue;
			}

			switch (ch) {
				case OPEN_BRACE:
					depth++;
					p++;
					open.push(p);
					break;
				case CLOSE_BRACE:
					depth--;
					if (depth === 0) return p + 1;
					open.pop();
					p++;
					break;
				case QUOTE:
				case APOSTROPHE: {
					// skip string literal
					const needle = ch === QUOTE ? '"' : "'";
					let r = p + 1 - base;
					p = length;
					for (;;) {
						const q = string_index_of.call(source, needle, r);
						if (q === -1) break;
						let k = q;
						while (k > r && char_code_at.call(source, k - 1) === BACKSLASH) k--;
						if (((q - k) & 1) === 0) {
							p = q + 1 + base;
							break;
						}
						r = q + 1;
					}
					break;
				}
				case BACKTICK: {
					// skip template literal, respecting ${} interpolations
					p++;
					while (
						p < length &&
						char_code_at.call(source, p - base) !== BACKTICK
					) {
						if (char_code_at.call(source, p - base) === BACKSLASH) {
							p++;
						} else if (
							char_code_at.call(source, p - base) === 36 /* $ */ &&
							p + 1 < length &&
							char_code_at.call(source, p + 1 - base) === OPEN_BRACE
						) {
							p += 2; // skip ${
							// recursively find the matching } for the interpolation
							const inner_end = this.find_matching_brace_memo(p);
							if (inner_end === -1) return this.brace_memo_failed(pos, floor);
							p = inner_end;
							continue;
						}
						p++;
					}
					if (p < length) p++; // skip closing backtick
					break;
				}
				case SLASH: {
					// skip // line comments
					if (
						p + 1 < length &&
						char_code_at.call(source, p + 1 - base) === SLASH
					) {
						p += 2;
						while (
							p < length &&
							char_code_at.call(source, p - base) !== LINEFEED
						)
							p++;
						break;
					}
					// skip /* block comments */
					if (
						p + 1 < length &&
						char_code_at.call(source, p + 1 - base) === ASTERISK
					) {
						p += 2;
						while (p < length) {
							if (
								char_code_at.call(source, p - base) === ASTERISK &&
								p + 1 < length &&
								char_code_at.call(source, p + 1 - base) === SLASH
							) {
								p += 2;
								break;
							}
							p++;
						}
						break;
					}
					p++;
					break;
				}
				default:
					p++;
			}
		}

		return this.brace_memo_failed(pos, floor);
	}

	private brace_memo_failed(pos: number, floor: number): number {
		const open = brace_open;
		// a table header cell parses with the source cut at the cell end
		if (!this.inline_range_parse) {
			const memo = this.cold.brace_memo!;
			memo.add(pos);
			for (let i = floor; i < open.length; i++) memo.add(open[i]);
		}
		open.length = floor;
		return -1;
	}

	/**
	 * find_matching_brace for feed stall checks with the same result, from the second failed
	 * scan of a brace on the scan keeps its state and resumes, so a brace open across feeds is scanned once
	 */
	private probe_matching_brace(pos: number): number {
		if (this.cold.bp_start !== pos) {
			// most braces close within the chunk, the plain scan is quicker for those
			const end = this.find_matching_brace(pos);
			if (end !== -1) return end;
			this.cold.bp_start = pos;
			this.cold.bp_end = -1;
			this.cold.bp_p = -1;
			return -1;
		}
		if (this.cold.bp_end !== -1) return this.cold.bp_end;
		if (this.cold.bp_p === -1) {
			// still open after a second feed, scan once more keeping state from here on
			const frames = this.cold.bp_frames;
			if (frames === null) this.cold.bp_frames = [1];
			else {
				frames.length = 0;
				frames.push(1);
			}
			this.cold.bp_p = pos;
			this.cold.bp_mode = BM_CODE;
			this.cold.bp_quote = 0;
		}
		if (this.brace_scan(this.source, this.source_base, this.source_end))
			return this.cold.bp_end;
		// _run stalls here, later chunks only need the brace scan until it closes
		this.wait_kind = WAIT_BRACE;
		this.cold.wait_cursor = this.cursor;
		return -1;
	}

	/**
	 * nothing _run reads changes until needle appears, so feed holds chunks back until one
	 * might hold it instead of rescanning the window every feed
	 */
	private wait_for(needle: string): void {
		this.wait_kind = WAIT_NEEDLE;
		this.cold.wait_needle = needle;
		this.cold.wait_cursor = this.cursor;
	}

	/** false only when the needle is not in the chunk and not across its start */
	private needle_in(chunk: string, len: number): boolean {
		const needle = this.cold.wait_needle;
		if (string_index_of.call(chunk, needle) !== -1) return true;
		const k = needle.length - 1;
		if (k === 0) return false;
		const pending = this.wait_chunks;
		const prev =
			pending.length !== 0 ? pending[pending.length - 1] : this.source;
		const n = prev.length;
		// too short to hold the part before the boundary, let _run look
		if (n < k || len < k) return true;
		const edge =
			string_slice.call(prev, n - k) + string_slice.call(chunk, 0, k);
		return string_index_of.call(edge, needle) !== -1;
	}

	/** resume the saved brace scan up to length, true with bp_end set once the brace closes */
	private brace_scan(source: string, base: number, length: number): boolean {
		// the probe made the frames before any resume
		const frames = this.cold.bp_frames!;
		let p = this.cold.bp_p;
		let mode = this.cold.bp_mode;
		let quote = this.cold.bp_quote;
		// code and template text jump to their next stop char, each stop keeps its own indexOf cursor, -1 until first searched
		const end = length - base;
		let c_open = -1;
		let c_close = -1;
		let c_quote = -1;
		let c_apos = -1;
		let c_tick = -1;
		let c_slash = -1;
		let c_bs = -1;
		let c_dollar = -1;

		scan: while (p < length) {
			let ch = char_code_at.call(source, p - base);
			if (mode === BM_CODE) {
				if (
					ch !== OPEN_BRACE &&
					ch !== CLOSE_BRACE &&
					ch !== QUOTE &&
					ch !== APOSTROPHE &&
					ch !== BACKTICK &&
					ch !== SLASH
				) {
					const r = p - base;
					if (c_open < r) {
						c_open = string_index_of.call(source, '{', r);
						if (c_open === -1 || c_open > end) c_open = end;
					}
					if (c_close < r) {
						c_close = string_index_of.call(source, '}', r);
						if (c_close === -1 || c_close > end) c_close = end;
					}
					if (c_quote < r) {
						c_quote = string_index_of.call(source, '"', r);
						if (c_quote === -1 || c_quote > end) c_quote = end;
					}
					if (c_apos < r) {
						c_apos = string_index_of.call(source, "'", r);
						if (c_apos === -1 || c_apos > end) c_apos = end;
					}
					if (c_tick < r) {
						c_tick = string_index_of.call(source, '`', r);
						if (c_tick === -1 || c_tick > end) c_tick = end;
					}
					if (c_slash < r) {
						c_slash = string_index_of.call(source, '/', r);
						if (c_slash === -1 || c_slash > end) c_slash = end;
					}
					let q = c_open;
					if (c_close < q) q = c_close;
					if (c_quote < q) q = c_quote;
					if (c_apos < q) q = c_apos;
					if (c_tick < q) q = c_tick;
					if (c_slash < q) q = c_slash;
					if (q >= end) {
						p = length;
						break scan;
					}
					p = q + base;
					ch = char_code_at.call(source, q);
				}
			} else if (mode === BM_STR) {
				if (ch !== quote && ch !== BACKSLASH) {
					// an odd backslash run at the input end leaves the escape state for the next chunk
					const r = p - base;
					const end = length - base;
					let s = r;
					for (;;) {
						let q = string_index_of.call(
							source,
							quote === QUOTE ? '"' : "'",
							s
						);
						if (q === -1 || q >= end) q = end;
						let k = q;
						while (k > r && char_code_at.call(source, k - 1) === BACKSLASH) k--;
						if (q === end) {
							p = length;
							if (((q - k) & 1) !== 0) mode = BM_STR_ESC;
							break scan;
						}
						if (((q - k) & 1) === 0) {
							p = q + base;
							ch = quote;
							break;
						}
						s = q + 1;
					}
				}
			} else if (mode === BM_LINE) {
				const nl = string_index_of.call(source, '\n', p - base);
				if (nl === -1) {
					p = length;
					break;
				}
				p = nl + base;
				ch = LINEFEED;
			} else if (mode === BM_BLOCK) {
				while (ch !== ASTERISK) {
					if (++p >= length) break scan;
					ch = char_code_at.call(source, p - base);
				}
			} else if (mode === BM_TPL) {
				if (ch !== BACKTICK && ch !== BACKSLASH && ch !== 36 /* $ */) {
					const r = p - base;
					if (c_tick < r) {
						c_tick = string_index_of.call(source, '`', r);
						if (c_tick === -1 || c_tick > end) c_tick = end;
					}
					if (c_bs < r) {
						c_bs = string_index_of.call(source, '\\', r);
						if (c_bs === -1 || c_bs > end) c_bs = end;
					}
					if (c_dollar < r) {
						c_dollar = string_index_of.call(source, '$', r);
						if (c_dollar === -1 || c_dollar > end) c_dollar = end;
					}
					let q = c_tick;
					if (c_bs < q) q = c_bs;
					if (c_dollar < q) q = c_dollar;
					if (q >= end) {
						p = length;
						break scan;
					}
					p = q + base;
					ch = char_code_at.call(source, q);
				}
			}
			switch (mode) {
				case BM_CODE:
					if (ch === OPEN_BRACE) {
						frames[frames.length - 1]++;
					} else if (ch === CLOSE_BRACE) {
						const top = frames.length - 1;
						if (--frames[top] === 0) {
							frames.pop();
							if (top === 0) {
								this.cold.bp_end = p + 1;
								return true;
							}
							// an interpolation closed, back in its template
							mode = BM_TPL;
						}
					} else if (ch === QUOTE || ch === APOSTROPHE) {
						quote = ch;
						mode = BM_STR;
					} else if (ch === BACKTICK) {
						frames.push(0);
						mode = BM_TPL;
					} else if (ch === SLASH) {
						mode = BM_SLASH;
					}
					p++;
					break;
				case BM_SLASH:
					if (ch === SLASH) {
						mode = BM_LINE;
						p++;
					} else if (ch === ASTERISK) {
						mode = BM_BLOCK;
						p++;
					} else {
						// a lone slash, this char is code
						mode = BM_CODE;
					}
					break;
				case BM_STR:
					if (ch === BACKSLASH) mode = BM_STR_ESC;
					else if (ch === quote) mode = BM_CODE;
					p++;
					break;
				case BM_STR_ESC:
					mode = BM_STR;
					p++;
					break;
				case BM_TPL:
					if (ch === BACKTICK) {
						frames.pop();
						mode = BM_CODE;
					} else if (ch === BACKSLASH) {
						mode = BM_TPL_ESC;
					} else if (ch === 36 /* $ */) {
						mode = BM_TPL_DOLLAR;
					}
					p++;
					break;
				case BM_TPL_ESC:
					mode = BM_TPL;
					p++;
					break;
				case BM_TPL_DOLLAR:
					if (ch === OPEN_BRACE) {
						frames.push(1);
						mode = BM_CODE;
						p++;
					} else {
						// not an interpolation, this char is template text
						mode = BM_TPL;
					}
					break;
				case BM_LINE:
					if (ch === LINEFEED) mode = BM_CODE;
					p++;
					break;
				case BM_BLOCK:
					if (ch === ASTERISK) mode = BM_BLOCK_STAR;
					p++;
					break;
				default:
					// BM_BLOCK_STAR
					if (ch === SLASH) mode = BM_CODE;
					else if (ch !== ASTERISK) mode = BM_BLOCK;
					p++;
			}
		}

		this.cold.bp_p = p;
		this.cold.bp_mode = mode;
		this.cold.bp_quote = quote;
		return false;
	}

	/**
	 * try to parse a link reference definition at block level.
	 * syntax: [label]: destination "title"
	 *
	 * returns position after the definition on success, -1 if not a
	 * definition, or -2 if more input is needed (incremental stall).
	 * on success, stores the definition in this.ref_map.
	 */
	private try_parse_link_ref_definition(pos: number): number {
		// in pfm link reference definitions are only valid at root level
		if (this.block_quote_depth > 0 || this.list_depth > 0) return -1;

		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let p = pos;

		// skip optional leading whitespace
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;

		// must start with [
		if (p >= length) return this.finished ? -1 : -2;
		if (char_code_at.call(source, p - base) !== OPEN_SQUARE_BRACKET) return -1;
		p++;

		// parse label - no line breaks, no empty label
		const label_start = p;
		while (p < length) {
			const ch = char_code_at.call(source, p - base);
			if (ch === CLOSE_SQUARE_BRACKET) break;
			if (ch === LINEFEED || ch === OPEN_SQUARE_BRACKET) return -1;
			if (ch === BACKSLASH && p + 1 < length) {
				p += 2;
				continue;
			}
			p++;
		}
		if (p >= length) return this.finished ? -1 : -2;
		if (p === label_start) return -1; // empty label

		const label_end = p;
		p++; // skip ]

		// must have : immediately after ]
		if (p >= length) return this.finished ? -1 : -2;
		if (char_code_at.call(source, p - base) !== COLON) return -1;
		p++;
		const label = string_slice.call(
			source,
			label_start - base,
			label_end - base
		);

		// skip optional whitespace (including at most one line break)
		let saw_newline = false;
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;
		if (p < length && char_code_at.call(source, p - base) === LINEFEED) {
			saw_newline = true;
			p++;
			while (
				p < length &&
				(char_code_at.call(source, p - base) === SPACE ||
					char_code_at.call(source, p - base) === TAB)
			)
				p++;
		}

		// parse destination
		if (p >= length) return this.finished ? -1 : -2;

		let url_start: number, url_end: number;
		const dest_ch = char_code_at.call(source, p - base);

		if (dest_ch === OPEN_ANGLE_BRACKET) {
			// angle-bracket destination: <url>
			p++;
			url_start = p;
			while (p < length) {
				const ch = char_code_at.call(source, p - base);
				if (ch === CLOSE_ANGLE_BRACKET) break;
				if (ch === LINEFEED || ch === OPEN_ANGLE_BRACKET) return -1;
				if (ch === BACKSLASH && p + 1 < length) {
					p += 2;
					continue;
				}
				p++;
			}
			if (p >= length) return this.finished ? -1 : -2;
			url_end = p;
			p++; // skip >
		} else if (dest_ch === LINEFEED) {
			// no destination - invalid
			return -1;
		} else {
			// bare destination - balanced parens, no spaces
			url_start = p;
			let paren_depth = 0;
			while (p < length) {
				const ch = char_code_at.call(source, p - base);
				if (ch <= 0x20) break; // whitespace or control
				if (ch === CLOSE_PAREN) {
					if (paren_depth === 0) break;
					paren_depth--;
				}
				if (ch === OPEN_PAREN) paren_depth++;
				if (ch === BACKSLASH && p + 1 < length) {
					p += 2;
					continue;
				}
				p++;
			}
			if (paren_depth !== 0) return -1;
			url_end = p;
			if (url_start === url_end) return -1; // empty bare destination
		}

		const url = string_slice.call(source, url_start - base, url_end - base);

		// skip optional whitespace before title (no line break yet)
		const pre_title_p = p;
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;
		const had_title_ws = p > pre_title_p;

		// check for optional title
		let title = '';
		if (p < length) {
			const tc = char_code_at.call(source, p - base);
			if (tc === LINEFEED) {
				// newline after url - check if next line has a title
				const nl_p = p;
				p++;
				while (
					p < length &&
					(char_code_at.call(source, p - base) === SPACE ||
						char_code_at.call(source, p - base) === TAB)
				)
					p++;
				if (p < length) {
					const ntc = char_code_at.call(source, p - base);
					if (ntc === 34 || ntc === 39 || ntc === OPEN_PAREN) {
						// try title on next line
						const title_result = this.parse_ref_title(p);
						if (title_result === -2) {
							return -2; // need more input to complete title
						} else if (title_result) {
							title = title_result.title;
							p = title_result.end;
						} else {
							// no title - position is after url, at the newline
							p = nl_p;
						}
					} else {
						// not a title char - no title, position at newline
						p = nl_p;
					}
				} else if (!this.finished) {
					return -2; // need more input
				} else {
					p = nl_p;
				}
			} else if (
				(tc === 34 || tc === 39 || tc === OPEN_PAREN) &&
				had_title_ws
			) {
				// title on same line (whitespace required between destination and title)
				const title_result = this.parse_ref_title(p);
				if (title_result === -2) {
					return -2; // need more input to complete title
				} else if (title_result) {
					title = title_result.title;
					p = title_result.end;
				} else {
					// invalid title - this makes the whole definition invalid
					return -1;
				}
			}
			// otherwise: no title, url ends where whitespace started
		} else if (!this.finished) {
			return -2; // need more input
		}

		// must be at end of line (only whitespace allowed after)
		while (
			p < length &&
			(char_code_at.call(source, p - base) === SPACE ||
				char_code_at.call(source, p - base) === TAB)
		)
			p++;
		if (p >= length && !this.finished) return -2; // need to see end of line
		if (p < length && char_code_at.call(source, p - base) !== LINEFEED)
			return -1;
		if (p < length) p++; // skip newline

		// store definition - first one wins
		const normalized = normalize_label(label);
		if (normalized) {
			let refs = this.ref_map;
			if (refs === NO_REFS) refs = this.ref_map = new Map();
			if (!refs.has(normalized)) refs.set(normalized, { url, title });
		}

		return p;
	}

	/**
	 * parse a title string starting at pos. handles "...", '...', (...)
	 * including multi-line titles (but not across blank lines).
	 * returns { title, end } or null on failure.
	 */
	private parse_ref_title(
		pos: number
	): { title: string; end: number } | null | -2 {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;

		const tc = char_code_at.call(source, pos - base);
		if (tc !== 34 && tc !== 39 && tc !== OPEN_PAREN) return null;
		const close_char = tc === OPEN_PAREN ? CLOSE_PAREN : tc;

		let p = pos + 1;
		const title_start = p;

		while (p < length) {
			const ch = char_code_at.call(source, p - base);
			if (ch === close_char) {
				const title = string_slice.call(source, title_start - base, p - base);
				return { title, end: p + 1 };
			}
			if (ch === LINEFEED) {
				// check for blank line - that terminates the title (invalid)
				let q = p + 1;
				while (
					q < length &&
					(char_code_at.call(source, q - base) === SPACE ||
						char_code_at.call(source, q - base) === TAB)
				)
					q++;
				if (q < length && char_code_at.call(source, q - base) === LINEFEED)
					return null; // blank line
				if (q >= length && !this.finished) return -2; // need more input
			}
			if (ch === BACKSLASH && p + 1 < length) {
				p += 2;
				continue;
			}
			p++;
		}

		// hit end of input without closing
		if (!this.finished) return -2; // need more input
		return null;
	}

	/**
	 * start a heading from a block dispatch state. validates # count,
	 * emits open(heading), skips whitespace after #, and pushes
	 * heading_marker state for streaming content.
	 */
	/**
	 * returns false if we need to hold back (not enough input).
	 */
	private start_heading(parent: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;

		let hash_count = 1;
		let pos = this.cursor + 1;
		while (
			pos < length &&
			char_code_at.call(source, pos - base) === OCTOTHERP
		) {
			hash_count++;
			pos++;
		}

		if (hash_count > 6) {
			this.states.push(StateKind.paragraph);
			const para_id = this.emit_open(NodeKind.paragraph, this.cursor, parent);
			this.node_stack.push(para_id);
			return true;
		}

		// need to see the character after the hashes to decide
		// heading (# ) vs paragraph (#text)
		if (pos >= length && !this.finished) {
			return false; // hold back
		}

		const after_hash = char_code_at.call(source, pos - base);
		if (
			pos < length &&
			after_hash !== SPACE &&
			after_hash !== TAB &&
			after_hash !== LINEFEED
		) {
			this.states.push(StateKind.paragraph);
			const para_id = this.emit_open(NodeKind.paragraph, this.cursor, parent);
			this.node_stack.push(para_id);
			return true;
		}

		// skip whitespace after # to find content_start.
		let content_start = pos;
		if (pos < length && (after_hash === SPACE || after_hash === TAB)) {
			content_start++;
			while (
				content_start < length &&
				(char_code_at.call(source, content_start - base) === SPACE ||
					char_code_at.call(source, content_start - base) === TAB)
			) {
				content_start++;
			}
		}

		// stall if we haven't passed the leading whitespace yet - more
		// whitespace may still arrive and shift content_start further.
		if (content_start >= length && !this.finished) {
			return false;
		}

		// emit open and value_start - content will stream via heading_marker state
		const h_id = this.emit_open(
			NodeKind.heading,
			this.cursor,
			parent,
			hash_count
		);
		this.out.set_value_start(h_id, content_start);
		this.chomp(content_start, true);
		const c0 =
			content_start < length
				? char_code_at.call(source, content_start - base)
				: 0;
		if (!this.in_table && (c0 >= 128 || (c0 !== 0 && TEXT_BREAK[c0] === 0))) {
			// plain content, take the text run of the heading_marker trip and its close of text and heading at the linefeed
			const t_id = this.emit_open(NodeKind.text, content_start, h_id);
			this.out.set_value_start(t_id, content_start);
			let p = content_start + 1;
			if (p < length) {
				const c1 = char_code_at.call(source, p - base);
				if (c1 !== 0 && (c1 >= 128 || TEXT_BREAK[c1] === 0)) {
					p++;
					while (p < length) {
						const ch = char_code_at.call(source, p - base);
						if (ch < 128 && TEXT_BREAK[ch] !== 0) break;
						p++;
					}
				}
			}
			this.cursor = p;
			if (p < length && char_code_at.call(source, p - base) === LINEFEED) {
				let ve = p;
				while (
					ve > 0 &&
					(char_code_at.call(source, ve - 1 - base) === SPACE ||
						char_code_at.call(source, ve - 1 - base) === TAB)
				) {
					ve--;
				}
				this.emit_close(t_id, ve);
				this.out.set_value_end(t_id, ve);
				this.out.set_value_end(h_id, ve);
				this.emit_close(h_id, p);
				return true;
			}
			this.node_stack.push(h_id);
			this.in_heading = true;
			this.states.push(StateKind.heading_marker);
			this.states.push(StateKind.inline);
			this.node_stack.push(t_id);
			this.states.push(StateKind.text);
			return true;
		}
		this.node_stack.push(h_id);
		this.in_heading = true;
		this.states.push(StateKind.heading_marker);
		return true;
	}

	// an inline construct that streams nested content (emphasis, strong,
	// strikethrough, superscript, subscript, link/image/directive text)
	// opened a span but reached end of input with no matching close. pop the
	// state and its node, leaving the node pending so _finalize revokes it
	// into literal text (commonmark degrade behavior). pop the enclosing
	// inline so the parent block state regains control - mirrors the normal
	// close path. without this the construct's state and inline ping-pong at
	// a fixed cursor and trip the no-progress guard.
	private _unwind_unterminated_delimiter(): void {
		this.states.pop();
		this.node_stack.pop();
		if (this.states[this.states.length - 1] === StateKind.inline) {
			this.states.pop();
		}
	}

	// delimiter states must close wherever inline pops or the two ping pong
	private lf_ends_inline(lf: number): boolean {
		const np = lf + 1;
		if (this.is_block_interrupt(np)) {
			this.interrupt_pos = np;
			this.interrupt_list_depth = this.list_depth;
			this.interrupt_svelte_depth = this.svelte_block_depth;
			return true;
		}
		if (this.list_depth === 0) return false;
		const { columns: ind } = this.count_indent(np);
		if (ind < this.list_content_offset) return false;
		const stripped = this.skip_columns(np, this.list_content_offset);
		return (
			stripped < this.source_end &&
			this.try_parse_list_marker(stripped) !== null
		);
	}

	// returns true when a linefeed inside a delimiter state (emphasis,
	// strong, strikethrough, superscript, subscript) was consumed by a
	// block interrupt or blockquote boundary. caller should `continue
	// main_loop` when true.
	private _delimiter_lf_close(current_node: number): boolean {
		// a heading's inline pops at every linefeed, in a block quote too
		if (!this.in_heading) {
			// feed mode, the caller pushes inline whose linefeed stalls until the next line decides
			if (!this.finished && !this.can_decide_after_lf(this.cursor))
				return false;
			if (this.block_quote_depth > 0) {
				const stripped = this.skip_bq_markers(
					this.cursor + 1,
					this.block_quote_depth
				);
				if (
					stripped !== -1 &&
					!this.is_blank_at_pos(stripped) &&
					!this.is_heading_start(stripped) &&
					!this.is_thematic_break_start(stripped)
				) {
					this.emit_bare_leaf(
						NodeKind.soft_break,
						this.cursor,
						current_node,
						this.cursor + 1
					);
					this.chomp(stripped, true);
					this.states.push(StateKind.inline);
					return true;
				}
			} else if (!this.lf_ends_inline(this.cursor)) {
				// is_block_interrupt in lf_ends_inline covers blank lines, headings and thematic breaks as above
				return false;
			}
		}
		this.states.pop();
		this.emit_close(current_node, this.cursor);
		this.out.set_value_end(current_node, this.cursor);
		this.node_stack.pop();
		return true;
	}

	/**
	 * outside block quotes, pop inline at a linefeed lf_ends_inline ends and close a paragraph
	 * under it here, its own interrupt check would reach the same answer
	 */
	private inline_lf_end(): void {
		const states = this.states;
		states.pop();
		if (states[states.length - 1] !== StateKind.paragraph) return;
		const node_stack = this.node_stack;
		this.emit_close(node_stack[node_stack.length - 1], this.cursor);
		states.pop();
		truncate_stack(
			node_stack,
			1 +
				this.block_quote_depth +
				this.list_depth * 2 +
				this.html_block_depth +
				this.svelte_block_depth * 2 +
				this.directive_colon_counts.length
		);
	}

	// main loop

	private _run(): void {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const window_len = length - base;

		// reset progress counter,  new data may have been fed since last _run()
		this.loop_without_progress = 0;
		this.interrupt_pos = -1;
		this.interrupt_marker_pos = -1;
		let iter_count = 0;

		main_loop: while (this.cursor <= length) {
			// stop when we've consumed all available input.
			if (!this.finished && this.cursor >= length) {
				break;
			}

			// revoke pending speculative nodes as soon as we're back at
			// a block-level state - they'll never close. tight-list
			// paragraphs are left pending on purpose (finalized at list
			// close or loose promotion) so they are skipped here.
			// pending nodes that are still ancestors on the node stack
			// (e.g. an html_block_element parent under an open list) are
			// also preserved - they have a live close path ahead.
			if (this.pending_count > this.pending_para_count) {
				const st = this.states[this.states.length - 1];
				if (
					st === StateKind.root ||
					st === StateKind.block_quote ||
					st === StateKind.list_item
				) {
					this.revoke_stale_pending();
				}
			}

			const active = this.states[this.states.length - 1];
			// keeps the builtin call in bounds so turbofan never deopts it, a cursor behind source_base reads nan too
			const code_at = this.cursor - base;
			const code =
				code_at >>> 0 < window_len ? char_code_at.call(source, code_at) : NaN;

			const current_node = this.node_stack[this.node_stack.length - 1];

			if ((++iter_count & 63) === 0 && this.stalled()) {
				console.error('Infinite loop detected');
				break;
			}

			switch (active) {
				case StateKind.root: {
					if (
						this.node_stack.length === 1 &&
						this.pending_count === this.pending_para_count
					) {
						this.trim_point = this.cursor;
					}
					if (code !== code) {
						this.cursor++;
						continue;
					}

					// frontmatter: must start at the very beginning of the document.
					// stall only while the prefix is still consistent with `---\n`
					// (first `-`, then `--`, then `---`). a second char that isn't
					// `-` rules out frontmatter - no reason to block list/tb/paragraph
					// dispatch any longer.
					if (
						this.cursor === 0 &&
						!this.frontmatter_failed &&
						code === DASH &&
						!this.finished &&
						length < 4 &&
						(length < 2 || char_code_at.call(source, 1 - base) === DASH) &&
						(length < 3 || char_code_at.call(source, 2 - base) === DASH)
					) {
						break main_loop;
					}
					if (
						this.cursor === 0 &&
						!this.frontmatter_failed &&
						code === DASH &&
						char_code_at.call(source, 1 - base) === DASH &&
						char_code_at.call(source, 2 - base) === DASH
					) {
						const ch3 = char_code_at.call(source, 3 - base);
						if (ch3 === LINEFEED || ch3 !== ch3 /* nan = eof */) {
							// need at least the opening `---\n` before we commit
							if (!this.finished && length < 4) break main_loop;
							this.states.push(StateKind.frontmatter);
							const fm_id = this.emit_open(
								NodeKind.frontmatter,
								0,
								current_node
							);
							this.node_stack.push(fm_id);
							// advance past `---\n`
							const content_start = ch3 === LINEFEED ? 4 : 3;
							this.out.set_value_start(fm_id, content_start);
							this.chomp(content_start, true);
							continue;
						}
					}

					// import statements: must appear before any other content
					if (this.imports_allowed && code === 105 /* i */) {
						const imp = this.try_parse_import(this.cursor);
						if (imp === false) break main_loop; // stall
						if (imp !== null) {
							this.emit_leaf(
								NodeKind.import_statement,
								this.cursor,
								current_node,
								imp.value_start,
								imp.value_end,
								imp.end
							);
							this.chomp(imp.end, true);
							continue;
						}
					}

					// once we see non-whitespace, non-import content, imports are no longer allowed
					if (
						this.imports_allowed &&
						code !== LINEFEED &&
						code !== SPACE &&
						code !== TAB
					) {
						this.imports_allowed = false;
					}

					switch (code) {
						case LINEFEED: {
							this.emit_bare_leaf(
								NodeKind.line_break,
								this.cursor,
								current_node,
								this.cursor + 1
							);
							this.cursor++;
							continue;
						}

						case SPACE:
						case TAB: {
							let pos = this.cursor;
							while (
								pos < length &&
								(char_code_at.call(source, pos - base) === SPACE ||
									char_code_at.call(source, pos - base) === TAB)
							) {
								pos++;
							}
							if (pos >= length && !this.finished) break main_loop;
							if (
								pos < length &&
								char_code_at.call(source, pos - base) === LINEFEED
							) {
								this.emit_bare_leaf(
									NodeKind.line_break,
									this.cursor,
									current_node,
									pos + 1
								);
								this.chomp(pos + 1, true);
								continue;
							}
							this.cursor++;
							continue;
						}

						case OCTOTHERP: {
							if (!this.start_heading(current_node)) break main_loop;
							continue;
						}

						case BACKTICK: {
							this.start_fence(current_node);
							continue;
						}

						case ASTERISK:
						case DASH:
						case UNDERSCORE: {
							// distinguish thematic break (`---`) from list (`- `)
							// from paragraph (`-text`). stall only while the line
							// could still be a thematic break (marker + ws chars
							// only). as soon as we see a non-marker/ws char, we
							// can commit to list or paragraph speculatively.
							if (this.could_be_thematic_break(this.cursor, code)) {
								break main_loop;
							}
							if (this.is_thematic_break_start(this.cursor)) {
								let line_end = this.cursor;
								while (
									line_end < length &&
									char_code_at.call(source, line_end - base) !== LINEFEED
								) {
									line_end++;
								}
								const break_end = line_end < length ? line_end + 1 : line_end;

								this.emit_bare_leaf(
									NodeKind.thematic_break,
									this.cursor,
									current_node,
									break_end
								);

								this.chomp(break_end, true);
								continue;
							}
							if (code !== UNDERSCORE) {
								const marker = this.try_parse_list_marker(this.cursor);
								if (marker) {
									this.start_list(marker, current_node);
									continue;
								}
							}
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node
							);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_ANGLE_BRACKET: {
							// in incremental mode, stall if the tag might be incomplete
							// (no closing > visible in the available source).
							if (
								!this.finished &&
								string_index_of.call(source, '>', this.cursor + 1 - base) === -1
							) {
								this.wait_for('>');
								break main_loop;
							}

							// autolinks require a scheme prefix (<scheme:...>).
							// only uri autolinks trigger paragraph wrapping at block level.
							const blk_uri = this.try_parse_uri_autolink(this.cursor + 1);
							if (blk_uri !== -1) {
								this.states.push(StateKind.paragraph);
								const auto_para = this.emit_open(
									NodeKind.paragraph,
									this.cursor,
									current_node
								);
								this.node_stack.push(auto_para);
								continue;
							}

							// try html comment at block level
							const blk_comment = this.try_parse_html_comment(this.cursor + 1);
							if (blk_comment === false) {
								if (this.cursor + 3 < length) this.wait_for('-->');
								break main_loop;
							}
							if (blk_comment) {
								const c_id = this.emit_open(
									NodeKind.html_comment,
									this.cursor,
									current_node
								);
								this.out.text(
									c_id,
									blk_comment.content_start,
									blk_comment.content_end,
									NodeKind.html_comment
								);
								this.emit_close(c_id, blk_comment.end);
								this.chomp(blk_comment.end, true);
								continue;
							}

							// try html opening tag at block level
							const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
							if (blk_tag === null && this.tag_wait) break main_loop;
							if (blk_tag) {
								// an element that closes on its line is inline in a paragraph, close_end is past its close
								const close_end =
									blk_tag.self_closing || this.is_void_tag(blk_tag.tag)
										? blk_tag.end
										: this.is_raw_text_tag(blk_tag.tag)
											? 0
											: this.closes_on_line(blk_tag.tag, blk_tag.end);
								if (close_end === -1) {
									this.wait_for('\n');
									break main_loop;
								}
								if (close_end > 0) {
									this.open_spec_tag(blk_tag, close_end, current_node, false);
								} else if (this.is_raw_text_tag(blk_tag.tag)) {
									this.open_raw_text(blk_tag, current_node);
								} else {
									const html_id = this.emit_open_pending(
										NodeKind.html,
										this.cursor,
										current_node
									);
									this.out.attr(html_id, 'tag', blk_tag.tag);
									if (blk_tag.has_attrs) {
										this.out.attr(html_id, 'attributes', blk_tag.attributes);
									}
									this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
									this.node_stack.push(html_id);
									this.states.push(StateKind.html_block_element);
									this.html_block_depth++;
									this.chomp(blk_tag.end, true);
								}
								continue;
							}

							// not html - start paragraph
							this.states.push(StateKind.paragraph);
							const blk_para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node
							);
							this.node_stack.push(blk_para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && char_code_at.call(source, p - base) === SPACE)
								p++;

							this.block_quote_depth++;
							const bq_id = this.emit_open(
								NodeKind.block_quote,
								this.cursor,
								current_node
							);
							this.node_stack.push(bq_id);
							this.states.push(StateKind.block_quote);
							this.chomp(p, true);
							continue;
						}

						case PIPE: {
							const result = this.try_start_table(current_node);
							if (result === false) break main_loop; // hold back
							if (result === true) continue; // table started
							// not a table - fall through to paragraph
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node
							);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_BRACE: {
							// svelte block opener: {#tag expr}
							if (!this.finished) {
								const probe = this.probe_matching_brace(this.cursor + 1);
								if (probe === -1) break main_loop;
							}
							const token = this.try_parse_svelte_block_token(this.cursor);
							if (token && token.kind === '#') {
								this.start_svelte_block(token, current_node);
								continue;
							}
							// not a block - start paragraph (inline will handle {expr})
							if (this.at_svelte_tag(code)) {
								this.open_spec_para(current_node, false);
								continue;
							}
							this.states.push(StateKind.paragraph);
							const brace_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node
							);
							this.node_stack.push(brace_para);
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							// need a complete line for link ref definition detection
							if (
								!this.finished &&
								string_index_of.call(source, '\n', this.cursor - base) === -1
							) {
								break main_loop;
							}
							const def_end = this.try_parse_link_ref_definition(this.cursor);
							if (def_end === -2) break main_loop;
							if (def_end >= 0) {
								this.chomp(def_end, true);
								continue;
							}
							this.states.push(StateKind.paragraph);
							const ref_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node
							);
							this.node_stack.push(ref_para);
							continue;
						}

						case COLON: {
							// try_parse_block_directive stalls internally while the
							// prefix is still consistent with a directive opener, so
							// non-directive lines dispatch to paragraph eagerly
							const dir = this.try_parse_block_directive(this.cursor);
							if (dir === false) break main_loop;
							if (dir !== null) {
								this.start_block_directive(dir, current_node);
								continue;
							}
							this.states.push(StateKind.paragraph);
							const colon_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node
							);
							this.node_stack.push(colon_para);
							continue;
						}

						default: {
							if (code === PLUS || (code >= 48 && code <= 57)) {
								if (!this.finished && this.plus_marker_pending(this.cursor))
									break main_loop;
								const marker = this.try_parse_list_marker(this.cursor);
								if (marker) {
									this.start_list(marker, current_node);
									continue;
								}
							}
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node
							);
							this.node_stack.push(para_id);
							if (code >= 128 || (code !== 0 && TEXT_BREAK[code] === 0))
								this.para_text(para_id);
							continue;
						}
					}
				}

				case StateKind.paragraph: {
					const node_stack_base =
						1 +
						this.block_quote_depth +
						this.list_depth * 2 +
						this.html_block_depth +
						this.svelte_block_depth * 2 +
						this.directive_colon_counts.length;

					if (!code) {
						if (!this.finished) break main_loop;
						this.emit_close(current_node, this.cursor);
						this.states.pop();
						// truncate_stack pops, the generic length setter is slow and this nearly always drops one element
						truncate_stack(this.node_stack, node_stack_base);
						continue;
					}

					// at linefeed: need to see next line to decide boundary.
					// hold back if nothing follows and more input may come.
					if (
						code === LINEFEED &&
						!this.finished &&
						!this.can_decide_after_lf(this.cursor)
					) {
						break main_loop;
					}

					if (code === LINEFEED) {
						const next_pos = this.cursor + 1;

						// pfm: no lazy continuation. every line in a blockquote
						// must have a `>` prefix; a line without one terminates
						// the blockquote.
						if (this.block_quote_depth > 0) {
							const stripped = this.skip_bq_markers(
								next_pos,
								this.block_quote_depth
							);

							if (stripped === -1) {
								// unmarked line - close the paragraph. cursor stays
								// on lf so enclosing block_quote state frames will
								// cascade-close themselves via their own linefeed
								// handlers (each calls skip_bq_markers(_, 1)).
								this.emit_close(current_node, this.cursor);
								this.states.pop();
								truncate_stack(this.node_stack, node_stack_base);
								continue;
							}

							// markers present - check for block interrupt at stripped pos
							if (
								this.is_blank_at_pos(stripped) ||
								this.is_heading_start(stripped) ||
								this.is_thematic_break_start(stripped) ||
								(char_code_at.call(source, stripped - base) === BACKTICK &&
									char_code_at.call(source, stripped + 1 - base) === BACKTICK &&
									char_code_at.call(source, stripped + 2 - base) === BACKTICK)
							) {
								this.emit_close(current_node, this.cursor);
								this.states.pop();
								truncate_stack(this.node_stack, node_stack_base);
								continue;
							}
							// inside a list inside a blockquote: a list marker on the
							// continuation line interrupts the paragraph (same as the
							// non-bq list path below).
							if (this.list_depth > 0) {
								const { columns: ind } = this.count_indent(stripped);
								const marker_pos =
									ind >= this.list_content_offset
										? this.skip_columns(stripped, this.list_content_offset)
										: stripped;
								if (
									marker_pos < length &&
									this.try_parse_list_marker(marker_pos) !== null
								) {
									this.emit_close(current_node, this.cursor);
									this.states.pop();
									truncate_stack(this.node_stack, node_stack_base);
									continue;
								}
							}
							// continuation line inside block quote - emit soft break
							this.emit_bare_leaf(
								NodeKind.soft_break,
								this.cursor,
								current_node,
								this.cursor + 1
							);
							this.chomp(stripped, true);
							const bq_c = char_code_at.call(source, stripped - base);
							if (bq_c >= 128 || (bq_c !== 0 && TEXT_BREAK[bq_c] === 0))
								this.para_text(current_node);
							else this.states.push(StateKind.inline);
							continue;
						}

						// not in block quote - use is_block_interrupt for the common case
						if (
							(this.interrupt_pos === next_pos &&
								this.interrupt_list_depth === this.list_depth &&
								this.interrupt_svelte_depth === this.svelte_block_depth) ||
							this.is_block_interrupt(next_pos)
						) {
							this.emit_close(current_node, this.cursor);
							this.states.pop();
							truncate_stack(this.node_stack, node_stack_base);
							continue;
						}

						// check for list item start within a list
						if (this.list_depth > 0) {
							const { columns: ind } = this.count_indent(next_pos);
							if (ind >= this.list_content_offset) {
								const stripped = this.skip_columns(
									next_pos,
									this.list_content_offset
								);
								if (
									stripped < length &&
									this.try_parse_list_marker(stripped) !== null
								) {
									this.emit_close(current_node, this.cursor);
									this.states.pop();
									truncate_stack(this.node_stack, node_stack_base);
									continue;
								}
							}
						}
						// continuation line - emit soft break
						this.emit_bare_leaf(
							NodeKind.soft_break,
							this.cursor,
							current_node,
							this.cursor + 1
						);
						this.cursor++;
						// strip leading whitespace on continuation line
						while (
							this.cursor < length &&
							char_code_at.call(source, this.cursor - base) === SPACE
						) {
							this.cursor++;
						}
						this.states.push(StateKind.inline);
						continue;
					} else {
						this.states.push(StateKind.inline);
						continue;
					}
				}

				case StateKind.code_fence_start: {
					if (this._run_code_fence_start(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.code_fence_info: {
					if (this._run_code_fence_info(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.code_fence_content: {
					if (this._run_code_fence_content(current_node)) break main_loop;
					continue;
				}

				case StateKind.code_fence_text_end: {
					if (this._run_code_fence_text_end(code, current_node))
						break main_loop;
					continue;
				}

				case StateKind.heading_marker: {
					// heading content: parse inlines until linefeed or eof.
					if (code === LINEFEED || code !== code) {
						if (!this.finished && code !== code) break main_loop;
						// trim trailing whitespace from heading value
						let value_end = this.cursor;
						while (
							value_end > 0 &&
							(char_code_at.call(source, value_end - 1 - base) === SPACE ||
								char_code_at.call(source, value_end - 1 - base) === TAB)
						) {
							value_end--;
						}
						this.out.set_value_end(current_node, value_end);
						this.emit_close(current_node, this.cursor);
						this.in_heading = false;
						this.node_stack.pop();
						this.states.pop();
						continue;
					}
					// dispatch to inline parsing for heading content
					this.states.push(StateKind.inline);
					if (!this.in_table && (code >= 128 || TEXT_BREAK[code] === 0)) {
						// take the plain run inline then text would, closing the text node at the linefeed
						const t_id = this.emit_open(
							NodeKind.text,
							this.cursor,
							current_node
						);
						this.out.set_value_start(t_id, this.cursor);
						let p = this.cursor + 1;
						if (p < length) {
							const c1 = char_code_at.call(source, p - base);
							if (c1 !== 0 && (c1 >= 128 || TEXT_BREAK[c1] === 0)) {
								const text_break = TEXT_BREAK;
								p++;
								while (p < length) {
									const ch = char_code_at.call(source, p - base);
									if (ch < 128 && text_break[ch] !== 0) break;
									p++;
								}
							}
						}
						if (
							p < length &&
							char_code_at.call(source, p - base) === LINEFEED
						) {
							let ve = p;
							while (
								ve > 0 &&
								(char_code_at.call(source, ve - 1 - base) === SPACE ||
									char_code_at.call(source, ve - 1 - base) === TAB)
							) {
								ve--;
							}
							this.emit_close(t_id, ve);
							this.out.set_value_end(t_id, ve);
							this.states.pop();
							this.cursor = p;
							continue;
						}
						this.node_stack.push(t_id);
						this.states.push(StateKind.text);
						this.cursor = p;
					}
					continue;
				}

				case StateKind.strong_emphasis: {
					if (!code) {
						this._unwind_unterminated_delimiter();
						continue;
					}
					// need the char after `*` to do the flanking check without
					// mis-committing on the nan wildcard mask at end-of-buffer.
					if (
						code === ASTERISK &&
						!this.finished &&
						this.cursor + 1 >= length
					) {
						break main_loop;
					}
					if (
						code === ASTERISK &&
						this.prev_class() & (CharMask.word | CharMask.punctuation) &&
						this.next_class() & (CharMask.whitespace | CharMask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];

						// no empty emphasis: if the node has no children, revoke it.
						// detect empty by checking if cursor is at value_start (nothing consumed).
						if (!this.emphasis_has_content) {
							this.out.revoke(n_id);
							this.pending_remove(n_id);
							this.states.pop();
							this.node_stack.pop();
							// don't advance cursor - re-evaluate this char in parent state
							if (this.states[this.states.length - 1] === StateKind.inline) {
								this.states.pop();
							}
							continue;
						}

						this.close_strong(n_id);
					} else if (
						code === LINEFEED &&
						this._delimiter_lf_close(current_node)
					) {
						continue;
					} else {
						this.emphasis_has_content = true;
						this.states.push(StateKind.inline);
					}

					continue;
				}

				case StateKind.emphasis: {
					if (this._run_emphasis(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.strikethrough: {
					if (this._run_strikethrough(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.superscript: {
					if (this._run_superscript(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.subscript: {
					if (this._run_subscript(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.link_text: {
					if (this._run_link_text(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.html_element: {
					if (this._run_html_element(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.html_block_element: {
					if (this._run_html_block_element(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.svelte_branch: {
					if (this._run_svelte_branch(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.block_quote: {
					if (this._run_block_quote(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.list_item: {
					if (this._run_list_item(code, current_node)) break main_loop;
					continue;
				}

				case StateKind.directive_container: {
					if (this._run_directive_container(code, current_node))
						break main_loop;
					continue;
				}

				case StateKind.inline: {
					// in table cells, | and \n break through all inline content
					if (this.in_table && (code === PIPE || code === LINEFEED || !code)) {
						this.states.pop(); // pop inline
						continue; // let table_row_content handle it
					}
					// in headings, \n and eof terminate - pop back to heading_marker
					if (this.in_heading && (code === LINEFEED || !code)) {
						this.states.pop();
						continue;
					}
					switch (code) {
						case BACKTICK: {
							// a one or two backtick span with plain content that closes on the same line takes one trip
							if (this.line_code_span(current_node)) continue;
							// the rest goes through code_span_start
							this.states.push(StateKind.code_span_start);
							this.extra = 0;
							this.code_span_open_pos = this.cursor;
							continue;
						}
						case LINEFEED: {
							// need to see next line - hold back at end of buffer
							if (!this.finished && !this.can_decide_after_lf(this.cursor)) {
								break main_loop;
							}
							if (this.block_quote_depth > 0) {
								this.states.pop();
								continue;
							}
							if (this.lf_ends_inline(this.cursor)) {
								this.inline_lf_end();
								continue;
							} else if (this.list_depth > 0) {
								// soft line break - emit soft_break node
								this.emit_bare_leaf(
									NodeKind.soft_break,
									this.cursor,
									current_node,
									this.cursor + 1
								);
								const li_c = char_code_at.call(source, ++this.cursor - base);
								if (
									(li_c >= 128 || (li_c !== 0 && TEXT_BREAK[li_c] === 0)) &&
									this.states[this.states.length - 2] === StateKind.paragraph
								) {
									this.states.pop();
									this.para_text(current_node);
								}
								continue;
							} else {
								// soft line break - emit soft_break node
								this.emit_bare_leaf(
									NodeKind.soft_break,
									this.cursor,
									current_node,
									this.cursor + 1
								);
								this.cursor++;
								// strip leading whitespace on continuation line
								while (
									this.cursor < length &&
									char_code_at.call(source, this.cursor - base) === SPACE
								) {
									this.cursor++;
								}
								continue;
							}
						}
						case ASTERISK: {
							// need to see the next char for flanking check
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							if (
								this.prev_class() &
									(CharMask.whitespace | CharMask.punctuation) &&
								this.next_class() & (CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open_pending(
									NodeKind.strong_emphasis,
									this.cursor,
									current_node
								);

								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.emphasis_has_content = false;
								this.states.push(StateKind.strong_emphasis);
								// a plain char next, do here what the delimiter state then inline would
								const c_next =
									this.cursor + 1 < length
										? char_code_at.call(source, this.cursor + 1 - base)
										: 0;
								if (
									c_next !== 0 &&
									(c_next >= 128 || TEXT_BREAK[c_next] === 0)
								) {
									this.emphasis_has_content = true;
									this.states.push(StateKind.inline);
									this.open_text_run(this.cursor + 1, n_id);
									continue;
								}
								if (c_next === ASTERISK && this.open_inner_strong(n_id))
									continue;
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
							}

							this.cursor++;
							continue;
						}

						case UNDERSCORE: {
							// need to see the next char for flanking check
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							if (
								this.prev_class() &
									(CharMask.whitespace | CharMask.punctuation) &&
								this.next_class() & (CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open_pending(
									NodeKind.emphasis,
									this.cursor,
									current_node
								);

								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.emphasis_has_content = false;
								this.states.push(StateKind.emphasis);
								// a plain char next, do here what the delimiter state then inline would
								const c_next =
									this.cursor + 1 < length
										? char_code_at.call(source, this.cursor + 1 - base)
										: 0;
								if (
									c_next !== 0 &&
									(c_next >= 128 || TEXT_BREAK[c_next] === 0)
								) {
									this.emphasis_has_content = true;
									this.states.push(StateKind.inline);
									this.open_text_run(this.cursor + 1, n_id);
									continue;
								}
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
							}

							this.cursor++;
							continue;
						}

						case TILDE: {
							// feed mode, the char after one or two tildes decides
							if (
								!this.finished &&
								(this.cursor + 1 >= length ||
									(this.cursor + 2 >= length &&
										char_code_at.call(source, this.cursor + 1 - base) ===
											TILDE))
							) {
								break main_loop;
							}
							// strikethrough: ~~ must be double tilde with flanking
							if (
								char_code_at.call(source, this.cursor + 1 - base) === TILDE &&
								this.prev_class() &
									(CharMask.whitespace | CharMask.punctuation) &&
								classify(char_code_at.call(source, this.cursor + 2 - base)) &
									(CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open_pending(
									NodeKind.strikethrough,
									this.cursor,
									current_node
								);
								this.out.set_value_start(n_id, this.cursor + 2);
								this.node_stack.push(n_id);
								this.states.push(StateKind.strikethrough);
								this.chomp(2);
							} else if (
								// subscript: single ~ with next char word/punctuation
								char_code_at.call(source, this.cursor + 1 - base) !== TILDE &&
								this.next_class() & (CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open_pending(
									NodeKind.subscript,
									this.cursor,
									current_node
								);
								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(StateKind.subscript);
								this.cursor++;
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
								this.cursor++;
							}
							continue;
						}

						case CARET: {
							// superscript: ^ opens if next char is word/punctuation
							// (no left-flanking constraint - x^2^ is valid)
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							if (this.next_class() & (CharMask.word | CharMask.punctuation)) {
								const n_id = this.emit_open_pending(
									NodeKind.superscript,
									this.cursor,
									current_node
								);
								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(StateKind.superscript);
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
							}
							this.cursor++;
							continue;
						}

						case CLOSE_SQUARE_BRACKET: {
							// if inside a link_text state, pop inline to let it handle ]
							if (
								this.states.length >= 2 &&
								this.states[this.states.length - 2] === StateKind.link_text
							) {
								// inside directive text, a ] matching a literal [
								// is text - fall through to the text path below
								const dt_top = this.directive_text_ids.length - 1;
								if (
									dt_top >= 0 &&
									this.directive_text_ids[dt_top] === current_node &&
									this.directive_text_brackets[dt_top] > 0
								) {
									this.directive_text_brackets[dt_top]--;
								} else {
									this.states.pop();
									continue;
								}
							}
							// otherwise ] is just text
							const t_id_br = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node
							);
							this.out.set_value_start(t_id_br, this.cursor);
							this.node_stack.push(t_id_br);
							this.states.push(StateKind.text);
							this.cursor++;
							continue;
						}

						case BACKSLASH: {
							// \ is a two-char token (escape or hard break) - hold back
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							const next_code = char_code_at.call(
								source,
								this.cursor + 1 - base
							);
							if (next_code === LINEFEED) {
								// need to see the complete continuation line to
								// strip leading whitespace and handle block quotes
								if (
									!this.finished &&
									!this.can_decide_after_lf(this.cursor + 1)
								) {
									break main_loop;
								}
								// pfm: in a blockquote, the continuation line must
								// have `>` markers. if absent, emit the hard_break
								// but leave the cursor on the lf so the paragraph
								// state's strict-markers path cascade-closes the
								// enclosing block_quote frames.
								if (this.block_quote_depth > 0) {
									const peek = this.skip_bq_markers(
										this.cursor + 2,
										this.block_quote_depth
									);
									if (peek === -1) {
										this.emit_bare_leaf(
											NodeKind.hard_break,
											this.cursor,
											current_node,
											this.cursor + 2
										);
										this.cursor++; // leave the cursor on the lf
										this.states.pop(); // pop inline; paragraph will see the lf
										continue;
									}
								}
								this.emit_bare_leaf(
									NodeKind.hard_break,
									this.cursor,
									current_node,
									this.cursor + 2
								);
								this.chomp(2);
								// strip block quote markers
								if (this.block_quote_depth > 0) {
									const stripped = this.skip_bq_markers(
										this.cursor,
										this.block_quote_depth
									);
									if (stripped !== -1) this.chomp(stripped, true);
								}
								// skip leading spaces
								while (
									this.cursor < length &&
									char_code_at.call(source, this.cursor - base) === SPACE
								) {
									this.cursor++;
								}
								continue;
							}
							if (this.is_ascii_punctuation(next_code)) {
								// escape: start text node after the backslash
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor + 1,
									current_node
								);
								this.out.set_value_start(t_id, this.cursor + 1);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
								this.chomp(2);
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
								this.cursor++;
							}
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							// links are not allowed inside directive text - the
							// bracket is literal. track it when it sits directly
							// in the text so the matching ] stays literal too.
							if (this.directive_text_ids.length > 0) {
								const dt_top = this.directive_text_ids.length - 1;
								if (this.directive_text_ids[dt_top] === current_node) {
									this.directive_text_brackets[dt_top]++;
								}
								const lt_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node
								);
								this.out.set_value_start(lt_id, this.cursor);
								this.node_stack.push(lt_id);
								this.states.push(StateKind.text);
								this.cursor++;
								continue;
							}
							// speculatively open a link - [ is a link until proven otherwise
							const link_id = this.emit_open_pending(
								NodeKind.link,
								this.cursor,
								current_node
							);
							this.node_stack.push(link_id);
							this.states.push(StateKind.link_text);
							this.link_text_start = this.cursor + 1;
							{
								// a plain char next, do here what link_text then inline would
								const c_next =
									this.cursor + 1 < length
										? char_code_at.call(source, this.cursor + 1 - base)
										: 0;
								if (
									c_next !== 0 &&
									(c_next >= 128 || TEXT_BREAK[c_next] === 0)
								) {
									this.states.push(StateKind.inline);
									this.open_text_run(this.cursor + 1, link_id);
									continue;
								}
							}
							this.cursor++;
							continue;
						}

						case EXCLAMATION_MARK: {
							// ![ is a two-char token - hold back lone ! at end of buffer
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							// ![  -> speculatively open an image
							// (not inside directive text - images are forbidden
							// there, the ! falls through to the text path)
							if (
								char_code_at.call(source, this.cursor + 1 - base) ===
									OPEN_SQUARE_BRACKET &&
								this.directive_text_ids.length === 0
							) {
								const img_id = this.emit_open_pending(
									NodeKind.image,
									this.cursor,
									current_node
								);
								this.node_stack.push(img_id);
								this.states.push(StateKind.link_text);
								this.link_text_start = this.cursor + 2;
								this.chomp(2); // skip ![
								continue;
							}

							// just ! - text
							const t_id = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node
							);
							this.node_stack.push(t_id);
							this.out.set_value_start(t_id, this.cursor);
							this.states.push(StateKind.text);
							this.cursor++;
							continue;
						}

						case OPEN_ANGLE_BRACKET: {
							// in incremental mode, stall if the tag might be incomplete
							if (
								!this.finished &&
								string_index_of.call(source, '>', this.cursor + 1 - base) === -1
							) {
								this.wait_for('>');
								break main_loop;
							}

							// autolinks are links - forbidden inside directive text
							const uri_end =
								this.directive_text_ids.length > 0
									? -1
									: this.try_parse_uri_autolink(this.cursor + 1);
							if (uri_end !== -1) {
								const uri_text = string_slice.call(
									source,
									this.cursor + 1 - base,
									uri_end - 1 - base
								);
								const link_id = this.emit_open(
									NodeKind.link,
									this.cursor,
									current_node
								);
								this.out.set_value_start(link_id, this.cursor + 1);
								this.out.set_value_end(link_id, uri_end - 1);
								this.emit_close(link_id, uri_end);
								this.out.attr(link_id, 'href', uri_text);

								this.emit_leaf(
									NodeKind.text,
									this.cursor + 1,
									link_id,
									this.cursor + 1,
									uri_end - 1,
									uri_end - 1
								);

								this.chomp(uri_end, true);
								this.states.pop();
								continue;
							}

							// try html comment: <!--
							const comment = this.try_parse_html_comment(this.cursor + 1);
							if (comment === false) {
								if (this.cursor + 3 < length) this.wait_for('-->');
								break main_loop;
							}
							if (comment) {
								const c_id = this.emit_open(
									NodeKind.html_comment,
									this.cursor,
									current_node
								);
								this.out.text(
									c_id,
									comment.content_start,
									comment.content_end,
									NodeKind.html_comment
								);
								this.emit_close(c_id, comment.end);
								this.chomp(comment.end, true);
								this.states.pop();
								continue;
							}

							// try html closing tag: </tag>
							const close = this.try_parse_html_close_tag(this.cursor + 1);
							if (close) {
								const opener_idx = this.find_html_opener(close.tag);
								if (opener_idx !== -1) {
									// close all intermediate unclosed html elements
									while (this.html_tag_stack.length > opener_idx + 1) {
										const intermediate = this.html_tag_stack.pop()!;
										// unwind states and node stack for intermediate
										this.close_html_inline(intermediate.id, this.cursor);
									}
									// close the matching opener
									const opener = this.html_tag_stack.pop()!;
									this.close_html_inline(opener.id, close.end);
									this.chomp(close.end, true);
									continue;
								}
								// no matching opener - treat as text
							}

							// try html opening tag: <tag ...> or <tag ... />
							const open_tag = this.try_parse_html_open_tag(this.cursor + 1);
							if (open_tag === null && this.tag_wait) break main_loop;
							if (open_tag) {
								if (open_tag.self_closing || this.is_void_tag(open_tag.tag)) {
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node
									);
									this.out.attr(html_id, 'tag', open_tag.tag);
									if (open_tag.has_attrs) {
										this.out.attr(html_id, 'attributes', open_tag.attributes);
									}
									this.out.attr(html_id, 'self_closing', true);
									this.emit_close(html_id, open_tag.end);
									this.chomp(open_tag.end, true);
									this.states.pop();
								} else if (this.is_raw_text_tag(open_tag.tag)) {
									// inline goes first so raw_text returns to the enclosing block when it closes
									this.states.pop();
									this.open_raw_text(open_tag, current_node);
								} else {
									const html_id = this.emit_open_pending(
										NodeKind.html,
										this.cursor,
										current_node
									);
									this.out.attr(html_id, 'tag', open_tag.tag);
									if (open_tag.has_attrs) {
										this.out.attr(html_id, 'attributes', open_tag.attributes);
									}
									this.html_tag_stack.push({ id: html_id, tag: open_tag.tag });
									this.node_stack.push(html_id);
									this.states.push(StateKind.html_element);
									this.chomp(open_tag.end, true);
								}
								continue;
							}

							// not an autolink or html tag, treat < as text
							const t_id = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node
							);
							this.node_stack.push(t_id);
							this.out.set_value_start(t_id, this.cursor);
							this.states.push(StateKind.text);
							this.cursor++;
							continue;
						}

						case OPEN_BRACE: {
							// in incremental mode, stall if we can't see the closing brace
							let expr_end: number;
							if (!this.finished) {
								expr_end = this.probe_matching_brace(this.cursor + 1);
								if (expr_end === -1) break main_loop;
							} else if (
								this.cold.bp_start === this.cursor + 1 &&
								this.cold.bp_p === this.source_end &&
								this.cold.bp_end === -1
							) {
								// the saved probe already ran to the end without a close
								expr_end = -1;
							} else {
								expr_end = this.find_matching_brace(this.cursor + 1);
							}
							if (expr_end !== -1) {
								// svelte void tag: {@tag ...}
								if (char_code_at.call(source, this.cursor + 1 - base) === AT) {
									// find the tag name: scan word chars after @
									let tp = this.cursor + 2;
									while (
										tp < expr_end - 1 &&
										char_code_at.call(source, tp - base) !== SPACE &&
										char_code_at.call(source, tp - base) !== TAB &&
										char_code_at.call(source, tp - base) !== LINEFEED &&
										char_code_at.call(source, tp - base) !== CLOSE_BRACE
									)
										tp++;
									const tag_name = string_slice.call(
										source,
										this.cursor + 2 - base,
										tp - base
									);
									if (tag_name.length > 0) {
										const st_id = this.emit_open(
											NodeKind.svelte_tag,
											this.cursor,
											current_node
										);
										this.out.attr(st_id, 'tag', tag_name);
										// skip whitespace after tag name to find expression start
										while (
											tp < expr_end - 1 &&
											(char_code_at.call(source, tp - base) === SPACE ||
												char_code_at.call(source, tp - base) === TAB)
										)
											tp++;
										if (tp < expr_end - 1) {
											this.out.set_value_start(st_id, tp);
											this.out.set_value_end(st_id, expr_end - 1);
										}
										this.emit_close(st_id, expr_end);
										this.chomp(expr_end, true);
										continue;
									}
								}
								// plain svelte expression: {expr}
								this.emit_leaf(
									NodeKind.mustache,
									this.cursor,
									current_node,
									this.cursor + 1,
									expr_end - 1,
									expr_end
								);
								this.chomp(expr_end, true);
								continue;
							}
							// unmatched { - treat as text
							const t_id_brace = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node
							);
							this.out.set_value_start(t_id_brace, this.cursor);
							this.node_stack.push(t_id_brace);
							this.states.push(StateKind.text);
							this.cursor++;
							continue;
						}

						case COLON: {
							// inline directive: :name[content]
							// need at least :x[ where x is a letter
							if (!this.finished && this.cursor + 2 >= length) {
								break main_loop;
							}
							const after_colon = this.cursor + 1;
							const fc =
								after_colon < length
									? char_code_at.call(source, after_colon - base)
									: 0;
							// must start with a letter
							if ((fc >= 97 && fc <= 122) || (fc >= 65 && fc <= 90)) {
								// scan name
								let np = after_colon;
								while (
									np < length &&
									this.is_directive_name_char(
										char_code_at.call(source, np - base)
									)
								) {
									np++;
								}
								// stall if name extends to end of buffer
								if (np >= length && !this.finished) break main_loop;
								// must be followed by [
								if (
									np < length &&
									char_code_at.call(source, np - base) === OPEN_SQUARE_BRACKET
								) {
									const dir_name = string_slice.call(
										source,
										after_colon - base,
										np - base
									);
									const d_id = this.emit_open_pending(
										NodeKind.directive_inline,
										this.cursor,
										current_node
									);
									this.out.attr(d_id, 'name', dir_name);
									this.out.set_value_start(d_id, np + 1);
									this.node_stack.push(d_id);
									this.states.push(StateKind.link_text);
									this.directive_text_ids.push(d_id);
									this.directive_text_brackets.push(0);
									this.link_text_start = np + 1;
									this.chomp(np + 1, true); // skip :name[
									continue;
								}
							}
							// not a directive - treat as text
							const t_id_colon = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node
							);
							this.out.set_value_start(t_id_colon, this.cursor);
							this.node_stack.push(t_id_colon);
							this.states.push(StateKind.text);
							this.cursor++;
							continue;
						}

						case PIPE: {
							// transparent intraword delimiter - provides flanking
							// context for _ and * without producing output.
							// fan|_tas_|tic -> fan<em>tas</em>tic
							if (!this.in_table) {
								this.cursor++;
								continue;
							}
							// in table context, | is a cell separator - fall through
						}
						// falls through
						default: {
							if (!code) {
								this.states.pop();
								continue;
							}
							// trailing whitespace in a heading is trimmed, so it gets no text node
							if (this.in_heading && (code === SPACE || code === TAB)) {
								let p = this.cursor + 1;
								while (p < length) {
									const ch = char_code_at.call(source, p - base);
									if (ch !== SPACE && ch !== TAB) break;
									p++;
								}
								if (p >= length && !this.finished) break main_loop;
								if (
									p >= length ||
									char_code_at.call(source, p - base) === LINEFEED
								) {
									this.chomp(p, true);
									continue;
								}
							}
							const t_id = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node
							);
							this.out.set_value_start(t_id, this.cursor);
							this.node_stack.push(t_id);

							this.states.push(StateKind.text);
							// skip the plain run the text state would, leaving a break char, nul or the buffer end for it
							let p = this.cursor + 1;
							if (p < length) {
								const c1 = char_code_at.call(source, p - base);
								if (c1 !== 0 && (c1 >= 128 || TEXT_BREAK[c1] === 0)) {
									const text_break = TEXT_BREAK;
									p++;
									while (p < length) {
										const ch = char_code_at.call(source, p - base);
										if (ch < 128 && text_break[ch] !== 0) break;
										p++;
									}
								}
							}
							this.cursor = p;
							continue;
						}
					}
				}

				case StateKind.text: {
					// in table cells, | and \n unwind all inline states
					if (this.in_table && (code === PIPE || code === LINEFEED || !code)) {
						this.unwind_inline_for_table();
						continue; // let table_row_content handle it
					}
					// in headings, \n and eof close the text and pop back
					if (this.in_heading && (code === LINEFEED || !code)) {
						// trim trailing whitespace from heading text
						let value_end = this.cursor;
						while (
							value_end > 0 &&
							(char_code_at.call(source, value_end - 1 - base) === SPACE ||
								char_code_at.call(source, value_end - 1 - base) === TAB)
						) {
							value_end--;
						}
						this.states.pop();
						this.emit_close(current_node, value_end);
						this.out.set_value_end(current_node, value_end);
						this.node_stack.pop();
						continue;
					}

					// pipe in non-table context: transparent intraword delimiter.
					// close the text node and let inline consume the pipe.
					if (code === PIPE && !this.in_table) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					}

					// handle backslash escapes within text
					if (code === BACKSLASH) {
						if (!this.finished && this.cursor + 1 >= length) {
							break main_loop;
						}
						const next_code = char_code_at.call(source, this.cursor + 1 - base);
						if (next_code === LINEFEED) {
							if (
								!this.finished &&
								!this.can_decide_after_lf(this.cursor + 1)
							) {
								break main_loop;
							}
							// pfm: in a blockquote, the continuation line must
							// have `>` markers. if absent, emit the hard_break
							// but leave the cursor on the lf so the paragraph
							// state's strict-markers path cascade-closes the
							// enclosing block_quote frames.
							if (this.block_quote_depth > 0) {
								const peek = this.skip_bq_markers(
									this.cursor + 2,
									this.block_quote_depth
								);
								if (peek === -1) {
									this.emit_close(current_node, this.cursor);
									this.out.set_value_end(current_node, this.cursor);
									this.node_stack.pop();
									this.states.pop(); // pop text
									const parent_id_bq =
										this.node_stack[this.node_stack.length - 1];
									this.emit_bare_leaf(
										NodeKind.hard_break,
										this.cursor,
										parent_id_bq,
										this.cursor + 2
									);
									this.cursor++; // leave the cursor on the lf
									// pop inline (under text) so paragraph sees the lf directly.
									if (
										this.states[this.states.length - 1] === StateKind.inline
									) {
										this.states.pop();
									}
									continue;
								}
							}
							this.emit_close(current_node, this.cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.node_stack.pop();
							this.states.pop(); // pop text
							const parent_id = this.node_stack[this.node_stack.length - 1];
							this.emit_bare_leaf(
								NodeKind.hard_break,
								this.cursor,
								parent_id,
								this.cursor + 2
							);
							this.chomp(2);
							// strip block quote markers
							if (this.block_quote_depth > 0) {
								const stripped = this.skip_bq_markers(
									this.cursor,
									this.block_quote_depth
								);
								if (stripped !== -1) this.chomp(stripped, true);
							}
							// skip leading spaces
							while (
								this.cursor < length &&
								char_code_at.call(source, this.cursor - base) === SPACE
							) {
								this.cursor++;
							}
							continue;
						}
						if (this.is_ascii_punctuation(next_code)) {
							// close current text node before the backslash
							this.emit_close(current_node, this.cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.node_stack.pop();
							// start new text node at the escaped character (skip backslash)
							const parent_id = this.node_stack[this.node_stack.length - 1];
							const esc_id = this.emit_open(
								NodeKind.text,
								this.cursor + 1,
								parent_id
							);
							this.out.set_value_start(esc_id, this.cursor + 1);
							this.node_stack.push(esc_id);
							this.chomp(2);
							continue;
						}
					}

					// at linefeed: hold back if next line isn't available yet
					if (
						code === LINEFEED &&
						!this.finished &&
						!this.can_decide_after_lf(this.cursor)
					) {
						break main_loop;
					}

					if (!code && !this.finished) {
						break main_loop;
					}

					// a linefeed or eof always closes the text node, the enclosing states decide what follows
					if (!code || code === LINEFEED) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						const states = this.states;
						if (
							code === LINEFEED &&
							this.block_quote_depth === 0 &&
							this.list_depth === 0 &&
							states[states.length - 1] === StateKind.inline &&
							(this.finished || this.can_decide_after_lf(this.cursor))
						) {
							// make the inline linefeed call here, an interrupting line pops inline, anything else is a soft break
							if (this.lf_ends_inline(this.cursor)) {
								this.inline_lf_end();
								continue;
							}
							const parent_id = this.node_stack[this.node_stack.length - 1];
							this.emit_bare_leaf(
								NodeKind.soft_break,
								this.cursor,
								parent_id,
								this.cursor + 1
							);
							let p = this.cursor + 1;
							while (
								p < length &&
								char_code_at.call(source, p - base) === SPACE
							) {
								p++;
							}
							// a plain char next, open the next text run as inline would
							if (p + 1 < length) {
								const c0 = char_code_at.call(source, p - base);
								const c1 = char_code_at.call(source, p + 1 - base);
								if (
									c0 !== 0 &&
									(c0 >= 128 || TEXT_BREAK[c0] === 0) &&
									c1 !== 0 &&
									(c1 >= 128 || TEXT_BREAK[c1] === 0)
								) {
									const t_id = this.emit_open(NodeKind.text, p, parent_id);
									this.out.set_value_start(t_id, p);
									this.node_stack.push(t_id);
									states.push(StateKind.text);
									const text_break = TEXT_BREAK;
									p += 2;
									while (p < length) {
										const ch = char_code_at.call(source, p - base);
										if (ch < 128 && text_break[ch] !== 0) break;
										p++;
									}
								}
							}
							this.cursor = p;
						}
						continue;
					} else if (code === COLON) {
						// only break text for inline directive: :letter...
						if (!this.finished && this.cursor + 1 >= length) break main_loop;
						const nc = char_code_at.call(source, this.cursor + 1 - base);
						if ((nc >= 97 && nc <= 122) || (nc >= 65 && nc <= 90)) {
							this.states.pop();
							this.emit_close(current_node, this.cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.node_stack.pop();
							this.states.pop();
							continue;
						}
						// not a directive - continue scanning past the colon
						this.cursor++;
						continue;
					} else if (
						code === ASTERISK ||
						code === UNDERSCORE ||
						code === TILDE ||
						code === CARET ||
						code === OPEN_ANGLE_BRACKET ||
						code === OPEN_SQUARE_BRACKET ||
						code === CLOSE_SQUARE_BRACKET ||
						code === EXCLAMATION_MARK ||
						code === BACKTICK ||
						code === OPEN_BRACE
					) {
						this.states.pop();

						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						this.states.pop();

						continue;
					}
					// fast scan: skip plain text in a tight loop instead of
					// re-entering the main loop per character. stops at any
					// delimiter, escape, line break, or end of buffer.
					// the ascii guard keeps the table load in bounds so it never takes out of bounds feedback
					{
						const text_break = TEXT_BREAK;
						let p = this.cursor + 1;
						while (p < length) {
							const ch = char_code_at.call(source, p - base);
							if (ch < 128 && text_break[ch] !== 0) break;
							p++;
						}
						this.cursor = p;
					}
					continue;
				}

				case StateKind.code_span_start: {
					if (this.extra > 2) {
						this.states.pop();
						this.states.push(StateKind.text);
						const t_id = this.emit_open(
							NodeKind.text,
							this.cursor - this.extra,
							current_node
						);
						this.node_stack.push(t_id);
						this.out.set_value_start(t_id, this.cursor - this.extra);
						continue;
					}

					switch (code) {
						case BACKTICK: {
							this.extra += 1;
							this.cursor++;
							continue;
						}
						case OCTOTHERP: {
							// need lookahead for #! annotation
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							if (
								char_code_at.call(source, this.cursor + 1 - base) ===
								EXCLAMATION_MARK
							) {
								this.chomp(2);
								this.states.pop();
								this.states.push(StateKind.code_span_info);
								this.info_start_pos = this.cursor;
								continue;
							}
							// # without ! - treat as normal code span content
							this.states.pop();
							this.states.push(StateKind.code_span_end);
							const cs_id_h = this.emit_open(
								NodeKind.code_span,
								this.cursor - this.extra,
								current_node
							);
							this.node_stack.push(cs_id_h);
							this.out.set_value_start(cs_id_h, this.cursor);
							continue;
						}
						case SPACE: {
							// need to see at least 1 char after the space
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							this.checkpoint_cursor = this.cursor;
							this.states.pop();
							this.states.push(StateKind.code_span_content_leading_space);
							const cs_id = this.emit_open(
								NodeKind.code_span,
								this.cursor - this.extra,
								current_node
							);
							this.node_stack.push(cs_id);
							// don't set value_start yet - we don't know if stripping
							// applies until the closing backtick. the close handler
							// sets both value_start and value_end with correct boundaries.

							// a space at the end of the input leaves nothing to skip after it
							this.chomp(this.cursor + 1 >= length ? 1 : 2);

							continue;
						}
						default: {
							this.states.pop();
							this.states.push(StateKind.code_span_end);
							const cs_id = this.emit_open(
								NodeKind.code_span,
								this.cursor - this.extra,
								current_node
							);
							this.node_stack.push(cs_id);
							this.out.set_value_start(cs_id, this.cursor);

							continue;
						}
					}
				}

				case StateKind.code_span_info: {
					switch (code) {
						case SPACE: {
							// need to see the next char to decide single vs double space
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							this.info_end_pos = this.cursor;
							this.checkpoint_cursor = this.cursor + 1;
							this.states.pop();
							if (char_code_at.call(source, this.cursor + 1 - base) === SPACE) {
								this.states.push(StateKind.code_span_content_leading_space);
								this.chomp(2);
							} else {
								this.states.push(StateKind.code_span_end);
								this.cursor++;
							}

							const cs_id = this.emit_open(
								NodeKind.code_span,
								this.info_start_pos - 2 - this.extra,
								current_node
							);
							this.node_stack.push(cs_id);

							this.out.attr(cs_id, 'info_start', this.info_start_pos);
							this.out.attr(cs_id, 'info_end', this.info_end_pos);

							// set value_start only for the non-leading-space path.
							// the leading-space path defers until its close handler
							// determines whether stripping applies.
							if (char_code_at.call(source, this.cursor - 2 - base) !== SPACE) {
								this.out.set_value_start(cs_id, this.cursor);
							}

							continue;
						}
						default: {
							this.cursor++;
							continue;
						}
					}
				}

				case StateKind.code_span_content_leading_space: {
					// need lookahead for closing sequence detection
					if (
						!this.finished &&
						(code === SPACE || code === BACKTICK) &&
						this.cursor + this.extra >= length
					) {
						break main_loop;
					}
					if (
						code === SPACE &&
						char_code_at.call(source, this.cursor + 1 - base) === BACKTICK
					) {
						this.cursor++;
						this.states.pop();
						this.states.push(StateKind.code_span_leading_space_end);
						continue;
					} else if (
						code === BACKTICK &&
						char_code_at.call(source, this.cursor - 1 - base) !== BACKTICK
					) {
						if (
							(this.extra === 1 &&
								char_code_at.call(source, this.cursor + 1 - base) !==
									BACKTICK) ||
							(this.extra === 2 &&
								char_code_at.call(source, this.cursor + 1 - base) ===
									BACKTICK &&
								char_code_at.call(source, this.cursor + 2 - base) !== BACKTICK)
						) {
							this.out.set_value_start(current_node, this.checkpoint_cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.emit_close(current_node, this.cursor + this.extra);
							this.node_stack.pop();
							this.states.pop();
							this.chomp(this.extra);
							continue;
						}
						this.cursor++;
						continue;
					} else if (code === LINEFEED || code !== code) {
						// code_span_end continues the span or fails it at a blank line or eof
						this.out.set_value_start(current_node, this.checkpoint_cursor);
						this.chomp(this.cursor, true);
						this.states.pop();
						this.states.push(StateKind.code_span_end);
						continue;
					} else {
						this.cursor++;
						continue;
					}
				}

				case StateKind.code_span_leading_space_end: {
					// need lookahead for closing sequence detection
					if (
						!this.finished &&
						code === BACKTICK &&
						this.cursor + this.extra >= length
					) {
						break main_loop;
					}
					if (
						this.extra === 1 &&
						code === BACKTICK &&
						char_code_at.call(source, this.cursor + 1 - base) !== BACKTICK
					) {
						this.states.pop();
						this.out.set_value_start(current_node, this.checkpoint_cursor + 1);
						this.emit_close(current_node, this.cursor + this.extra);
						this.out.set_value_end(current_node, this.cursor - 1);
						this.node_stack.pop();
					} else if (
						this.extra === 2 &&
						code === BACKTICK &&
						char_code_at.call(source, this.cursor + 1 - base) === BACKTICK &&
						char_code_at.call(source, this.cursor + 2 - base) !== BACKTICK
					) {
						this.states.pop();
						this.out.set_value_start(current_node, this.checkpoint_cursor + 1);
						this.emit_close(current_node, this.cursor + this.extra);
						this.out.set_value_end(current_node, this.cursor - 1);
						this.node_stack.pop();
					} else {
						this.states.pop();
						this.states.push(StateKind.code_span_content_leading_space);
					}
					this.chomp(this.extra);
					continue;
				}

				case StateKind.code_span_end: {
					// in table cells, | breaks through code spans
					if (this.in_table && (code === PIPE || code === LINEFEED)) {
						this.unwind_inline_for_table();
						continue;
					}
					if (code === BACKTICK) {
						// count the full backtick run at cursor
						let run = 1;
						while (
							this.cursor + run < length &&
							char_code_at.call(source, this.cursor + run - base) === BACKTICK
						)
							run++;
						// need enough lookahead to see end of run
						if (!this.finished && this.cursor + run >= length) {
							break main_loop;
						}
						if (run === this.extra) {
							// exact match - close the code span
							this.out.set_value_end(current_node, this.cursor);
							this.states.pop();
							this.emit_close(current_node, this.cursor + this.extra);
							this.node_stack.pop();
							this.chomp(this.extra);
							continue;
						}
						// wrong count - skip the entire backtick run
						this.cursor += run;
						continue;
					}

					// hold back until the next line shows whether it is blank
					if (
						code === LINEFEED &&
						!this.finished &&
						!this.can_decide_after_lf(this.cursor)
					) {
						break main_loop;
					}
					if (
						(code === LINEFEED && this.is_blank_line_after(this.cursor)) ||
						code !== code
					) {
						// handle_repair turns the revoked code_span into text for the backticks
						const delim_end = this.code_span_open_pos + this.extra;
						this.chomp(delim_end, true);
						this.out.revoke(
							this.node_stack[this.node_stack.length - 1],
							string_slice.call(
								source,
								this.code_span_open_pos - base,
								delim_end - base
							),
							this.one_shot ? this.code_span_open_pos : undefined
						);
						this.node_stack.pop();
						this.states.pop();

						continue;
					}
					// skip chars the state ignores without paying the loop head per char
					{
						const in_table = this.in_table;
						let p = this.cursor + 1;
						while (p < length) {
							const ch = char_code_at.call(source, p - base);
							if (
								ch === BACKTICK ||
								ch === LINEFEED ||
								(in_table && ch === PIPE)
							)
								break;
							p++;
						}
						this.cursor = p;
					}
					continue;
				}

				case StateKind.table_body: {
					// at start of a potential data row line.
					if (!code) {
						if (!this.finished) break main_loop;
						this.end_table();
						continue;
					}

					if (code === LINEFEED) {
						// blank line -> end table
						this.end_table();
						continue;
					}

					// in feed mode a heading, fence or thematic break needs its whole line, a row taken early could not become one
					if (
						!this.finished &&
						(code === ASTERISK ||
							code === DASH ||
							code === UNDERSCORE ||
							code === OCTOTHERP ||
							code === BACKTICK) &&
						string_index_of.call(source, '\n', this.cursor - base) === -1
					) {
						break main_loop;
					}

					// block-level interrupts end the table
					if (code === OCTOTHERP && this.is_heading_start(this.cursor)) {
						this.end_table();
						continue;
					}
					if (
						code === BACKTICK &&
						this.cursor + 2 < length &&
						char_code_at.call(source, this.cursor + 1 - base) === BACKTICK &&
						char_code_at.call(source, this.cursor + 2 - base) === BACKTICK
					) {
						this.end_table();
						continue;
					}
					if (code === CLOSE_ANGLE_BRACKET) {
						this.end_table();
						continue;
					}
					if (
						(code === ASTERISK || code === DASH || code === UNDERSCORE) &&
						this.is_thematic_break_start(this.cursor)
					) {
						this.end_table();
						continue;
					}

					// start a new data row eagerly
					this.table_row_id = this.emit_open(
						NodeKind.table_row,
						this.cursor,
						this.table_node_id
					);
					this.table_cell_col = 0;

					// skip leading pipe
					if (code === PIPE) {
						this.cursor++;
					}

					// open first cell and push onto node_stack for inline content
					this.table_cell_id = this.emit_open(
						NodeKind.table_cell,
						this.cursor,
						this.table_row_id,
						this.table_cell_col
					);
					this.table_cell_has_content = false;
					this.node_stack.push(this.table_cell_id);
					this.states.push(StateKind.table_row_content);
					this.table_cells();
					continue;
				}

				case StateKind.table_row_content: {
					// we arrive here when inline states pop back due to | or \n

					// sentinel mode: used by parse_inline_range to stop the loop
					if (this.inline_range_parse && !code) {
						break main_loop;
					}

					if (!code) {
						if (!this.finished) break main_loop;
						// eof - close current cell + row, pad remaining cols
						if (this.table_cell_col < this.table_col_count) {
							this.close_table_cell();
							this.table_cell_col++;
						}
						this.pad_and_close_row();
						this.states.pop();
						continue;
					}

					if (code === PIPE) {
						if (this.table_cell_col < this.table_col_count) {
							this.close_table_cell();
						}
						this.table_cell_col++;
						this.cursor++;

						// open next cell eagerly - don't push inline yet,
						// let the fallthrough handle whitespace skipping first
						if (this.table_cell_col < this.table_col_count) {
							this.table_cell_id = this.emit_open(
								NodeKind.table_cell,
								this.cursor,
								this.table_row_id,
								this.table_cell_col
							);
							this.table_cell_has_content = false;
							this.node_stack.push(this.table_cell_id);
							this.table_cells();
						}
						continue;
					}

					if (code === LINEFEED) {
						if (this.table_cell_col < this.table_col_count) {
							this.close_table_cell();
							this.table_cell_col++;
						}
						this.pad_and_close_row();
						this.states.pop();
						this.cursor++;
						continue;
					}

					// skip leading whitespace before cell content
					if (
						!this.table_cell_has_content &&
						(code === SPACE || code === TAB)
					) {
						let p = this.cursor + 1;
						while (p < length) {
							const ch = char_code_at.call(source, p - base);
							if (ch !== SPACE && ch !== TAB) break;
							p++;
						}
						this.cursor = p;
						continue;
					}

					// push inline to handle cell content
					this.table_cell_has_content = true;
					if (code >= 128 || TEXT_BREAK[code] === 0) {
						this.table_cell_text(current_node);
						continue;
					}
					this.states.push(StateKind.inline);
					continue;
				}

				case StateKind.frontmatter: {
					if (this._run_frontmatter(current_node)) break main_loop;
					continue;
				}

				case StateKind.raw_text: {
					if (this._run_raw_text()) break main_loop;
					continue;
				}

				default: {
					this.cursor++;
					continue;
				}
			}
		}
	}

	// cold states live outside _run to keep it under the turbofan bytecode size limit, true stops the main loop

	/**
	 * a finished parse outside block quotes takes a whole fence in one call when fence_whole can
	 * else the code fence states run
	 */
	private start_fence(parent: number): void {
		if (
			!this.finished
				? !this.fence_open(parent)
				: this.block_quote_depth > 0 || !this.fence_whole(parent)
		) {
			if (this.finished && this.span_para(parent)) return;
			this.states.push(StateKind.code_fence_start);
			this.extra = 0;
		}
	}

	/** finished parse, one or two backticks starting a block open a paragraph and take the inline code span step */
	private span_para(parent: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const start = this.cursor;
		let p = start + 1;
		if (p < length && char_code_at.call(source, p - base) === BACKTICK) p++;
		if (p >= length || char_code_at.call(source, p - base) === BACKTICK)
			return false;
		const para_id = this.emit_open(NodeKind.paragraph, start, parent);
		this.node_stack.push(para_id);
		this.states.push(StateKind.paragraph);
		this.class_floor = -1;
		this.states.push(StateKind.inline);
		if (this.line_code_span(para_id)) return true;
		this.states.push(StateKind.code_span_start);
		this.extra = 0;
		this.code_span_open_pos = start;
		return true;
	}

	/** incremental fence opener once the info line and the char after it are visible, emits what the start and info states would */
	private fence_open(parent: number): boolean {
		if (this.block_quote_depth > 0) return false;
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const start = this.cursor;
		let p0 = start + 1;
		while (p0 < length && char_code_at.call(source, p0 - base) === BACKTICK)
			p0++;
		const fence_len = p0 - start;
		if (fence_len < 3) return false;
		const nl_rel = string_index_of.call(source, '\n', p0 - base);
		if (nl_rel === -1) return false;
		const info_end = nl_rel + base;
		if (info_end + 1 >= length) return false;
		for (let q = p0; q < info_end; q++) {
			if (char_code_at.call(source, q - base) === 0) return false;
		}
		const out = this.out;
		const cf_id = this.emit_open(NodeKind.code_fence, start, parent);
		this.node_stack.push(cf_id);
		this.extra = fence_len;
		this.info_start_pos = p0;
		this.info_end_pos = info_end;
		out.attr(cf_id, 'info_start', p0);
		out.attr(cf_id, 'info_end', info_end);
		let line = info_end + 1;
		out.set_value_start(cf_id, line);
		this.class_floor = -1;
		// the close scan of _run_code_fence_content, a close with a visible lf takes the whole fence here,
		// else the content state resumes at the line the scan stopped on
		for (;;) {
			const rel = string_index_of.call(source, '`', line - base);
			if (rel === -1) break;
			const bt = rel + base;
			if (bt > line) {
				const lf = string_last_index_of.call(source, '\n', bt - 1 - base);
				if (lf !== -1 && lf + base + 1 > line) line = lf + base + 1;
			}
			let lp = line;
			while (lp < bt) {
				const ch = char_code_at.call(source, lp - base);
				if (ch !== SPACE && ch !== TAB) break;
				lp++;
			}
			if (lp === bt) {
				while (lp < length && char_code_at.call(source, lp - base) === BACKTICK)
					lp++;
				if (lp - bt >= fence_len) {
					if (
						lp < length &&
						char_code_at.call(source, lp - base) === LINEFEED
					) {
						out.set_value_end(cf_id, line - 1);
						this.emit_close(cf_id, lp);
						this.node_stack.pop();
						this.cursor = lp + 1;
						return true;
					}
					break;
				}
			}
			const nl = string_index_of.call(source, '\n', lp - base);
			if (nl === -1) break;
			line = nl + base + 1;
		}
		this.states.push(StateKind.code_fence_content);
		this.fence_scan = line;
		this.cursor = info_end + 1;
		return true;
	}

	private fence_whole(parent: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const start = this.cursor;
		let p0 = start + 1;
		while (p0 < length && char_code_at.call(source, p0 - base) === BACKTICK)
			p0++;
		const fence_len = p0 - start;
		if (fence_len < 3) return false;
		const nl_rel = string_index_of.call(source, '\n', p0 - base);
		if (nl_rel === -1) return false;
		const info_end = nl_rel + base;
		if (info_end + 1 >= length) return false;
		for (let q = p0; q < info_end; q++) {
			if (char_code_at.call(source, q - base) === 0) return false;
		}

		const out = this.out;
		const cf_id = this.emit_open(NodeKind.code_fence, start, parent);
		this.node_stack.push(cf_id);
		this.extra = fence_len;
		this.info_start_pos = p0;
		this.info_end_pos = info_end;
		out.attr(cf_id, 'info_start', p0);
		out.attr(cf_id, 'info_end', info_end);
		let line = info_end + 1;
		out.set_value_start(cf_id, line);

		// same closing fence scan as _run_code_fence_content
		let found_index = -1;
		for (;;) {
			const rel = string_index_of.call(source, '`', line - base);
			if (rel === -1) break;
			const bt = rel + base;
			if (bt > line) {
				const lf = string_last_index_of.call(source, '\n', bt - 1 - base);
				if (lf !== -1 && lf + base + 1 > line) line = lf + base + 1;
			}
			let lp = line;
			while (lp < bt) {
				const ch = char_code_at.call(source, lp - base);
				if (ch !== SPACE && ch !== TAB) break;
				lp++;
			}
			if (lp === bt) {
				while (lp < length && char_code_at.call(source, lp - base) === BACKTICK)
					lp++;
				if (lp - bt >= fence_len) {
					found_index = bt;
					break;
				}
			}
			const nl = string_index_of.call(source, '\n', lp - base);
			if (nl === -1) break;
			line = nl + base + 1;
		}

		this.class_floor = -1;
		if (found_index === -1) {
			out.set_value_end(cf_id, length);
			this.emit_close(cf_id, length);
			this.node_stack.pop();
			this.cursor = length + 1;
			return true;
		}
		out.set_value_end(cf_id, line - 1);
		let end = found_index;
		while (end < length && char_code_at.call(source, end - base) === BACKTICK)
			end++;
		const ch = end < length ? char_code_at.call(source, end - base) : -1;
		if (ch === -1 || ch === LINEFEED) {
			this.emit_close(cf_id, end);
			this.node_stack.pop();
			this.cursor = end + 1;
			return true;
		}
		// the fence ends at the closing run, the rest of its line is skipped
		let ep = end;
		while (ep < length && char_code_at.call(source, ep - base) !== LINEFEED)
			ep++;
		this.emit_close(cf_id, end);
		this.node_stack.pop();
		this.cursor = ep;
		return true;
	}

	private _run_code_fence_start(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		if (code === BACKTICK) {
			this.extra += 1;
			this.cursor++;
			return false;
		} else if (this.extra >= 3) {
			// pfm: inside a blockquote, the fence is only valid if
			// all content lines up to the closing fence have `>`
			// markers. otherwise, the opening backticks become
			// paragraph text.
			if (this.block_quote_depth > 0) {
				// find end of info line.
				let info_end = this.cursor;
				while (
					info_end < length &&
					char_code_at.call(source, info_end - base) !== LINEFEED
				)
					info_end++;
				if (info_end >= length && !this.finished) return true;
				const scan = this.finished
					? this.bq_fence_scan(info_end + 1, this.extra, this.block_quote_depth)
					: this.bq_fence_feed(
							info_end + 1,
							this.extra,
							this.block_quote_depth
						);
				if (scan === 0) return true;
				if (scan === -1) {
					// fence cannot close inside the blockquote -
					// treat the opening backticks as literal text.
					// emit a paragraph with a text node containing
					// the backticks, then let the paragraph state
					// continue parsing the rest of the line.
					this.states.pop();
					const bq_fp_id = this.emit_open(
						NodeKind.paragraph,
						this.cursor - this.extra,
						current_node
					);
					this.node_stack.push(bq_fp_id);
					this.emit_leaf(
						NodeKind.text,
						this.cursor - this.extra,
						bq_fp_id,
						this.cursor - this.extra,
						this.cursor,
						this.cursor
					);
					this.states.push(StateKind.paragraph);
					return false;
				}
			}
			this.states.pop();
			this.states.push(StateKind.code_fence_info);
			const cf_id = this.emit_open(
				NodeKind.code_fence,
				this.cursor - this.extra,
				current_node
			);
			this.node_stack.push(cf_id);

			this.info_start_pos = this.cursor;

			return false;
		} else {
			this.states.pop();
			const para_id = this.emit_open(
				NodeKind.paragraph,
				this.cursor - this.extra,
				current_node
			);
			this.node_stack.push(para_id);
			this.states.push(StateKind.paragraph);
			this.chomp(this.cursor - this.extra, true);
			return false;
		}
	}

	private _run_code_fence_info(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		if (!code && this.finished) {
			this.states.pop();
			this.emit_close(current_node, length);
			this.out.set_value_start(current_node, length);
			this.out.set_value_end(current_node, length);
			return false;
		} else if (!code) {
			return true;
		} else if (this.cursor + 1 >= length && this.finished) {
			this.emit_close(current_node, length);
			this.out.set_value_end(current_node, length);
			this.states.pop();
			return false;
		} else if (this.cursor + 1 >= length) {
			return true;
		}
		if (code !== LINEFEED) {
			let p = this.cursor + 1;
			while (p + 1 < length) {
				const ch = char_code_at.call(source, p - base);
				if (ch === 0 || ch === LINEFEED) break;
				p++;
			}
			this.cursor = p;
			return false;
		} else if (this.cursor >= length && this.finished) {
			this.emit_close(current_node, length);
			this.out.set_value_end(current_node, length);
			this.states.pop();
			return false;
		} else if (this.cursor >= length) {
			return true;
		} else {
			this.info_end_pos = this.cursor;
			this.states.pop();
			this.states.push(StateKind.code_fence_content);
			this.out.attr(current_node, 'info_start', this.info_start_pos);
			this.out.attr(current_node, 'info_end', this.cursor);
			this.cursor++;

			this.out.set_value_start(current_node, this.cursor);
			this.fence_scan = this.cursor;

			return false;
		}
	}

	private _run_code_fence_content(current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// scan line-by-line for closing fence: a line with only
		// optional whitespace followed by >= extra backticks.
		// resume at fence_scan, a line is ruled out only once its backtick run ends inside the buffer
		// jump between backticks, only a line whose first non whitespace char is a backtick can close
		const fence_len = this.extra;
		let line = this.fence_scan;
		let found_index = -1;

		for (;;) {
			const rel = string_index_of.call(source, '`', line - base);
			if (rel === -1) {
				// no candidate left, resume at the start of the last line
				const lf = string_last_index_of.call(source, '\n', length - 1 - base);
				if (lf !== -1 && lf + base + 1 > line) line = lf + base + 1;
				break;
			}
			const bt = rel + base;
			if (bt > line) {
				const lf = string_last_index_of.call(source, '\n', bt - 1 - base);
				if (lf !== -1 && lf + base + 1 > line) line = lf + base + 1;
			}
			let lp = line;
			while (lp < bt) {
				const ch = char_code_at.call(source, lp - base);
				if (ch !== SPACE && ch !== TAB) break;
				lp++;
			}
			if (lp === bt) {
				while (lp < length && char_code_at.call(source, lp - base) === BACKTICK)
					lp++;
				if (lp - bt >= fence_len) {
					found_index = bt;
					break;
				}
			}
			const nl = string_index_of.call(source, '\n', lp - base);
			if (nl === -1) break;
			line = nl + base + 1;
		}

		if (found_index === -1) {
			if (!this.finished) {
				this.fence_scan = line;
				if (this.can_trim(this.node_stack.length - 1)) {
					this.trim_point = line;
					this.wait_kind = WAIT_FENCE;
				} else this.wait_for('`'); // kept html lines stay, chunks wait whole for a backtick
				return true;
			}
			this.out.set_value_end(current_node, length);
			this.states.pop();
			this.states.push(StateKind.code_fence_text_end);
			this.chomp(length, true);
			return false;
		}
		const found_nl = line - 1;

		// count actual backticks at found_index for chomp
		let bt_end = found_index;
		while (
			bt_end < length &&
			char_code_at.call(source, bt_end - base) === BACKTICK
		)
			bt_end++;

		this.states.pop();
		this.states.push(StateKind.code_fence_text_end);
		this.out.set_value_end(current_node, found_nl);
		this.chomp(bt_end, true);
		return false;
	}

	private _run_raw_text(): boolean {
		const base = this.source_base;
		const length = this.source_end;
		const needle = this.cold.raw_needle;
		const rel = string_index_of.call(
			this.source,
			needle,
			this.cold.raw_scan - base
		);
		const id = this.cold.raw_node;
		if (rel !== -1) {
			const idx = rel + base;
			const end = idx + needle.length;
			this.out.set_value_end(id, idx);
			this.emit_close(id, end);
			this.states.pop();
			this.chomp(end, true);
			return false;
		}
		if (!this.finished) {
			// a close tag starting earlier would already be whole in the window
			const scan = length - needle.length + 1;
			if (scan > this.cold.raw_scan) this.cold.raw_scan = scan;
			// the node is not on the node stack, nothing rereads before the scan
			if (this.can_trim(this.node_stack.length)) {
				this.trim_point = this.cold.raw_scan;
				this.wait_kind = WAIT_RAW;
			}
			return true;
		}
		this.out.set_value_end(id, length);
		this.emit_close(id, length);
		this.states.pop();
		this.chomp(length, true);
		return false;
	}

	private _run_code_fence_text_end(
		code: number,
		current_node: number
	): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		if (this.cursor >= length && !this.finished) return true;
		if (this.cursor >= length || code === LINEFEED) {
			this.emit_close(current_node, this.cursor);
			this.node_stack.pop();
			this.states.pop();
			this.cursor++;
			return false;
		}
		if (code === BACKTICK) {
			this.cursor++;
			return false;
		}
		// non-backtick trailing content - scan to end of line
		{
			let ep = this.cursor;
			while (ep < length && char_code_at.call(source, ep - base) !== LINEFEED)
				ep++;
			if (ep >= length && !this.finished) return true;
			this.emit_close(current_node, this.cursor);
			this.node_stack.pop();
			this.states.pop();
			this.chomp(ep, true);
			return false;
		}
	}

	private _run_emphasis(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		if (!code) {
			this._unwind_unterminated_delimiter();
			return false;
		}
		// need the char after `_` to do the flanking check without
		// mis-committing on the nan wildcard mask at end-of-buffer.
		if (code === UNDERSCORE && !this.finished && this.cursor + 1 >= length) {
			return true;
		}
		if (
			code === UNDERSCORE &&
			this.prev_class() & (CharMask.word | CharMask.punctuation) &&
			this.next_class() & (CharMask.whitespace | CharMask.punctuation)
		) {
			const n_id = this.node_stack[this.node_stack.length - 1];

			// no empty emphasis: if the node has no children, revoke it.
			if (!this.emphasis_has_content) {
				this.out.revoke(n_id);
				this.pending_remove(n_id);
				this.states.pop();
				this.node_stack.pop();
				if (this.states[this.states.length - 1] === StateKind.inline) {
					this.states.pop();
				}
				return false;
			}

			this.out.set_value_end(n_id, this.cursor);
			this.emit_close(n_id, this.cursor + 1);
			this.pending_remove(n_id);
			this.states.pop();
			this.node_stack.pop();
			this.cursor++;
			if (this.states[this.states.length - 1] === StateKind.inline) {
				this.states.pop();
			}
		} else if (code === LINEFEED && this._delimiter_lf_close(current_node)) {
			return false;
		} else {
			this.emphasis_has_content = true;
			this.states.push(StateKind.inline);
		}

		return false;
	}

	private _run_strikethrough(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		if (!code) {
			this._unwind_unterminated_delimiter();
			return false;
		}
		// feed mode, the char after one or two tildes decides
		if (
			code === TILDE &&
			!this.finished &&
			(this.cursor + 1 >= length ||
				(this.cursor + 2 >= length &&
					char_code_at.call(source, this.cursor + 1 - base) === TILDE))
		) {
			return true;
		}
		// close: ~~ with right-flanking
		if (
			code === TILDE &&
			char_code_at.call(source, this.cursor + 1 - base) === TILDE &&
			this.prev_class() & (CharMask.word | CharMask.punctuation) &&
			classify(char_code_at.call(source, this.cursor + 2 - base)) &
				(CharMask.whitespace | CharMask.punctuation)
		) {
			const n_id = this.node_stack[this.node_stack.length - 1];
			this.out.set_value_end(n_id, this.cursor);
			this.emit_close(n_id, this.cursor + 2);
			this.pending_remove(n_id);
			this.states.pop();
			this.node_stack.pop();
			this.chomp(2);
			if (this.states[this.states.length - 1] === StateKind.inline) {
				this.states.pop();
			}
		} else if (code === LINEFEED && this._delimiter_lf_close(current_node)) {
			return false;
		} else {
			this.states.push(StateKind.inline);
		}
		return false;
	}

	private _run_superscript(code: number, current_node: number): boolean {
		if (!code) {
			this._unwind_unterminated_delimiter();
			return false;
		}
		// close: ^ after content (no right-flanking needed -
		// ^ is unambiguous, and x^2^y must work)
		if (
			code === CARET &&
			this.prev_class() & (CharMask.word | CharMask.punctuation)
		) {
			const n_id = this.node_stack[this.node_stack.length - 1];
			this.out.set_value_end(n_id, this.cursor);
			this.emit_close(n_id, this.cursor + 1);
			this.pending_remove(n_id);
			this.states.pop();
			this.node_stack.pop();
			this.cursor++;
			if (this.states[this.states.length - 1] === StateKind.inline) {
				this.states.pop();
			}
		} else if (code === LINEFEED && this._delimiter_lf_close(current_node)) {
			return false;
		} else {
			this.states.push(StateKind.inline);
		}
		return false;
	}

	private _run_subscript(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		if (!code) {
			this._unwind_unterminated_delimiter();
			return false;
		}
		// a lone tilde at the buffer end could still become a double tilde
		if (
			code === TILDE &&
			!this.finished &&
			this.cursor + 1 >= this.source_end
		) {
			return true;
		}
		// close: single ~ after content (no right-flanking needed -
		// ~ is unambiguous inside subscript, and h~2~o must work)
		if (
			code === TILDE &&
			char_code_at.call(source, this.cursor + 1 - base) !== TILDE &&
			this.prev_class() & (CharMask.word | CharMask.punctuation)
		) {
			const n_id = this.node_stack[this.node_stack.length - 1];
			this.out.set_value_end(n_id, this.cursor);
			this.emit_close(n_id, this.cursor + 1);
			this.pending_remove(n_id);
			this.states.pop();
			this.node_stack.pop();
			this.cursor++;
			if (this.states[this.states.length - 1] === StateKind.inline) {
				this.states.pop();
			}
		} else if (code === LINEFEED && this._delimiter_lf_close(current_node)) {
			return false;
		} else {
			this.states.push(StateKind.inline);
		}
		return false;
	}

	private _run_link_text(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// inside [link text], ![image alt], or :name[content]
		// - stream content, watch for closing ]
		// in table cells inline pops at pipes and linefeeds, the text state unwinds there
		if (this.in_table && (code === PIPE || code === LINEFEED)) {
			this.unwind_inline_for_table();
			return false;
		}
		if (!code) {
			this._unwind_unterminated_delimiter();
			return false;
		}
		if (code === CLOSE_SQUARE_BRACKET) {
			// inline directive: ] closes the text, an optional
			// (key=val) argument list may follow immediately
			if (this.kind_of(current_node) === NodeKind.directive_inline) {
				// literal bracket from an unmatched [ in the text -
				// dispatch to inline which consumes it as text
				const depth_top = this.directive_text_brackets.length - 1;
				if (this.directive_text_brackets[depth_top] > 0) {
					this.states.push(StateKind.inline);
					return false;
				}

				// hold back - ( might arrive next
				const dir_after = this.cursor + 1;
				if (dir_after >= length && !this.finished) {
					return true;
				}

				let dir_close_end = dir_after;
				if (
					dir_after < length &&
					char_code_at.call(source, dir_after - base) === OPEN_PAREN
				) {
					const parsed = this.try_parse_directive_args(dir_after);
					if (parsed === false) return true;
					if (parsed !== null) {
						if (parsed.args) this.out.attr(current_node, 'args', parsed.args);
						dir_close_end = parsed.end;
					}
					// malformed args: close at ] and leave (...) as text
				}

				this.out.set_value_end(current_node, this.cursor);
				this.pending_remove(current_node);
				this.emit_close(current_node, dir_close_end);
				this.node_stack.pop();
				this.states.pop();
				this.directive_text_pop(current_node);
				if (this.states[this.states.length - 1] === StateKind.inline) {
					this.states.pop();
				}
				this.chomp(dir_close_end, true);
				return false;
			}

			// found ] - need to see what follows to decide
			const after = this.cursor + 1;

			// if ] is at end of buffer and more input may come,
			// hold back - ( might arrive next
			if (after >= length && !this.finished) {
				return true;
			}

			if (
				after < length &&
				char_code_at.call(source, after - base) === OPEN_PAREN
			) {
				// parse the (url "title") part
				let p = after + 1;
				// skip whitespace
				while (
					p < length &&
					(char_code_at.call(source, p - base) === SPACE ||
						char_code_at.call(source, p - base) === TAB)
				)
					p++;

				let url_start = p;
				let url_end = p;

				// check for angle-bracket url
				if (
					p < length &&
					char_code_at.call(source, p - base) === OPEN_ANGLE_BRACKET
				) {
					p++;
					url_start = p;
					while (
						p < length &&
						char_code_at.call(source, p - base) !== CLOSE_ANGLE_BRACKET &&
						char_code_at.call(source, p - base) !== LINEFEED
					)
						p++;
					if (
						p < length &&
						char_code_at.call(source, p - base) === CLOSE_ANGLE_BRACKET
					) {
						url_end = p;
						p++;
					}
				} else if (
					p < length &&
					char_code_at.call(source, p - base) === CLOSE_PAREN
				) {
					// empty url: [text]()
					url_start = p;
					url_end = p;
				} else {
					// regular url - balanced parens, no spaces
					url_start = p;
					let paren_depth = 0;
					while (p < length) {
						const ch = char_code_at.call(source, p - base);
						if (ch <= 0x20) break;
						if (ch === CLOSE_PAREN) {
							if (paren_depth === 0) break;
							paren_depth--;
						}
						if (ch === OPEN_PAREN) paren_depth++;
						if (ch === BACKSLASH && p + 1 < length) {
							p += 2;
							continue;
						}
						p++;
					}
					url_end = p;
				}

				// skip whitespace
				while (
					p < length &&
					(char_code_at.call(source, p - base) === SPACE ||
						char_code_at.call(source, p - base) === TAB)
				)
					p++;

				// optional title
				let title_start = -1;
				let title_end = -1;
				if (p < length) {
					const tc = char_code_at.call(source, p - base);
					if (tc === 34 || tc === 39 || tc === OPEN_PAREN) {
						const close_char = tc === OPEN_PAREN ? CLOSE_PAREN : tc;
						p++;
						title_start = p;
						while (
							p < length &&
							char_code_at.call(source, p - base) !== close_char &&
							char_code_at.call(source, p - base) !== LINEFEED
						) {
							if (
								char_code_at.call(source, p - base) === BACKSLASH &&
								p + 1 < length
							) {
								p += 2;
								continue;
							}
							p++;
						}
						if (
							p < length &&
							char_code_at.call(source, p - base) === close_char
						) {
							title_end = p;
							p++;
						}
					}
				}

				// skip trailing whitespace
				while (
					p < length &&
					(char_code_at.call(source, p - base) === SPACE ||
						char_code_at.call(source, p - base) === TAB)
				)
					p++;

				if (p < length && char_code_at.call(source, p - base) === CLOSE_PAREN) {
					p++; // skip )
					// success - set attrs and close
					const n_id = current_node;
					const url = string_slice.call(
						source,
						url_start - base,
						url_end - base
					);
					const is_image = this.kind_of(n_id) === NodeKind.image;
					this.out.attr(n_id, is_image ? 'src' : 'href', url);
					if (title_start >= 0 && title_end >= 0) {
						this.out.attr(
							n_id,
							'title',
							string_slice.call(source, title_start - base, title_end - base)
						);
					}
					this.out.set_value_end(n_id, this.cursor);
					this.pending_remove(n_id);
					this.emit_close(n_id, p);
					this.node_stack.pop();
					this.states.pop();
					if (this.states[this.states.length - 1] === StateKind.inline) {
						this.states.pop();
					}
					this.chomp(p, true);
					return false;
				}

				// url parsing didn't find ) - if we hit end of buffer
				// and more input may come, hold back
				if (!this.finished && p >= length) {
					return true;
				}
				// ( found but url is malformed - fall through to revoke
			}

			// check for reference syntax: ][ref] or ][]
			if (
				after < length &&
				char_code_at.call(source, after - base) === OPEN_SQUARE_BRACKET
			) {
				let ref_p = after + 1;

				// need to see at least one char after [
				if (ref_p >= length && !this.finished) {
					return true;
				}

				// ][] - collapsed reference: label = link text
				if (
					ref_p < length &&
					char_code_at.call(source, ref_p - base) === CLOSE_SQUARE_BRACKET
				) {
					const label = string_slice.call(
						source,
						this.link_text_start - base,
						this.cursor - base
					);
					const refs = this.ref_map;
					const def =
						refs.size === 0 ? undefined : refs.get(normalize_label(label));
					if (def) {
						const is_image = this.kind_of(current_node) === NodeKind.image;
						this.out.attr(current_node, is_image ? 'src' : 'href', def.url);
						if (def.title) this.out.attr(current_node, 'title', def.title);
						this.out.set_value_end(current_node, this.cursor);
						this.pending_remove(current_node);
						this.emit_close(current_node, ref_p + 1);
						this.node_stack.pop();
						this.states.pop();
						if (this.states[this.states.length - 1] === StateKind.inline) {
							this.states.pop();
						}
						this.chomp(ref_p + 1, true);
						return false;
					}
					// no definition found - revoke
					this.out.revoke(current_node);
					this.node_stack.pop();
					this.states.pop();
					return false;
				}

				// ][label] - full reference
				const ref_start = ref_p;
				while (ref_p < length) {
					const ch = char_code_at.call(source, ref_p - base);
					if (ch === CLOSE_SQUARE_BRACKET) break;
					if (ch === OPEN_SQUARE_BRACKET || ch === LINEFEED) break;
					if (ch === BACKSLASH && ref_p + 1 < length) {
						ref_p += 2;
						continue;
					}
					ref_p++;
				}

				// stall if we ran out of input
				if (ref_p >= length && !this.finished) {
					return true;
				}

				if (
					ref_p < length &&
					char_code_at.call(source, ref_p - base) === CLOSE_SQUARE_BRACKET &&
					ref_p > ref_start
				) {
					const label = string_slice.call(
						source,
						ref_start - base,
						ref_p - base
					);
					const refs = this.ref_map;
					const def =
						refs.size === 0 ? undefined : refs.get(normalize_label(label));
					if (def) {
						const is_image = this.kind_of(current_node) === NodeKind.image;
						this.out.attr(current_node, is_image ? 'src' : 'href', def.url);
						if (def.title) this.out.attr(current_node, 'title', def.title);
						this.out.set_value_end(current_node, this.cursor);
						this.pending_remove(current_node);
						this.emit_close(current_node, ref_p + 1);
						this.node_stack.pop();
						this.states.pop();
						if (this.states[this.states.length - 1] === StateKind.inline) {
							this.states.pop();
						}
						this.chomp(ref_p + 1, true);
						return false;
					}
				}
			}

			// definitively not a link/reference. revoke.
			this.out.revoke(current_node);
			this.node_stack.pop();
			this.states.pop();
			return false;
		}

		if (
			code === LINEFEED &&
			!this.finished &&
			!this.can_decide_after_lf(this.cursor)
		) {
			return true;
		}
		if (code === LINEFEED && this.link_text_lf_ends(current_node)) {
			this.out.revoke(current_node);
			this.directive_text_pop(current_node);
			this.node_stack.pop();
			this.states.pop();
			return false;
		}

		// dispatch inline content inside the link text
		this.states.push(StateKind.inline);
		return false;
	}

	/**
	 * true when the paragraph ends at this linefeed, in a block quote a continuation line
	 * is taken instead, a heading ends at every linefeed
	 */
	private link_text_lf_ends(current_node: number): boolean {
		if (this.in_heading) return true;
		if (this.block_quote_depth > 0) {
			const stripped = this.skip_bq_markers(
				this.cursor + 1,
				this.block_quote_depth
			);
			if (
				stripped === -1 ||
				this.is_blank_at_pos(stripped) ||
				this.is_heading_start(stripped) ||
				this.is_thematic_break_start(stripped) ||
				this.is_fence_start(stripped) ||
				(this.list_depth > 0 && this.bq_list_marker(stripped))
			) {
				return true;
			}
			this.emit_bare_leaf(
				NodeKind.soft_break,
				this.cursor,
				current_node,
				this.cursor + 1
			);
			this.chomp(stripped, true);
			this.states.push(StateKind.inline);
			return false;
		}
		return (
			this.is_blank_line_after(this.cursor) || this.lf_ends_inline(this.cursor)
		);
	}

	private is_fence_start(pos: number): boolean {
		const source = this.source;
		const base = this.source_base;
		return (
			pos + 2 < this.source_end &&
			char_code_at.call(source, pos - base) === BACKTICK &&
			char_code_at.call(source, pos + 1 - base) === BACKTICK &&
			char_code_at.call(source, pos + 2 - base) === BACKTICK
		);
	}

	/** a list marker on a marked continuation line inside a list in a quote */
	private bq_list_marker(stripped: number): boolean {
		const { columns: ind } = this.count_indent(stripped);
		const marker_pos =
			ind >= this.list_content_offset
				? this.skip_columns(stripped, this.list_content_offset)
				: stripped;
		return (
			marker_pos < this.source_end &&
			this.try_parse_list_marker(marker_pos) !== null
		);
	}

	private _run_html_element(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		// inline html container state.
		// check if current char starts a matching closing tag.
		if (code === OPEN_ANGLE_BRACKET) {
			// stall if tag might be incomplete
			if (
				!this.finished &&
				string_index_of.call(source, '>', this.cursor + 1 - base) === -1
			) {
				return true;
			}
			const close = this.try_parse_html_close_tag(this.cursor + 1);
			if (close) {
				const opener_idx = this.find_html_opener(close.tag);
				if (
					opener_idx !== -1 &&
					this.html_tag_stack[opener_idx].id === current_node
				) {
					// close intermediate unclosed html elements
					while (this.html_tag_stack.length > opener_idx + 1) {
						const intermediate = this.html_tag_stack.pop()!;
						this.close_html_inline(intermediate.id, this.cursor);
					}
					// close this html element - commit the pending node
					this.html_tag_stack.pop();
					this.pending_remove(current_node);
					this.emit_close(current_node, close.end);
					this.node_stack.pop();
					this.states.pop();
					this.chomp(close.end, true);
					// pop trailing inline state if present
					if (this.states[this.states.length - 1] === StateKind.inline) {
						this.states.pop();
					}
					return false;
				}
			}
		}

		// in table cells inline pops at pipes and linefeeds, the text state unwinds there
		if (this.in_table && (code === PIPE || code === LINEFEED)) {
			this.unwind_inline_for_table();
			return false;
		}

		if (
			code === LINEFEED &&
			!this.finished &&
			!this.can_decide_after_lf(this.cursor)
		) {
			return true;
		}
		if (
			code === LINEFEED &&
			// pop wherever inline pops at a linefeed or the two ping pong, in a block quote
			// a marked line interrupts and an unmarked one ends the quote
			(this.block_quote_depth > 0 ||
				this.in_heading ||
				this.lf_ends_inline(this.cursor))
		) {
			// block interrupt after newline - close unclosed inline html element
			if (
				this.html_tag_stack.length > 0 &&
				this.html_tag_stack[this.html_tag_stack.length - 1].id === current_node
			) {
				this.html_tag_stack.pop();
			}
			this.states.pop();
			this.node_stack.pop();
			return false;
		}

		if (!code) {
			if (!this.finished) return true;
			// eof: unwind stacks - _finalize will revoke the pending node
			if (
				this.html_tag_stack.length > 0 &&
				this.html_tag_stack[this.html_tag_stack.length - 1].id === current_node
			) {
				this.html_tag_stack.pop();
			}
			this.states.pop();
			this.node_stack.pop();
			return false;
		}

		// dispatch to inline for content inside the element
		this.states.push(StateKind.inline);
		return false;
	}

	private _run_html_block_element(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// block-level html container state.
		// acts like root but also checks for closing tags.

		if (!code) {
			if (!this.finished) return true;
			// eof: unwind stacks - _finalize will revoke the pending node
			if (
				this.html_tag_stack.length > 0 &&
				this.html_tag_stack[this.html_tag_stack.length - 1].id === current_node
			) {
				this.html_tag_stack.pop();
			}
			this.html_block_depth--;
			this.states.pop();
			this.node_stack.pop();
			return false;
		}

		// check for closing tag
		if (code === OPEN_ANGLE_BRACKET) {
			// stall if tag might be incomplete
			if (
				!this.finished &&
				string_index_of.call(source, '>', this.cursor + 1 - base) === -1
			) {
				this.wait_for('>');
				return true;
			}
			const close = this.try_parse_html_close_tag(this.cursor + 1);
			if (close) {
				const opener_idx = this.find_html_opener(close.tag);
				if (
					opener_idx !== -1 &&
					this.html_tag_stack[opener_idx].id === current_node
				) {
					// close intermediate html elements
					while (this.html_tag_stack.length > opener_idx + 1) {
						const intermediate = this.html_tag_stack.pop()!;
						if (!this.is_closed(intermediate.id)) {
							this.emit_close(intermediate.id, this.cursor);
						}
					}
					// close this html element - commit the pending node
					this.html_tag_stack.pop();
					this.pending_remove(current_node);
					this.emit_close(current_node, close.end);
					this.html_block_depth--;
					this.node_stack.pop();
					this.states.pop();
					this.chomp(close.end, true);
					return false;
				}
			}
		}

		// skip linefeeds - they act as separators
		if (code === LINEFEED) {
			this.emit_bare_leaf(
				NodeKind.line_break,
				this.cursor,
				current_node,
				this.cursor + 1
			);
			this.cursor++;
			return false;
		}

		// skip leading whitespace
		if (code === SPACE || code === TAB) {
			let pos = this.cursor;
			while (
				pos < length &&
				(char_code_at.call(source, pos - base) === SPACE ||
					char_code_at.call(source, pos - base) === TAB)
			) {
				pos++;
			}
			// a chunk end inside the run may still be followed by a linefeed
			if (pos >= length && !this.finished) return true;
			if (pos < length && char_code_at.call(source, pos - base) === LINEFEED) {
				this.emit_bare_leaf(
					NodeKind.line_break,
					this.cursor,
					current_node,
					pos + 1
				);
				this.chomp(pos + 1, true);
				return false;
			}
			// the rest of the run would come back here one char at a time
			this.cursor = pos;
			return false;
		}

		// dispatch block-level content inside the html element
		// (headings, code fences, paragraphs, nested html, etc.)
		if (code === OCTOTHERP) {
			if (!this.start_heading(current_node)) return true;
			return false;
		}

		if (code === BACKTICK) {
			this.start_fence(current_node);
			return false;
		}

		if (code === OPEN_ANGLE_BRACKET) {
			// nested html at block level
			const blk_comment = this.try_parse_html_comment(this.cursor + 1);
			if (blk_comment === false) {
				if (this.cursor + 3 < this.source_end) this.wait_for('-->');
				return true;
			}
			if (blk_comment) {
				const c_id = this.emit_open(
					NodeKind.html_comment,
					this.cursor,
					current_node
				);
				this.out.text(
					c_id,
					blk_comment.content_start,
					blk_comment.content_end,
					NodeKind.html_comment
				);
				this.emit_close(c_id, blk_comment.end);
				this.chomp(blk_comment.end, true);
				return false;
			}

			const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
			if (blk_tag === null && this.tag_wait) return true;
			if (blk_tag) {
				// an element that closes on its line is inline in a paragraph, close_end is past its close
				const close_end =
					blk_tag.self_closing || this.is_void_tag(blk_tag.tag)
						? blk_tag.end
						: this.is_raw_text_tag(blk_tag.tag)
							? 0
							: this.closes_on_line(blk_tag.tag, blk_tag.end);
				if (close_end === -1) {
					this.wait_for('\n');
					return true;
				}
				if (close_end > 0) {
					this.open_spec_tag(
						blk_tag,
						close_end,
						current_node,
						this.in_phrasing(current_node)
					);
				} else if (this.is_raw_text_tag(blk_tag.tag)) {
					this.open_raw_text(blk_tag, current_node);
				} else {
					const html_id = this.emit_open_pending(
						NodeKind.html,
						this.cursor,
						current_node
					);
					this.out.attr(html_id, 'tag', blk_tag.tag);
					if (blk_tag.has_attrs) {
						this.out.attr(html_id, 'attributes', blk_tag.attributes);
					}
					this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
					this.node_stack.push(html_id);
					this.states.push(StateKind.html_block_element);
					this.html_block_depth++;
					this.chomp(blk_tag.end, true);
				}
				return false;
			}
		}

		if (code === OPEN_BRACE) {
			// svelte block opener nested inside an html block element
			if (!this.finished) {
				const probe = this.probe_matching_brace(this.cursor + 1);
				if (probe === -1) return true;
			}
			const token = this.try_parse_svelte_block_token(this.cursor);
			if (token && token.kind === '#') {
				this.start_svelte_block(token, current_node);
				return false;
			}
		}

		if (code === ASTERISK || code === DASH || code === UNDERSCORE) {
			if (this.could_be_thematic_break(this.cursor, code)) return true;
			if (this.is_thematic_break_start(this.cursor)) {
				let line_end = this.cursor;
				while (
					line_end < length &&
					char_code_at.call(source, line_end - base) !== LINEFEED
				)
					line_end++;
				this.emit_bare_leaf(
					NodeKind.thematic_break,
					this.cursor,
					current_node,
					line_end
				);
				this.chomp(line_end, true);
				return false;
			}
			if (code !== UNDERSCORE) {
				const marker = this.try_parse_list_marker(this.cursor);
				if (marker) {
					this.start_list(marker, current_node);
					return false;
				}
			}
		}

		if (code === PLUS || (code >= 48 && code <= 57)) {
			if (!this.finished && this.plus_marker_pending(this.cursor)) return true;
			const marker = this.try_parse_list_marker(this.cursor);
			if (marker) {
				this.start_list(marker, current_node);
				return false;
			}
		}

		if (code === PIPE) {
			const result = this.try_start_table(current_node);
			if (result === false) return true;
			if (result === true) return false;
		}

		// default: start a paragraph for text content
		const phrasing = this.in_phrasing(current_node);
		if (phrasing || this.at_svelte_tag(code)) {
			this.open_spec_para(current_node, phrasing);
			return false;
		}
		this.states.push(StateKind.paragraph);
		const blk_html_para = this.emit_open(
			NodeKind.paragraph,
			this.cursor,
			current_node
		);
		this.node_stack.push(blk_html_para);
		return false;
	}

	private _run_svelte_branch(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// container state for svelte block branches.
		// dispatches block content like root, but also handles
		// {:tag} (new branch) and {/tag} (close block).

		if (!code) {
			if (!this.finished) return true;
			// eof: close branch + block
			this.emit_close(this.svelte_branch_id, this.cursor);
			this.node_stack.pop(); // branch
			this.emit_close(this.svelte_block_id, this.cursor);
			this.node_stack.pop(); // block
			this.states.pop();
			this.leave_svelte_block();
			return false;
		}

		if (code === OPEN_BRACE) {
			// stall if closing brace not visible
			if (!this.finished) {
				const probe = this.probe_matching_brace(this.cursor + 1);
				if (probe === -1) return true;
			}
			const token = this.try_parse_svelte_block_token(this.cursor);
			if (token) {
				if (token.kind === ':') {
					// close current branch, open new one
					this.emit_close(this.svelte_branch_id, this.cursor);
					this.node_stack.pop(); // pop old branch

					const branch_id = this.emit_open(
						NodeKind.svelte_branch,
						this.cursor,
						this.svelte_block_id
					);
					this.out.attr(branch_id, 'tag', token.tag);
					if (token.expr_start !== 0 || token.expr_end !== 0) {
						this.out.set_value_start(branch_id, token.expr_start);
						this.out.set_value_end(branch_id, token.expr_end);
					}
					this.svelte_branch_id = branch_id;
					this.node_stack.push(branch_id);
					this.chomp(token.end, true);
					return false;
				}
				if (token.kind === '/') {
					// close branch + block
					this.emit_close(this.svelte_branch_id, this.cursor);
					this.node_stack.pop(); // branch
					this.emit_close(this.svelte_block_id, token.end);
					this.node_stack.pop(); // block
					this.states.pop();
					this.leave_svelte_block();
					this.chomp(token.end, true);
					return false;
				}
				if (token.kind === '#') {
					// nested svelte block - open it within this branch
					this.start_svelte_block(token, current_node);
					return false;
				}
			}
		}

		// skip linefeeds
		if (code === LINEFEED) {
			this.emit_bare_leaf(
				NodeKind.line_break,
				this.cursor,
				current_node,
				this.cursor + 1
			);
			this.cursor++;
			return false;
		}

		// skip leading whitespace
		if (code === SPACE || code === TAB) {
			let pos = this.cursor;
			while (
				pos < length &&
				(char_code_at.call(source, pos - base) === SPACE ||
					char_code_at.call(source, pos - base) === TAB)
			) {
				pos++;
			}
			// a chunk end inside the run may still be followed by a linefeed
			if (pos >= length && !this.finished) return true;
			if (pos < length && char_code_at.call(source, pos - base) === LINEFEED) {
				this.emit_bare_leaf(
					NodeKind.line_break,
					this.cursor,
					current_node,
					pos + 1
				);
				this.chomp(pos + 1, true);
				return false;
			}
			// the rest of the run would come back here one char at a time
			this.cursor = pos;
			return false;
		}

		// dispatch block-level content
		if (code === OCTOTHERP) {
			if (!this.start_heading(current_node)) return true;
			return false;
		}

		if (code === BACKTICK) {
			this.start_fence(current_node);
			return false;
		}

		if (code === CLOSE_ANGLE_BRACKET) {
			let p = this.cursor + 1;
			if (p < length && char_code_at.call(source, p - base) === SPACE) p++;
			this.block_quote_depth++;
			const bq_id = this.emit_open(
				NodeKind.block_quote,
				this.cursor,
				current_node
			);
			this.node_stack.push(bq_id);
			this.states.push(StateKind.block_quote);
			this.chomp(p, true);
			return false;
		}

		if (code === OPEN_ANGLE_BRACKET) {
			if (
				!this.finished &&
				string_index_of.call(source, '>', this.cursor + 1 - base) === -1
			) {
				this.wait_for('>');
				return true;
			}
			const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
			if (blk_tag === null && this.tag_wait) return true;
			if (blk_tag) {
				// an element that closes on its line is inline in a paragraph, close_end is past its close
				const close_end =
					blk_tag.self_closing || this.is_void_tag(blk_tag.tag)
						? blk_tag.end
						: this.is_raw_text_tag(blk_tag.tag)
							? 0
							: this.closes_on_line(blk_tag.tag, blk_tag.end);
				if (close_end === -1) {
					this.wait_for('\n');
					return true;
				}
				if (close_end > 0) {
					this.open_spec_tag(
						blk_tag,
						close_end,
						current_node,
						this.in_phrasing(current_node)
					);
				} else if (this.is_raw_text_tag(blk_tag.tag)) {
					this.open_raw_text(blk_tag, current_node);
				} else {
					const html_id = this.emit_open_pending(
						NodeKind.html,
						this.cursor,
						current_node
					);
					this.out.attr(html_id, 'tag', blk_tag.tag);
					if (blk_tag.has_attrs) {
						this.out.attr(html_id, 'attributes', blk_tag.attributes);
					}
					this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
					this.node_stack.push(html_id);
					this.states.push(StateKind.html_block_element);
					this.html_block_depth++;
					this.chomp(blk_tag.end, true);
				}
				return false;
			}
		}

		if (code === ASTERISK || code === DASH || code === UNDERSCORE) {
			if (this.could_be_thematic_break(this.cursor, code)) return true;
			if (this.is_thematic_break_start(this.cursor)) {
				let line_end = this.cursor;
				while (
					line_end < length &&
					char_code_at.call(source, line_end - base) !== LINEFEED
				)
					line_end++;
				this.emit_bare_leaf(
					NodeKind.thematic_break,
					this.cursor,
					current_node,
					line_end
				);
				this.chomp(line_end, true);
				return false;
			}
			if (code !== UNDERSCORE) {
				const marker = this.try_parse_list_marker(this.cursor);
				if (marker) {
					this.start_list(marker, current_node);
					return false;
				}
			}
		}

		if (code === PLUS || (code >= 48 && code <= 57)) {
			if (!this.finished && this.plus_marker_pending(this.cursor)) return true;
			const marker = this.try_parse_list_marker(this.cursor);
			if (marker) {
				this.start_list(marker, current_node);
				return false;
			}
		}

		if (code === OPEN_SQUARE_BRACKET) {
			const def_end = this.try_parse_link_ref_definition(this.cursor);
			if (def_end === -2) return true;
			if (def_end >= 0) {
				this.chomp(def_end, true);
				return false;
			}
		}

		if (code === COLON) {
			const dir = this.try_parse_block_directive(this.cursor);
			if (dir === false) return true;
			if (dir !== null) {
				this.start_block_directive(dir, current_node);
				return false;
			}
		}

		if (code === PIPE) {
			const result = this.try_start_table(current_node);
			if (result === false) return true;
			if (result === true) return false;
		}

		// default: start a paragraph
		if (this.at_svelte_tag(code)) {
			this.open_spec_para(current_node, false);
			return false;
		}
		this.states.push(StateKind.paragraph);
		const svelte_para = this.emit_open(
			NodeKind.paragraph,
			this.cursor,
			current_node
		);
		this.node_stack.push(svelte_para);
		return false;
	}

	private _run_block_quote(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// only feed reads trim_point, a finished parse never trims
		if (!this.finished && this.can_trim(this.node_stack.length)) {
			this.trim_point = this.cursor;
		}
		if (!code) {
			if (!this.finished) return true;
			this.emit_close(current_node, this.cursor);
			this.states.pop();
			this.node_stack.pop();
			this.block_quote_depth--;
			return false;
		}

		switch (code) {
			case LINEFEED: {
				if (!this.finished && !this.can_decide_after_lf(this.cursor)) {
					return true;
				}
				const next_pos = this.cursor + 1;
				const stripped = this.skip_bq_markers(next_pos, 1);

				if (stripped !== -1) {
					if (this.is_blank_at_pos(stripped)) {
						this.emit_bare_leaf(
							NodeKind.line_break,
							this.cursor,
							current_node,
							stripped
						);
						this.chomp(stripped, true);
						return false;
					}
					this.chomp(stripped, true);
					return false;
				}

				this.emit_close(current_node, this.cursor);
				this.states.pop();
				this.node_stack.pop();
				this.block_quote_depth--;
				return false;
			}

			case SPACE:
			case TAB: {
				this.cursor++;
				return false;
			}

			case OCTOTHERP: {
				if (!this.start_heading(current_node)) return true;
				return false;
			}

			case BACKTICK: {
				this.start_fence(current_node);
				return false;
			}

			case ASTERISK:
			case DASH:
			case UNDERSCORE: {
				// need a complete line to distinguish thematic break
				// from list marker from paragraph.
				if (
					!this.finished &&
					string_index_of.call(source, '\n', this.cursor - base) === -1
				) {
					return true;
				}
				if (this.is_thematic_break_start(this.cursor)) {
					let line_end = this.cursor;
					while (
						line_end < length &&
						char_code_at.call(source, line_end - base) !== LINEFEED
					) {
						line_end++;
					}
					const break_end = line_end < length ? line_end : line_end;

					this.emit_bare_leaf(
						NodeKind.thematic_break,
						this.cursor,
						current_node,
						break_end
					);

					this.chomp(break_end, true);
					return false;
				}
				if (code !== UNDERSCORE) {
					const marker = this.try_parse_list_marker(this.cursor);
					if (marker) {
						this.start_list(marker, current_node);
						return false;
					}
				}
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(para_id);
				return false;
			}

			case CLOSE_ANGLE_BRACKET: {
				let p = this.cursor + 1;
				if (p < length && char_code_at.call(source, p - base) === SPACE) p++;

				this.block_quote_depth++;
				const bq_id = this.emit_open(
					NodeKind.block_quote,
					this.cursor,
					current_node
				);
				this.node_stack.push(bq_id);
				this.states.push(StateKind.block_quote);
				this.chomp(p, true);
				return false;
			}

			case PIPE: {
				const result = this.try_start_table(current_node);
				if (result === false) return true;
				if (result === true) return false;
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(para_id);
				return false;
			}

			case OPEN_SQUARE_BRACKET: {
				const def_end = this.try_parse_link_ref_definition(this.cursor);
				if (def_end === -2) return true;
				if (def_end >= 0) {
					this.chomp(def_end, true);
					return false;
				}
				this.states.push(StateKind.paragraph);
				const bq_ref_para = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(bq_ref_para);
				return false;
			}

			case COLON: {
				// try_parse_block_directive stalls internally while the
				// prefix is still consistent with a directive opener, so
				// non-directive lines dispatch to paragraph eagerly
				const dir = this.try_parse_block_directive(this.cursor);
				if (dir === false) return true;
				if (dir !== null) {
					this.start_block_directive(dir, current_node);
					return false;
				}
				this.states.push(StateKind.paragraph);
				const bq_colon_para = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(bq_colon_para);
				return false;
			}

			default: {
				if (code === PLUS || (code >= 48 && code <= 57)) {
					// stall only while the marker prefix is still being
					// read - same logic as the top-level block dispatch.
					if (!this.finished && this.plus_marker_pending(this.cursor))
						return true;
					const marker = this.try_parse_list_marker(this.cursor);
					if (marker) {
						this.start_list(marker, current_node);
						return false;
					}
				}
				if (code === OPEN_ANGLE_BRACKET || this.at_svelte_tag(code)) {
					this.open_spec_para(current_node, false);
					return false;
				}
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(para_id);
				if (code >= 128 || (code !== 0 && TEXT_BREAK[code] === 0))
					this.para_text(para_id);
				return false;
			}
		}
	}

	private _run_list_item(code: number, current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// only feed reads trim_point, a finished parse never trims
		if (!this.finished && this.can_trim(this.node_stack.length)) {
			this.trim_point = this.cursor;
		}
		if (!code) {
			if (!this.finished) return true;
			this.end_list();
			return false;
		}

		switch (code) {
			case LINEFEED: {
				const raw_next_pos = this.cursor + 1;

				// need to see the complete next line to make
				// continuation / interruption decisions
				if (!this.finished && !this.can_decide_after_lf(this.cursor)) {
					return true;
				}

				// pfm: inside a blockquote, the "next line" we care
				// about for list continuation is the content after
				// the `>` markers. if markers are absent, end the
				// list and let enclosing block_quote frames cascade-
				// close themselves (cursor stays on the lf).
				let next_pos = raw_next_pos;
				if (this.block_quote_depth > 0) {
					const stripped_bq = this.skip_bq_markers(
						raw_next_pos,
						this.block_quote_depth
					);
					if (stripped_bq === -1) {
						this.end_list();
						return false;
					}
					next_pos = stripped_bq;
				}

				const cur_is_blank =
					this.cursor === 0 ||
					char_code_at.call(source, this.cursor - 1 - base) === LINEFEED;
				if (
					next_pos >= length ||
					cur_is_blank ||
					this.is_blank_at_pos(next_pos)
				) {
					let p = next_pos;
					while (p < length) {
						if (!this.is_blank_at_pos(p)) break;
						while (
							p < length &&
							char_code_at.call(source, p - base) !== LINEFEED
						)
							p++;
						if (p < length) p++;
						// when inside a blockquote, skip the `>` markers on
						// the next line before re-testing for blank.
						if (this.block_quote_depth > 0 && p < length) {
							// in streaming mode, stall if the line isn't
							// fully available - skip_bq_markers needs to
							// see all markers to decide definitively.
							// nothing read here changes before that lf, chunks wait whole for it
							if (
								!this.finished &&
								string_index_of.call(source, '\n', p - base) === -1
							) {
								this.wait_for('\n');
								return true;
							}
							const sp = this.skip_bq_markers(p, this.block_quote_depth);
							if (sp === -1) {
								// unmarked line inside blockquote - terminate.
								this.end_list();
								return false;
							}
							p = sp;
						}
					}

					// stall if we can't see past blank lines yet, or if
					// we don't have enough of the first non-blank line
					// to decide whether it's a sibling list marker or
					// an outer-scope interrupt. we only need as much
					// lookahead as try_parse_list_marker requires.
					if (!this.finished) {
						if (p >= length) return true;
						let lp = p;
						// skip optional indent for the marker
						while (
							lp < length &&
							(char_code_at.call(source, lp - base) === SPACE ||
								char_code_at.call(source, lp - base) === TAB)
						)
							lp++;
						if (lp >= length) return true;
						const mch = char_code_at.call(source, lp - base);
						if (mch === DASH || mch === ASTERISK || mch === PLUS) {
							// for - and *, we also need to rule out a
							// thematic break on this line - scan until
							// we see a non-marker/ws char or lf.
							if (mch !== PLUS) {
								let q = lp + 1;
								let decided = false;
								while (q < length) {
									const qc = char_code_at.call(source, q - base);
									if (qc === LINEFEED) {
										decided = true;
										break;
									}
									if (qc !== mch && qc !== SPACE && qc !== TAB) {
										decided = true;
										break;
									}
									q++;
								}
								if (!decided) return true;
							} else if (this.plus_marker_pending(lp)) {
								return true;
							}
						} else if (mch >= 48 && mch <= 57) {
							if (this.plus_marker_pending(lp)) return true;
						}
						// otherwise the next line isn't a list marker -
						// fall through (will hit end_list / continuation
						// logic below which is decisive without the lf).
					}

					if (p < length) {
						const marker_after = this.try_parse_list_marker(p);
						if (marker_after) {
							if (marker_after.indent >= this.list_content_offset) {
								this.list_is_loose = true;
								this.chomp(p, true);
								this.start_list(marker_after, current_node);
								return false;
							}
							if (
								marker_after.indent >= this.list_marker_indent &&
								marker_after.ordered === this.list_ordered &&
								marker_after.marker_char === this.list_marker
							) {
								this.list_is_loose = true;
								this.emit_close(current_node, this.cursor);
								this.node_stack.pop();
								const new_item_id = this.emit_open(
									NodeKind.list_item,
									p,
									this.list_node_id
								);
								this.node_stack.push(new_item_id);
								this.list_content_offset = marker_after.content_offset;
								this.chomp(marker_after.content_start, true);
								return false;
							}
							this.end_list();
							return false;
						}

						const { columns: indent_count, end: ip } = this.count_indent(p);
						if (
							indent_count >= this.list_content_offset &&
							ip < length &&
							char_code_at.call(source, ip - base) !== LINEFEED
						) {
							this.list_is_loose = true;
							this.chomp(this.skip_columns(p, this.list_content_offset), true);
							return false;
						}
					}

					this.end_list();
					return false;
				}

				// thematic break before list marker, the paragraph interrupt check may already have answered both
				let marker: MarkerResult | null;
				if (this.interrupt_marker_pos === next_pos) {
					marker = this.interrupt_marker;
				} else {
					if (this.is_thematic_break_start(next_pos)) {
						this.end_list();
						return false;
					}
					// check for list marker on next line
					marker = this.try_parse_list_marker(next_pos);
				}
				if (marker) {
					if (marker.indent >= this.list_content_offset) {
						this.chomp(next_pos, true);
						this.start_list(marker, current_node);
						return false;
					}
					if (
						marker.indent >= this.list_marker_indent &&
						marker.ordered === this.list_ordered &&
						marker.marker_char === this.list_marker
					) {
						this.emit_close(current_node, this.cursor);
						this.node_stack.pop();
						const new_item_id = this.emit_open(
							NodeKind.list_item,
							next_pos,
							this.list_node_id
						);
						this.node_stack.push(new_item_id);
						this.list_content_offset = marker.content_offset;
						this.chomp(marker.content_start, true);
						this.item_para(new_item_id);
						return false;
					}
					this.end_list();
					return false;
				}

				// check for block-level content: if indented enough, it's
				// inside the list item; otherwise it interrupts the list.
				{
					const { columns: indent_count, end: ip } =
						this.count_indent(next_pos);
					if (
						indent_count >= this.list_content_offset &&
						ip < length &&
						char_code_at.call(source, ip - base) !== LINEFEED
					) {
						// content indented to list item's content column -
						// strip indent and continue as list item content
						this.chomp(
							this.skip_columns(next_pos, this.list_content_offset),
							true
						);
						return false;
					}
				}

				// block-level interrupts at outer indent level end the list
				if (
					this.is_heading_start(next_pos) ||
					this.is_thematic_break_start(next_pos) ||
					this.is_block_quote_start(next_pos)
				) {
					this.end_list();
					return false;
				}

				this.end_list();
				return false;
			}

			case SPACE:
			case TAB: {
				this.cursor++;
				return false;
			}

			case OCTOTHERP: {
				if (!this.start_heading(current_node)) return true;
				return false;
			}

			case BACKTICK: {
				this.start_fence(current_node);
				return false;
			}

			case ASTERISK:
			case DASH:
			case UNDERSCORE: {
				// distinguish thematic break / nested list / paragraph.
				// stall only while the line could still be a thematic
				// break (marker + ws chars). as soon as any other char
				// appears we can commit to a nested list / paragraph.
				if (this.could_be_thematic_break(this.cursor, code)) return true;
				if (this.is_thematic_break_start(this.cursor)) {
					let line_end = this.cursor;
					while (
						line_end < length &&
						char_code_at.call(source, line_end - base) !== LINEFEED
					)
						line_end++;
					const break_end = line_end < length ? line_end + 1 : line_end;
					this.emit_bare_leaf(
						NodeKind.thematic_break,
						this.cursor,
						current_node,
						break_end
					);
					this.chomp(break_end, true);
					return false;
				}
				if (code !== UNDERSCORE) {
					const nested = this.try_parse_list_marker(this.cursor);
					if (nested) {
						if (nested.indent >= this.list_content_offset) {
							// nested sub-list inside this item
							this.start_list(nested, current_node);
						} else if (
							nested.indent >= this.list_marker_indent &&
							nested.ordered === this.list_ordered &&
							nested.marker_char === this.list_marker
						) {
							// same list, new sibling item (e.g. after code fence in item)
							this.emit_close(current_node, this.cursor);
							this.node_stack.pop();
							const new_item_id = this.emit_open(
								NodeKind.list_item,
								this.cursor,
								this.list_node_id
							);
							this.node_stack.push(new_item_id);
							this.list_content_offset = nested.content_offset;
							this.chomp(nested.content_start, true);
						} else {
							// marker at outer list level - end this list
							this.end_list();
						}
						return false;
					}
				}
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open_pending(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.track_list_pending_para(para_id);
				this.node_stack.push(para_id);
				return false;
			}

			case CLOSE_ANGLE_BRACKET: {
				let p = this.cursor + 1;
				if (p < length && char_code_at.call(source, p - base) === SPACE) p++;
				this.block_quote_depth++;
				const bq_id = this.emit_open(
					NodeKind.block_quote,
					this.cursor,
					current_node
				);
				this.node_stack.push(bq_id);
				this.states.push(StateKind.block_quote);
				this.chomp(p, true);
				return false;
			}

			case PIPE: {
				const result = this.try_start_table(current_node);
				if (result === false) return true;
				if (result === true) return false;
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open_pending(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.track_list_pending_para(para_id);
				this.node_stack.push(para_id);
				return false;
			}

			case OPEN_SQUARE_BRACKET: {
				const def_end = this.try_parse_link_ref_definition(this.cursor);
				if (def_end === -2) return true;
				if (def_end >= 0) {
					this.chomp(def_end, true);
					return false;
				}
				this.states.push(StateKind.paragraph);
				const li_ref_para = this.emit_open_pending(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.track_list_pending_para(li_ref_para);
				this.node_stack.push(li_ref_para);
				return false;
			}

			case COLON: {
				const dir = this.try_parse_block_directive(this.cursor);
				if (dir === false) return true;
				if (dir !== null) {
					this.start_block_directive(dir, current_node);
					return false;
				}
				this.states.push(StateKind.paragraph);
				const li_colon_para = this.emit_open_pending(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.track_list_pending_para(li_colon_para);
				this.node_stack.push(li_colon_para);
				return false;
			}

			default: {
				// a digit or `+` could start a nested list marker - stall
				// while the prefix is still being read so we don't commit
				// the char as paragraph text before the marker decision.
				if (
					!this.finished &&
					(code === PLUS || (code >= 48 && code <= 57)) &&
					this.plus_marker_pending(this.cursor)
				)
					return true;
				const nested = this.try_parse_list_marker(this.cursor);
				if (nested) {
					if (nested.indent >= this.list_content_offset) {
						this.start_list(nested, current_node);
					} else if (
						nested.indent >= this.list_marker_indent &&
						nested.ordered === this.list_ordered &&
						nested.marker_char === this.list_marker
					) {
						this.emit_close(current_node, this.cursor);
						this.node_stack.pop();
						const new_item_id = this.emit_open(
							NodeKind.list_item,
							this.cursor,
							this.list_node_id
						);
						this.node_stack.push(new_item_id);
						this.list_content_offset = nested.content_offset;
						this.chomp(nested.content_start, true);
					} else {
						this.end_list();
					}
					return false;
				}
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open_pending(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.track_list_pending_para(para_id);
				this.node_stack.push(para_id);
				if (code >= 128 || (code !== 0 && TEXT_BREAK[code] === 0))
					this.para_text(para_id);
				return false;
			}
		}
	}

	private _run_directive_container(
		code: number,
		current_node: number
	): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// container directive: dispatches inner block content,
		// watches for closing ::: fence.
		if (!code) {
			if (!this.finished) return true;
			// eof: close the container
			this.emit_close(current_node, this.cursor);
			this.node_stack.pop();
			this.states.pop();
			this.directive_colon_counts.pop();
			return false;
		}

		const dc_colons =
			this.directive_colon_counts[this.directive_colon_counts.length - 1];

		switch (code) {
			case LINEFEED: {
				if (!this.finished && !this.can_decide_after_lf(this.cursor)) {
					return true;
				}
				this.emit_bare_leaf(
					NodeKind.line_break,
					this.cursor,
					current_node,
					this.cursor + 1
				);
				this.cursor++;
				return false;
			}

			case SPACE:
			case TAB: {
				let pos = this.cursor;
				while (
					pos < length &&
					(char_code_at.call(source, pos - base) === SPACE ||
						char_code_at.call(source, pos - base) === TAB)
				) {
					pos++;
				}
				if (pos >= length && !this.finished) return true;
				if (
					pos < length &&
					char_code_at.call(source, pos - base) === LINEFEED
				) {
					this.emit_bare_leaf(
						NodeKind.line_break,
						this.cursor,
						current_node,
						pos + 1
					);
					this.chomp(pos + 1, true);
					return false;
				}
				this.cursor++;
				return false;
			}

			case COLON: {
				// check for closing fence: n+ colons (>= opener) with no name
				const close_end = this.try_parse_directive_close(
					this.cursor,
					dc_colons
				);
				if (close_end === -2) return true;
				if (close_end >= 0) {
					this.emit_close(current_node, close_end);
					this.node_stack.pop();
					this.states.pop();
					this.directive_colon_counts.pop();
					this.chomp(close_end, true);
					return false;
				}

				// check for nested directive (opening fence)
				const dir = this.try_parse_block_directive(this.cursor);
				if (dir === false) return true;
				if (dir !== null) {
					this.start_block_directive(dir, current_node);
					return false;
				}
				// not a directive - start paragraph
				this.states.push(StateKind.paragraph);
				const dc_colon_para = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(dc_colon_para);
				return false;
			}

			case OCTOTHERP: {
				if (!this.start_heading(current_node)) return true;
				return false;
			}

			case BACKTICK: {
				this.start_fence(current_node);
				return false;
			}

			case ASTERISK:
			case DASH:
			case UNDERSCORE: {
				if (this.could_be_thematic_break(this.cursor, code)) return true;
				if (this.is_thematic_break_start(this.cursor)) {
					let line_end = this.cursor;
					while (
						line_end < length &&
						char_code_at.call(source, line_end - base) !== LINEFEED
					)
						line_end++;
					this.emit_bare_leaf(
						NodeKind.thematic_break,
						this.cursor,
						current_node,
						line_end
					);
					this.chomp(line_end, true);
					return false;
				}
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(para_id);
				return false;
			}

			case CLOSE_ANGLE_BRACKET: {
				let p = this.cursor + 1;
				if (p < length && char_code_at.call(source, p - base) === SPACE) p++;
				this.block_quote_depth++;
				const bq_id = this.emit_open(
					NodeKind.block_quote,
					this.cursor,
					current_node
				);
				this.node_stack.push(bq_id);
				this.states.push(StateKind.block_quote);
				this.chomp(p, true);
				return false;
			}

			case PIPE: {
				const result = this.try_start_table(current_node);
				if (result === false) return true;
				if (result === true) return false;
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(para_id);
				return false;
			}

			case OPEN_SQUARE_BRACKET: {
				const def_end = this.try_parse_link_ref_definition(this.cursor);
				if (def_end === -2) return true;
				if (def_end >= 0) {
					this.chomp(def_end, true);
					return false;
				}
				this.states.push(StateKind.paragraph);
				const dc_ref_para = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(dc_ref_para);
				return false;
			}

			default: {
				this.states.push(StateKind.paragraph);
				const para_id = this.emit_open(
					NodeKind.paragraph,
					this.cursor,
					current_node
				);
				this.node_stack.push(para_id);
				return false;
			}
		}
	}

	private _run_frontmatter(current_node: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		// fast scan: look for `\n---` to close frontmatter.
		// search from cursor-1 so the newline ending the opening
		// fence can serve as the `\n` prefix for an empty body.
		const fm_search = this.cursor > 0 ? this.cursor - 1 : 0;
		const fm_rel = string_index_of.call(source, '\n---', fm_search - base);
		const fm_close = fm_rel === -1 ? -1 : fm_rel + base;
		if (fm_close === -1) {
			if (!this.finished) {
				this.wait_for('\n---');
				return true;
			}
			// eof without closing `---`: not valid frontmatter.
			// revoke and re-parse from position 0 as normal content.
			this.frontmatter_failed = true;
			const fm_id = this.node_stack.pop()!;
			this.states.pop();
			this.out.revoke(fm_id);
			this.chomp(0, true);
			return false;
		}

		// `\n---` found - check that nothing follows except optional newline/eof
		const after_fence = fm_close + 4; // position after `\n---`
		// in incremental mode, stall until we can see what follows `---`
		if (after_fence >= length && !this.finished) return true;
		const ch_after = char_code_at.call(source, after_fence - base);
		if (ch_after === LINEFEED || ch_after !== ch_after /* nan = eof */) {
			const fm_id = current_node;
			const end = ch_after === LINEFEED ? after_fence + 1 : after_fence;
			this.out.set_value_end(fm_id, fm_close + 1); // value ends at the \n before ---
			this.emit_close(fm_id, end);
			this.node_stack.pop();
			this.states.pop();
			this.chomp(end, true);
			return false;
		}

		// `---` followed by other chars - not a valid close.
		// skip past this `\n---` and keep scanning.
		this.chomp(after_fence, true);
		return false;
	}

	// table helpers

	/**
	 * try to start a table at the current cursor position.
	 * requires seeing the full header row + full delimiter row.
	 * @returns true = table started, false = hold back, null = not a table
	 */
	private try_start_table(parent: number): boolean | null {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const row_start = this.cursor;

		// one pass over the header row, four words per cell in table_bounds, cell bounds and trimmed content
		// bounds with the trimmed end stored as ~end when the content is not plain
		let pos = row_start;
		while (pos < length) {
			const c = char_code_at.call(source, pos - base);
			if (c !== SPACE && c !== TAB) break;
			pos++;
		}
		if (pos < length && char_code_at.call(source, pos - base) === PIPE) pos++;
		let bounds = this.cold.table_bounds;
		if (bounds === null) bounds = this.cold.table_bounds = new Int32Array(16);
		let n = 0;
		let cell_start = pos;
		let first = -1;
		let last = pos;
		let plain = true;
		let header_end = length;
		while (pos < length) {
			const ch = char_code_at.call(source, pos - base);
			if (ch < 128 && TEXT_BREAK[ch] !== 0) {
				if (ch === LINEFEED) {
					header_end = pos;
					break;
				}
				if (ch === PIPE) {
					if (n + 4 > bounds.length) bounds = this.grow_table_bounds(bounds);
					bounds[n] = cell_start;
					bounds[n + 1] = pos;
					bounds[n + 2] = first < 0 ? pos : first;
					bounds[n + 3] = first < 0 ? pos : plain ? last : ~last;
					n += 4;
					cell_start = pos + 1;
					first = -1;
					plain = true;
				} else {
					plain = false;
					if (first < 0) first = pos;
					last = pos + 1;
					if (ch === BACKSLASH && pos + 1 < length) {
						const e = char_code_at.call(source, pos + 1 - base);
						if (e !== LINEFEED) {
							pos++;
							if (e !== SPACE && e !== TAB) last = pos + 1;
						}
					}
				}
			} else if (ch !== SPACE && ch !== TAB) {
				if (ch === 0) plain = false;
				if (first < 0) first = pos;
				last = pos + 1;
			}
			pos++;
		}
		if (header_end >= length && !this.finished) {
			this.wait_for('\n');
			return false; // hold back - need \n
		}
		// trailing content after the last pipe is a cell unless it is only whitespace
		if (first >= 0) {
			if (n + 4 > bounds.length) bounds = this.grow_table_bounds(bounds);
			bounds[n] = cell_start;
			bounds[n + 1] = header_end;
			bounds[n + 2] = first;
			bounds[n + 3] = plain ? last : ~last;
			n += 4;
		}
		if (n === 0) return null;
		const col_count = n >> 2;

		// find delimiter row
		const delim_start = header_end + 1;
		if (delim_start >= length && !this.finished) return false; // hold back

		let delim_end = length;
		if (delim_start < length) {
			const lf = string_index_of.call(source, '\n', delim_start - base);
			if (lf !== -1) delim_end = lf + base;
		}
		if (delim_end >= length && !this.finished) {
			this.wait_for('\n');
			return false; // hold back - need full delimiter row
		}

		// parse delimiter row
		const alignments = this.parse_delimiter_row(
			delim_start,
			delim_end,
			col_count
		);
		if (alignments === null) return null; // not a table

		// confirmed table - emit structure
		const table_id = this.emit_open(NodeKind.table, row_start, parent);
		this.out.attr(table_id, 'alignments', alignments);
		this.out.attr(table_id, 'col_count', col_count);

		// store table state
		this.table_col_count = col_count;
		this.table_node_id = table_id;
		this.in_table = true;

		// emit header row using the inline state machinery:
		// open header node, then parse each cell through inline
		const header_id = this.emit_open(
			NodeKind.table_header,
			row_start,
			table_id
		);
		for (let i = 0; i < col_count; i++) {
			const c_start = bounds[i << 2];
			const c_end = bounds[(i << 2) + 1];
			const s = bounds[(i << 2) + 2];
			let e = bounds[(i << 2) + 3];
			this.table_cell_id = this.emit_open(
				NodeKind.table_cell,
				c_start,
				header_id,
				i
			);
			if (e >= 0) {
				if (s < e) {
					this.emit_leaf(NodeKind.text, s, this.table_cell_id, s, e, e);
					this.interrupt_pos = -1;
					this.loop_without_progress = 0;
				}
			} else {
				e = ~e;
				// parse cell content through inline machinery, it never starts a table so bounds stay ours
				this.node_stack.push(this.table_cell_id);
				this.parse_inline_range(s, e);
				this.node_stack.pop();
			}
			this.emit_close(this.table_cell_id, c_end);
		}
		this.emit_close(header_id, header_end);

		// push table node + state
		this.node_stack.push(table_id);
		this.states.push(StateKind.table_body);

		// advance cursor past delimiter row
		const after_delim = delim_end < length ? delim_end + 1 : delim_end;
		this.chomp(after_delim, true);
		return true;
	}

	private grow_table_bounds(bounds: Int32Array): Int32Array {
		const next = new Int32Array(bounds.length << 1);
		next.set(bounds);
		this.cold.table_bounds = next;
		return next;
	}

	/**
	 * sampled every 64 trips, popping below the lowest depth sampled at this cursor is progress
	 * since unwinding pending delimiters takes a trip each, depth only falls so far so a real loop still stops
	 */
	private stalled(): boolean {
		const depth = this.states.length;
		if (this.cursor !== this.prev_cursor) {
			this.prev_cursor = this.cursor;
			this.prev_depth = depth;
			this.loop_without_progress = 0;
			return false;
		}
		if (depth < this.prev_depth) {
			this.prev_depth = depth;
			this.loop_without_progress = 0;
			return false;
		}
		this.loop_without_progress += 64;
		return this.loop_without_progress > 100;
	}

	/**
	 * a paragraph just opened at a plain char, take the plain run its states would in three trips
	 * outside block quotes take the linefeed call too and carry on across soft breaks
	 */
	private para_text(para_id: number): void {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		let start = this.cursor;
		for (;;) {
			// the text is emitted once the end of the run decides between a leaf and an open
			let p = start + 1;
			if (p < length) {
				const c1 = char_code_at.call(source, p - base);
				if (c1 !== 0 && (c1 >= 128 || TEXT_BREAK[c1] === 0)) {
					p++;
					while (p < length) {
						const ch = char_code_at.call(source, p - base);
						if (ch < 128 && TEXT_BREAK[ch] !== 0) break;
						p++;
					}
				}
			}
			if (p < length && char_code_at.call(source, p - base) === LINEFEED) {
				const bq = this.block_quote_depth > 0;
				// at the root the text state holds back on the linefeed, in a list inline does
				const hold = !bq && !this.finished && !this.can_decide_after_lf(p);
				if (!hold || this.list_depth > 0) {
					if (hold) this.states.push(StateKind.inline);
					this.emit_leaf(NodeKind.text, start, para_id, start, p, p);
					// in a block quote inline would only pop on the linefeed
					if (bq || hold) {
						this.cursor = p;
						return;
					}
					if (this.lf_ends_inline(p)) {
						this.emit_close(para_id, p);
						this.states.pop();
						this.node_stack.pop();
						this.cursor = p;
						return;
					}
					this.emit_bare_leaf(NodeKind.soft_break, p, para_id, p + 1);
					let q = p + 1;
					// the root strips leading spaces of the continuation line, a list keeps them
					if (this.list_depth === 0) {
						while (q < length && char_code_at.call(source, q - base) === SPACE)
							q++;
					}
					const c0 = q < length ? char_code_at.call(source, q - base) : 0;
					if (!(c0 >= 128 || (c0 !== 0 && TEXT_BREAK[c0] === 0))) {
						this.states.push(StateKind.inline);
						this.cursor = q;
						return;
					}
					start = q;
					continue;
				}
			}
			const t_id = this.emit_open(NodeKind.text, start, para_id);
			this.out.set_value_start(t_id, start);
			this.states.push(StateKind.inline);
			this.node_stack.push(t_id);
			this.states.push(StateKind.text);
			this.cursor = p;
			return;
		}
	}

	/**
	 * a data cell just opened, take the table_row_content trips for plain cells in one
	 * and leave anything else for that state at the cursor
	 */
	private table_cells(): void {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		for (;;) {
			let q = this.cursor;
			while (q < length) {
				const ch = char_code_at.call(source, q - base);
				if (ch !== SPACE && ch !== TAB) break;
				q++;
			}
			this.cursor = q;
			if (q >= length) return;
			const c0 = char_code_at.call(source, q - base);
			if (c0 === BACKTICK) {
				if (!this.table_cell_code(q)) return;
			} else {
				if (c0 === 0 || (c0 < 128 && TEXT_BREAK[c0] !== 0)) return;
				this.table_cell_has_content = true;
				if (!this.table_cell_text(this.table_cell_id)) return;
			}
			if (char_code_at.call(source, this.cursor - base) !== PIPE) return;
			// the pipe branch of table_row_content
			this.close_table_cell();
			this.table_cell_col++;
			this.cursor++;
			if (this.table_cell_col >= this.table_col_count) return;
			this.table_cell_id = this.emit_open(
				NodeKind.table_cell,
				this.cursor,
				this.table_row_id,
				this.table_cell_col
			);
			this.table_cell_has_content = false;
			this.node_stack.push(this.table_cell_id);
		}
	}

	/** a cell opening with a backtick at start, true when its content ended at a pipe or linefeed, false leaves inline pushed */
	private table_cell_code(start: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		this.table_cell_has_content = true;
		this.states.push(StateKind.inline);
		let q = start + 1;
		if (q < length && char_code_at.call(source, q - base) === BACKTICK) q++;
		const run_n = q - start;
		if (q >= length) return false;
		const c0 = char_code_at.call(source, q - base);
		if (
			c0 === BACKTICK ||
			c0 === SPACE ||
			c0 === OCTOTHERP ||
			c0 === LINEFEED ||
			c0 === PIPE
		)
			return false;
		let e = q + 1;
		while (e < length) {
			const ch = char_code_at.call(source, e - base);
			if (ch === BACKTICK || ch === LINEFEED || ch === PIPE) break;
			e++;
		}
		if (e >= length || char_code_at.call(source, e - base) !== BACKTICK)
			return false;
		let r = e + 1;
		while (r < length && char_code_at.call(source, r - base) === BACKTICK) r++;
		if (r - e !== run_n || r >= length) return false;
		const cell = this.table_cell_id;
		this.emit_leaf(NodeKind.code_span, start, cell, q, e, r);
		this.extra = run_n;
		this.code_span_open_pos = start;
		this.cursor = r;
		const c = char_code_at.call(source, r - base);
		if (c === 0 || (c < 128 && TEXT_BREAK[c] !== 0)) return false;
		// table_cell_text pushes inline again when its run does not end the cell
		this.states.pop();
		return this.table_cell_text(cell);
	}

	/**
	 * a plain run from the cursor ending at a pipe or linefeed is one text node closed here
	 * otherwise inline and text are left pushed past the run as inline would
	 */
	private table_cell_text(parent: number): boolean {
		const source = this.source;
		const base = this.source_base;
		const length = this.source_end;
		const start = this.cursor;
		// ve ends the last char that is not a space or tab so trailing padding is never scanned back, start while there is none
		let ve = start;
		let p = start + 1;
		let ch = p < length ? char_code_at.call(source, p - base) : 0;
		if (ch !== 0) {
			for (;;) {
				if (ch <= SPACE) {
					// a linefeed is the only text break at or below a space
					if (ch === LINEFEED) break;
					p++;
					if (ch !== SPACE && ch !== TAB) ve = p;
				} else {
					if (ch < 128 && TEXT_BREAK[ch] !== 0) break;
					p++;
					ve = p;
				}
				if (p >= length) break;
				ch = char_code_at.call(source, p - base);
			}
		}
		if (p < length && (ch === PIPE || ch === LINEFEED)) {
			if (ve === start) ve = this.blank_run_end(start + 1);
			this.emit_leaf(NodeKind.text, start, parent, start, ve, p);
			this.cursor = p;
			return true;
		}
		const t_id = this.emit_open(NodeKind.text, start, parent);
		this.out.set_value_start(t_id, start);
		this.states.push(StateKind.inline);
		this.node_stack.push(t_id);
		this.states.push(StateKind.text);
		this.cursor = p;
		return false;
	}

	private blank_run_end(end: number): number {
		const source = this.source;
		const base = this.source_base;
		while (end > 0) {
			const c = char_code_at.call(source, end - 1 - base);
			if (c !== SPACE && c !== TAB) break;
			end--;
		}
		return end;
	}

	/**
	 * parse a delimiter row. returns alignment array or null if invalid.
	 */
	private parse_delimiter_row(
		start: number,
		end: number,
		col_count: number
	): string[] | null {
		const source = this.source;
		const base = this.source_base;
		let pos = start;
		let c = pos < end ? char_code_at.call(source, pos - base) : -1;
		while (c === SPACE || c === TAB) {
			pos++;
			c = pos < end ? char_code_at.call(source, pos - base) : -1;
		}
		if (c === PIPE) {
			pos++;
			c = pos < end ? char_code_at.call(source, pos - base) : -1;
		}

		const alignments: string[] = [];
		while (pos < end) {
			while (c === SPACE) {
				pos++;
				c = pos < end ? char_code_at.call(source, pos - base) : -1;
			}
			if (pos >= end) break;

			if (c === PIPE && pos + 1 >= end) break;

			let left_colon = false;
			if (c === COLON) {
				left_colon = true;
				pos++;
				c = pos < end ? char_code_at.call(source, pos - base) : -1;
			}
			const dashes = pos;
			while (c === DASH) {
				pos++;
				c = pos < end ? char_code_at.call(source, pos - base) : -1;
			}
			if (pos === dashes) return null; // invalid delimiter cell

			let right_colon = false;
			if (c === COLON) {
				right_colon = true;
				pos++;
				c = pos < end ? char_code_at.call(source, pos - base) : -1;
			}
			while (c === SPACE) {
				pos++;
				c = pos < end ? char_code_at.call(source, pos - base) : -1;
			}

			// expect pipe or end
			if (pos < end) {
				if (c !== PIPE) return null; // unexpected char
				pos++;
				c = pos < end ? char_code_at.call(source, pos - base) : -1;
			}

			// more cells than the header can never be a table
			if (alignments.length === col_count) return null;
			if (left_colon && right_colon) alignments.push('center');
			else if (right_colon) alignments.push('right');
			else if (left_colon) alignments.push('left');
			else alignments.push('none');
		}

		return alignments.length === col_count ? alignments : null;
	}

	/**
	 * parse inline content for a specific byte range. used for header cells
	 * where the full content is available atomically.
	 * saves/restores parser state, uses a sentinel state to prevent leaking
	 * into block-level parsing.
	 */
	private parse_inline_range(start: number, end: number): void {
		const saved_cursor = this.cursor;
		const saved_finished = this.finished;
		const saved_floor = this.class_floor;

		this.cursor = start;
		this.finished = true;
		this.class_floor = start;
		this.range_next_class = classify(
			start + 1 < this.source_end
				? char_code_at.call(this.source, start + 1 - this.source_base)
				: NaN
		);

		// use a sentinel on the state stack so _run() stops here
		const sentinel = this.states.length;
		this.states.push(StateKind.table_row_content); // sentinel
		this.states.push(StateKind.inline);

		const save_source = this.source;
		const save_end = this.source_end;
		this.source = string_slice.call(this.source, 0, end - this.source_base);
		this.source_end = this.source_base + this.source.length;
		this.inline_range_parse = true;

		this._run();

		this.source = save_source;
		this.source_end = save_end;
		this.inline_range_parse = false;

		// unwind anything left above the sentinel
		while (this.states.length > sentinel) {
			const top = this.states[this.states.length - 1];
			if (
				top === StateKind.text ||
				top === StateKind.emphasis ||
				top === StateKind.strong_emphasis ||
				top === StateKind.strikethrough ||
				top === StateKind.superscript ||
				top === StateKind.subscript ||
				top === StateKind.link_text
			) {
				const node_id = this.node_stack[this.node_stack.length - 1];
				this.out.set_value_end(node_id, end);
				this.emit_close(node_id, end);
				if (this.kind_of(node_id) === NodeKind.directive_inline) {
					this.directive_text_pop(node_id);
				}
				this.node_stack.pop();
			}
			this.states.pop();
		}

		// restore
		this.cursor = saved_cursor;
		this.finished = saved_finished;
		this.class_floor = saved_floor;
		this.interrupt_pos = -1;
		this.interrupt_marker_pos = -1;
	}

	/**
	 * unwind all inline states back to table_row_content.
	 * called when `|` or `\n` is encountered inside inline content within a table cell.
	 * closes text nodes, pops inline states, closes pending inline constructs.
	 */
	private unwind_inline_for_table(): void {
		while (this.states.length > 0) {
			const top = this.states[this.states.length - 1];
			if (top === StateKind.table_row_content) break;

			if (top === StateKind.text) {
				const text_id = this.node_stack[this.node_stack.length - 1];
				// trim trailing whitespace from the text value
				let ve = this.cursor;
				while (
					ve > 0 &&
					(char_code_at.call(this.source, ve - 1 - this.source_base) ===
						SPACE ||
						char_code_at.call(this.source, ve - 1 - this.source_base) === TAB)
				) {
					ve--;
				}
				this.out.set_value_end(text_id, ve);
				this.emit_close(text_id, this.cursor);
				this.node_stack.pop();
				this.states.pop();
			} else if (top === StateKind.inline) {
				this.states.pop();
			} else if (
				top === StateKind.code_span_end ||
				top === StateKind.code_span_start ||
				top === StateKind.code_span_content_leading_space ||
				top === StateKind.code_span_leading_space_end ||
				top === StateKind.code_span_info
			) {
				const cs_id = this.node_stack[this.node_stack.length - 1];
				const delim_end = this.code_span_open_pos + this.extra;
				this.out.revoke(
					cs_id,
					string_slice.call(
						this.source,
						this.code_span_open_pos - this.source_base,
						delim_end - this.source_base
					),
					this.one_shot ? this.code_span_open_pos : undefined
				);
				this.node_stack.pop();
				this.states.pop();
				const parent_id = this.node_stack[this.node_stack.length - 1];
				this.emit_leaf(
					NodeKind.text,
					delim_end,
					parent_id,
					delim_end,
					this.cursor,
					this.cursor
				);
				// don't push to node_stack - this text node is immediately closed
			} else {
				// emphasis, strong, strikethrough, superscript, link_text
				const node_id = this.node_stack[this.node_stack.length - 1];
				if (this.pending_has(node_id)) {
					// speculative node never closed - revoke it now
					// so the delimiter becomes literal text
					this.out.revoke(node_id);
					this.pending_remove(node_id);
				} else {
					// already committed (closed normally) - just close
					this.out.set_value_end(node_id, this.cursor);
					this.emit_close(node_id, this.cursor);
				}
				if (this.kind_of(node_id) === NodeKind.directive_inline) {
					this.directive_text_pop(node_id);
				}
				this.node_stack.pop();
				this.states.pop();
			}
		}
	}

	/**
	 * close the current table cell. pops cell from node_stack.
	 */
	private close_table_cell(): void {
		this.emit_close(this.table_cell_id, this.cursor);
		if (this.node_stack[this.node_stack.length - 1] === this.table_cell_id) {
			this.node_stack.pop();
		}
	}

	/**
	 * pad remaining columns with empty cells and close the current row.
	 */
	private pad_and_close_row(): void {
		for (let i = this.table_cell_col; i < this.table_col_count; i++) {
			const cell_id = this.emit_open(
				NodeKind.table_cell,
				this.cursor,
				this.table_row_id,
				i
			);
			this.emit_close(cell_id, this.cursor);
		}
		this.emit_close(this.table_row_id, this.cursor);
	}

	/**
	 * close the current table and pop state.
	 */
	private end_table(): void {
		this.states.pop(); // pop table_body
		this.close_table_node();
	}

	// leaves the state stack alone, the caller pops it
	private close_table_node(): void {
		this.emit_close(this.table_node_id, this.cursor);
		this.node_stack.pop(); // pop table node
		this.table_col_count = 0;
		this.table_node_id = 0;
		this.table_row_id = 0;
		this.table_cell_id = 0;
		this.table_cell_col = 0;
		this.in_table = false;
	}

	private _finalize(): void {
		const length = this.source_end;

		// close unclosed nodes gently (set end if not already set)
		// skip pending nodes - those will be revoked below.
		// ids an earlier finish already finalized stay as they were
		const done = this.finalized_below;
		for (let i = 0; i < this.node_stack.length; i++) {
			const id = this.node_stack[i];
			if (done > 0 && !(id >= done)) continue;
			if (!this.is_closed(id) && !this.pending_has(id)) {
				this.out.set_value_end(id, length - 1);
				this.emit_close(id, length - 1);
			}
		}

		// revoke any remaining pending nodes (unclosed html, unclosed emphasis, etc.)
		for (let pi = 0; pi < this.pending_count; pi++) {
			const id = this.pending_ids[pi];
			const kind = this.kind_of(id);
			// block-level revocations (html) need the source text for repair
			if (kind === NodeKind.html) {
				const start = this.pending_starts[pi];
				this.out.revoke(
					id,
					this.html_open_tag_text(start),
					this.one_shot ? start : undefined
				);
			} else {
				this.out.revoke(id);
			}
		}
		this.pending_count = 0;
		this.pending_para_count = 0;
		this.give_back_ids();
	}
}

// idle between documents on a tree rather than a stub so the emitter only ever sees one class
let spare_parser: PFMParser | null = null;
let spare_parser_busy = false;
let idle_tree: TreeBuilder | null = null;

/**
 * parse markdown that may include svelte syntax into tokens and nodes.
 *
 * line endings in `input` are normalized to `\n` per commonmark 2.1.
 * the returned `source` is the normalized string, and all node
 * positions are offsets into it. callers slicing for content should
 * use `source`, not the original `input`.
 *
 * @param input source markdown string.
 * @param options parser configuration and reusable storage.
 * @returns arena-backed parse result, the normalized source, and errors.
 */
export function parse_markdown_svelte(
	input: string,
	options?: ParseOptions
): { nodes: NodeBuffer; errors: ErrorCollector; source: string } {
	const source = normalize_newlines(input);

	let dispatcher: PluginDispatcher | undefined;
	let tab_size: number | undefined;
	if (options !== undefined) {
		tab_size = options.tab_size;
		const plugins = options.plugins;
		if (plugins && plugins.length > 0) {
			const text_source = new SourceTextSource(source);
			dispatcher = new PluginDispatcher(plugins, text_source);
		}
	}

	// short documents are denser in nodes, oversizing a small buffer is only a slab carve
	const len = source.length;
	const tree = new TreeBuilder(
		len < 512 ? (len >> 2) + 16 : len >> 3,
		dispatcher
	);
	let errors: ErrorCollector;
	if (spare_parser_busy) {
		// a plugin or emitter reentered parse, the spare holds the outer document
		errors = new PFMParser(tree, tab_size).parse_normalized(source);
	} else {
		spare_parser_busy = true;
		let keep = false;
		try {
			if (spare_parser === null) {
				if (idle_tree === null) idle_tree = new TreeBuilder(0);
				spare_parser = new PFMParser(idle_tree);
			}
			spare_parser.bind(tree, tab_size);
			errors = spare_parser.parse_normalized(source);
			keep = true;
		} finally {
			// a throw can leave the parser half written, so the next document gets a fresh one
			if (keep) {
				spare_parser!.bind(idle_tree!);
				spare_parser!.release();
			} else spare_parser = null;
			spare_parser_busy = false;
		}
	}

	// run sequential plugins after parse completes
	const nodes = tree.get_buffer();
	if (dispatcher) {
		dispatcher.run_sequential(nodes);
	}
	nodes.trim();

	return { nodes, errors, source };
}
