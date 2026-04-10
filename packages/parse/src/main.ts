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
} from "./constants";

import type { ParseOptions } from "./types";

import type { Emitter } from "./opcodes";
import { NodeKind } from "./utils";
import { NodeBuffer, ErrorCollector } from "./utils";
import { TreeBuilder } from "./tree_builder";
import { PluginDispatcher } from "./plugin_dispatch";
import { SourceTextSource } from "./node_view";
export type { ParseOptions, ParseResult } from "./types";
export type { ParsePlugin } from "./plugin_types";
export { NodeKind, NodeBuffer } from "./utils";
export { PluginDispatcher } from "./plugin_dispatch";
export { SourceTextSource, WireTextSource } from "./node_view";

export { WireEmitter, WireOp } from "./wire_emitter";
export type { Emitter } from "./opcodes";

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

/**
 * pfm parser - state machine that emits opcodes via an emitter interface.
 */
export class PFMParser {
	// source
	private source: string = "";
	private cursor: number = 0;
	private finished: boolean = false;

	// state machine
	private states: StateKind[] = [StateKind.root];
	private node_stack: number[] = [0]; // stack of opcode ids

	// id generation
	private next_id: number = 1; // 0 is reserved for root
	private pending_ids: number[] = [];
	private pending_starts: number[] = [];
	private pending_count: number = 0;
	private closed_flags: number[] = [];
	private NodeKind_array: NodeKind[] = [];

	// char classification helpers
	private prev: number = CharMask.whitespace;
	private current: number = 0;
	private next_class: number = 0;

	// block state
	private block_quote_depth: number = 0;
	private emphasis_has_content: boolean = false;
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
	}[] = [];

	// tight-list speculation:  every list_item's content paragraph is
	// emitted as pending. at list close we finalize the collection,
	// committing them all if the list became loose, or revoking (unwrap)
	// them all if it stayed tight.
	private list_pending_paras: number[] = [];

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

	// svelte block state
	private svelte_block_depth: number = 0;
	private svelte_block_tag: string = "";
	private svelte_branch_id: number = 0;
	private svelte_block_id: number = 0;
	private svelte_block_stack: {
		block_id: number;
		branch_id: number;
		tag: string;
	}[] = [];

	private frontmatter_failed: boolean = false;
	private imports_allowed: boolean = true;

	// link reference definitions
	private ref_map: Map<string, { url: string; title: string }> = new Map();
	private link_text_start: number = 0;

	// directive container state
	private directive_colon_counts: number[] = [];

	private extra: number = 0;
	private info_start_pos: number = 0;
	private info_end_pos: number = 0;
	private checkpoint_cursor: number = 0;
	private prev_cursor: number = 0;
	private loop_without_progress: number = 0;

	private out: Emitter;
	private errors: ErrorCollector;

	private tab_size: number = 2;

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
		this._init();
		this.source = source;
		this.current = classify(source.charCodeAt(0));
		this.next_class = classify(source.charCodeAt(1));
		this.errors = EMPTY_ERRORS;
		this.finished = true;

		this._run();
		this._finalize();

		return { errors: this.errors };
	}

	/**
	 * initialize the parser for incremental feeding. must be called
	 * before the first feed() call.
	 */
	init(): void {
		this._init();
		this.finished = false;
	}

	/**
	 * feed a chunk of source text. the parser advances as far as it
	 * can, stalling at line boundaries when lookahead is insufficient.
	 * call init() before the first feed().
	 */
	feed(chunk: string): void {
		this.source += chunk;
		this.current = classify(this.source.charCodeAt(this.cursor));
		this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
		this._run();
		this.out.cursor(this.cursor);
	}

	/**
	 * signal end-of-input. finalizes all open nodes and revokes
	 * pending speculation.
	 */
	finish(): { errors: ErrorCollector } {
		this.finished = true;
		this._run();
		this._finalize();
		this.out.cursor(this.cursor);
		return { errors: this.errors };
	}

	private _init(): void {
		this.source = "";
		this.cursor = 0;
		this.finished = false;
		this.states = [StateKind.root];
		this.node_stack = [0];
		this.next_id = 1;
		this.pending_ids = [];
		this.pending_count = 0;
		this.closed_flags = [];
		this.NodeKind_array = [];
		this.prev = CharMask.whitespace;
		this.current = CharMask.whitespace;
		this.next_class = CharMask.whitespace;
		this.block_quote_depth = 0;
		this.list_depth = 0;
		this.list_marker = 0;
		this.list_ordered = false;
		this.list_start_num = 0;
		this.list_node_id = 0;
		this.list_is_loose = false;
		this.list_content_offset = 0;
		this.list_marker_indent = 0;
		this.list_state_stack = [];
		this.list_pending_paras = [];
		this.table_col_count = 0;
		this.table_node_id = 0;
		this.table_row_id = 0;
		this.table_cell_id = 0;
		this.table_cell_col = 0;
		this.in_table = false;
		this.inline_range_parse = false;
		this.table_cell_has_content = false;
		this.html_tag_stack = [];
		this.html_block_depth = 0;
		this.svelte_block_depth = 0;
		this.svelte_block_tag = "";
		this.svelte_branch_id = 0;
		this.svelte_block_id = 0;
		this.svelte_block_stack = [];
		this.extra = 0;
		this.info_start_pos = 0;
		this.info_end_pos = 0;
		this.checkpoint_cursor = 0;
		this.prev_cursor = 0;
		this.loop_without_progress = 0;
		this.frontmatter_failed = false;
		this.imports_allowed = true;
		this.ref_map.clear();
		this.link_text_start = 0;
		this.directive_colon_counts = [];
		this.errors = EMPTY_ERRORS;

		// emit the root node open
		this.out.open(0, NodeKind.root, 0, -1, 0, false);
	}

	// opcode helpers

	private emit_open(
		kind: NodeKind,
		start: number,
		parent: number,
		extra = 0,
		pending = false,
	): number {
		const id = this.next_id++;
		this.out.open(id, kind, start, parent, extra, pending);
		if (pending) {
			this.pending_starts[this.pending_count] = start;
			this.pending_ids[this.pending_count++] = id;
		}
		this.NodeKind_array[id] = kind;
		return id;
	}

	private emit_close(id: number, end: number): void {
		this.out.close(id, end);
		this.closed_flags[id] = 1;
	}

	/** swap-remove an id from the  pending_ids array. */
	private pending_remove(id: number): void {
		const ids = this.pending_ids;
		const len = this.pending_count;
		for (let i = 0; i < len; i++) {
			if (ids[i] === id) {
				ids[i] = ids[len - 1];
				this.pending_count = len - 1;
				return;
			}
		}
	}

	/** check if an id is in the pending_ids array. */
	private pending_has(id: number): boolean {
		const ids = this.pending_ids;
		for (let i = 0; i < this.pending_count; i++) {
			if (ids[i] === id) return true;
		}
		return false;
	}

	/** normalize link reference label: collapse whitespace, lowercase. */
	private normalize_label(label: string): string {
		return label.trim().replace(/\s+/g, " ").toLowerCase();
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
		const length = source.length;

		// must match "import " or "import{" at pos
		// "import" = [105, 109, 112, 111, 114, 116]
		if (pos + 6 >= length && !this.finished) return false; // stall - need at least "import " + something

		if (
			source.charCodeAt(pos + 1) !== 109 /* m */ ||
			source.charCodeAt(pos + 2) !== 112 /* p */ ||
			source.charCodeAt(pos + 3) !== 111 /* o */ ||
			source.charCodeAt(pos + 4) !== 114 /* r */ ||
			source.charCodeAt(pos + 5) !== 116 /* t */
		)
			return null;

		const after_import = source.charCodeAt(pos + 6);
		if (after_import !== SPACE && after_import !== OPEN_BRACE) return null;

		// scan to end of line
		let p = pos + 6;
		while (p < length && source.charCodeAt(p) !== LINEFEED) {
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
	 * try to parse a block-level directive at `pos`.
	 * returns:
	 *   - `{ kind: 'leaf' | 'container', colons, name, name_start, name_end, content_start, content_end, end }`
	 *     on success (`content_start === -1` means no `[content]`)
	 *   - `null` if not a directive
	 *   - `false` if we need more input (stall)
	 */
	private try_parse_block_directive(pos: number):
		| {
				kind: "leaf" | "container";
				colons: number;
				name: string;
				content_start: number;
				content_end: number;
				end: number;
		  }
		| null
		| false {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// count colons
		let colon_count = 0;
		while (p < length && source.charCodeAt(p) === COLON) {
			colon_count++;
			p++;
		}

		// need at least 2 colons for block directive
		if (colon_count < 2) return null;

		// stall if at end of buffer - more colons or name may come
		if (p >= length && !this.finished) return false;

		// must be followed by a letter (start of name)
		if (p >= length) return null;
		const first = source.charCodeAt(p);
		if (!((first >= 97 && first <= 122) || (first >= 65 && first <= 90))) {
			return null;
		}

		// scan name
		const name_start = p;
		while (p < length && this.is_directive_name_char(source.charCodeAt(p))) {
			p++;
		}

		// stall if name extends to end of buffer
		if (p >= length && !this.finished) return false;

		const name = source.slice(name_start, p);
		const kind = colon_count >= 3 ? ("container" as const) : ("leaf" as const);

		// check for [content]
		let content_start = -1;
		let content_end = -1;

		if (p < length && source.charCodeAt(p) === OPEN_SQUARE_BRACKET) {
			p++; // skip [
			content_start = p;
			let bracket_depth = 1;
			while (p < length && bracket_depth > 0) {
				const ch = source.charCodeAt(p);
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
			content_end = p;
			p++; // skip ]
		}

		// skip trailing whitespace
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		) {
			p++;
		}

		// in incremental mode, stall until we see the end of line
		if (p >= length && !this.finished) return false;

		// must be at end of line (or end of input)
		if (p < length && source.charCodeAt(p) !== LINEFEED) {
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
			end: p,
		};
	}

	/**
	 * check if position starts a block directive closing fence.
	 * returns the end position (after newline) or -1 if not a closing fence.
	 * returns -2 if more input needed.
	 */
	private try_parse_directive_close(pos: number, min_colons: number): number {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// count colons
		let colon_count = 0;
		while (p < length && source.charCodeAt(p) === COLON) {
			colon_count++;
			p++;
		}

		if (colon_count < min_colons) return -1;

		// stall if at end of buffer
		if (p >= length && !this.finished) return -2;

		// skip trailing whitespace
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		) {
			p++;
		}

		// in incremental mode, stall until we see the end of line
		if (p >= length && !this.finished) return -2;

		// must be at end of line or end of input
		if (p < length && source.charCodeAt(p) !== LINEFEED) return -1;
		if (p < length) p++; // consume newline

		return p;
	}

	private chomp(count: number, replace: boolean = false): void {
		if (replace) {
			this.cursor = count;
		} else {
			this.cursor += count;
		}

		if (count > 1 || replace) {
			this.prev = classify(this.source.charCodeAt(this.cursor - 1));
			this.current = classify(this.source.charCodeAt(this.cursor));
			this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
		} else {
			this.prev = this.current;
			this.current = this.next_class;
			this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
		}
	}

	/** fast path for the common case: advance cursor by 1. */
	private chomp1(): void {
		this.cursor++;
		this.prev = this.current;
		this.current = this.next_class;
		this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
	}

	/**
	 * count leading whitespace columns starting at `pos`.
	 * spaces count as 1 column, tabs count as `tab_size` columns.
	 * returns total columns and the position after the whitespace.
	 */
	private count_indent(pos: number): { columns: number; end: number } {
		const source = this.source;
		const length = source.length;
		const ts = this.tab_size;
		let columns = 0;
		while (pos < length) {
			const ch = source.charCodeAt(pos);
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
	 * skip enough whitespace characters starting at `pos` to consume
	 * at least `target` columns. returns the position after skipping.
	 */
	private skip_columns(pos: number, target: number): number {
		const source = this.source;
		const length = source.length;
		const ts = this.tab_size;
		let columns = 0;
		while (pos < length && columns < target) {
			const ch = source.charCodeAt(pos);
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
		const length = source.length;

		// inside a block quote the paragraph boundary depends on the `>`
		// markers and the space that follows them. until the full prefix
		// is visible, skip_bq_markers can mis-strip. require the complete
		// next line to avoid under-reading the continuation prefix.
		if (this.block_quote_depth > 0) {
			for (let p = pos + 1; p < length; p++) {
				if (source.charCodeAt(p) === LINEFEED) return true;
			}
			return false;
		}

		let p = pos + 1;
		// skip leading whitespace on the next line.
		while (p < length) {
			const ch = source.charCodeAt(p);
			if (ch !== SPACE && ch !== TAB) break;
			p++;
		}
		if (p >= length) {
			// whole next line is whitespace-to-eob: need more input unless
			// the source is finished (in which case it's a blank line).
			return this.finished;
		}
		const ch = source.charCodeAt(p);
		// blank line is an immediate decision.
		if (ch === LINEFEED) return true;
		// full next-line scan for an easy fast path - if a linefeed is
		// reachable, we have the whole line and can decide anything.
		for (let q = p + 1; q < length; q++) {
			if (source.charCodeAt(q) === LINEFEED) return true;
		}
		// partial next line (no trailing linefeed yet). we can still
		// decide for unambiguous first-char cases.
		switch (ch) {
			case OCTOTHERP:
				// heading needs at least `#` + one lookahead char
				// (distinguishes `# x` heading from `#x` paragraph).
				return p + 1 < length;
			case CLOSE_ANGLE_BRACKET:
				// block quote - immediate.
				return true;
			case BACKTICK:
				// code fence needs three backticks visible.
				return (
					p + 2 < length &&
					source.charCodeAt(p + 1) === BACKTICK &&
					source.charCodeAt(p + 2) === BACKTICK
				);
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
						const qch = source.charCodeAt(q);
						if (qch === LINEFEED) return true;
						if (qch !== ch && qch !== SPACE && qch !== TAB) return true;
					}
				}
				return false;
			case PLUS:
				// plus is only ever a list marker - no thematic break ambiguity.
				// one char of lookahead is enough inside a list.
				if (this.list_depth > 0 && p + 1 < length) return true;
				return false;
			case UNDERSCORE:
			case OPEN_ANGLE_BRACKET:
			case OPEN_SQUARE_BRACKET:
			case PIPE:
			case OPEN_BRACE:
			case COLON:
				// genuinely ambiguous - need to see the rest of the line.
				return false;
			default:
				// digits may start an ordered list marker. inside a list we
				// can decide early: scan the digit run, then look for the
				// `.`/`)` delimiter and one char of lookahead. if the digit
				// run hits a non-digit non-delimiter char, it's clearly not
				// a marker - paragraph continues.
				if (ch >= 48 && ch <= 57) {
					if (this.list_depth === 0) return false;
					let q = p + 1;
					while (
						q < length &&
						source.charCodeAt(q) >= 48 &&
						source.charCodeAt(q) <= 57
					)
						q++;
					if (q >= length) return false;
					const dch = source.charCodeAt(q);
					if (dch !== DOT && dch !== CLOSE_PAREN) return true; // not a marker - continue paragraph
					return q + 1 < length;
				}
				// everything else (letters, punctuation, etc.) cannot
				// start a block - the paragraph continues.
				return true;
		}
	}

	private is_heading_start(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		while (
			pos < length &&
			(source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)
		) {
			pos++;
		}
		if (pos >= length || source.charCodeAt(pos) !== OCTOTHERP) return false;
		let count = 0;
		while (pos < length && source.charCodeAt(pos) === OCTOTHERP) {
			count++;
			pos++;
		}
		if (count > 6) return false;
		const ch = source.charCodeAt(pos);
		return pos >= length || ch === SPACE || ch === TAB || ch === LINEFEED;
	}

	private is_blank_line_after(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		let p = pos + 1;
		while (p < length && source.charCodeAt(p) !== LINEFEED) {
			const ch = source.charCodeAt(p);
			if (ch !== SPACE && ch !== TAB) return false;
			p++;
		}
		// hit end-of-buffer without \n, not a confirmed blank line in feed mode
		if (p >= length && !this.finished) return false;
		return true;
	}

	private is_thematic_break_start(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		let spaces = 0;
		while (pos < length && source.charCodeAt(pos) === SPACE) {
			spaces++;
			pos++;
		}
		if (spaces > 3) return false;

		if (pos >= length) return false;

		const marker = source.charCodeAt(pos);
		if (marker !== ASTERISK && marker !== DASH && marker !== UNDERSCORE)
			return false;

		let count = 0;
		while (pos < length && source.charCodeAt(pos) !== LINEFEED) {
			const ch = source.charCodeAt(pos);
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
		const length = source.length;
		for (let i = 0; i < depth; i++) {
			while (
				pos < length &&
				(source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)
			) {
				pos++;
			}
			if (pos >= length || source.charCodeAt(pos) !== CLOSE_ANGLE_BRACKET)
				return -1;
			pos++;
			if (pos < length && source.charCodeAt(pos) === SPACE) pos++;
		}
		return pos;
	}

	private is_block_quote_start(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		while (
			pos < length &&
			(source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)
		) {
			pos++;
		}
		return pos < length && source.charCodeAt(pos) === CLOSE_ANGLE_BRACKET;
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
		bq_depth: number,
	): number {
		const source = this.source;
		const length = source.length;
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
				(source.charCodeAt(fp) === SPACE || source.charCodeAt(fp) === TAB)
			)
				fp++;
			let bt = 0;
			while (fp < length && source.charCodeAt(fp) === BACKTICK) {
				bt++;
				fp++;
			}
			if (bt >= fence_len) return 1;
			// advance to next line.
			let nl = stripped;
			while (nl < length && source.charCodeAt(nl) !== LINEFEED) nl++;
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
		const length = source.length;
		while (pos < length && source.charCodeAt(pos) !== LINEFEED) {
			const ch = source.charCodeAt(pos);
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
		const length = source.length;
		let p = pos;

		// skip leading whitespace once
		while (p < length) {
			const ch = source.charCodeAt(p);
			if (ch !== SPACE && ch !== TAB) break;
			p++;
		}

		// end of buffer -> blank line only if finished
		if (p >= length) return this.finished;

		const ch = source.charCodeAt(p);

		// blank line
		if (ch === LINEFEED) return true;

		// svelte block boundary ({: or {/) interrupts paragraphs
		if (ch === OPEN_BRACE && this.is_svelte_block_boundary(p)) return true;

		// fast exit: first non-ws char can't start any block construct
		switch (ch) {
			case OCTOTHERP:
				return this.is_heading_start(pos);
			case CLOSE_ANGLE_BRACKET:
				return true;
			case BACKTICK:
				return (
					p + 2 < length &&
					source.charCodeAt(p + 1) === BACKTICK &&
					source.charCodeAt(p + 2) === BACKTICK
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
			case COLON:
				// :: or ::: starts a block directive
				return p + 1 < length && source.charCodeAt(p + 1) === COLON;
			default:
				if (ch >= 48 && ch <= 57) return this.is_list_item_start_interrupt(pos);
				return false;
		}
	}

	private try_parse_list_marker(pos: number): MarkerResult | null {
		const source = this.source;
		const length = source.length;
		if (pos >= length) return null;
		const start = pos;
		const ws = this.count_indent(pos);
		let indent = ws.columns;
		pos = ws.end;
		// no indent limit (commonmark limits to 0-3 because 4+ is indented code,
		// but pfm removes indented code blocks, indentation is insignificant)

		if (pos >= length) return null;
		const ch = source.charCodeAt(pos);

		// unordered: -, *, +
		if (ch === DASH || ch === ASTERISK || ch === PLUS) {
			// in incremental mode, don't accept a marker at end of buffer -
			// more characters may follow (e.g. `---` thematic break)
			if (pos + 1 >= length && !this.finished) return null;
			const after = source.charCodeAt(pos + 1);
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
				source.charCodeAt(pos) >= 48 &&
				source.charCodeAt(pos) <= 57
			) {
				pos++;
			}
			if (pos - num_start > 9) return null;

			if (pos >= length) return null;
			const delimiter = source.charCodeAt(pos);
			if (delimiter !== DOT && delimiter !== CLOSE_PAREN) return null;

			// in incremental mode, don't accept a marker at end of buffer
			if (pos + 1 >= length && !this.finished) return null;
			const after = source.charCodeAt(pos + 1);
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
				const num = parseInt(source.slice(num_start, pos), 10);
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
		const length = source.length;
		const marker = this.try_parse_list_marker(pos);
		if (!marker) return false;
		if (this.list_depth > 0) return true;
		if (marker.ordered && marker.start_num !== 1) return false;
		let p = marker.content_start;
		while (p < length && source.charCodeAt(p) !== LINEFEED) {
			if (source.charCodeAt(p) !== SPACE && source.charCodeAt(p) !== TAB)
				return true;
			p++;
		}
		return false;
	}

	private start_list(marker: MarkerResult, parent: number): void {
		// save current list state for nesting
		if (this.list_depth > 0) {
			this.list_state_stack.push({
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
		this.list_pending_paras = [];

		const list_id = this.emit_open(NodeKind.list, this.cursor, parent);
		this.node_stack.push(list_id);
		this.list_node_id = list_id;
		// emit ordered/start immediately so renderers pick the right tag
		// (<ol> vs <ul>) from the first frame instead of flipping at close.
		this.out.attr(list_id, "ordered", marker.ordered);
		this.out.attr(list_id, "start", marker.start_num);

		const item_id = this.emit_open(NodeKind.list_item, this.cursor, list_id);
		this.node_stack.push(item_id);

		this.states.push(StateKind.list_item);
		this.chomp(marker.content_start, true);
	}

	/**
	 * eegister a pending paragraph that was opened inside a list_item -
	 * the wrapper is speculative until the list closes (tight -> unwrap,
	 * loose -> commit).
	 */
	private track_list_pending_para(id: number): void {
		this.list_pending_paras.push(id);
	}

	/**
	 * promote all pending list-item paragraphs in the current list to
	 * committed. called when a blank line makes the list loose - the
	 * wrappers are now real paragraphs that renderers should show.
	 */
	private commit_list_pending_paras(): void {
		for (let i = 0; i < this.list_pending_paras.length; i++) {
			const pid = this.list_pending_paras[i];
			this.out.commit(pid);
			this.pending_remove(pid);
		}
		this.list_pending_paras.length = 0;
	}

	/**
	 * at list close, resolve every pending paragraph collected for this
	 * list. tight -> revoke (unwrap wrapper, text becomes direct child of
	 * list_item). loose -> commit (wrapper stays).
	 */
	private finalize_list_pending_paras(): void {
		const loose = this.list_is_loose;
		for (let i = 0; i < this.list_pending_paras.length; i++) {
			const pid = this.list_pending_paras[i];
			if (loose) {
				this.out.commit(pid);
			} else {
				this.out.revoke(pid);
			}
			this.pending_remove(pid);
		}
		this.list_pending_paras.length = 0;
	}

	private end_list(): void {
		// finalize every pending list-item paragraph for this list.
		this.finalize_list_pending_paras();

		// close list_item
		const item_id = this.node_stack[this.node_stack.length - 1];
		this.emit_close(item_id, this.cursor);
		this.node_stack.pop();

		// set list metadata and close. ordered/start were emitted at
		// start_list - only tightness is known here.
		const list_id = this.node_stack[this.node_stack.length - 1];
		this.out.attr(list_id, "tight", !this.list_is_loose);
		this.emit_close(list_id, this.cursor);
		this.node_stack.pop();

		this.states.pop();
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
			this.list_pending_paras = [];
		}
	}

	/**
	 * open a svelte_block + first svelte_branch from a {#tag expr} token.
	 */
	private start_svelte_block(
		token: {
			kind: "#" | ":" | "/";
			tag: string;
			expr_start: number;
			expr_end: number;
			end: number;
		},
		parent: number,
	): void {
		// save current svelte block state for nesting
		if (this.svelte_block_depth > 0) {
			this.svelte_block_stack.push({
				block_id: this.svelte_block_id,
				branch_id: this.svelte_branch_id,
				tag: this.svelte_block_tag,
			});
		}

		this.svelte_block_depth++;
		this.svelte_block_tag = token.tag;

		// open svelte_block
		const block_id = this.emit_open(
			NodeKind.svelte_block,
			this.cursor,
			parent,
		);
		this.out.attr(block_id, "tag", token.tag);
		this.svelte_block_id = block_id;
		this.node_stack.push(block_id);

		// open first svelte_branch
		const branch_id = this.emit_open(
			NodeKind.svelte_branch,
			this.cursor,
			block_id,
		);
		this.out.attr(branch_id, "tag", token.tag);
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
		const length = source.length;
		let p = pos;
		let ch = source.charCodeAt(p);

		if (!((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122))) return -1;
		p++;

		let scheme_len = 1;
		while (p < length && scheme_len <= 32) {
			ch = source.charCodeAt(p);
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

		if (scheme_len < 2 || source.charCodeAt(p) !== COLON) return -1;
		p++;

		while (p < length) {
			ch = source.charCodeAt(p);
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
		return tag === "script" || tag === "style";
	}

	/**
	 * scan forward from `pos` for the case-sensitive closing tag `</tag>`.
	 * returns the end position (after `>`) or -1 if not found / input incomplete.
	 */
	private find_raw_close_tag(
		pos: number,
		tag: string,
	): { content_end: number; end: number } | null {
		const source = this.source;
		const length = source.length;
		const needle = "</" + tag + ">";
		let scan = pos;
		while (scan < length) {
			const idx = source.indexOf(needle, scan);
			if (idx === -1) return null;
			return { content_end: idx, end: idx + needle.length };
		}
		return null;
	}

	/**
	 * try to parse an html opening tag starting at pos (the char after `<`).
	 * returns null if not a valid tag.
	 */
	private try_parse_html_open_tag(pos: number): {
		tag: string;
		attributes: Record<string, string | boolean | { type: "expression"; value: string }>;
		self_closing: boolean;
		end: number;
	} | null {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// tag name must start with a letter or underscore
		if (p >= length || !this.is_tag_name_start(source.charCodeAt(p)))
			return null;

		const tag_start = p;
		p++;
		while (p < length && this.is_tag_name_char(source.charCodeAt(p))) p++;
		const tag = source.slice(tag_start, p);

		// parse attributes
		const attributes: Record<string, string | boolean | { type: "expression"; value: string }> = {};

		while (p < length) {
			// skip whitespace
			while (
				p < length &&
				(source.charCodeAt(p) === SPACE ||
					source.charCodeAt(p) === TAB ||
					source.charCodeAt(p) === LINEFEED)
			)
				p++;

			if (p >= length) return null;

			// check for end of tag
			if (source.charCodeAt(p) === SLASH) {
				if (
					p + 1 < length &&
					source.charCodeAt(p + 1) === CLOSE_ANGLE_BRACKET
				) {
					return { tag, attributes, self_closing: true, end: p + 2 };
				}
				return null; // stray /
			}

			if (source.charCodeAt(p) === CLOSE_ANGLE_BRACKET) {
				return { tag, attributes, self_closing: false, end: p + 1 };
			}

			// svelte shorthand attribute: {name}
			if (source.charCodeAt(p) === OPEN_BRACE) {
				const expr_end = this.find_matching_brace(p + 1);
				if (expr_end === -1) return null;
				const expr = source.slice(p + 1, expr_end - 1);
				attributes[expr] = { type: "expression", value: expr };
				p = expr_end;
				continue;
			}

			// parse attribute name
			const attr_name_start = p;
			const ch = source.charCodeAt(p);
			// attribute name: anything that's not whitespace, =, >, /
			if (ch === EQUALS || ch === CLOSE_ANGLE_BRACKET || ch === SLASH) {
				return null; // invalid attribute start
			}

			while (
				p < length &&
				source.charCodeAt(p) !== SPACE &&
				source.charCodeAt(p) !== TAB &&
				source.charCodeAt(p) !== LINEFEED &&
				source.charCodeAt(p) !== EQUALS &&
				source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET &&
				source.charCodeAt(p) !== SLASH
			) {
				p++;
			}

			if (p === attr_name_start) return null;
			const attr_name = source.slice(attr_name_start, p);

			// skip whitespace before potential =
			while (
				p < length &&
				(source.charCodeAt(p) === SPACE ||
					source.charCodeAt(p) === TAB ||
					source.charCodeAt(p) === LINEFEED)
			)
				p++;

			if (p < length && source.charCodeAt(p) === EQUALS) {
				p++; // skip =
				// skip whitespace after =
				while (
					p < length &&
					(source.charCodeAt(p) === SPACE ||
						source.charCodeAt(p) === TAB ||
						source.charCodeAt(p) === LINEFEED)
				)
					p++;

				if (p >= length) return null;

				const quote = source.charCodeAt(p);
				if (quote === OPEN_BRACE) {
					// svelte expression attribute value: attr={expr}
					const expr_end = this.find_matching_brace(p + 1);
					if (expr_end === -1) return null;
					attributes[attr_name] = { type: "expression", value: source.slice(p + 1, expr_end - 1) };
					p = expr_end;
				} else if (quote === QUOTE || quote === APOSTROPHE) {
					// quoted value
					p++; // skip opening quote
					const value_start = p;
					while (p < length && source.charCodeAt(p) !== quote) p++;
					if (p >= length) return null; // unclosed quote
					const value = source.slice(value_start, p);
					p++; // skip closing quote
					attributes[attr_name] = value;
				} else {
					// unquoted value
					const value_start = p;
					while (p < length && this.is_unquoted_attr_char(source.charCodeAt(p)))
						p++;
					if (p === value_start) return null; // empty unquoted value
					attributes[attr_name] = source.slice(value_start, p);
				}
			} else {
				// boolean attribute
				attributes[attr_name] = true;
			}
		}

		return null; // ran off end of input
	}

	/**
	 * try to parse an html closing tag starting at pos (the char after `<`).
	 * pos should point to the `/` in `</tag>`.
	 * returns the tag name and end position, or null.
	 */
	private try_parse_html_close_tag(
		pos: number,
	): { tag: string; end: number } | null {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// must start with /
		if (p >= length || source.charCodeAt(p) !== SLASH) return null;
		p++;

		// optional whitespace after /
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		)
			p++;

		// tag name
		if (p >= length || !this.is_tag_name_start(source.charCodeAt(p)))
			return null;
		const tag_start = p;
		p++;
		while (p < length && this.is_tag_name_char(source.charCodeAt(p))) p++;
		const tag = source.slice(tag_start, p);

		// optional whitespace before >
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		)
			p++;

		// must end with >
		if (p >= length || source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET)
			return null;
		return { tag, end: p + 1 };
	}

	/**
	 * ty to parse an html comment starting at pos (the char after `<`).
	 * pos should point to the `!` in `<!--`.
	 * returns the content start, content end, and end position.
	 */
	private try_parse_html_comment(
		pos: number,
	):
		| { content_start: number; content_end: number; end: number }
		| null
		| false {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// must be <!--
		if (
			source.charCodeAt(p) !== EXCLAMATION_MARK ||
			source.charCodeAt(p + 1) !== DASH ||
			source.charCodeAt(p + 2) !== DASH
		) {
			if (p + 2 >= length && !this.finished) return false;
			return null;
		}
		p += 3;
		const content_start = p;

		// scan for -->
		while (p + 2 < length) {
			if (
				source.charCodeAt(p) === DASH &&
				source.charCodeAt(p + 1) === DASH &&
				source.charCodeAt(p + 2) === CLOSE_ANGLE_BRACKET
			) {
				return { content_start, content_end: p, end: p + 3 };
			}
			p++;
		}

		if (!this.finished) return false; // need more input
		return null; // no closing -->
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

	/**
	 * close an inline html element by unwinding state/node stacks.
	 */
	private close_html_inline(html_id: number, end: number): void {
		// unwind the node stack and state stack to find and close this html element
		while (this.node_stack.length > 1) {
			const top_id = this.node_stack[this.node_stack.length - 1];
			const top_state = this.states[this.states.length - 1];

			if (top_id === html_id) {
				// found the html element - commit and close it
				this.pending_remove(html_id);
				this.emit_close(html_id, end);
				this.node_stack.pop();
				this.states.pop(); // pop html_element state
				// pop trailing inline state if present
				if (this.states[this.states.length - 1] === StateKind.inline) {
					this.states.pop();
				}
				return;
			}

			// close intermediate nodes (text, emphasis, etc.)
			if (!this.closed_flags[top_id]) {
				this.out.set_value_end(top_id, this.cursor);
				this.emit_close(top_id, this.cursor);
			}
			this.node_stack.pop();
			this.states.pop();
		}
	}

	/**
	 * try to parse a svelte block token at `pos` (pointing at `{`).
	 * returns null if not a svelte block token.
	 * recognizes: {#tag expr}, {:tag expr}, {/tag}
	 */
	private try_parse_svelte_block_token(pos: number): {
		kind: "#" | ":" | "/";
		tag: string;
		expr_start: number;
		expr_end: number;
		end: number;
	} | null {
		const source = this.source;
		const length = source.length;
		if (pos >= length || source.charCodeAt(pos) !== OPEN_BRACE) return null;
		let p = pos + 1;
		if (p >= length) return null;
		const sigil = source.charCodeAt(p);
		if (sigil !== OCTOTHERP && sigil !== COLON && sigil !== SLASH) return null;
		const kind_ch = sigil === OCTOTHERP ? "#" : sigil === COLON ? ":" : "/";
		p++;

		// tag name
		const tag_start = p;
		while (
			p < length &&
			source.charCodeAt(p) !== SPACE &&
			source.charCodeAt(p) !== TAB &&
			source.charCodeAt(p) !== CLOSE_BRACE
		)
			p++;
		if (p === tag_start) return null;
		let tag = source.slice(tag_start, p);

		// handle {:else if expr} - "else if" is a compound tag name
		if (kind_ch === ":" && tag === "else") {
			const save = p;
			while (
				p < length &&
				(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
			)
				p++;
			if (
				p + 1 < length &&
				source.charCodeAt(p) === 105 /* i */ &&
				source.charCodeAt(p + 1) === 102 /* f */ &&
				(p + 2 >= length ||
					source.charCodeAt(p + 2) === SPACE ||
					source.charCodeAt(p + 2) === TAB ||
					source.charCodeAt(p + 2) === CLOSE_BRACE)
			) {
				tag = "else if";
				p += 2;
			} else {
				p = save;
			}
		}

		if (kind_ch === "/") {
			// {/tag} - no expression
			while (
				p < length &&
				(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
			)
				p++;
			if (p >= length || source.charCodeAt(p) !== CLOSE_BRACE) return null;
			return { kind: kind_ch, tag, expr_start: 0, expr_end: 0, end: p + 1 };
		}

		// skip whitespace after tag name
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		)
			p++;

		if (p < length && source.charCodeAt(p) === CLOSE_BRACE) {
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
		if (pos >= source.length || source.charCodeAt(pos) !== OPEN_BRACE)
			return false;
		const next = source.charCodeAt(pos + 1);
		return next === COLON || next === SLASH;
	}

	/**
	 * find the matching closing brace for a svelte expression.
	 * pos should point to the char after the opening `{`.
	 * tracks nested braces and skips over string literals and template literals.
	 * returns the position just past the closing `}`, or -1 if not found.
	 */
	private find_matching_brace(pos: number): number {
		const source = this.source;
		const length = source.length;
		let depth = 1;
		let p = pos;

		while (p < length) {
			const ch = source.charCodeAt(p);

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
					// skip string literal
					p++;
					while (p < length && source.charCodeAt(p) !== ch) {
						if (source.charCodeAt(p) === BACKSLASH) p++; // skip escaped char
						p++;
					}
					if (p < length) p++; // skip closing quote
					break;
				}
				case BACKTICK: {
					// skip template literal, respecting ${} interpolations
					p++;
					while (p < length && source.charCodeAt(p) !== BACKTICK) {
						if (source.charCodeAt(p) === BACKSLASH) {
							p++;
						} else if (
							source.charCodeAt(p) === 36 /* $ */ &&
							p + 1 < length &&
							source.charCodeAt(p + 1) === OPEN_BRACE
						) {
							p += 2; // skip ${
							// recursively find the matching } for the interpolation
							const inner_end = this.find_matching_brace(p);
							if (inner_end === -1) return -1;
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
					if (p + 1 < length && source.charCodeAt(p + 1) === SLASH) {
						p += 2;
						while (p < length && source.charCodeAt(p) !== LINEFEED) p++;
						break;
					}
					// skip /* block comments */
					if (p + 1 < length && source.charCodeAt(p + 1) === ASTERISK) {
						p += 2;
						while (p < length) {
							if (
								source.charCodeAt(p) === ASTERISK &&
								p + 1 < length &&
								source.charCodeAt(p + 1) === SLASH
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

		return -1;
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
		const length = source.length;
		let p = pos;

		// skip optional leading whitespace
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		)
			p++;

		// must start with [
		if (p >= length) return this.finished ? -1 : -2;
		if (source.charCodeAt(p) !== OPEN_SQUARE_BRACKET) return -1;
		p++;

		// parse label - no line breaks, no empty label
		const label_start = p;
		while (p < length) {
			const ch = source.charCodeAt(p);
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

		const label = source.slice(label_start, p);
		p++; // skip ]

		// must have : immediately after ]
		if (p >= length) return this.finished ? -1 : -2;
		if (source.charCodeAt(p) !== COLON) return -1;
		p++;

		// skip optional whitespace (including at most one line break)
		let saw_newline = false;
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		)
			p++;
		if (p < length && source.charCodeAt(p) === LINEFEED) {
			saw_newline = true;
			p++;
			while (
				p < length &&
				(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
			)
				p++;
		}

		// parse destination
		if (p >= length) return this.finished ? -1 : -2;

		let url_start: number, url_end: number;
		const dest_ch = source.charCodeAt(p);

		if (dest_ch === OPEN_ANGLE_BRACKET) {
			// angle-bracket destination: <url>
			p++;
			url_start = p;
			while (p < length) {
				const ch = source.charCodeAt(p);
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
				const ch = source.charCodeAt(p);
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

		const url = source.slice(url_start, url_end);

		// skip optional whitespace before title (no line break yet)
		const pre_title_p = p;
		while (
			p < length &&
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		)
			p++;
		const had_title_ws = p > pre_title_p;

		// check for optional title
		let title = "";
		if (p < length) {
			const tc = source.charCodeAt(p);
			if (tc === LINEFEED) {
				// newline after url - check if next line has a title
				const nl_p = p;
				p++;
				while (
					p < length &&
					(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
				)
					p++;
				if (p < length) {
					const ntc = source.charCodeAt(p);
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
			(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
		)
			p++;
		if (p >= length && !this.finished) return -2; // need to see end of line
		if (p < length && source.charCodeAt(p) !== LINEFEED) return -1;
		if (p < length) p++; // skip newline

		// store definition - first one wins
		const normalized = this.normalize_label(label);
		if (normalized && !this.ref_map.has(normalized)) {
			this.ref_map.set(normalized, { url, title });
		}

		return p;
	}

	/**
	 * parse a title string starting at pos. handles "...", '...', (...)
	 * including multi-line titles (but not across blank lines).
	 * returns { title, end } or null on failure.
	 */
	private parse_ref_title(
		pos: number,
	): { title: string; end: number } | null | -2 {
		const source = this.source;
		const length = source.length;

		const tc = source.charCodeAt(pos);
		if (tc !== 34 && tc !== 39 && tc !== OPEN_PAREN) return null;
		const close_char = tc === OPEN_PAREN ? CLOSE_PAREN : tc;

		let p = pos + 1;
		const title_start = p;

		while (p < length) {
			const ch = source.charCodeAt(p);
			if (ch === close_char) {
				const title = source.slice(title_start, p);
				return { title, end: p + 1 };
			}
			if (ch === LINEFEED) {
				// check for blank line - that terminates the title (invalid)
				let q = p + 1;
				while (
					q < length &&
					(source.charCodeAt(q) === SPACE || source.charCodeAt(q) === TAB)
				)
					q++;
				if (q < length && source.charCodeAt(q) === LINEFEED) return null; // blank line
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
		const length = source.length;

		let hash_count = 1;
		let pos = this.cursor + 1;
		while (pos < length && source.charCodeAt(pos) === OCTOTHERP) {
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

		const after_hash = source.charCodeAt(pos);
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
				(source.charCodeAt(content_start) === SPACE ||
					source.charCodeAt(content_start) === TAB)
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
			hash_count,
		);
		this.out.set_value_start(h_id, content_start);
		this.node_stack.push(h_id);
		this.in_heading = true;
		this.states.push(StateKind.heading_marker);
		this.chomp(content_start, true);
		return true;
	}

	// returns true when a linefeed inside a delimiter state (emphasis,
	// strong, strikethrough, superscript, subscript) was consumed by a
	// block interrupt or blockquote boundary. caller should `continue
	// main_loop` when true.
	private _delimiter_lf_close(current_node: number): boolean {
		if (this.block_quote_depth > 0) {
			const next_pos = this.cursor + 1;
			const stripped = this.skip_bq_markers(
				next_pos,
				this.block_quote_depth,
			);

			if (
				stripped !== -1 &&
				!this.is_blank_at_pos(stripped) &&
				!this.is_heading_start(stripped) &&
				!this.is_thematic_break_start(stripped)
			) {
				const sb = this.emit_open(
					NodeKind.soft_break,
					this.cursor,
					current_node,
				);
				this.emit_close(sb, this.cursor + 1);
				this.chomp(stripped, true);
				this.states.push(StateKind.inline);
			} else {
				this.states.pop();
				this.emit_close(current_node, this.cursor);
				this.out.set_value_end(current_node, this.cursor);
				this.node_stack.pop();
			}
			return true;
		}

		if (
			this.is_blank_line_after(this.cursor) ||
			this.is_heading_start(this.cursor + 1) ||
			this.is_thematic_break_start(this.cursor + 1)
		) {
			this.states.pop();
			this.emit_close(current_node, this.cursor);
			this.out.set_value_end(current_node, this.cursor);
			this.node_stack.pop();
			return true;
		}

		return false;
	}

	// main loop

	private _run(): void {
		const source = this.source;
		const length = source.length;

		// reset progress counter,  new data may have been fed since last _run()
		this.loop_without_progress = 0;
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
			if (this.pending_count > 0) {
				const st = this.states[this.states.length - 1];
				if (
					st === StateKind.root ||
					st === StateKind.block_quote ||
					st === StateKind.list_item
				) {
					let write = 0;
					for (let pi = 0; pi < this.pending_count; pi++) {
						const pid = this.pending_ids[pi];
						const pkind = this.NodeKind_array[pid];
						if (pkind === NodeKind.paragraph) {
							// preserve - finalize_list_pending_para owns this one.
							this.pending_ids[write] = pid;
							this.pending_starts[write] = this.pending_starts[pi];
							write++;
							continue;
						}
						if (pkind === NodeKind.html) {
							const pstart = this.pending_starts[pi];
							let pend = pstart;
							while (pend < length && source.charCodeAt(pend) !== LINEFEED)
								pend++;
							this.out.revoke(pid, source.slice(pstart, pend));
						} else {
							this.out.revoke(pid);
						}
					}
					this.pending_count = write;
				}
			}

			const active = this.states[this.states.length - 1];
			const code = source.charCodeAt(this.cursor);

			const current_node = this.node_stack[this.node_stack.length - 1];

			if ((++iter_count & 63) === 0) {
				if (this.cursor === this.prev_cursor) {
					this.loop_without_progress += 64;
					if (this.loop_without_progress > 100) {
						console.error("Infinite loop detected");
						break;
					}
				} else {
					this.loop_without_progress = 0;
				}
				this.prev_cursor = this.cursor;
			}

			switch (active) {
				case StateKind.root: {
					if (code !== code) {
						this.chomp1();
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
						(length < 2 || source.charCodeAt(1) === DASH) &&
						(length < 3 || source.charCodeAt(2) === DASH)
					) {
						break main_loop;
					}
					if (
						this.cursor === 0 &&
						!this.frontmatter_failed &&
						code === DASH &&
						source.charCodeAt(1) === DASH &&
						source.charCodeAt(2) === DASH
					) {
						const ch3 = source.charCodeAt(3);
						if (ch3 === LINEFEED || ch3 !== ch3 /* nan = eof */) {
							// need at least the opening `---\n` before we commit
							if (!this.finished && length < 4) break main_loop;
							this.states.push(StateKind.frontmatter);
							const fm_id = this.emit_open(
								NodeKind.frontmatter,
								0,
								current_node,
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
							const imp_id = this.emit_open(
								NodeKind.import_statement,
								this.cursor,
								current_node,
							);
							this.out.set_value_start(imp_id, imp.value_start);
							this.out.set_value_end(imp_id, imp.value_end);
							this.emit_close(imp_id, imp.end);
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
							const id = this.emit_open(
								NodeKind.line_break,
								this.cursor,
								current_node,
							);
							this.emit_close(id, this.cursor + 1);
							this.chomp1();
							continue;
						}

						case SPACE:
						case TAB: {
							let pos = this.cursor;
							while (
								pos < length &&
								(source.charCodeAt(pos) === SPACE ||
									source.charCodeAt(pos) === TAB)
							) {
								pos++;
							}
							if (pos >= length && !this.finished) break main_loop;
							if (pos < length && source.charCodeAt(pos) === LINEFEED) {
								const id = this.emit_open(
									NodeKind.line_break,
									this.cursor,
									current_node,
								);
								this.emit_close(id, pos + 1);
								this.chomp(pos + 1, true);
								continue;
							}
							this.chomp1();
							continue;
						}

						case OCTOTHERP: {
							if (!this.start_heading(current_node)) break main_loop;
							continue;
						}

						case BACKTICK: {
							this.states.push(StateKind.code_fence_start);
							this.extra = 0;
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
							if (!this.finished) {
								let could_be_tb = true;
								for (let p = this.cursor + 1; p < length; p++) {
									const ch = source.charCodeAt(p);
									if (ch === LINEFEED) {
										could_be_tb = false;
										break;
									}
									if (ch !== code && ch !== SPACE && ch !== TAB) {
										could_be_tb = false;
										break;
									}
								}
								if (could_be_tb) break main_loop;
							}
							if (this.is_thematic_break_start(this.cursor)) {
								let line_end = this.cursor;
								while (
									line_end < length &&
									source.charCodeAt(line_end) !== LINEFEED
								) {
									line_end++;
								}
								const break_end = line_end < length ? line_end + 1 : line_end;

								const tb_id = this.emit_open(
									NodeKind.thematic_break,
									this.cursor,
									current_node,
								);
								this.emit_close(tb_id, break_end);

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
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_ANGLE_BRACKET: {
							// in incremental mode, stall if the tag might be incomplete
							// (no closing > visible in the available source).
							if (
								!this.finished &&
								source.indexOf(">", this.cursor + 1) === -1
							) {
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
									current_node,
								);
								this.node_stack.push(auto_para);
								continue;
							}

							// try html comment at block level
							const blk_comment = this.try_parse_html_comment(this.cursor + 1);
							if (blk_comment === false) break main_loop;
							if (blk_comment) {
								const c_id = this.emit_open(
									NodeKind.html_comment,
									this.cursor,
									current_node,
								);
								this.out.text(
									c_id,
									blk_comment.content_start,
									blk_comment.content_end,
								);
								this.emit_close(c_id, blk_comment.end);
								this.chomp(blk_comment.end, true);
								continue;
							}

							// try html opening tag at block level
							const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
							if (blk_tag) {
								if (blk_tag.self_closing) {
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
									);
									this.out.attr(html_id, "tag", blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", blk_tag.attributes);
									}
									this.out.attr(html_id, "self_closing", true);
									this.emit_close(html_id, blk_tag.end);
									this.chomp(blk_tag.end, true);
								} else if (this.is_raw_text_tag(blk_tag.tag)) {
									// raw text elements (script, style): skip content, scan for close tag
									const raw = this.find_raw_close_tag(blk_tag.end, blk_tag.tag);
									if (!raw) {
										if (!this.finished) break main_loop;
										// eof without close tag - emit with remaining content as value
										const html_id = this.emit_open(
											NodeKind.html,
											this.cursor,
											current_node,
										);
										this.out.attr(html_id, "tag", blk_tag.tag);
										if (Object.keys(blk_tag.attributes).length > 0) {
											this.out.attr(html_id, "attributes", blk_tag.attributes);
										}
										this.out.set_value_start(html_id, blk_tag.end);
										this.out.set_value_end(html_id, length);
										this.emit_close(html_id, length);
										this.chomp(length, true);
									} else {
										const html_id = this.emit_open(
											NodeKind.html,
											this.cursor,
											current_node,
										);
										this.out.attr(html_id, "tag", blk_tag.tag);
										if (Object.keys(blk_tag.attributes).length > 0) {
											this.out.attr(html_id, "attributes", blk_tag.attributes);
										}
										this.out.set_value_start(html_id, blk_tag.end);
										this.out.set_value_end(html_id, raw.content_end);
										this.emit_close(html_id, raw.end);
										this.chomp(raw.end, true);
									}
								} else {
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
										0,
										true,
									);
									this.out.attr(html_id, "tag", blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", blk_tag.attributes);
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
								current_node,
							);
							this.node_stack.push(blk_para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && source.charCodeAt(p) === SPACE) p++;

							this.block_quote_depth++;
							const bq_id = this.emit_open(
								NodeKind.block_quote,
								this.cursor,
								current_node,
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
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_BRACE: {
							// svelte block opener: {#tag expr}
							if (!this.finished) {
								const probe = this.find_matching_brace(this.cursor + 1);
								if (probe === -1) break main_loop;
							}
							const token = this.try_parse_svelte_block_token(this.cursor);
							if (token && token.kind === "#") {
								this.start_svelte_block(token, current_node);
								continue;
							}
							// not a block - start paragraph (inline will handle {expr})
							this.states.push(StateKind.paragraph);
							const brace_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(brace_para);
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							// need a complete line for link ref definition detection
							if (!this.finished && source.indexOf("\n", this.cursor) === -1) {
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
								current_node,
							);
							this.node_stack.push(ref_para);
							continue;
						}

						case COLON: {
							// need a complete line for directive detection
							if (!this.finished && source.indexOf("\n", this.cursor) === -1) {
								break main_loop;
							}
							const dir = this.try_parse_block_directive(this.cursor);
							if (dir === false) break main_loop;
							if (dir !== null) {
								if (dir.kind === "leaf") {
									const d_id = this.emit_open(
										NodeKind.directive_leaf,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.emit_close(d_id, dir.end);
									this.chomp(dir.end, true);
								} else {
									const d_id = this.emit_open(
										NodeKind.directive_container,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.node_stack.push(d_id);
									this.states.push(StateKind.directive_container);
									this.directive_colon_counts.push(dir.colons);
									this.chomp(dir.end, true);
								}
								continue;
							}
							this.states.push(StateKind.paragraph);
							const colon_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(colon_para);
							continue;
						}

						default: {
							if (code === PLUS || (code >= 48 && code <= 57)) {
								// stall only while the marker prefix is still being
								// read. plus: one char of lookahead is enough (space
								// /tab/lf = marker, else paragraph). digits: skip the
								// digit run, then the delimiter char (. or )), then
								// one more char. try_parse_list_marker has the same
								// incremental safeguards and returns null when data
								// is insufficient, so this just prevents committing
								// to paragraph too eagerly.
								if (!this.finished) {
									let p = this.cursor + 1;
									if (code !== PLUS) {
										while (
											p < length &&
											source.charCodeAt(p) >= 48 &&
											source.charCodeAt(p) <= 57
										)
											p++;
										if (p >= length) break main_loop;
										const after = source.charCodeAt(p);
										if (after === DOT || after === CLOSE_PAREN) p++;
									}
									if (p >= length) break main_loop;
								}
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
								current_node,
							);
							this.node_stack.push(para_id);
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
						this.node_stack.length = node_stack_base;
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
								this.block_quote_depth,
							);

							if (stripped === -1) {
								// unmarked line - close the paragraph. cursor stays
								// on lf so enclosing block_quote state frames will
								// cascade-close themselves via their own linefeed
								// handlers (each calls skip_bq_markers(_, 1)).
								this.emit_close(current_node, this.cursor);
								this.states.pop();
								this.node_stack.length = node_stack_base;
								continue;
							}

							// markers present - check for block interrupt at stripped pos
							if (
								this.is_blank_at_pos(stripped) ||
								this.is_heading_start(stripped) ||
								this.is_thematic_break_start(stripped) ||
								(source.charCodeAt(stripped) === BACKTICK &&
									source.charCodeAt(stripped + 1) === BACKTICK &&
									source.charCodeAt(stripped + 2) === BACKTICK)
							) {
								this.emit_close(current_node, this.cursor);
								this.states.pop();
								this.node_stack.length = node_stack_base;
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
									this.node_stack.length = node_stack_base;
									continue;
								}
							}
							// continuation line inside block quote - emit soft break
							const sb_p = this.emit_open(
								NodeKind.soft_break,
								this.cursor,
								current_node,
							);
							this.emit_close(sb_p, this.cursor + 1);
							this.chomp(stripped, true);
							this.states.push(StateKind.inline);
							continue;
						}

						// not in block quote - use is_block_interrupt for the common case
						if (this.is_block_interrupt(next_pos)) {
							this.emit_close(current_node, this.cursor);
							this.states.pop();
							this.node_stack.length = node_stack_base;
							continue;
						}

						// check for list item start within a list
						if (this.list_depth > 0) {
							const { columns: ind } = this.count_indent(next_pos);
							if (ind >= this.list_content_offset) {
								const stripped = this.skip_columns(
									next_pos,
									this.list_content_offset,
								);
								if (
									stripped < length &&
									this.try_parse_list_marker(stripped) !== null
								) {
									this.emit_close(current_node, this.cursor);
									this.states.pop();
									this.node_stack.length = node_stack_base;
									continue;
								}
							}
						}
						// continuation line - emit soft break
						const sb_p_nq = this.emit_open(
							NodeKind.soft_break,
							this.cursor,
							current_node,
						);
						this.emit_close(sb_p_nq, this.cursor + 1);
						this.chomp1();
						// strip leading whitespace on continuation line
						while (
							this.cursor < length &&
							source.charCodeAt(this.cursor) === SPACE
						) {
							this.chomp1();
						}
						this.states.push(StateKind.inline);
						continue;
					} else {
						this.states.push(StateKind.inline);
						continue;
					}
				}

				case StateKind.code_fence_start: {
					if (code === BACKTICK) {
						this.extra += 1;
						this.chomp1();
						continue;
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
								source.charCodeAt(info_end) !== LINEFEED
							)
								info_end++;
							if (info_end >= length && !this.finished) break main_loop;
							const scan = this.bq_fence_scan(
								info_end + 1,
								this.extra,
								this.block_quote_depth,
							);
							if (scan === 0) break main_loop; // stall for more input
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
									current_node,
								);
								this.node_stack.push(bq_fp_id);
								const bq_ft_id = this.emit_open(
									NodeKind.text,
									this.cursor - this.extra,
									bq_fp_id,
								);
								this.out.set_value_start(bq_ft_id, this.cursor - this.extra);
								this.out.set_value_end(bq_ft_id, this.cursor);
								this.emit_close(bq_ft_id, this.cursor);
								this.states.push(StateKind.paragraph);
								continue;
							}
						}
						this.states.pop();
						this.states.push(StateKind.code_fence_info);
						const cf_id = this.emit_open(
							NodeKind.code_fence,
							this.cursor - this.extra,
							current_node,
						);
						this.node_stack.push(cf_id);

						this.info_start_pos = this.cursor;

						continue;
					} else {
						this.states.pop();
						const para_id = this.emit_open(
							NodeKind.paragraph,
							this.cursor - this.extra,
							current_node,
						);
						this.node_stack.push(para_id);
						this.states.push(StateKind.paragraph);
						this.chomp(this.cursor - this.extra, true);
						continue;
					}
				}

				case StateKind.code_fence_info: {
					if (!code && this.finished) {
						this.states.pop();
						this.emit_close(current_node, length);
						this.out.set_value_start(current_node, length);
						this.out.set_value_end(current_node, length);
						break;
					} else if (!code) {
						break main_loop; // wait for more input
					} else if (this.cursor + 1 >= length && this.finished) {
						this.emit_close(current_node, length);
						this.out.set_value_end(current_node, length);
						this.states.pop();
						continue;
					} else if (this.cursor + 1 >= length) {
						break main_loop; // wait for more input
					}
					if (code !== LINEFEED) {
						this.chomp1();
						continue;
					} else if (this.cursor >= length && this.finished) {
						this.emit_close(current_node, length);
						this.out.set_value_end(current_node, length);
						this.states.pop();
						continue;
					} else if (this.cursor >= length) {
						break main_loop;
					} else {
						this.info_end_pos = this.cursor;
						this.states.pop();
						this.states.push(StateKind.code_fence_content);
						this.out.attr(current_node, "info_start", this.info_start_pos);
						this.out.attr(current_node, "info_end", this.cursor);
						this.chomp1();

						this.out.set_value_start(current_node, this.cursor);

						continue;
					}
				}

				case StateKind.code_fence_content: {
					// scan line-by-line for closing fence: a line with only
					// optional whitespace followed by >= extra backticks.
					const fence_len = this.extra;
					let scan = this.cursor;
					let found_index = -1;
					let found_nl = -1;

					// check if the current line (at cursor, which is a line start)
					// is itself the closing fence (empty code block case).
					{
						let lp = scan;
						while (
							lp < length &&
							(source.charCodeAt(lp) === SPACE || source.charCodeAt(lp) === TAB)
						)
							lp++;
						const bt_start = lp;
						while (lp < length && source.charCodeAt(lp) === BACKTICK) lp++;
						if (lp - bt_start >= fence_len) {
							// closing fence on the first content line - value is empty
							found_index = bt_start;
							found_nl = this.cursor > 0 ? this.cursor - 1 : this.cursor;
						}
					}

					if (found_index === -1) {
						while (scan < length) {
							const nl = source.indexOf("\n", scan);
							if (nl === -1) break;

							let lp = nl + 1;
							while (
								lp < length &&
								(source.charCodeAt(lp) === SPACE ||
									source.charCodeAt(lp) === TAB)
							)
								lp++;
							const bt_start = lp;
							while (lp < length && source.charCodeAt(lp) === BACKTICK) lp++;
							if (lp - bt_start >= fence_len) {
								found_index = bt_start;
								found_nl = nl;
								break;
							}
							scan = nl + 1;
						}
					}

					if (found_index === -1) {
						if (!this.finished) {
							break main_loop;
						}
						this.out.set_value_end(current_node, length);
						this.states.pop();
						this.states.push(StateKind.code_fence_text_end);
						this.chomp(length, true);
						continue;
					}

					// count actual backticks at found_index for chomp
					let bt_end = found_index;
					while (bt_end < length && source.charCodeAt(bt_end) === BACKTICK)
						bt_end++;

					this.states.pop();
					this.states.push(StateKind.code_fence_text_end);
					this.out.set_value_end(current_node, found_nl);
					this.chomp(bt_end, true);
					continue;
				}

				case StateKind.code_fence_text_end: {
					if (this.cursor >= length && !this.finished) break main_loop;
					if (this.cursor >= length || code === LINEFEED) {
						this.emit_close(current_node, this.cursor);
						this.node_stack.pop();
						this.states.pop();
						this.chomp1();
						continue;
					}
					if (code === BACKTICK) {
						this.chomp1();
						continue;
					}
					// non-backtick trailing content - scan to end of line
					{
						let ep = this.cursor;
						while (ep < length && source.charCodeAt(ep) !== LINEFEED) ep++;
						if (ep >= length && !this.finished) break main_loop;
						this.emit_close(current_node, this.cursor);
						this.node_stack.pop();
						this.states.pop();
						this.chomp(ep, true);
						continue;
					}
				}

				case StateKind.heading_marker: {
					// heading content: parse inlines until linefeed or eof.
					if (code === LINEFEED || code !== code) {
						if (!this.finished && code !== code) break main_loop;
						// trim trailing whitespace from heading value
						let value_end = this.cursor;
						while (
							value_end > 0 &&
							(source.charCodeAt(value_end - 1) === SPACE ||
								source.charCodeAt(value_end - 1) === TAB)
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
					continue;
				}

				case StateKind.strong_emphasis: {
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
						this.prev & (CharMask.word | CharMask.punctuation) &&
						this.next_class & (CharMask.whitespace | CharMask.punctuation)
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

						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						// pop trailing inline so parent state sees next char directly
						if (this.states[this.states.length - 1] === StateKind.inline) {
							this.states.pop();
						}
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
					// need the char after `_` to do the flanking check without
					// mis-committing on the nan wildcard mask at end-of-buffer.
					if (
						code === UNDERSCORE &&
						!this.finished &&
						this.cursor + 1 >= length
					) {
						break main_loop;
					}
					if (
						code === UNDERSCORE &&
						this.prev & (CharMask.word | CharMask.punctuation) &&
						this.next_class & (CharMask.whitespace | CharMask.punctuation)
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
							continue;
						}

						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						if (this.states[this.states.length - 1] === StateKind.inline) {
							this.states.pop();
						}
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

				case StateKind.strikethrough: {
					// ~~ is a two-char token - hold back lone ~ at end of buffer
					if (code === TILDE && !this.finished && this.cursor + 1 >= length) {
						break main_loop;
					}
					// close: ~~ with right-flanking
					if (
						code === TILDE &&
						source.charCodeAt(this.cursor + 1) === TILDE &&
						this.prev & (CharMask.word | CharMask.punctuation) &&
						classify(source.charCodeAt(this.cursor + 2)) &
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
					} else if (
						code === LINEFEED &&
						this._delimiter_lf_close(current_node)
					) {
						continue;
					} else {
						this.states.push(StateKind.inline);
					}
					continue;
				}

				case StateKind.superscript: {
					// close: ^ after content (no right-flanking needed -
					// ^ is unambiguous, and x^2^y must work)
					if (
						code === CARET &&
						this.prev & (CharMask.word | CharMask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];
						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						if (this.states[this.states.length - 1] === StateKind.inline) {
							this.states.pop();
						}
					} else if (
						code === LINEFEED &&
						this._delimiter_lf_close(current_node)
					) {
						continue;
					} else {
						this.states.push(StateKind.inline);
					}
					continue;
				}

				case StateKind.subscript: {
					// close: single ~ after content (no right-flanking needed -
					// ~ is unambiguous inside subscript, and h~2~o must work)
					if (
						code === TILDE &&
						source.charCodeAt(this.cursor + 1) !== TILDE &&
						this.prev & (CharMask.word | CharMask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];
						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						if (this.states[this.states.length - 1] === StateKind.inline) {
							this.states.pop();
						}
					} else if (
						code === LINEFEED &&
						this._delimiter_lf_close(current_node)
					) {
						continue;
					} else {
						this.states.push(StateKind.inline);
					}
					continue;
				}

				case StateKind.link_text: {
					// inside [link text], ![image alt], or :name[content]
					// - stream content, watch for closing ]
					if (code === CLOSE_SQUARE_BRACKET) {
						// inline directive: ] just closes - no (url) or [ref] needed
						if (
							this.NodeKind_array[current_node] === NodeKind.directive_inline
						) {
							this.out.set_value_end(current_node, this.cursor);
							this.pending_remove(current_node);
							this.emit_close(current_node, this.cursor + 1);
							this.node_stack.pop();
							this.states.pop();
							if (this.states[this.states.length - 1] === StateKind.inline) {
								this.states.pop();
							}
							this.chomp1();
							continue;
						}

						// found ] - need to see what follows to decide
						const after = this.cursor + 1;

						// if ] is at end of buffer and more input may come,
						// hold back - ( might arrive next
						if (after >= length && !this.finished) {
							break main_loop;
						}

						if (after < length && source.charCodeAt(after) === OPEN_PAREN) {
							// parse the (url "title") part
							let p = after + 1;
							// skip whitespace
							while (
								p < length &&
								(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
							)
								p++;

							let url_start = p;
							let url_end = p;

							// check for angle-bracket url
							if (p < length && source.charCodeAt(p) === OPEN_ANGLE_BRACKET) {
								p++;
								url_start = p;
								while (
									p < length &&
									source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET &&
									source.charCodeAt(p) !== LINEFEED
								)
									p++;
								if (
									p < length &&
									source.charCodeAt(p) === CLOSE_ANGLE_BRACKET
								) {
									url_end = p;
									p++;
								}
							} else if (p < length && source.charCodeAt(p) === CLOSE_PAREN) {
								// empty url: [text]()
								url_start = p;
								url_end = p;
							} else {
								// regular url - balanced parens, no spaces
								url_start = p;
								let paren_depth = 0;
								while (p < length) {
									const ch = source.charCodeAt(p);
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
								(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
							)
								p++;

							// optional title
							let title_start = -1;
							let title_end = -1;
							if (p < length) {
								const tc = source.charCodeAt(p);
								if (tc === 34 || tc === 39 || tc === OPEN_PAREN) {
									const close_char = tc === OPEN_PAREN ? CLOSE_PAREN : tc;
									p++;
									title_start = p;
									while (
										p < length &&
										source.charCodeAt(p) !== close_char &&
										source.charCodeAt(p) !== LINEFEED
									) {
										if (source.charCodeAt(p) === BACKSLASH && p + 1 < length) {
											p += 2;
											continue;
										}
										p++;
									}
									if (p < length && source.charCodeAt(p) === close_char) {
										title_end = p;
										p++;
									}
								}
							}

							// skip trailing whitespace
							while (
								p < length &&
								(source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)
							)
								p++;

							if (p < length && source.charCodeAt(p) === CLOSE_PAREN) {
								p++; // skip )
								// success - set attrs and close
								const n_id = current_node;
								const url = source.slice(url_start, url_end);
								const is_image = this.NodeKind_array[n_id] === NodeKind.image;
								this.out.attr(n_id, is_image ? "src" : "href", url);
								if (title_start >= 0 && title_end >= 0) {
									this.out.attr(
										n_id,
										"title",
										source.slice(title_start, title_end),
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
								continue;
							}

							// url parsing didn't find ) - if we hit end of buffer
							// and more input may come, hold back
							if (!this.finished && p >= length) {
								break main_loop;
							}
							// ( found but url is malformed - fall through to revoke
						}

						// check for reference syntax: ][ref] or ][]
						if (
							after < length &&
							source.charCodeAt(after) === OPEN_SQUARE_BRACKET
						) {
							let ref_p = after + 1;

							// need to see at least one char after [
							if (ref_p >= length && !this.finished) {
								break main_loop;
							}

							// ][] - collapsed reference: label = link text
							if (
								ref_p < length &&
								source.charCodeAt(ref_p) === CLOSE_SQUARE_BRACKET
							) {
								const label = source.slice(this.link_text_start, this.cursor);
								const normalized = this.normalize_label(label);
								const def = this.ref_map.get(normalized);
								if (def) {
									const is_image =
										this.NodeKind_array[current_node] === NodeKind.image;
									this.out.attr(
										current_node,
										is_image ? "src" : "href",
										def.url,
									);
									if (def.title)
										this.out.attr(current_node, "title", def.title);
									this.out.set_value_end(current_node, this.cursor);
									this.pending_remove(current_node);
									this.emit_close(current_node, ref_p + 1);
									this.node_stack.pop();
									this.states.pop();
									if (
										this.states[this.states.length - 1] === StateKind.inline
									) {
										this.states.pop();
									}
									this.chomp(ref_p + 1, true);
									continue;
								}
								// no definition found - revoke
								this.out.revoke(current_node);
								this.node_stack.pop();
								this.states.pop();
								continue;
							}

							// ][label] - full reference
							const ref_start = ref_p;
							while (ref_p < length) {
								const ch = source.charCodeAt(ref_p);
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
								break main_loop;
							}

							if (
								ref_p < length &&
								source.charCodeAt(ref_p) === CLOSE_SQUARE_BRACKET &&
								ref_p > ref_start
							) {
								const label = source.slice(ref_start, ref_p);
								const normalized = this.normalize_label(label);
								const def = this.ref_map.get(normalized);
								if (def) {
									const is_image =
										this.NodeKind_array[current_node] === NodeKind.image;
									this.out.attr(
										current_node,
										is_image ? "src" : "href",
										def.url,
									);
									if (def.title)
										this.out.attr(current_node, "title", def.title);
									this.out.set_value_end(current_node, this.cursor);
									this.pending_remove(current_node);
									this.emit_close(current_node, ref_p + 1);
									this.node_stack.pop();
									this.states.pop();
									if (
										this.states[this.states.length - 1] === StateKind.inline
									) {
										this.states.pop();
									}
									this.chomp(ref_p + 1, true);
									continue;
								}
							}
						}

						// definitively not a link/reference. revoke.
						this.out.revoke(current_node);
						this.node_stack.pop();
						this.states.pop();
						continue;
					}

					if (code === LINEFEED && this.is_blank_line_after(this.cursor)) {
						// paragraph boundary - revoke link
						this.out.revoke(current_node);
						this.node_stack.pop();
						this.states.pop();
						continue;
					}

					// dispatch inline content inside the link text
					this.states.push(StateKind.inline);
					continue;
				}

				case StateKind.html_element: {
					// inline html container state.
					// check if current char starts a matching closing tag.
					if (code === OPEN_ANGLE_BRACKET) {
						// stall if tag might be incomplete
						if (!this.finished && source.indexOf(">", this.cursor + 1) === -1) {
							break main_loop;
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
								continue;
							}
						}
					}

					if (code === LINEFEED && this.is_block_interrupt(this.cursor + 1)) {
						// block interrupt after newline - close unclosed inline html element
						if (
							this.html_tag_stack.length > 0 &&
							this.html_tag_stack[this.html_tag_stack.length - 1].id ===
								current_node
						) {
							this.html_tag_stack.pop();
						}
						this.states.pop();
						this.node_stack.pop();
						continue;
					}

					if (!code) {
						if (!this.finished) break main_loop;
						// eof: unwind stacks - _finalize will revoke the pending node
						if (
							this.html_tag_stack.length > 0 &&
							this.html_tag_stack[this.html_tag_stack.length - 1].id ===
								current_node
						) {
							this.html_tag_stack.pop();
						}
						this.states.pop();
						this.node_stack.pop();
						continue;
					}

					// dispatch to inline for content inside the element
					this.states.push(StateKind.inline);
					continue;
				}

				case StateKind.html_block_element: {
					// block-level html container state.
					// acts like root but also checks for closing tags.

					if (!code) {
						if (!this.finished) break main_loop;
						// eof: unwind stacks - _finalize will revoke the pending node
						if (
							this.html_tag_stack.length > 0 &&
							this.html_tag_stack[this.html_tag_stack.length - 1].id ===
								current_node
						) {
							this.html_tag_stack.pop();
						}
						this.html_block_depth--;
						this.states.pop();
						this.node_stack.pop();
						continue;
					}

					// check for closing tag
					if (code === OPEN_ANGLE_BRACKET) {
						// stall if tag might be incomplete
						if (!this.finished && source.indexOf(">", this.cursor + 1) === -1) {
							break main_loop;
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
									if (!this.closed_flags[intermediate.id]) {
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
								continue;
							}
						}
					}

					// skip linefeeds - they act as separators
					if (code === LINEFEED) {
						const lb_id = this.emit_open(
							NodeKind.line_break,
							this.cursor,
							current_node,
						);
						this.emit_close(lb_id, this.cursor + 1);
						this.chomp1();
						continue;
					}

					// skip leading whitespace
					if (code === SPACE || code === TAB) {
						let pos = this.cursor;
						while (
							pos < length &&
							(source.charCodeAt(pos) === SPACE ||
								source.charCodeAt(pos) === TAB)
						) {
							pos++;
						}
						if (pos < length && source.charCodeAt(pos) === LINEFEED) {
							const lb_id = this.emit_open(
								NodeKind.line_break,
								this.cursor,
								current_node,
							);
							this.emit_close(lb_id, pos + 1);
							this.chomp(pos + 1, true);
							continue;
						}
						this.chomp1();
						continue;
					}

					// dispatch block-level content inside the html element
					// (headings, code fences, paragraphs, nested html, etc.)
					if (code === OCTOTHERP) {
						if (!this.start_heading(current_node)) break main_loop;
						continue;
					}

					if (code === BACKTICK) {
						this.states.push(StateKind.code_fence_start);
						this.extra = 0;
						continue;
					}

					if (code === OPEN_ANGLE_BRACKET) {
						// nested html at block level
						const blk_comment = this.try_parse_html_comment(this.cursor + 1);
						if (blk_comment === false) break main_loop;
						if (blk_comment) {
							const c_id = this.emit_open(
								NodeKind.html_comment,
								this.cursor,
								current_node,
							);
							this.out.text(
								c_id,
								blk_comment.content_start,
								blk_comment.content_end,
							);
							this.emit_close(c_id, blk_comment.end);
							this.chomp(blk_comment.end, true);
							continue;
						}

						const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
						if (blk_tag) {
							if (blk_tag.self_closing) {
								const html_id = this.emit_open(
									NodeKind.html,
									this.cursor,
									current_node,
								);
								this.out.attr(html_id, "tag", blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, "attributes", blk_tag.attributes);
								}
								this.out.attr(html_id, "self_closing", true);
								this.emit_close(html_id, blk_tag.end);
								this.chomp(blk_tag.end, true);
							} else if (this.is_raw_text_tag(blk_tag.tag)) {
								const raw = this.find_raw_close_tag(blk_tag.end, blk_tag.tag);
								if (!raw) {
									if (!this.finished) break main_loop;
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
									);
									this.out.attr(html_id, "tag", blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", blk_tag.attributes);
									}
									this.out.set_value_start(html_id, blk_tag.end);
									this.out.set_value_end(html_id, length);
									this.emit_close(html_id, length);
									this.chomp(length, true);
								} else {
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
									);
									this.out.attr(html_id, "tag", blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", blk_tag.attributes);
									}
									this.out.set_value_start(html_id, blk_tag.end);
									this.out.set_value_end(html_id, raw.content_end);
									this.emit_close(html_id, raw.end);
									this.chomp(raw.end, true);
								}
							} else {
								const html_id = this.emit_open(
									NodeKind.html,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.attr(html_id, "tag", blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, "attributes", blk_tag.attributes);
								}
								this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
								this.node_stack.push(html_id);
								this.states.push(StateKind.html_block_element);
								this.html_block_depth++;
								this.chomp(blk_tag.end, true);
							}
							continue;
						}
					}

					// default: start a paragraph for text content
					this.states.push(StateKind.paragraph);
					const blk_html_para = this.emit_open(
						NodeKind.paragraph,
						this.cursor,
						current_node,
					);
					this.node_stack.push(blk_html_para);
					continue;
				}

				case StateKind.svelte_branch: {
					// container state for svelte block branches.
					// dispatches block content like root, but also handles
					// {:tag} (new branch) and {/tag} (close block).

					if (!code) {
						if (!this.finished) break main_loop;
						// eof: close branch + block
						this.emit_close(this.svelte_branch_id, this.cursor);
						this.node_stack.pop(); // branch
						this.emit_close(this.svelte_block_id, this.cursor);
						this.node_stack.pop(); // block
						this.states.pop();
						this.svelte_block_depth--;
						if (
							this.svelte_block_depth > 0 &&
							this.svelte_block_stack.length > 0
						) {
							const prev = this.svelte_block_stack.pop()!;
							this.svelte_block_id = prev.block_id;
							this.svelte_branch_id = prev.branch_id;
							this.svelte_block_tag = prev.tag;
						}
						continue;
					}

					if (code === OPEN_BRACE) {
						// stall if closing brace not visible
						if (!this.finished) {
							const probe = this.find_matching_brace(this.cursor + 1);
							if (probe === -1) break main_loop;
						}
						const token = this.try_parse_svelte_block_token(this.cursor);
						if (token) {
							if (token.kind === ":") {
								// close current branch, open new one
								this.emit_close(this.svelte_branch_id, this.cursor);
								this.node_stack.pop(); // pop old branch

								const branch_id = this.emit_open(
									NodeKind.svelte_branch,
									this.cursor,
									this.svelte_block_id,
								);
								this.out.attr(branch_id, "tag", token.tag);
								if (token.expr_start !== 0 || token.expr_end !== 0) {
									this.out.set_value_start(branch_id, token.expr_start);
									this.out.set_value_end(branch_id, token.expr_end);
								}
								this.svelte_branch_id = branch_id;
								this.node_stack.push(branch_id);
								this.chomp(token.end, true);
								continue;
							}
							if (token.kind === "/") {
								// close branch + block
								this.emit_close(this.svelte_branch_id, this.cursor);
								this.node_stack.pop(); // branch
								this.emit_close(this.svelte_block_id, token.end);
								this.node_stack.pop(); // block
								this.states.pop();
								this.svelte_block_depth--;
								if (
									this.svelte_block_depth > 0 &&
									this.svelte_block_stack.length > 0
								) {
									const prev = this.svelte_block_stack.pop()!;
									this.svelte_block_id = prev.block_id;
									this.svelte_branch_id = prev.branch_id;
									this.svelte_block_tag = prev.tag;
								}
								this.chomp(token.end, true);
								continue;
							}
							if (token.kind === "#") {
								// nested svelte block - open it within this branch
								this.start_svelte_block(token, current_node);
								continue;
							}
						}
					}

					// skip linefeeds
					if (code === LINEFEED) {
						const lb_id = this.emit_open(
							NodeKind.line_break,
							this.cursor,
							current_node,
						);
						this.emit_close(lb_id, this.cursor + 1);
						this.chomp1();
						continue;
					}

					// skip leading whitespace
					if (code === SPACE || code === TAB) {
						let pos = this.cursor;
						while (
							pos < length &&
							(source.charCodeAt(pos) === SPACE ||
								source.charCodeAt(pos) === TAB)
						) {
							pos++;
						}
						if (pos < length && source.charCodeAt(pos) === LINEFEED) {
							const lb_id = this.emit_open(
								NodeKind.line_break,
								this.cursor,
								current_node,
							);
							this.emit_close(lb_id, pos + 1);
							this.chomp(pos + 1, true);
							continue;
						}
						this.chomp1();
						continue;
					}

					// dispatch block-level content
					if (code === OCTOTHERP) {
						if (!this.start_heading(current_node)) break main_loop;
						continue;
					}

					if (code === BACKTICK) {
						this.states.push(StateKind.code_fence_start);
						this.extra = 0;
						continue;
					}

					if (code === CLOSE_ANGLE_BRACKET) {
						let p = this.cursor + 1;
						if (p < length && source.charCodeAt(p) === SPACE) p++;
						this.block_quote_depth++;
						const bq_id = this.emit_open(
							NodeKind.block_quote,
							this.cursor,
							current_node,
						);
						this.node_stack.push(bq_id);
						this.states.push(StateKind.block_quote);
						this.chomp(p, true);
						continue;
					}

					if (code === OPEN_ANGLE_BRACKET) {
						if (!this.finished && source.indexOf(">", this.cursor + 1) === -1) {
							break main_loop;
						}
						const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
						if (blk_tag) {
							if (blk_tag.self_closing) {
								const html_id = this.emit_open(
									NodeKind.html,
									this.cursor,
									current_node,
								);
								this.out.attr(html_id, "tag", blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, "attributes", blk_tag.attributes);
								}
								this.out.attr(html_id, "self_closing", true);
								this.emit_close(html_id, blk_tag.end);
								this.chomp(blk_tag.end, true);
							} else if (this.is_raw_text_tag(blk_tag.tag)) {
								const raw = this.find_raw_close_tag(blk_tag.end, blk_tag.tag);
								if (!raw) {
									if (!this.finished) break main_loop;
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
									);
									this.out.attr(html_id, "tag", blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", blk_tag.attributes);
									}
									this.out.set_value_start(html_id, blk_tag.end);
									this.out.set_value_end(html_id, length);
									this.emit_close(html_id, length);
									this.chomp(length, true);
								} else {
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
									);
									this.out.attr(html_id, "tag", blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", blk_tag.attributes);
									}
									this.out.set_value_start(html_id, blk_tag.end);
									this.out.set_value_end(html_id, raw.content_end);
									this.emit_close(html_id, raw.end);
									this.chomp(raw.end, true);
								}
							} else {
								const html_id = this.emit_open(
									NodeKind.html,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.attr(html_id, "tag", blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, "attributes", blk_tag.attributes);
								}
								this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
								this.node_stack.push(html_id);
								this.states.push(StateKind.html_block_element);
								this.html_block_depth++;
								this.chomp(blk_tag.end, true);
							}
							continue;
						}
					}

					if (code === ASTERISK || code === DASH || code === UNDERSCORE) {
						if (!this.finished && this.cursor + 2 >= length) {
							break main_loop;
						}
						if (this.is_thematic_break_start(this.cursor)) {
							let line_end = this.cursor;
							while (
								line_end < length &&
								source.charCodeAt(line_end) !== LINEFEED
							)
								line_end++;
							const tb_id = this.emit_open(
								NodeKind.thematic_break,
								this.cursor,
								current_node,
							);
							this.emit_close(tb_id, line_end);
							this.chomp(line_end, true);
							continue;
						}
					}

					if (code === OPEN_SQUARE_BRACKET) {
						const def_end = this.try_parse_link_ref_definition(this.cursor);
						if (def_end === -2) break main_loop;
						if (def_end >= 0) {
							this.chomp(def_end, true);
							continue;
						}
					}

					if (code === COLON) {
						const dir = this.try_parse_block_directive(this.cursor);
						if (dir === false) break main_loop;
						if (dir !== null) {
							if (dir.kind === "leaf") {
								const d_id = this.emit_open(
									NodeKind.directive_leaf,
									this.cursor,
									current_node,
								);
								this.out.attr(d_id, "name", dir.name);
								if (dir.content_start >= 0) {
									this.out.set_value_start(d_id, dir.content_start);
									this.out.set_value_end(d_id, dir.content_end);
								}
								this.emit_close(d_id, dir.end);
								this.chomp(dir.end, true);
							} else {
								const d_id = this.emit_open(
									NodeKind.directive_container,
									this.cursor,
									current_node,
								);
								this.out.attr(d_id, "name", dir.name);
								if (dir.content_start >= 0) {
									this.out.set_value_start(d_id, dir.content_start);
									this.out.set_value_end(d_id, dir.content_end);
								}
								this.node_stack.push(d_id);
								this.states.push(StateKind.directive_container);
								this.directive_colon_counts.push(dir.colons);
								this.chomp(dir.end, true);
							}
							continue;
						}
					}

					// default: start a paragraph
					this.states.push(StateKind.paragraph);
					const svelte_para = this.emit_open(
						NodeKind.paragraph,
						this.cursor,
						current_node,
					);
					this.node_stack.push(svelte_para);
					continue;
				}

				case StateKind.block_quote: {
					if (!code) {
						if (!this.finished) break main_loop;
						this.emit_close(current_node, this.cursor);
						this.states.pop();
						this.node_stack.pop();
						this.block_quote_depth--;
						continue;
					}

					switch (code) {
						case LINEFEED: {
							if (!this.finished && !this.can_decide_after_lf(this.cursor)) {
								break main_loop;
							}
							const next_pos = this.cursor + 1;
							const stripped = this.skip_bq_markers(next_pos, 1);

							if (stripped !== -1) {
								if (this.is_blank_at_pos(stripped)) {
									const lb_id = this.emit_open(
										NodeKind.line_break,
										this.cursor,
										current_node,
									);
									this.emit_close(lb_id, stripped);
									this.chomp(stripped, true);
									continue;
								}
								this.chomp(stripped, true);
								continue;
							}

							this.emit_close(current_node, this.cursor);
							this.states.pop();
							this.node_stack.pop();
							this.block_quote_depth--;
							continue;
						}

						case SPACE:
						case TAB: {
							this.chomp1();
							continue;
						}

						case OCTOTHERP: {
							if (!this.start_heading(current_node)) break main_loop;
							continue;
						}

						case BACKTICK: {
							this.states.push(StateKind.code_fence_start);
							this.extra = 0;
							continue;
						}

						case ASTERISK:
						case DASH:
						case UNDERSCORE: {
							// need a complete line to distinguish thematic break
							// from list marker from paragraph.
							if (!this.finished && source.indexOf("\n", this.cursor) === -1) {
								break main_loop;
							}
							if (this.is_thematic_break_start(this.cursor)) {
								let line_end = this.cursor;
								while (
									line_end < length &&
									source.charCodeAt(line_end) !== LINEFEED
								) {
									line_end++;
								}
								const break_end = line_end < length ? line_end : line_end;

								const tb_id = this.emit_open(
									NodeKind.thematic_break,
									this.cursor,
									current_node,
								);
								this.emit_close(tb_id, break_end);

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
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && source.charCodeAt(p) === SPACE) p++;

							this.block_quote_depth++;
							const bq_id = this.emit_open(
								NodeKind.block_quote,
								this.cursor,
								current_node,
							);
							this.node_stack.push(bq_id);
							this.states.push(StateKind.block_quote);
							this.chomp(p, true);
							continue;
						}

						case PIPE: {
							const result = this.try_start_table(current_node);
							if (result === false) break main_loop;
							if (result === true) continue;
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							const def_end = this.try_parse_link_ref_definition(this.cursor);
							if (def_end === -2) break main_loop;
							if (def_end >= 0) {
								this.chomp(def_end, true);
								continue;
							}
							this.states.push(StateKind.paragraph);
							const bq_ref_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(bq_ref_para);
							continue;
						}

						case COLON: {
							// need a complete line for directive detection
							if (!this.finished && source.indexOf("\n", this.cursor) === -1) {
								break main_loop;
							}
							const dir = this.try_parse_block_directive(this.cursor);
							if (dir === false) break main_loop;
							if (dir !== null) {
								if (dir.kind === "leaf") {
									const d_id = this.emit_open(
										NodeKind.directive_leaf,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.emit_close(d_id, dir.end);
									this.chomp(dir.end, true);
								} else {
									const d_id = this.emit_open(
										NodeKind.directive_container,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.node_stack.push(d_id);
									this.states.push(StateKind.directive_container);
									this.directive_colon_counts.push(dir.colons);
									this.chomp(dir.end, true);
								}
								continue;
							}
							this.states.push(StateKind.paragraph);
							const bq_colon_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(bq_colon_para);
							continue;
						}

						default: {
							if (code === PLUS || (code >= 48 && code <= 57)) {
								// stall only while the marker prefix is still being
								// read - same logic as the top-level block dispatch.
								if (!this.finished) {
									let p = this.cursor + 1;
									if (code !== PLUS) {
										while (
											p < length &&
											source.charCodeAt(p) >= 48 &&
											source.charCodeAt(p) <= 57
										)
											p++;
										if (p >= length) break main_loop;
										const after = source.charCodeAt(p);
										if (after === DOT || after === CLOSE_PAREN) p++;
									}
									if (p >= length) break main_loop;
								}
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
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}
					}
				}

				case StateKind.list_item: {
					if (!code) {
						if (!this.finished) break main_loop;
						this.end_list();
						continue;
					}

					switch (code) {
						case LINEFEED: {
							const raw_next_pos = this.cursor + 1;

							// need to see the complete next line to make
							// continuation / interruption decisions
							if (!this.finished && !this.can_decide_after_lf(this.cursor)) {
								break main_loop;
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
									this.block_quote_depth,
								);
								if (stripped_bq === -1) {
									this.end_list();
									continue;
								}
								next_pos = stripped_bq;
							}

							const cur_is_blank =
								this.cursor === 0 ||
								source.charCodeAt(this.cursor - 1) === LINEFEED;
							if (
								next_pos >= length ||
								cur_is_blank ||
								this.is_blank_at_pos(next_pos)
							) {
								let p = next_pos;
								while (p < length) {
									if (!this.is_blank_at_pos(p)) break;
									while (p < length && source.charCodeAt(p) !== LINEFEED) p++;
									if (p < length) p++;
									// when inside a blockquote, skip the `>` markers on
									// the next line before re-testing for blank.
									if (this.block_quote_depth > 0 && p < length) {
										// in streaming mode, stall if the line isn't
										// fully available - skip_bq_markers needs to
										// see all markers to decide definitively.
										if (!this.finished) {
											let ep = p;
											while (ep < length && source.charCodeAt(ep) !== LINEFEED)
												ep++;
											if (ep >= length) break main_loop;
										}
										const sp = this.skip_bq_markers(p, this.block_quote_depth);
										if (sp === -1) {
											// unmarked line inside blockquote - terminate.
											this.end_list();
											continue main_loop;
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
									if (p >= length) break main_loop;
									let lp = p;
									// skip optional indent for the marker
									while (
										lp < length &&
										(source.charCodeAt(lp) === SPACE ||
											source.charCodeAt(lp) === TAB)
									)
										lp++;
									if (lp >= length) break main_loop;
									const mch = source.charCodeAt(lp);
									if (mch === DASH || mch === ASTERISK || mch === PLUS) {
										// for - and *, we also need to rule out a
										// thematic break on this line - scan until
										// we see a non-marker/ws char or lf.
										if (mch !== PLUS) {
											let q = lp + 1;
											let decided = false;
											while (q < length) {
												const qc = source.charCodeAt(q);
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
											if (!decided) break main_loop;
										} else if (lp + 1 >= length) {
											break main_loop;
										}
									} else if (mch >= 48 && mch <= 57) {
										let q = lp + 1;
										while (
											q < length &&
											source.charCodeAt(q) >= 48 &&
											source.charCodeAt(q) <= 57
										)
											q++;
										if (q >= length) break main_loop;
										const dch = source.charCodeAt(q);
										if (dch === DOT || dch === CLOSE_PAREN) q++;
										if (q >= length) break main_loop;
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
											continue;
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
												this.list_node_id,
											);
											this.node_stack.push(new_item_id);
											this.list_content_offset = marker_after.content_offset;
											this.chomp(marker_after.content_start, true);
											continue;
										}
										this.end_list();
										continue;
									}

									const { columns: indent_count, end: ip } =
										this.count_indent(p);
									if (
										indent_count >= this.list_content_offset &&
										ip < length &&
										source.charCodeAt(ip) !== LINEFEED
									) {
										this.list_is_loose = true;
										this.chomp(
											this.skip_columns(p, this.list_content_offset),
											true,
										);
										continue;
									}
								}

								this.end_list();
								continue;
							}

							// check for thematic break before list marker (precedence)
							if (this.is_thematic_break_start(next_pos)) {
								this.end_list();
								continue;
							}

							// check for list marker on next line
							const marker = this.try_parse_list_marker(next_pos);
							if (marker) {
								if (marker.indent >= this.list_content_offset) {
									this.chomp(next_pos, true);
									this.start_list(marker, current_node);
									continue;
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
										this.list_node_id,
									);
									this.node_stack.push(new_item_id);
									this.list_content_offset = marker.content_offset;
									this.chomp(marker.content_start, true);
									continue;
								}
								this.end_list();
								continue;
							}

							// check for block-level content: if indented enough, it's
							// inside the list item; otherwise it interrupts the list.
							{
								const { columns: indent_count, end: ip } =
									this.count_indent(next_pos);
								if (
									indent_count >= this.list_content_offset &&
									ip < length &&
									source.charCodeAt(ip) !== LINEFEED
								) {
									// content indented to list item's content column -
									// strip indent and continue as list item content
									this.chomp(
										this.skip_columns(next_pos, this.list_content_offset),
										true,
									);
									continue;
								}
							}

							// block-level interrupts at outer indent level end the list
							if (
								this.is_heading_start(next_pos) ||
								this.is_thematic_break_start(next_pos) ||
								this.is_block_quote_start(next_pos)
							) {
								this.end_list();
								continue;
							}

							this.end_list();
							continue;
						}

						case SPACE:
						case TAB: {
							this.chomp1();
							continue;
						}

						case OCTOTHERP: {
							if (!this.start_heading(current_node)) break main_loop;
							continue;
						}

						case BACKTICK: {
							this.states.push(StateKind.code_fence_start);
							this.extra = 0;
							continue;
						}

						case ASTERISK:
						case DASH:
						case UNDERSCORE: {
							// distinguish thematic break / nested list / paragraph.
							// stall only while the line could still be a thematic
							// break (marker + ws chars). as soon as any other char
							// appears we can commit to a nested list / paragraph.
							if (!this.finished) {
								let could_be_tb = true;
								for (let p = this.cursor + 1; p < length; p++) {
									const ch = source.charCodeAt(p);
									if (ch === LINEFEED) {
										could_be_tb = false;
										break;
									}
									if (ch !== code && ch !== SPACE && ch !== TAB) {
										could_be_tb = false;
										break;
									}
								}
								if (could_be_tb) break main_loop;
							}
							if (this.is_thematic_break_start(this.cursor)) {
								let line_end = this.cursor;
								while (
									line_end < length &&
									source.charCodeAt(line_end) !== LINEFEED
								)
									line_end++;
								const break_end = line_end < length ? line_end + 1 : line_end;
								const tb_id = this.emit_open(
									NodeKind.thematic_break,
									this.cursor,
									current_node,
								);
								this.emit_close(tb_id, break_end);
								this.chomp(break_end, true);
								continue;
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
											this.list_node_id,
										);
										this.node_stack.push(new_item_id);
										this.list_content_offset = nested.content_offset;
										this.chomp(nested.content_start, true);
									} else {
										// marker at outer list level - end this list
										this.end_list();
									}
									continue;
								}
							}
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
								0,
								true,
							);
							this.track_list_pending_para(para_id);
							this.node_stack.push(para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && source.charCodeAt(p) === SPACE) p++;
							this.block_quote_depth++;
							const bq_id = this.emit_open(
								NodeKind.block_quote,
								this.cursor,
								current_node,
							);
							this.node_stack.push(bq_id);
							this.states.push(StateKind.block_quote);
							this.chomp(p, true);
							continue;
						}

						case PIPE: {
							const result = this.try_start_table(current_node);
							if (result === false) break main_loop;
							if (result === true) continue;
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
								0,
								true,
							);
							this.track_list_pending_para(para_id);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							const def_end = this.try_parse_link_ref_definition(this.cursor);
							if (def_end === -2) break main_loop;
							if (def_end >= 0) {
								this.chomp(def_end, true);
								continue;
							}
							this.states.push(StateKind.paragraph);
							const li_ref_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
								0,
								true,
							);
							this.track_list_pending_para(li_ref_para);
							this.node_stack.push(li_ref_para);
							continue;
						}

						case COLON: {
							const dir = this.try_parse_block_directive(this.cursor);
							if (dir === false) break main_loop;
							if (dir !== null) {
								if (dir.kind === "leaf") {
									const d_id = this.emit_open(
										NodeKind.directive_leaf,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.emit_close(d_id, dir.end);
									this.chomp(dir.end, true);
								} else {
									const d_id = this.emit_open(
										NodeKind.directive_container,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.node_stack.push(d_id);
									this.states.push(StateKind.directive_container);
									this.directive_colon_counts.push(dir.colons);
									this.chomp(dir.end, true);
								}
								continue;
							}
							this.states.push(StateKind.paragraph);
							const li_colon_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
								0,
								true,
							);
							this.track_list_pending_para(li_colon_para);
							this.node_stack.push(li_colon_para);
							continue;
						}

						default: {
							// a digit or `+` could start a nested list marker - stall
							// while the prefix is still being read so we don't commit
							// the char as paragraph text before the marker decision.
							if (
								!this.finished &&
								(code === PLUS || (code >= 48 && code <= 57))
							) {
								let p = this.cursor + 1;
								if (code !== PLUS) {
									while (
										p < length &&
										source.charCodeAt(p) >= 48 &&
										source.charCodeAt(p) <= 57
									)
										p++;
									if (p >= length) break main_loop;
									const after = source.charCodeAt(p);
									if (after === DOT || after === CLOSE_PAREN) p++;
								}
								if (p >= length) break main_loop;
							}
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
										this.list_node_id,
									);
									this.node_stack.push(new_item_id);
									this.list_content_offset = nested.content_offset;
									this.chomp(nested.content_start, true);
								} else {
									this.end_list();
								}
								continue;
							}
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
								0,
								true,
							);
							this.track_list_pending_para(para_id);
							this.node_stack.push(para_id);
							continue;
						}
					}
				}

				case StateKind.directive_container: {
					// container directive: dispatches inner block content,
					// watches for closing ::: fence.
					if (!code) {
						if (!this.finished) break main_loop;
						// eof: close the container
						this.emit_close(current_node, this.cursor);
						this.node_stack.pop();
						this.states.pop();
						this.directive_colon_counts.pop();
						continue;
					}

					const dc_colons =
						this.directive_colon_counts[this.directive_colon_counts.length - 1];

					switch (code) {
						case LINEFEED: {
							if (!this.finished && !this.can_decide_after_lf(this.cursor)) {
								break main_loop;
							}
							const lb_id = this.emit_open(
								NodeKind.line_break,
								this.cursor,
								current_node,
							);
							this.emit_close(lb_id, this.cursor + 1);
							this.chomp1();
							continue;
						}

						case SPACE:
						case TAB: {
							let pos = this.cursor;
							while (
								pos < length &&
								(source.charCodeAt(pos) === SPACE ||
									source.charCodeAt(pos) === TAB)
							) {
								pos++;
							}
							if (pos >= length && !this.finished) break main_loop;
							if (pos < length && source.charCodeAt(pos) === LINEFEED) {
								const lb_id = this.emit_open(
									NodeKind.line_break,
									this.cursor,
									current_node,
								);
								this.emit_close(lb_id, pos + 1);
								this.chomp(pos + 1, true);
								continue;
							}
							this.chomp1();
							continue;
						}

						case COLON: {
							// need a complete line for directive/close detection
							if (!this.finished && source.indexOf("\n", this.cursor) === -1) {
								break main_loop;
							}
							// check for closing fence: n+ colons (>= opener) with no name
							const close_end = this.try_parse_directive_close(
								this.cursor,
								dc_colons,
							);
							if (close_end === -2) break main_loop;
							if (close_end >= 0) {
								this.emit_close(current_node, close_end);
								this.node_stack.pop();
								this.states.pop();
								this.directive_colon_counts.pop();
								this.chomp(close_end, true);
								continue;
							}

							// check for nested directive (opening fence)
							const dir = this.try_parse_block_directive(this.cursor);
							if (dir === false) break main_loop;
							if (dir !== null) {
								if (dir.kind === "leaf") {
									const d_id = this.emit_open(
										NodeKind.directive_leaf,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.emit_close(d_id, dir.end);
									this.chomp(dir.end, true);
								} else {
									const d_id = this.emit_open(
										NodeKind.directive_container,
										this.cursor,
										current_node,
									);
									this.out.attr(d_id, "name", dir.name);
									if (dir.content_start >= 0) {
										this.out.set_value_start(d_id, dir.content_start);
										this.out.set_value_end(d_id, dir.content_end);
									}
									this.node_stack.push(d_id);
									this.states.push(StateKind.directive_container);
									this.directive_colon_counts.push(dir.colons);
									this.chomp(dir.end, true);
								}
								continue;
							}
							// not a directive - start paragraph
							this.states.push(StateKind.paragraph);
							const dc_colon_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(dc_colon_para);
							continue;
						}

						case OCTOTHERP: {
							if (!this.start_heading(current_node)) break main_loop;
							continue;
						}

						case BACKTICK: {
							this.states.push(StateKind.code_fence_start);
							this.extra = 0;
							continue;
						}

						case ASTERISK:
						case DASH:
						case UNDERSCORE: {
							if (!this.finished && this.cursor + 2 >= length) {
								break main_loop;
							}
							if (this.is_thematic_break_start(this.cursor)) {
								let line_end = this.cursor;
								while (
									line_end < length &&
									source.charCodeAt(line_end) !== LINEFEED
								)
									line_end++;
								const tb_id = this.emit_open(
									NodeKind.thematic_break,
									this.cursor,
									current_node,
								);
								this.emit_close(tb_id, line_end);
								this.chomp(line_end, true);
								continue;
							}
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && source.charCodeAt(p) === SPACE) p++;
							this.block_quote_depth++;
							const bq_id = this.emit_open(
								NodeKind.block_quote,
								this.cursor,
								current_node,
							);
							this.node_stack.push(bq_id);
							this.states.push(StateKind.block_quote);
							this.chomp(p, true);
							continue;
						}

						case PIPE: {
							const result = this.try_start_table(current_node);
							if (result === false) break main_loop;
							if (result === true) continue;
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							const def_end = this.try_parse_link_ref_definition(this.cursor);
							if (def_end === -2) break main_loop;
							if (def_end >= 0) {
								this.chomp(def_end, true);
								continue;
							}
							this.states.push(StateKind.paragraph);
							const dc_ref_para = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(dc_ref_para);
							continue;
						}

						default: {
							this.states.push(StateKind.paragraph);
							const para_id = this.emit_open(
								NodeKind.paragraph,
								this.cursor,
								current_node,
							);
							this.node_stack.push(para_id);
							continue;
						}
					}
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
							this.states.push(StateKind.code_span_start);
							this.extra = 0;
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
							if (this.is_block_interrupt(this.cursor + 1)) {
								this.states.pop();
								continue;
							} else if (this.list_depth > 0) {
								const np = this.cursor + 1;
								const { columns: ind } = this.count_indent(np);
								if (ind >= this.list_content_offset) {
									const stripped = this.skip_columns(
										np,
										this.list_content_offset,
									);
									if (
										stripped < length &&
										this.try_parse_list_marker(stripped) !== null
									) {
										this.states.pop();
										continue;
									}
								}
								// soft line break - emit soft_break node
								const sb_il = this.emit_open(
									NodeKind.soft_break,
									this.cursor,
									current_node,
								);
								this.emit_close(sb_il, this.cursor + 1);
								this.chomp1();
								continue;
							} else {
								// soft line break - emit soft_break node
								const sb_inl = this.emit_open(
									NodeKind.soft_break,
									this.cursor,
									current_node,
								);
								this.emit_close(sb_inl, this.cursor + 1);
								this.chomp1();
								// strip leading whitespace on continuation line
								while (
									this.cursor < length &&
									source.charCodeAt(this.cursor) === SPACE
								) {
									this.chomp1();
								}
								continue;
							}
						}
						case ASTERISK: {
							// need to see the next char for flanking check
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							if (
								this.prev & (CharMask.whitespace | CharMask.punctuation) &&
								this.next_class & (CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open(
									NodeKind.strong_emphasis,
									this.cursor,
									current_node,
									0,
									true,
								);

								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.emphasis_has_content = false;
								this.states.push(StateKind.strong_emphasis);
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node,
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
							}

							this.chomp1();
							continue;
						}

						case UNDERSCORE: {
							// need to see the next char for flanking check
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							if (
								this.prev & (CharMask.whitespace | CharMask.punctuation) &&
								this.next_class & (CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open(
									NodeKind.emphasis,
									this.cursor,
									current_node,
									0,
									true,
								);

								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.emphasis_has_content = false;
								this.states.push(StateKind.emphasis);
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node,
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
							}

							this.chomp1();
							continue;
						}

						case TILDE: {
							// ~~ is a two-char token. if only one ~ is available
							// and more input is expected, hold back.
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							// strikethrough: ~~ must be double tilde with flanking
							if (
								source.charCodeAt(this.cursor + 1) === TILDE &&
								this.prev & (CharMask.whitespace | CharMask.punctuation) &&
								classify(source.charCodeAt(this.cursor + 2)) &
									(CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open(
									NodeKind.strikethrough,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.set_value_start(n_id, this.cursor + 2);
								this.node_stack.push(n_id);
								this.states.push(StateKind.strikethrough);
								this.chomp(2);
							} else if (
								// subscript: single ~ with next char word/punctuation
								source.charCodeAt(this.cursor + 1) !== TILDE &&
								this.next_class & (CharMask.word | CharMask.punctuation)
							) {
								const n_id = this.emit_open(
									NodeKind.subscript,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(StateKind.subscript);
								this.chomp1();
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node,
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
								this.chomp1();
							}
							continue;
						}

						case CARET: {
							// superscript: ^ opens if next char is word/punctuation
							// (no left-flanking constraint - x^2^ is valid)
							if (this.next_class & (CharMask.word | CharMask.punctuation)) {
								const n_id = this.emit_open(
									NodeKind.superscript,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(StateKind.superscript);
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node,
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
							}
							this.chomp1();
							continue;
						}

						case CLOSE_SQUARE_BRACKET: {
							// if inside a link_text state, pop inline to let it handle ]
							if (
								this.states.length >= 2 &&
								this.states[this.states.length - 2] === StateKind.link_text
							) {
								this.states.pop();
								continue;
							}
							// otherwise ] is just text
							const t_id_br = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node,
							);
							this.out.set_value_start(t_id_br, this.cursor);
							this.node_stack.push(t_id_br);
							this.states.push(StateKind.text);
							this.chomp1();
							continue;
						}

						case BACKSLASH: {
							// \ is a two-char token (escape or hard break) - hold back
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							const next_code = source.charCodeAt(this.cursor + 1);
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
										this.block_quote_depth,
									);
									if (peek === -1) {
										const hb_id = this.emit_open(
											NodeKind.hard_break,
											this.cursor,
											current_node,
										);
										this.emit_close(hb_id, this.cursor + 2);
										this.chomp1(); // past `\` only; cursor now on lf
										this.states.pop(); // pop inline; paragraph will see the lf
										continue;
									}
								}
								const hb_id = this.emit_open(
									NodeKind.hard_break,
									this.cursor,
									current_node,
								);
								this.emit_close(hb_id, this.cursor + 2);
								this.chomp(2);
								// strip block quote markers
								if (this.block_quote_depth > 0) {
									const stripped = this.skip_bq_markers(
										this.cursor,
										this.block_quote_depth,
									);
									if (stripped !== -1) this.chomp(stripped, true);
								}
								// skip leading spaces
								while (
									this.cursor < length &&
									source.charCodeAt(this.cursor) === SPACE
								) {
									this.chomp1();
								}
								continue;
							}
							if (this.is_ascii_punctuation(next_code)) {
								// escape: start text node after the backslash
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor + 1,
									current_node,
								);
								this.out.set_value_start(t_id, this.cursor + 1);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
								this.chomp(2);
							} else {
								const t_id = this.emit_open(
									NodeKind.text,
									this.cursor,
									current_node,
								);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(StateKind.text);
								this.chomp1();
							}
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							// speculatively open a link - [ is a link until proven otherwise
							const link_id = this.emit_open(
								NodeKind.link,
								this.cursor,
								current_node,
								0,
								true,
							);
							this.node_stack.push(link_id);
							this.states.push(StateKind.link_text);
							this.link_text_start = this.cursor + 1;
							this.chomp1(); // skip [
							continue;
						}

						case EXCLAMATION_MARK: {
							// ![ is a two-char token - hold back lone ! at end of buffer
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							// ![  -> speculatively open an image
							if (source.charCodeAt(this.cursor + 1) === OPEN_SQUARE_BRACKET) {
								const img_id = this.emit_open(
									NodeKind.image,
									this.cursor,
									current_node,
									0,
									true,
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
								current_node,
							);
							this.node_stack.push(t_id);
							this.out.set_value_start(t_id, this.cursor);
							this.states.push(StateKind.text);
							this.chomp1();
							continue;
						}

						case OPEN_ANGLE_BRACKET: {
							// in incremental mode, stall if the tag might be incomplete
							if (
								!this.finished &&
								source.indexOf(">", this.cursor + 1) === -1
							) {
								break main_loop;
							}

							const uri_end = this.try_parse_uri_autolink(this.cursor + 1);
							if (uri_end !== -1) {
								const uri_text = source.slice(this.cursor + 1, uri_end - 1);
								const link_id = this.emit_open(
									NodeKind.link,
									this.cursor,
									current_node,
								);
								this.out.set_value_start(link_id, this.cursor + 1);
								this.out.set_value_end(link_id, uri_end - 1);
								this.emit_close(link_id, uri_end);
								this.out.attr(link_id, "href", uri_text);

								const text_id = this.emit_open(
									NodeKind.text,
									this.cursor + 1,
									link_id,
								);
								this.out.set_value_start(text_id, this.cursor + 1);
								this.out.set_value_end(text_id, uri_end - 1);
								this.emit_close(text_id, uri_end - 1);

								this.chomp(uri_end, true);
								this.states.pop();
								continue;
							}

							// try html comment: <!--
							const comment = this.try_parse_html_comment(this.cursor + 1);
							if (comment === false) break main_loop;
							if (comment) {
								const c_id = this.emit_open(
									NodeKind.html_comment,
									this.cursor,
									current_node,
								);
								this.out.text(c_id, comment.content_start, comment.content_end);
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
							if (open_tag) {
								if (open_tag.self_closing) {
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
									);
									this.out.attr(html_id, "tag", open_tag.tag);
									if (Object.keys(open_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", open_tag.attributes);
									}
									this.out.attr(html_id, "self_closing", true);
									this.emit_close(html_id, open_tag.end);
									this.chomp(open_tag.end, true);
									this.states.pop();
								} else if (this.is_raw_text_tag(open_tag.tag)) {
									const raw = this.find_raw_close_tag(
										open_tag.end,
										open_tag.tag,
									);
									if (!raw) {
										if (!this.finished) break main_loop;
										const html_id = this.emit_open(
											NodeKind.html,
											this.cursor,
											current_node,
										);
										this.out.attr(html_id, "tag", open_tag.tag);
										if (Object.keys(open_tag.attributes).length > 0) {
											this.out.attr(html_id, "attributes", open_tag.attributes);
										}
										this.out.set_value_start(html_id, open_tag.end);
										this.out.set_value_end(html_id, length);
										this.emit_close(html_id, length);
										this.chomp(length, true);
									} else {
										const html_id = this.emit_open(
											NodeKind.html,
											this.cursor,
											current_node,
										);
										this.out.attr(html_id, "tag", open_tag.tag);
										if (Object.keys(open_tag.attributes).length > 0) {
											this.out.attr(html_id, "attributes", open_tag.attributes);
										}
										this.out.set_value_start(html_id, open_tag.end);
										this.out.set_value_end(html_id, raw.content_end);
										this.emit_close(html_id, raw.end);
										this.chomp(raw.end, true);
									}
									this.states.pop();
								} else {
									const html_id = this.emit_open(
										NodeKind.html,
										this.cursor,
										current_node,
										0,
										true,
									);
									this.out.attr(html_id, "tag", open_tag.tag);
									if (Object.keys(open_tag.attributes).length > 0) {
										this.out.attr(html_id, "attributes", open_tag.attributes);
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
								current_node,
							);
							this.node_stack.push(t_id);
							this.out.set_value_start(t_id, this.cursor);
							this.states.push(StateKind.text);
							this.chomp1();
							continue;
						}

						case OPEN_BRACE: {
							// in incremental mode, stall if we can't see the closing brace
							if (!this.finished) {
								const probe = this.find_matching_brace(this.cursor + 1);
								if (probe === -1) break main_loop;
							}
							const expr_end = this.find_matching_brace(this.cursor + 1);
							if (expr_end !== -1) {
								// svelte void tag: {@tag ...}
								if (source.charCodeAt(this.cursor + 1) === AT) {
									// find the tag name: scan word chars after @
									let tp = this.cursor + 2;
									while (
										tp < expr_end - 1 &&
										source.charCodeAt(tp) !== SPACE &&
										source.charCodeAt(tp) !== TAB &&
										source.charCodeAt(tp) !== LINEFEED &&
										source.charCodeAt(tp) !== CLOSE_BRACE
									)
										tp++;
									const tag_name = source.slice(this.cursor + 2, tp);
									if (tag_name.length > 0) {
										const st_id = this.emit_open(
											NodeKind.svelte_tag,
											this.cursor,
											current_node,
										);
										this.out.attr(st_id, "tag", tag_name);
										// skip whitespace after tag name to find expression start
										while (
											tp < expr_end - 1 &&
											(source.charCodeAt(tp) === SPACE ||
												source.charCodeAt(tp) === TAB)
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
								const m_id = this.emit_open(
									NodeKind.mustache,
									this.cursor,
									current_node,
								);
								this.out.set_value_start(m_id, this.cursor + 1);
								this.out.set_value_end(m_id, expr_end - 1);
								this.emit_close(m_id, expr_end);
								this.chomp(expr_end, true);
								continue;
							}
							// unmatched { - treat as text
							const t_id_brace = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node,
							);
							this.out.set_value_start(t_id_brace, this.cursor);
							this.node_stack.push(t_id_brace);
							this.states.push(StateKind.text);
							this.chomp1();
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
								after_colon < length ? source.charCodeAt(after_colon) : 0;
							// must start with a letter
							if ((fc >= 97 && fc <= 122) || (fc >= 65 && fc <= 90)) {
								// scan name
								let np = after_colon;
								while (
									np < length &&
									this.is_directive_name_char(source.charCodeAt(np))
								) {
									np++;
								}
								// stall if name extends to end of buffer
								if (np >= length && !this.finished) break main_loop;
								// must be followed by [
								if (
									np < length &&
									source.charCodeAt(np) === OPEN_SQUARE_BRACKET
								) {
									const dir_name = source.slice(after_colon, np);
									const d_id = this.emit_open(
										NodeKind.directive_inline,
										this.cursor,
										current_node,
										0,
										true,
									);
									this.out.attr(d_id, "name", dir_name);
									this.node_stack.push(d_id);
									this.states.push(StateKind.link_text);
									this.link_text_start = np + 1;
									this.chomp(np + 1, true); // skip :name[
									continue;
								}
							}
							// not a directive - treat as text
							const t_id_colon = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node,
							);
							this.out.set_value_start(t_id_colon, this.cursor);
							this.node_stack.push(t_id_colon);
							this.states.push(StateKind.text);
							this.chomp1();
							continue;
						}

						case PIPE: {
							// transparent intraword delimiter - provides flanking
							// context for _ and * without producing output.
							// fan|_tas_|tic -> fan<em>tas</em>tic
							if (!this.in_table) {
								this.chomp1();
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
							const t_id = this.emit_open(
								NodeKind.text,
								this.cursor,
								current_node,
							);
							this.out.set_value_start(t_id, this.cursor);
							this.node_stack.push(t_id);

							this.states.push(StateKind.text);
							this.chomp1();
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
							(source.charCodeAt(value_end - 1) === SPACE ||
								source.charCodeAt(value_end - 1) === TAB)
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
						const next_code = source.charCodeAt(this.cursor + 1);
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
									this.block_quote_depth,
								);
								if (peek === -1) {
									this.emit_close(current_node, this.cursor);
									this.out.set_value_end(current_node, this.cursor);
									this.node_stack.pop();
									this.states.pop(); // pop text
									const parent_id_bq =
										this.node_stack[this.node_stack.length - 1];
									const hb_bq_id = this.emit_open(
										NodeKind.hard_break,
										this.cursor,
										parent_id_bq,
									);
									this.emit_close(hb_bq_id, this.cursor + 2);
									this.chomp1(); // past `\` only; cursor now on lf
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
							const hb_id = this.emit_open(
								NodeKind.hard_break,
								this.cursor,
								parent_id,
							);
							this.emit_close(hb_id, this.cursor + 2);
							this.chomp(2);
							// strip block quote markers
							if (this.block_quote_depth > 0) {
								const stripped = this.skip_bq_markers(
									this.cursor,
									this.block_quote_depth,
								);
								if (stripped !== -1) this.chomp(stripped, true);
							}
							// skip leading spaces
							while (
								this.cursor < length &&
								source.charCodeAt(this.cursor) === SPACE
							) {
								this.chomp1();
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
								parent_id,
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

					if (code === LINEFEED && this.block_quote_depth > 0) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					}

					if (
						!code ||
						(code === LINEFEED && this.is_block_interrupt(this.cursor + 1))
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (code === LINEFEED && this.list_depth > 0) {
						const np = this.cursor + 1;
						const { columns: ind } = this.count_indent(np);
						if (ind >= this.list_content_offset) {
							const stripped = this.skip_columns(np, this.list_content_offset);
							if (
								stripped < length &&
								this.try_parse_list_marker(stripped) !== null
							) {
								this.states.pop();
								this.emit_close(current_node, this.cursor);
								this.out.set_value_end(current_node, this.cursor);
								this.node_stack.pop();
								continue;
							}
						}
						// list continuation - close text, let inline emit soft_break
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (code === LINEFEED) {
						// non-blockquote, non-list linefeed - close text, let inline emit soft_break
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (code === COLON) {
						// only break text for inline directive: :letter...
						if (!this.finished && this.cursor + 1 >= length) break main_loop;
						const nc = source.charCodeAt(this.cursor + 1);
						if ((nc >= 97 && nc <= 122) || (nc >= 65 && nc <= 90)) {
							this.states.pop();
							this.emit_close(current_node, this.cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.node_stack.pop();
							this.states.pop();
							continue;
						}
						// not a directive - continue scanning past the colon
						this.chomp1();
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
					{
						let p = this.cursor + 1;
						while (p < length) {
							const ch = source.charCodeAt(p);
							if (TEXT_BREAK[ch]) break;
							p++;
						}
						this.cursor = p;
						this.prev = classify(source.charCodeAt(p - 1));
						this.current = classify(source.charCodeAt(p));
						this.next_class = classify(source.charCodeAt(p + 1));
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
							current_node,
						);
						this.node_stack.push(t_id);
						this.out.set_value_start(t_id, this.cursor);
						continue;
					}

					switch (code) {
						case BACKTICK: {
							this.checkpoint_cursor = this.cursor;
							this.extra += 1;
							this.chomp1();
							continue;
						}
						case OCTOTHERP: {
							// need lookahead for #! annotation
							if (!this.finished && this.cursor + 1 >= length) break main_loop;
							if (source.charCodeAt(this.cursor + 1) === EXCLAMATION_MARK) {
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
								current_node,
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
								current_node,
							);
							this.node_stack.push(cs_id);
							// don't set value_start yet - we don't know if stripping
							// applies until the closing backtick. the close handler
							// sets both value_start and value_end with correct boundaries.

							this.chomp(2);

							continue;
						}
						default: {
							this.states.pop();
							this.states.push(StateKind.code_span_end);
							const cs_id = this.emit_open(
								NodeKind.code_span,
								this.cursor - this.extra,
								current_node,
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
							if (source.charCodeAt(this.cursor + 1) === SPACE) {
								this.states.push(StateKind.code_span_content_leading_space);
								this.chomp(2);
							} else {
								this.states.push(StateKind.code_span_end);
								this.chomp1();
							}

							const cs_id = this.emit_open(
								NodeKind.code_span,
								this.info_start_pos - 2 - this.extra,
								current_node,
							);
							this.node_stack.push(cs_id);

							this.out.attr(cs_id, "info_start", this.info_start_pos);
							this.out.attr(cs_id, "info_end", this.info_end_pos);

							// set value_start only for the non-leading-space path.
							// the leading-space path defers until its close handler
							// determines whether stripping applies.
							if (source.charCodeAt(this.cursor - 2) !== SPACE) {
								this.out.set_value_start(cs_id, this.cursor);
							}

							continue;
						}
						default: {
							this.chomp1();
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
						source.charCodeAt(this.cursor + 1) === BACKTICK
					) {
						this.chomp1();
						this.states.pop();
						this.states.push(StateKind.code_span_leading_space_end);
						continue;
					} else if (
						code === BACKTICK &&
						source.charCodeAt(this.cursor - 1) !== BACKTICK
					) {
						if (
							(this.extra === 1 &&
								source.charCodeAt(this.cursor + 1) !== BACKTICK) ||
							(this.extra === 2 &&
								source.charCodeAt(this.cursor + 1) === BACKTICK &&
								source.charCodeAt(this.cursor + 2) !== BACKTICK)
						) {
							this.out.set_value_start(current_node, this.checkpoint_cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.emit_close(current_node, this.cursor + this.extra);
							this.node_stack.pop();
							this.states.pop();
							this.chomp(this.extra);
							continue;
						}
						this.chomp1();
						continue;
					} else if (code === LINEFEED) {
						this.out.set_value_start(current_node, this.checkpoint_cursor);
						this.chomp(this.cursor, true);
						this.states.pop();
						this.states.push(StateKind.code_span_end);
						continue;
					} else {
						this.chomp1();
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
						source.charCodeAt(this.cursor + 1) !== BACKTICK
					) {
						this.states.pop();
						this.out.set_value_start(current_node, this.checkpoint_cursor + 1);
						this.emit_close(current_node, this.cursor + this.extra);
						this.out.set_value_end(current_node, this.cursor - 1);
						this.node_stack.pop();
					} else if (
						this.extra === 2 &&
						code === BACKTICK &&
						source.charCodeAt(this.cursor + 1) === BACKTICK &&
						source.charCodeAt(this.cursor + 2) !== BACKTICK
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
							source.charCodeAt(this.cursor + run) === BACKTICK
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
						this.prev = classify(source.charCodeAt(this.cursor - 1));
						this.current = classify(source.charCodeAt(this.cursor));
						this.next_class = classify(source.charCodeAt(this.cursor + 1));
						continue;
					}

					if (
						(code === LINEFEED && this.is_blank_line_after(this.cursor)) ||
						code !== code
					) {
						// code span failure - revoke the code_span node.
						// handle_repair converts the code_span to a text node
						// for the backtick(s), so no additional text node needed.
						this.chomp(this.checkpoint_cursor + this.extra, true);
						this.out.revoke(this.node_stack[this.node_stack.length - 1]);
						this.node_stack.pop();
						this.states.pop();

						continue;
					}
					this.chomp1();
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

					// block-level interrupts end the table
					if (code === OCTOTHERP && this.is_heading_start(this.cursor)) {
						this.end_table();
						continue;
					}
					if (
						code === BACKTICK &&
						this.cursor + 2 < length &&
						source.charCodeAt(this.cursor + 1) === BACKTICK &&
						source.charCodeAt(this.cursor + 2) === BACKTICK
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
						this.table_node_id,
					);
					this.table_cell_col = 0;

					// skip leading pipe
					if (code === PIPE) {
						this.chomp1();
					}

					// open first cell and push onto node_stack for inline content
					this.table_cell_id = this.emit_open(
						NodeKind.table_cell,
						this.cursor,
						this.table_row_id,
						this.table_cell_col,
					);
					this.table_cell_has_content = false;
					this.node_stack.push(this.table_cell_id);
					this.states.push(StateKind.table_row_content);
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
						this.chomp1(); // skip the pipe

						// open next cell eagerly - don't push inline yet,
						// let the fallthrough handle whitespace skipping first
						if (this.table_cell_col < this.table_col_count) {
							this.table_cell_id = this.emit_open(
								NodeKind.table_cell,
								this.cursor,
								this.table_row_id,
								this.table_cell_col,
							);
							this.table_cell_has_content = false;
							this.node_stack.push(this.table_cell_id);
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
						this.chomp1();
						continue;
					}

					// skip leading whitespace before cell content
					if (
						!this.table_cell_has_content &&
						(code === SPACE || code === TAB)
					) {
						this.chomp1();
						continue;
					}

					// push inline to handle cell content
					this.table_cell_has_content = true;
					this.states.push(StateKind.inline);
					continue;
				}

				case StateKind.frontmatter: {
					// fast scan: look for `\n---` to close frontmatter.
					// search from cursor-1 so the newline ending the opening
					// fence can serve as the `\n` prefix for an empty body.
					const fm_search = this.cursor > 0 ? this.cursor - 1 : 0;
					const fm_close = source.indexOf("\n---", fm_search);
					if (fm_close === -1) {
						if (!this.finished) break main_loop;
						// eof without closing `---`: not valid frontmatter.
						// revoke and re-parse from position 0 as normal content.
						this.frontmatter_failed = true;
						const fm_id = this.node_stack.pop()!;
						this.states.pop();
						this.out.revoke(fm_id);
						this.chomp(0, true);
						continue;
					}

					// `\n---` found - check that nothing follows except optional newline/eof
					const after_fence = fm_close + 4; // position after `\n---`
					// in incremental mode, stall until we can see what follows `---`
					if (after_fence >= length && !this.finished) break main_loop;
					const ch_after = source.charCodeAt(after_fence);
					if (ch_after === LINEFEED || ch_after !== ch_after /* nan = eof */) {
						const fm_id = current_node;
						const end = ch_after === LINEFEED ? after_fence + 1 : after_fence;
						this.out.set_value_end(fm_id, fm_close + 1); // value ends at the \n before ---
						this.emit_close(fm_id, end);
						this.node_stack.pop();
						this.states.pop();
						this.chomp(end, true);
						continue;
					}

					// `---` followed by other chars - not a valid close.
					// skip past this `\n---` and keep scanning.
					this.chomp(after_fence, true);
					continue;
				}

				default: {
					this.chomp1();
					continue;
				}
			}
		}
	}

	// table helpers

	/**
	 * try to start a table at the current cursor position.
	 * requires seeing the full header row + full delimiter row.
	 * @returns true = table started, false = hold back, null = not a table
	 */
	private try_start_table(parent: number): boolean | null {
		const source = this.source;
		const length = source.length;

		// find end of header row
		let header_end = this.cursor;
		while (header_end < length && source.charCodeAt(header_end) !== LINEFEED)
			header_end++;
		if (header_end >= length && !this.finished) return false; // hold back - need \n

		// parse header cells
		const header_cells = this.parse_table_row_cells(this.cursor, header_end);
		if (header_cells.length === 0) return null;

		// find delimiter row
		const delim_start = header_end + 1;
		if (delim_start >= length && !this.finished) return false; // hold back

		let delim_end = delim_start;
		while (delim_end < length && source.charCodeAt(delim_end) !== LINEFEED)
			delim_end++;
		if (delim_end >= length && !this.finished) return false; // hold back - need full delimiter row

		// parse delimiter row
		const alignments = this.parse_delimiter_row(delim_start, delim_end);
		if (!alignments || alignments.length !== header_cells.length) return null; // not a table

		// confirmed table - emit structure
		const col_count = header_cells.length;
		const table_id = this.emit_open(NodeKind.table, this.cursor, parent);
		this.out.attr(table_id, "alignments", alignments);
		this.out.attr(table_id, "col_count", col_count);

		// store table state
		this.table_col_count = col_count;
		this.table_node_id = table_id;
		this.in_table = true;

		// emit header row using the inline state machinery:
		// open header node, then parse each cell through inline
		const header_id = this.emit_open(
			NodeKind.table_header,
			this.cursor,
			table_id,
		);
		for (let i = 0; i < header_cells.length; i++) {
			const cell = header_cells[i];
			const trimmed = this.trim_cell_range(cell.start, cell.end);
			this.table_cell_id = this.emit_open(
				NodeKind.table_cell,
				cell.start,
				header_id,
				i,
			);
			if (trimmed.start < trimmed.end) {
				// parse cell content through inline machinery
				this.node_stack.push(this.table_cell_id);
				this.parse_inline_range(trimmed.start, trimmed.end);
				this.node_stack.pop();
			}
			this.emit_close(this.table_cell_id, cell.end);
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

	/**
	 * parse cells from a table row between start and end positions.
	 * handles leading/trailing pipes and escaped pipes.
	 */
	private parse_table_row_cells(
		start: number,
		end: number,
	): { start: number; end: number }[] {
		const source = this.source;
		let pos = start;

		// skip leading whitespace
		while (
			pos < end &&
			(source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)
		)
			pos++;

		// skip leading pipe
		const has_leading_pipe = pos < end && source.charCodeAt(pos) === PIPE;
		if (has_leading_pipe) pos++;

		const cells: { start: number; end: number }[] = [];
		let cell_start = pos;

		while (pos < end) {
			const ch = source.charCodeAt(pos);
			if (ch === BACKSLASH && pos + 1 < end) {
				pos += 2; // skip escaped char
				continue;
			}
			if (ch === PIPE) {
				cells.push({ start: cell_start, end: pos });
				cell_start = pos + 1;
			}
			pos++;
		}

		// trailing content after last pipe (only if no leading pipe - gfm allows pipeless rows)
		if (cell_start < end) {
			// check if the content is just whitespace
			let all_ws = true;
			for (let i = cell_start; i < end; i++) {
				const c = source.charCodeAt(i);
				if (c !== SPACE && c !== TAB) {
					all_ws = false;
					break;
				}
			}
			if (!all_ws) {
				cells.push({ start: cell_start, end: end });
			}
		}

		return cells;
	}

	/**
	 * parse a delimiter row. returns alignment array or null if invalid.
	 */
	private parse_delimiter_row(start: number, end: number): string[] | null {
		const source = this.source;
		let pos = start;

		// skip leading whitespace
		while (
			pos < end &&
			(source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)
		)
			pos++;

		// skip leading pipe
		if (pos < end && source.charCodeAt(pos) === PIPE) pos++;

		const alignments: string[] = [];

		while (pos < end) {
			// skip whitespace
			while (pos < end && source.charCodeAt(pos) === SPACE) pos++;
			if (pos >= end) break;

			// check for trailing pipe at end
			if (source.charCodeAt(pos) === PIPE && pos + 1 >= end) break;

			let left_colon = false;
			if (source.charCodeAt(pos) === COLON) {
				left_colon = true;
				pos++;
			}

			let dash_count = 0;
			while (pos < end && source.charCodeAt(pos) === DASH) {
				dash_count++;
				pos++;
			}
			if (dash_count === 0) return null; // invalid delimiter cell

			let right_colon = false;
			if (pos < end && source.charCodeAt(pos) === COLON) {
				right_colon = true;
				pos++;
			}

			// skip whitespace
			while (pos < end && source.charCodeAt(pos) === SPACE) pos++;

			// expect pipe or end
			if (pos < end) {
				if (source.charCodeAt(pos) === PIPE) {
					pos++;
				} else {
					return null; // unexpected char
				}
			}

			if (left_colon && right_colon) alignments.push("center");
			else if (right_colon) alignments.push("right");
			else if (left_colon) alignments.push("left");
			else alignments.push("none");
		}

		return alignments.length > 0 ? alignments : null;
	}

	/**
	 * trim whitespace from cell content range.
	 */
	private trim_cell_range(
		start: number,
		end: number,
	): { start: number; end: number } {
		const source = this.source;
		let s = start,
			e = end;
		while (
			s < e &&
			(source.charCodeAt(s) === SPACE || source.charCodeAt(s) === TAB)
		)
			s++;
		while (
			e > s &&
			(source.charCodeAt(e - 1) === SPACE || source.charCodeAt(e - 1) === TAB)
		)
			e--;
		return { start: s, end: e };
	}

	/**
	 * emit a data row with cells, padding/truncating to table_col_count.
	 */
	private emit_table_row(
		row_start: number,
		row_end: number,
		parent: number,
	): void {
		const cells = this.parse_table_row_cells(row_start, row_end);
		const row_id = this.emit_open(NodeKind.table_row, row_start, parent);

		for (let i = 0; i < this.table_col_count; i++) {
			if (i < cells.length) {
				const cell = cells[i];
				const trimmed = this.trim_cell_range(cell.start, cell.end);
				const cell_id = this.emit_open(
					NodeKind.table_cell,
					cell.start,
					row_id,
					i,
				);
				if (trimmed.start < trimmed.end) {
					this.out.text(cell_id, trimmed.start, trimmed.end);
				}
				this.emit_close(cell_id, cell.end);
			} else {
				// pad with empty cells
				const cell_id = this.emit_open(
					NodeKind.table_cell,
					row_end,
					row_id,
					i,
				);
				this.emit_close(cell_id, row_end);
			}
		}

		this.emit_close(row_id, row_end);
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
		const saved_prev = this.prev;

		this.cursor = start;
		this.finished = true;
		this.prev = CharMask.whitespace;
		this.current = classify(this.source.charCodeAt(start));
		this.next_class = classify(this.source.charCodeAt(start + 1));

		// use a sentinel on the state stack so _run() stops here
		const sentinel = this.states.length;
		this.states.push(StateKind.table_row_content); // sentinel
		this.states.push(StateKind.inline);

		const save_source = this.source;
		this.source = this.source.slice(0, end);
		this.inline_range_parse = true;

		this._run();

		this.source = save_source;
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
				this.node_stack.pop();
			}
			this.states.pop();
		}

		// restore
		this.cursor = saved_cursor;
		this.finished = saved_finished;
		this.prev = saved_prev;
		this.current = classify(this.source.charCodeAt(this.cursor));
		this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
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
					(this.source.charCodeAt(ve - 1) === SPACE ||
						this.source.charCodeAt(ve - 1) === TAB)
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
				// revoke the code span and emit a text node for the
				// backtick(s) + content so nothing is lost
				const cs_id = this.node_stack[this.node_stack.length - 1];
				this.out.revoke(cs_id);
				this.node_stack.pop();
				this.states.pop();
				// create replacement text covering backticks + content
				const parent_id = this.node_stack[this.node_stack.length - 1];
				const t_id = this.emit_open(
					NodeKind.text,
					this.checkpoint_cursor,
					parent_id,
				);
				this.out.set_value_start(t_id, this.checkpoint_cursor);
				this.out.set_value_end(t_id, this.cursor);
				this.emit_close(t_id, this.cursor);
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
				i,
			);
			this.emit_close(cell_id, this.cursor);
		}
		this.emit_close(this.table_row_id, this.cursor);
	}

	/**
	 * close the current table and pop state.
	 */
	private end_table(): void {
		this.emit_close(this.table_node_id, this.cursor);
		this.states.pop(); // pop table_body
		this.node_stack.pop(); // pop table node
		this.table_col_count = 0;
		this.table_node_id = 0;
		this.table_row_id = 0;
		this.table_cell_id = 0;
		this.table_cell_col = 0;
		this.in_table = false;
	}

	private _finalize(): void {
		const length = this.source.length;

		// close unclosed nodes gently (set end if not already set)
		// skip pending nodes - those will be revoked below.
		for (let i = 0; i < this.node_stack.length; i++) {
			const id = this.node_stack[i];
			if (!this.closed_flags[id] && !this.pending_has(id)) {
				this.out.set_value_end(id, length - 1);
				this.emit_close(id, length - 1);
			}
		}

		// revoke any remaining pending nodes (unclosed html, unclosed emphasis, etc.)
		for (let pi = 0; pi < this.pending_count; pi++) {
			const id = this.pending_ids[pi];
			const kind = this.NodeKind_array[id];
			// block-level revocations (html) need the source text for repair
			if (kind === NodeKind.html) {
				const start = this.pending_starts[pi];
				// find end: scan from start to the closing > or use the line end
				let end = start;
				while (end < length && this.source.charCodeAt(end) !== LINEFEED) end++;
				this.out.revoke(id, this.source.slice(start, end));
			} else {
				this.out.revoke(id);
			}
		}
		this.pending_count = 0;
	}
}

/**
 * parse markdown that may include svelte syntax into tokens and nodes.
 * @param input source markdown string.
 * @param options parser configuration and reusable storage.
 * @returns arena-backed parse result and collected tokens.
 */
export function parse_markdown_svelte(
	input: string,
	options: ParseOptions = {},
): { nodes: NodeBuffer; errors: ErrorCollector } {
	let dispatcher: PluginDispatcher | undefined;
	if (options.plugins && options.plugins.length > 0) {
		const text_source = new SourceTextSource(input);
		dispatcher = new PluginDispatcher(options.plugins, text_source);
	}

	const tree = new TreeBuilder(input.length >> 3 || 128, dispatcher);
	const parser = new PFMParser(tree, options.tab_size);
	const { errors } = parser.parse(input);

	// run sequential plugins after parse completes
	if (dispatcher) {
		dispatcher.run_sequential(tree.get_buffer());
	}

	return { nodes: tree.get_buffer(), errors };
}
