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
} from './constants';

import type { parse_options, parse_result, parse_context } from './types';
import type { Introspector } from './introspector';
import type { Emitter } from './opcodes';
import { node_kind } from './utils';
import { node_buffer, error_collector } from './utils';
import { TreeBuilder } from './tree_builder';
export type { parse_options, parse_result } from './types';
export { node_kind, node_buffer } from './utils';
export { Introspector } from './introspector';
export type { introspection_entry } from './introspector';
export { WireEmitter, WireOp } from './wire_emitter';
// PFMDocument retained for pixi renderer — not part of primary API.
// Use TreeBuilder/WireTreeBuilder + PFMCursor + CursorHTMLRenderer instead.
export { PFMDocument, applyBatch, textContent } from './pfm_document';
export type { PFMNode, PFMHandlers } from './pfm_document';
export type { Emitter } from './opcodes';

const enum char_mask {
	whitespace = 1 << 0,
	punctuation = 1 << 1,
	word = 1 << 2,
}

console.warn("NEW VERSION")

const char_class_table = new Uint8Array(128);

for (let i = 0; i < char_class_table.length; i += 1) {
	let mask = 0;

	if (i <= 0x20) {
		mask |= char_mask.whitespace;
	}

	if ((i >= 33 && i <= 47) || (i >= 58 && i <= 64)) {
		mask |= char_mask.punctuation;
	}

	// Classify ~, ^, and | as punctuation for delimiter flanking
	if (i === 126 || i === 94 || i === 124) {
		mask |= char_mask.punctuation;
		mask &= ~char_mask.word;
	}

	if (mask === 0) {
		mask = char_mask.word;
	}

	char_class_table[i] = mask;
}

const classify = (code: number): char_mask =>
	// Common case first: ASCII (code < 128). NaN < 128 is false, so
	// NaN falls through to the second branch where code !== code catches it.
	code < 128
		? char_class_table[code]
		: code !== code
			// NaN means charCodeAt read past the buffer. Return a mask that
			// satisfies ALL flanking checks so both openers and closers
			// commit speculatively. Revocation corrects if wrong.
			? (char_mask.whitespace | char_mask.punctuation | char_mask.word)
			: char_mask.word;

/**
 * Lookup table for characters that break out of text scanning.
 * Any character that requires the text state to yield control
 * (delimiters, escapes, line breaks, table pipes).
 */
/** Shared empty error collector — avoids allocation when no errors are recorded. */
const EMPTY_ERRORS = new error_collector(1);

const text_break = new Uint8Array(128);
text_break[LINEFEED] = 1;
text_break[BACKSLASH] = 1;
text_break[ASTERISK] = 1;
text_break[UNDERSCORE] = 1;
text_break[TILDE] = 1;
text_break[CARET] = 1;
text_break[OPEN_ANGLE_BRACKET] = 1;
text_break[OPEN_SQUARE_BRACKET] = 1;
text_break[CLOSE_SQUARE_BRACKET] = 1;
text_break[EXCLAMATION_MARK] = 1;
text_break[BACKTICK] = 1;
text_break[PIPE] = 1;
text_break[OPEN_BRACE] = 1;

export const enum state_kind {
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
}

const fences = Array.from({ length: 20 }, (_, i) =>
	Array(i).fill('`').join('')
);

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
 * PFM Parser — state machine that emits opcodes via an Emitter interface.
 *
 * Replaces the old closure-based `tokenize()` function. All state-machine
 * logic is identical; only the output mechanism changes from direct
 * node_buffer manipulation to Emitter calls.
 */
export class PFMParser {
	// Source
	private source: string = '';
	private cursor: number = 0;
	private finished: boolean = false;

	// State machine
	private states: state_kind[] = [state_kind.root];
	private node_stack: number[] = [0]; // stack of opcode IDs

	// ID generation
	private next_id: number = 1; // 0 is reserved for root
	private pending_ids: number[] = [];
	private pending_count: number = 0;
	private closed_flags: number[] = [];
	private node_kind_array: node_kind[] = [];

	// Char classification
	private prev: number = char_mask.whitespace;
	private current: number = 0;
	private next_class: number = 0;

	// Block state
	private block_quote_depth: number = 0;
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
	}[] = [];

	// Table state
	private table_col_count: number = 0;
	private table_alignments: string[] = [];
	private table_node_id: number = 0;
	private table_row_id: number = 0;
	private table_cell_id: number = 0;
	private table_cell_col: number = 0;
	private table_cell_start: number = 0;
	private table_text_id: number = 0; // 0 = no open text node in current cell
	private in_table: boolean = false;
	private inline_range_parse: boolean = false;
	private table_cell_has_content: boolean = false;

	// HTML state
	private html_tag_stack: { id: number; tag: string }[] = [];
	private html_block_depth: number = 0;

	// Svelte block state
	private svelte_block_depth: number = 0;
	private svelte_block_tag: string = '';
	private svelte_branch_id: number = 0;
	private svelte_block_id: number = 0;
	private svelte_block_stack: {
		block_id: number;
		branch_id: number;
		tag: string;
	}[] = [];

	// Misc
	private extra: number = 0;
	private info_start_pos: number = 0;
	private info_end_pos: number = 0;
	private checkpoint_cursor: number = 0;
	private prev_cursor: number = 0;
	private loop_without_progress: number = 0;

	// Output
	private out: Emitter;
	private errors: error_collector;

	// Introspector (optional)
	private introspector?: Introspector;

	constructor(emitter: Emitter) {
		this.out = emitter;
		this.errors = EMPTY_ERRORS;
	}

	/**
	 * Parse a complete source string.
	 * @param source The markdown source to parse.
	 * @param introspector Optional introspector for debugging.
	 * @returns Object with error collector.
	 */
	/**
	 * Parse a complete source string (batch mode). Equivalent to
	 * init() + feed(source) + finish().
	 */
	parse(source: string, introspector?: Introspector): { errors: error_collector } {
		this._init(introspector);
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
	 * Initialize the parser for incremental feeding. Must be called
	 * before the first feed() call.
	 */
	init(introspector?: Introspector): void {
		this._init(introspector);
		this.finished = false;
	}

	/**
	 * Feed a chunk of source text. The parser advances as far as it
	 * can, stalling at line boundaries when lookahead is insufficient.
	 * Call init() before the first feed().
	 */
	feed(chunk: string): void {
		this.source += chunk;
		this.current = classify(this.source.charCodeAt(this.cursor));
		this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
		this._run();
		this.out.cursor(this.cursor);
	}

	/**
	 * Signal end-of-input. Finalizes all open nodes and revokes
	 * pending speculation.
	 */
	finish(): { errors: error_collector } {
		this.finished = true;
		this._run();
		this._finalize();
		this.out.cursor(this.cursor);
		return { errors: this.errors };
	}

	private _init(introspector?: Introspector): void {
		this.source = '';
		this.cursor = 0;
		this.finished = false;
		this.states = [state_kind.root];
		this.node_stack = [0];
		this.next_id = 1;
		this.pending_ids = [];
		this.pending_count = 0;
		this.closed_flags = [];
		this.node_kind_array = [];
		this.prev = char_mask.whitespace;
		this.current = char_mask.whitespace;
		this.next_class = char_mask.whitespace;
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
		this.table_col_count = 0;
		this.table_alignments = [];
		this.table_node_id = 0;
		this.table_row_id = 0;
		this.table_cell_id = 0;
		this.table_cell_col = 0;
		this.table_cell_start = 0;
		this.table_text_id = 0;
		this.in_table = false;
		this.inline_range_parse = false;
		this.table_cell_has_content = false;
		this.html_tag_stack = [];
		this.html_block_depth = 0;
		this.svelte_block_depth = 0;
		this.svelte_block_tag = '';
		this.svelte_branch_id = 0;
		this.svelte_block_id = 0;
		this.svelte_block_stack = [];
		this.extra = 0;
		this.info_start_pos = 0;
		this.info_end_pos = 0;
		this.checkpoint_cursor = 0;
		this.prev_cursor = 0;
		this.loop_without_progress = 0;
		this.errors = EMPTY_ERRORS;
		this.introspector = introspector;

		// Emit the root node open
		this.out.open(0, node_kind.root, 0, -1, 0, false);
	}

	// -----------------------------------------------------------
	// Helpers to emit opcodes
	// -----------------------------------------------------------

	private emit_open(kind: node_kind, start: number, parent: number, extra = 0, pending = false): number {
		const id = this.next_id++;
		this.out.open(id, kind, start, parent, extra, pending);
		if (pending) { this.pending_ids[this.pending_count++] = id; }
		this.node_kind_array[id] = kind;
		return id;
	}

	private emit_close(id: number, end: number): void {
		this.out.close(id, end);
		this.closed_flags[id] = 1;
	}

	/** Swap-remove an id from the dense pending_ids array. */
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

	/** Check if an id is in the pending_ids array. */
	private pending_has(id: number): boolean {
		const ids = this.pending_ids;
		for (let i = 0; i < this.pending_count; i++) {
			if (ids[i] === id) return true;
		}
		return false;
	}

	// -----------------------------------------------------------
	// chomp — advance cursor and update char classification
	// -----------------------------------------------------------

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

	/** Fast path for the common case: advance cursor by 1. */
	private chomp1(): void {
		this.cursor++;
		this.prev = this.current;
		this.current = this.next_class;
		this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
	}

	/**
	 * Check if there's enough input after a LINEFEED at `pos` to make
	 * a block-level decision. We need to see the first non-whitespace
	 * character on the next line (or a \n for blank line detection).
	 * Returns false if we ran out of buffer before finding it.
	 */
	private can_decide_after_lf(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		for (let p = pos + 1; p < length; p++) {
			const ch = source.charCodeAt(p);
			if (ch !== SPACE && ch !== TAB) {
				// Found non-ws. Need one more byte past it so handlers
				// have enough context (e.g., > needs space after it)
				return p + 1 < length;
			}
		}
		return false; // only whitespace until end of buffer — need more
	}

	// -----------------------------------------------------------
	// Helper predicates (ported from closures)
	// -----------------------------------------------------------

	private is_heading_start(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
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
		// Hit end-of-buffer without \n — not a confirmed blank line in feed mode
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
		if (marker !== ASTERISK && marker !== DASH && marker !== UNDERSCORE) return false;

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

		return count >= 3;
	}

	private is_ascii_punctuation(code: number): boolean {
		return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
			(code >= 91 && code <= 96) || (code >= 123 && code <= 126);
	}

	private skip_bq_markers(pos: number, depth: number): number {
		const source = this.source;
		const length = source.length;
		for (let i = 0; i < depth; i++) {
			while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
				pos++;
			}
			if (pos >= length || source.charCodeAt(pos) !== CLOSE_ANGLE_BRACKET) return -1;
			pos++;
			if (pos < length && source.charCodeAt(pos) === SPACE) pos++;
		}
		return pos;
	}

	private is_block_quote_start(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
			pos++;
		}
		return pos < length && source.charCodeAt(pos) === CLOSE_ANGLE_BRACKET;
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
	 * Single-pass lookahead: does a block-level construct start at `pos`?
	 * Skips whitespace once, checks the first meaningful character, then
	 * dispatches to the specific predicate only when the char could start
	 * a block construct. For continuation lines (most common case) this
	 * returns false after one whitespace scan + one char check.
	 */
	private is_block_interrupt(pos: number): boolean {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// Skip leading whitespace once
		while (p < length) {
			const ch = source.charCodeAt(p);
			if (ch !== SPACE && ch !== TAB) break;
			p++;
		}

		// End of buffer → blank line only if finished
		if (p >= length) return this.finished;

		const ch = source.charCodeAt(p);

		// Blank line
		if (ch === LINEFEED) return true;

		// Svelte block boundary ({: or {/) interrupts paragraphs
		if (ch === OPEN_BRACE && this.is_svelte_block_boundary(p)) return true;

		// Fast exit: first non-ws char can't start any block construct
		switch (ch) {
			case OCTOTHERP:
				return this.is_heading_start(pos);
			case CLOSE_ANGLE_BRACKET:
				return true;
			case BACKTICK:
				return p + 2 < length &&
					source.charCodeAt(p + 1) === BACKTICK &&
					source.charCodeAt(p + 2) === BACKTICK;
			case ASTERISK:
			case DASH:
			case UNDERSCORE:
				return this.is_thematic_break_start(pos) ||
					(ch !== UNDERSCORE && this.is_list_item_start_interrupt(pos));
			case PLUS:
				return this.is_list_item_start_interrupt(pos);
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
		let indent = 0;

		while (pos < length && source.charCodeAt(pos) === SPACE) {
			indent++;
			pos++;
		}
		// PFM: no indent limit (CommonMark limits to 0-3 because 4+ is indented code,
		// but PFM removes indented code blocks — indentation is insignificant)

		if (pos >= length) return null;
		const ch = source.charCodeAt(pos);

		// Unordered: -, *, +
		if (ch === DASH || ch === ASTERISK || ch === PLUS) {
			// In incremental mode, don't accept a marker at end of buffer —
			// more characters may follow (e.g. `---` thematic break)
			if (pos + 1 >= length && !this.finished) return null;
			const after = source.charCodeAt(pos + 1);
			if (pos + 1 >= length || after === SPACE || after === TAB || after === LINEFEED) {
				let content_start = pos + 1;
				if (content_start < length && (after === SPACE || after === TAB)) {
					content_start++;
				}
				return {
					indent,
					marker_char: ch,
					ordered: false,
					start_num: 0,
					content_start,
					content_offset: content_start - start,
				};
			}
			return null;
		}

		// Ordered: digits followed by . or )
		if (ch >= 48 && ch <= 57) {
			const num_start = pos;
			while (pos < length && source.charCodeAt(pos) >= 48 && source.charCodeAt(pos) <= 57) {
				pos++;
			}
			if (pos - num_start > 9) return null;

			if (pos >= length) return null;
			const delimiter = source.charCodeAt(pos);
			if (delimiter !== DOT && delimiter !== CLOSE_PAREN) return null;

			// In incremental mode, don't accept a marker at end of buffer
			if (pos + 1 >= length && !this.finished) return null;
			const after = source.charCodeAt(pos + 1);
			if (pos + 1 >= length || after === SPACE || after === TAB || after === LINEFEED) {
				let content_start = pos + 1;
				if (content_start < length && (after === SPACE || after === TAB)) {
					content_start++;
				}
				const num = parseInt(source.slice(num_start, pos), 10);
				return {
					indent,
					marker_char: delimiter,
					ordered: true,
					start_num: num,
					content_start,
					content_offset: content_start - start,
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
			if (source.charCodeAt(p) !== SPACE && source.charCodeAt(p) !== TAB) return true;
			p++;
		}
		return false;
	}

	private start_list(marker: MarkerResult, parent: number): void {
		// Save current list state for nesting
		if (this.list_depth > 0) {
			this.list_state_stack.push({
				marker: this.list_marker,
				ordered: this.list_ordered,
				start_num: this.list_start_num,
				node_idx: this.list_node_id,
				is_loose: this.list_is_loose,
				content_offset: this.list_content_offset,
				marker_indent: this.list_marker_indent,
			});
		}

		this.list_depth++;
		this.list_ordered = marker.ordered;
		this.list_marker = marker.marker_char;
		this.list_start_num = marker.start_num;
		this.list_is_loose = false;
		this.list_content_offset = marker.content_offset;
		this.list_marker_indent = marker.indent;

		const list_id = this.emit_open(node_kind.list, this.cursor, parent);
		this.node_stack.push(list_id);
		this.list_node_id = list_id;

		const item_id = this.emit_open(node_kind.list_item, this.cursor, list_id);
		this.node_stack.push(item_id);

		this.states.push(state_kind.list_item);
		this.chomp(marker.content_start, true);
	}

	private end_list(): void {
		// Close list_item
		const item_id = this.node_stack[this.node_stack.length - 1];
		this.emit_close(item_id, this.cursor);
		this.node_stack.pop();

		// Set list metadata and close
		const list_id = this.node_stack[this.node_stack.length - 1];
		this.out.attr(list_id, 'ordered', this.list_ordered);
		this.out.attr(list_id, 'start', this.list_start_num);
		this.out.attr(list_id, 'tight', !this.list_is_loose);
		this.emit_close(list_id, this.cursor);
		this.node_stack.pop();

		this.states.pop();
		this.list_depth--;

		// Restore outer list state if nested
		if (this.list_depth > 0 && this.list_state_stack.length > 0) {
			const prev = this.list_state_stack.pop()!;
			this.list_marker = prev.marker;
			this.list_ordered = prev.ordered;
			this.list_start_num = prev.start_num;
			this.list_node_id = prev.node_idx;
			this.list_is_loose = prev.is_loose;
			this.list_content_offset = prev.content_offset;
			this.list_marker_indent = prev.marker_indent;
		}
	}

	/**
	 * Open a svelte_block + first svelte_branch from a {#tag expr} token.
	 */
	private start_svelte_block(
		token: { kind: '#' | ':' | '/'; tag: string; expr_start: number; expr_end: number; end: number },
		parent: number
	): void {
		// Save current svelte block state for nesting
		if (this.svelte_block_depth > 0) {
			this.svelte_block_stack.push({
				block_id: this.svelte_block_id,
				branch_id: this.svelte_branch_id,
				tag: this.svelte_block_tag,
			});
		}

		this.svelte_block_depth++;
		this.svelte_block_tag = token.tag;

		// Open svelte_block
		const block_id = this.emit_open(node_kind.svelte_block, this.cursor, parent);
		this.out.attr(block_id, 'tag', token.tag);
		this.svelte_block_id = block_id;
		this.node_stack.push(block_id);

		// Open first svelte_branch
		const branch_id = this.emit_open(node_kind.svelte_branch, this.cursor, block_id);
		this.out.attr(branch_id, 'tag', token.tag);
		if (token.expr_start !== 0 || token.expr_end !== 0) {
			this.out.set_value_start(branch_id, token.expr_start);
			this.out.set_value_end(branch_id, token.expr_end);
		}
		this.svelte_branch_id = branch_id;
		this.node_stack.push(branch_id);

		this.states.push(state_kind.svelte_branch);
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
			if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) ||
				(ch >= 48 && ch <= 57) || ch === 43 || ch === 45 || ch === 46) {
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

	private try_parse_email_autolink(pos: number): number {
		const source = this.source;
		const length = source.length;
		let p = pos;
		let ch: number;
		const local_start = p;

		while (p < length) {
			ch = source.charCodeAt(p);
			if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) ||
				(ch >= 48 && ch <= 57) || ch === 46 || ch === 45 || ch === 95) {
				p++;
			} else {
				break;
			}
		}

		if (p === local_start || source.charCodeAt(p) !== AT) return -1;
		p++;

		const domain_start = p;
		let has_dot = false;

		while (p < length) {
			ch = source.charCodeAt(p);
			if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) ||
				(ch >= 48 && ch <= 57) || ch === 45) {
				p++;
			} else if (ch === 46) {
				has_dot = true;
				p++;
			} else {
				break;
			}
		}

		if (p === domain_start || !has_dot || source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET) return -1;
		return p + 1;
	}

	// -----------------------------------------------------------
	// HTML tag parsing helpers
	// -----------------------------------------------------------

	/**
	 * Check if character code is a valid tag name start (letter or underscore).
	 */
	private is_tag_name_start(ch: number): boolean {
		return (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === UNDERSCORE;
	}

	/**
	 * Check if character code is a valid tag name continuation
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
	 * Check if character is valid in an unquoted attribute value.
	 * Invalid: whitespace, ", ', =, <, >, `
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
	 * Try to parse an HTML opening tag starting at pos (the char after `<`).
	 * Returns null if not a valid tag.
	 */
	private try_parse_html_open_tag(
		pos: number
	): {
		tag: string;
		attributes: Record<string, string | boolean>;
		self_closing: boolean;
		end: number;
	} | null {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// Tag name must start with a letter or underscore
		if (p >= length || !this.is_tag_name_start(source.charCodeAt(p))) return null;

		const tag_start = p;
		p++;
		while (p < length && this.is_tag_name_char(source.charCodeAt(p))) p++;
		const tag = source.slice(tag_start, p);

		// Parse attributes
		const attributes: Record<string, string | boolean> = {};

		while (p < length) {
			// Skip whitespace
			while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB || source.charCodeAt(p) === LINEFEED)) p++;

			if (p >= length) return null;

			// Check for end of tag
			if (source.charCodeAt(p) === SLASH) {
				if (p + 1 < length && source.charCodeAt(p + 1) === CLOSE_ANGLE_BRACKET) {
					return { tag, attributes, self_closing: true, end: p + 2 };
				}
				return null; // stray /
			}

			if (source.charCodeAt(p) === CLOSE_ANGLE_BRACKET) {
				return { tag, attributes, self_closing: false, end: p + 1 };
			}

			// Svelte shorthand attribute: {name}
			if (source.charCodeAt(p) === OPEN_BRACE) {
				const expr_end = this.find_matching_brace(p + 1);
				if (expr_end === -1) return null;
				const expr = source.slice(p + 1, expr_end - 1);
				attributes[expr] = expr;
				p = expr_end;
				continue;
			}

			// Parse attribute name
			const attr_name_start = p;
			const ch = source.charCodeAt(p);
			// Attribute name: anything that's not whitespace, =, >, /
			if (
				ch === EQUALS || ch === CLOSE_ANGLE_BRACKET || ch === SLASH
			) {
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

			// Skip whitespace before potential =
			while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB || source.charCodeAt(p) === LINEFEED)) p++;

			if (p < length && source.charCodeAt(p) === EQUALS) {
				p++; // skip =
				// Skip whitespace after =
				while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB || source.charCodeAt(p) === LINEFEED)) p++;

				if (p >= length) return null;

				const quote = source.charCodeAt(p);
				if (quote === OPEN_BRACE) {
					// Svelte expression attribute value: attr={expr}
					const expr_end = this.find_matching_brace(p + 1);
					if (expr_end === -1) return null;
					attributes[attr_name] = source.slice(p + 1, expr_end - 1);
					p = expr_end;
				} else if (quote === QUOTE || quote === APOSTROPHE) {
					// Quoted value
					p++; // skip opening quote
					const value_start = p;
					while (p < length && source.charCodeAt(p) !== quote) p++;
					if (p >= length) return null; // unclosed quote
					const value = source.slice(value_start, p);
					p++; // skip closing quote
					attributes[attr_name] = value;
				} else {
					// Unquoted value
					const value_start = p;
					while (p < length && this.is_unquoted_attr_char(source.charCodeAt(p))) p++;
					if (p === value_start) return null; // empty unquoted value
					attributes[attr_name] = source.slice(value_start, p);
				}
			} else {
				// Boolean attribute
				attributes[attr_name] = true;
			}
		}

		return null; // ran off end of input
	}

	/**
	 * Try to parse an HTML closing tag starting at pos (the char after `<`).
	 * pos should point to the `/` in `</tag>`.
	 * Returns the tag name and end position, or null.
	 */
	private try_parse_html_close_tag(
		pos: number
	): { tag: string; end: number } | null {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// Must start with /
		if (p >= length || source.charCodeAt(p) !== SLASH) return null;
		p++;

		// Optional whitespace after /
		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		// Tag name
		if (p >= length || !this.is_tag_name_start(source.charCodeAt(p))) return null;
		const tag_start = p;
		p++;
		while (p < length && this.is_tag_name_char(source.charCodeAt(p))) p++;
		const tag = source.slice(tag_start, p);

		// Optional whitespace before >
		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		// Must end with >
		if (p >= length || source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET) return null;
		return { tag, end: p + 1 };
	}

	/**
	 * Try to parse an HTML comment starting at pos (the char after `<`).
	 * pos should point to the `!` in `<!--`.
	 * Returns the content start, content end, and end position.
	 */
	private try_parse_html_comment(
		pos: number
	): { content_start: number; content_end: number; end: number } | null {
		const source = this.source;
		const length = source.length;
		let p = pos;

		// Must be <!--
		if (
			p + 2 >= length ||
			source.charCodeAt(p) !== EXCLAMATION_MARK ||
			source.charCodeAt(p + 1) !== DASH ||
			source.charCodeAt(p + 2) !== DASH
		) {
			return null;
		}
		p += 3;
		const content_start = p;

		// Scan for -->
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

		return null; // no closing -->
	}

	/**
	 * Find the matching HTML opener on the html_tag_stack for a closing tag.
	 * Returns the stack index or -1 if not found.
	 */
	/**
	 * Find the matching HTML opener on the html_tag_stack for a closing tag.
	 * Returns the stack index or -1 if not found.
	 */
	private find_html_opener(tag: string): number {
		for (let i = this.html_tag_stack.length - 1; i >= 0; i--) {
			if (this.html_tag_stack[i].tag === tag) return i;
		}
		return -1;
	}

	/**
	 * Close an inline HTML element by unwinding state/node stacks.
	 */
	private close_html_inline(html_id: number, end: number): void {
		// Unwind the node stack and state stack to find and close this HTML element
		while (this.node_stack.length > 1) {
			const top_id = this.node_stack[this.node_stack.length - 1];
			const top_state = this.states[this.states.length - 1];

			if (top_id === html_id) {
				// Found the HTML element — commit and close it
				this.pending_remove(html_id);
				this.emit_close(html_id, end);
				this.node_stack.pop();
				this.states.pop(); // pop html_element state
				// Pop trailing inline state if present
				if (this.states[this.states.length - 1] === state_kind.inline) {
					this.states.pop();
				}
				return;
			}

			// Close intermediate nodes (text, emphasis, etc.)
			if (!this.closed_flags[top_id]) {
				this.out.set_value_end(top_id, this.cursor);
				this.emit_close(top_id, this.cursor);
			}
			this.node_stack.pop();
			this.states.pop();
		}
	}

	/**
	 * Try to parse a Svelte block token at `pos` (pointing at `{`).
	 * Returns null if not a svelte block token.
	 * Recognizes: {#tag expr}, {:tag expr}, {/tag}
	 */
	private try_parse_svelte_block_token(
		pos: number
	): { kind: '#' | ':' | '/'; tag: string; expr_start: number; expr_end: number; end: number } | null {
		const source = this.source;
		const length = source.length;
		if (pos >= length || source.charCodeAt(pos) !== OPEN_BRACE) return null;
		let p = pos + 1;
		if (p >= length) return null;
		const sigil = source.charCodeAt(p);
		if (sigil !== OCTOTHERP && sigil !== COLON && sigil !== SLASH) return null;
		const kind_ch = sigil === OCTOTHERP ? '#' : sigil === COLON ? ':' : '/';
		p++;

		// Tag name
		const tag_start = p;
		while (p < length && source.charCodeAt(p) !== SPACE && source.charCodeAt(p) !== TAB && source.charCodeAt(p) !== CLOSE_BRACE) p++;
		if (p === tag_start) return null;
		let tag = source.slice(tag_start, p);

		// Handle {:else if expr} — "else if" is a compound tag name
		if (kind_ch === ':' && tag === 'else') {
			const save = p;
			while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;
			if (p + 1 < length && source.charCodeAt(p) === 105 /* i */ && source.charCodeAt(p + 1) === 102 /* f */ &&
				(p + 2 >= length || source.charCodeAt(p + 2) === SPACE || source.charCodeAt(p + 2) === TAB || source.charCodeAt(p + 2) === CLOSE_BRACE)) {
				tag = 'else if';
				p += 2;
			} else {
				p = save;
			}
		}

		if (kind_ch === '/') {
			// {/tag} — no expression
			while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;
			if (p >= length || source.charCodeAt(p) !== CLOSE_BRACE) return null;
			return { kind: kind_ch, tag, expr_start: 0, expr_end: 0, end: p + 1 };
		}

		// Skip whitespace after tag name
		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		if (p < length && source.charCodeAt(p) === CLOSE_BRACE) {
			// No expression: {#tag} or {:tag}
			return { kind: kind_ch, tag, expr_start: 0, expr_end: 0, end: p + 1 };
		}

		// Expression content: find the matching }
		const expr_start = p;
		const brace_end = this.find_matching_brace(expr_start);
		if (brace_end === -1) return null;
		// brace_end points past the }, expr_end is just before it
		return { kind: kind_ch, tag, expr_start, expr_end: brace_end - 1, end: brace_end };
	}

	/**
	 * Check if position starts with a svelte block continuation ({:...}) or
	 * closer ({/...}) that would interrupt the current block content.
	 */
	private is_svelte_block_boundary(pos: number): boolean {
		if (this.svelte_block_depth === 0) return false;
		const source = this.source;
		if (pos >= source.length || source.charCodeAt(pos) !== OPEN_BRACE) return false;
		const next = source.charCodeAt(pos + 1);
		return next === COLON || next === SLASH;
	}

	/**
	 * Find the matching closing brace for a Svelte expression.
	 * pos should point to the char after the opening `{`.
	 * Tracks nested braces and skips over string literals and template literals.
	 * Returns the position just past the closing `}`, or -1 if not found.
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
					// Skip string literal
					p++;
					while (p < length && source.charCodeAt(p) !== ch) {
						if (source.charCodeAt(p) === BACKSLASH) p++; // skip escaped char
						p++;
					}
					if (p < length) p++; // skip closing quote
					break;
				}
				case BACKTICK: {
					// Skip template literal, respecting ${} interpolations
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
							// Recursively find the matching } for the interpolation
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
					// Skip // line comments
					if (p + 1 < length && source.charCodeAt(p + 1) === SLASH) {
						p += 2;
						while (p < length && source.charCodeAt(p) !== LINEFEED) p++;
						break;
					}
					// Skip /* block comments */
					if (p + 1 < length && source.charCodeAt(p + 1) === ASTERISK) {
						p += 2;
						while (p < length) {
							if (source.charCodeAt(p) === ASTERISK && p + 1 < length && source.charCodeAt(p + 1) === SLASH) {
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

	private try_parse_inline_link(pos: number): LinkResult | null {
		const source = this.source;
		const length = source.length;
		if (source.charCodeAt(pos) !== OPEN_SQUARE_BRACKET) return null;

		let p = pos + 1;
		let bracket_depth = 1;

		while (p < length && bracket_depth > 0) {
			const ch = source.charCodeAt(p);
			if (ch === BACKSLASH && p + 1 < length) {
				p += 2;
				continue;
			}
			if (ch === OPEN_SQUARE_BRACKET) bracket_depth++;
			else if (ch === CLOSE_SQUARE_BRACKET) bracket_depth--;
			if (bracket_depth > 0) p++;
		}

		if (bracket_depth !== 0) return null;

		const text_start = pos + 1;
		const text_end = p;
		p++;

		if (p >= length || source.charCodeAt(p) !== OPEN_PAREN) return null;
		p++;

		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		let url_start: number, url_end: number;

		if (p < length && source.charCodeAt(p) === OPEN_ANGLE_BRACKET) {
			p++;
			url_start = p;
			while (p < length) {
				const ch = source.charCodeAt(p);
				if (ch === CLOSE_ANGLE_BRACKET) break;
				if (ch === LINEFEED || ch === OPEN_ANGLE_BRACKET) return null;
				if (ch === BACKSLASH && p + 1 < length && source.charCodeAt(p + 1) !== LINEFEED) {
					p += 2;
					continue;
				}
				p++;
			}
			if (p >= length || source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET) return null;
			url_end = p;
			p++;
		} else if (p < length && source.charCodeAt(p) === CLOSE_PAREN) {
			url_start = p;
			url_end = p;
		} else {
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
			if (paren_depth !== 0) return null;
			url_end = p;
		}

		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		let title_start = -1, title_end = -1;
		if (p < length) {
			const tc = source.charCodeAt(p);
			if (tc === 34 || tc === 39 || tc === OPEN_PAREN) {
				const close_char = tc === OPEN_PAREN ? CLOSE_PAREN : tc;
				p++;
				title_start = p;
				while (p < length) {
					const ch = source.charCodeAt(p);
					if (ch === close_char) break;
					if (ch === LINEFEED) return null;
					if (ch === BACKSLASH && p + 1 < length) {
						p += 2;
						continue;
					}
					p++;
				}
				if (p >= length || source.charCodeAt(p) !== close_char) return null;
				title_end = p;
				p++;
			}
		}

		while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

		if (p >= length || source.charCodeAt(p) !== CLOSE_PAREN) return null;
		p++;

		return { text_start, text_end, url_start, url_end, title_start, title_end, end: p };
	}

	/**
	 * Start a heading from a block dispatch state. Validates # count,
	 * emits open(heading), skips whitespace after #, and pushes
	 * heading_marker state for streaming content.
	 */
	/**
	 * Returns false if we need to hold back (not enough input).
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
			this.states.push(state_kind.paragraph);
			const para_id = this.emit_open(node_kind.paragraph, this.cursor, parent);
			this.node_stack.push(para_id);
			return true;
		}

		// Need to see the character after the hashes to decide
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
			this.states.push(state_kind.paragraph);
			const para_id = this.emit_open(node_kind.paragraph, this.cursor, parent);
			this.node_stack.push(para_id);
			return true;
		}

		// Skip whitespace after #
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

		// Emit open and value_start — content will stream via heading_marker state
		const h_id = this.emit_open(node_kind.heading, this.cursor, parent, hash_count);
		this.out.set_value_start(h_id, content_start);
		this.node_stack.push(h_id);
		this.states.push(state_kind.heading_marker);
		this.chomp(content_start, true);
		return true;
	}

	// -----------------------------------------------------------
	// Main loop
	// -----------------------------------------------------------

	private _run(): void {
		const source = this.source;
		const length = source.length;
		const introspector = this.introspector;

		// Reset progress counter — new data may have been fed since last _run()
		this.loop_without_progress = 0;
		let iter_count = 0;

		main_loop: while (this.cursor <= length) {
			// Stop when we've consumed all available input.
			if (!this.finished && this.cursor >= length) {
				break;
			}

			// Revoke pending speculative nodes as soon as we're back at
			// a block-level state — they'll never close.
			if (this.pending_count > 0) {
				const st = this.states[this.states.length - 1];
				if (
					st === state_kind.root ||
					st === state_kind.block_quote ||
					st === state_kind.list_item
				) {
					for (let pi = 0; pi < this.pending_count; pi++) {
						this.out.revoke(this.pending_ids[pi]);
					}
					this.pending_count = 0;
				}
			}

			if (introspector) introspector.step(this.cursor, this.states);

			const active = this.states[this.states.length - 1];
			const code = source.charCodeAt(this.cursor);

			const current_node = this.node_stack[this.node_stack.length - 1];

			if ((++iter_count & 63) === 0) {
				if (this.cursor === this.prev_cursor) {
					this.loop_without_progress += 64;
					if (this.loop_without_progress > 100) {
						console.error('Infinite loop detected');
						break;
					}
				} else {
					this.loop_without_progress = 0;
				}
				this.prev_cursor = this.cursor;
			}

			switch (active) {
				case state_kind.root: {
					if (code !== code) {
						this.chomp1();
						continue;
					}
					switch (code) {
						case LINEFEED: {
							const id = this.emit_open(node_kind.line_break, this.cursor, current_node);
							this.emit_close(id, this.cursor + 1);
							this.chomp1();
							continue;
						}

						case SPACE:
						case TAB: {
							let pos = this.cursor;
							while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
								pos++;
							}
							if (pos < length && source.charCodeAt(pos) === LINEFEED) {
								const id = this.emit_open(node_kind.line_break, this.cursor, current_node);
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
							this.states.push(state_kind.code_fence_start);
							this.extra = 0;
							continue;
						}

						case ASTERISK:
						case DASH:
						case UNDERSCORE: {
							// Need 2 bytes of lookahead to distinguish
							// thematic break (---) from list (- ) from paragraph
							if (!this.finished && this.cursor + 2 >= length) {
								break main_loop;
							}
							if (this.is_thematic_break_start(this.cursor)) {
								let line_end = this.cursor;
								while (line_end < length && source.charCodeAt(line_end) !== LINEFEED) {
									line_end++;
								}
								const break_end = line_end < length ? line_end + 1 : line_end;

								const tb_id = this.emit_open(node_kind.thematic_break, this.cursor, current_node);
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
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_ANGLE_BRACKET: {
							// In incremental mode, stall if the tag might be incomplete
							// (no closing > visible in the available source).
							if (!this.finished && source.indexOf('>', this.cursor + 1) === -1) {
								break main_loop;
							}

							// Autolinks get handled as inline content (in a paragraph).
							// Check if this is an autolink to avoid misparse as HTML.
							const blk_uri = this.try_parse_uri_autolink(this.cursor + 1);
							const blk_email = blk_uri !== -1 ? -1 : this.try_parse_email_autolink(this.cursor + 1);
							if (blk_uri !== -1 || blk_email !== -1) {
								// Start a paragraph and let inline handle it
								this.states.push(state_kind.paragraph);
								const auto_para = this.emit_open(node_kind.paragraph, this.cursor, current_node);
								this.node_stack.push(auto_para);
								continue;
							}

							// Try HTML comment at block level
							const blk_comment = this.try_parse_html_comment(this.cursor + 1);
							if (blk_comment) {
								const c_id = this.emit_open(node_kind.html_comment, this.cursor, current_node);
								this.out.text(c_id, blk_comment.content_start, blk_comment.content_end);
								this.emit_close(c_id, blk_comment.end);
								this.chomp(blk_comment.end, true);
								continue;
							}

							// Try HTML opening tag at block level
							const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
							if (blk_tag) {
								if (blk_tag.self_closing) {
									const html_id = this.emit_open(node_kind.html, this.cursor, current_node);
									this.out.attr(html_id, 'tag', blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, 'attributes', blk_tag.attributes);
									}
									this.out.attr(html_id, 'self_closing', true);
									this.emit_close(html_id, blk_tag.end);
									this.chomp(blk_tag.end, true);
								} else {
									const html_id = this.emit_open(node_kind.html, this.cursor, current_node, 0, true);
									this.out.attr(html_id, 'tag', blk_tag.tag);
									if (Object.keys(blk_tag.attributes).length > 0) {
										this.out.attr(html_id, 'attributes', blk_tag.attributes);
									}
									this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
									this.node_stack.push(html_id);
									this.states.push(state_kind.html_block_element);
									this.html_block_depth++;
									this.chomp(blk_tag.end, true);
								}
								continue;
							}

							// Not HTML — start paragraph
							this.states.push(state_kind.paragraph);
							const blk_para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(blk_para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && source.charCodeAt(p) === SPACE) p++;

							this.block_quote_depth++;
							const bq_id = this.emit_open(node_kind.block_quote, this.cursor, current_node);
							this.node_stack.push(bq_id);
							this.states.push(state_kind.block_quote);
							this.chomp(p, true);
							continue;
						}

						case PIPE: {
							const result = this.try_start_table(current_node);
							if (result === false) break main_loop; // hold back
							if (result === true) continue; // table started
							// Not a table — fall through to paragraph
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}

						case OPEN_BRACE: {
							// Svelte block opener: {#tag expr}
							if (!this.finished) {
								const probe = this.find_matching_brace(this.cursor + 1);
								if (probe === -1) break main_loop;
							}
							const token = this.try_parse_svelte_block_token(this.cursor);
							if (token && token.kind === '#') {
								this.start_svelte_block(token, current_node);
								continue;
							}
							// Not a block — start paragraph (inline will handle {expr})
							this.states.push(state_kind.paragraph);
							const brace_para = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(brace_para);
							continue;
						}

						default: {
							if (code === PLUS || (code >= 48 && code <= 57)) {
								const marker = this.try_parse_list_marker(this.cursor);
								if (marker) {
									this.start_list(marker, current_node);
									continue;
								}
							}
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}
					}
				}

				case state_kind.paragraph: {
					const node_stack_base = 1 + this.block_quote_depth + this.list_depth * 2 + this.html_block_depth + this.svelte_block_depth * 2;

					if (!code) {
						if (!this.finished) break main_loop;
						this.emit_close(current_node, this.cursor);
						this.states.pop();
						this.node_stack.length = node_stack_base;
						continue;
					}

					// At LINEFEED: need to see next line to decide boundary.
					// Hold back if nothing follows and more input may come.
					if (code === LINEFEED && !this.finished && !this.can_decide_after_lf(this.cursor)) {
						break main_loop;
					}

					if (code === LINEFEED) {
						const next_pos = this.cursor + 1;

						// In block quotes, try stripping > markers first
						if (this.block_quote_depth > 0) {
							const stripped = this.skip_bq_markers(next_pos, this.block_quote_depth);

							if (stripped !== -1) {
								// Markers stripped — check for block interrupt at stripped pos
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
								// Continuation line inside block quote — emit soft break
								const sb_p = this.emit_open(node_kind.soft_break, this.cursor, current_node);
								this.emit_close(sb_p, this.cursor + 1);
								this.chomp(stripped, true);
								this.states.push(state_kind.inline);
								continue;
							}

							// No markers stripped — check for interrupts at raw next_pos
							if (
								this.is_blank_line_after(this.cursor) ||
								this.is_heading_start(next_pos) ||
								this.is_thematic_break_start(next_pos) ||
								(source.charCodeAt(next_pos) === BACKTICK &&
									source.charCodeAt(next_pos + 1) === BACKTICK &&
									source.charCodeAt(next_pos + 2) === BACKTICK)
							) {
								this.emit_close(current_node, this.cursor);
								this.states.pop();
								this.node_stack.length = node_stack_base;
								continue;
							}
							this.chomp1();
							this.states.push(state_kind.inline);
							continue;
						}

						// Not in block quote — use is_block_interrupt for the common case
						if (this.is_block_interrupt(next_pos)) {
							this.emit_close(current_node, this.cursor);
							this.states.pop();
							this.node_stack.length = node_stack_base;
							continue;
						}

						// Check for list item start within a list
						if (this.list_depth > 0) {
							let ind = 0;
							let tp = next_pos;
							while (tp < length && source.charCodeAt(tp) === SPACE) { ind++; tp++; }
							if (ind >= this.list_content_offset) {
								const stripped = next_pos + this.list_content_offset;
								if (stripped < length && this.try_parse_list_marker(stripped) !== null) {
									this.emit_close(current_node, this.cursor);
									this.states.pop();
									this.node_stack.length = node_stack_base;
									continue;
								}
							}
						}
						this.chomp1();
						continue;
					} else {
						this.states.push(state_kind.inline);
						continue;
					}
				}

				case state_kind.code_fence_start: {
					if (code === BACKTICK) {
						this.extra += 1;
						this.chomp1();
						continue;
					} else if (this.extra >= 3) {
						this.states.pop();
						this.states.push(state_kind.code_fence_info);
						const cf_id = this.emit_open(node_kind.code_fence, this.cursor - this.extra, current_node);
						this.node_stack.push(cf_id);

						this.info_start_pos = this.cursor;

						continue;
					} else {
						this.states.pop();
						const para_id = this.emit_open(node_kind.paragraph, this.cursor - this.extra, current_node);
						this.node_stack.push(para_id);
						this.states.push(state_kind.paragraph);
						this.chomp(this.cursor - this.extra, true);
						continue;
					}
				}

				case state_kind.code_fence_info: {
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
						this.states.push(state_kind.code_fence_content);
						this.out.attr(current_node, 'info_start', this.info_start_pos);
						this.out.attr(current_node, 'info_end', this.cursor);
						this.chomp1();

						this.out.set_value_start(current_node, this.cursor);

						continue;
					}
				}

				case state_kind.code_fence_content: {
					// Scan line-by-line for closing fence: a line with only
					// optional whitespace followed by >= extra backticks.
					const fence_len = this.extra;
					let scan = this.cursor;
					let found_index = -1;
					let found_nl = -1;

					// Check if the current line (at cursor, which is a line start)
					// is itself the closing fence (empty code block case).
					{
						let lp = scan;
						while (lp < length && (source.charCodeAt(lp) === SPACE || source.charCodeAt(lp) === TAB)) lp++;
						const bt_start = lp;
						while (lp < length && source.charCodeAt(lp) === BACKTICK) lp++;
						if (lp - bt_start >= fence_len) {
							// Closing fence on the first content line — value is empty
							found_index = bt_start;
							found_nl = this.cursor > 0 ? this.cursor - 1 : this.cursor;
						}
					}

					if (found_index === -1) {
						while (scan < length) {
							const nl = source.indexOf('\n', scan);
							if (nl === -1) break;

							let lp = nl + 1;
							while (lp < length && (source.charCodeAt(lp) === SPACE || source.charCodeAt(lp) === TAB)) lp++;
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
						this.states.push(state_kind.code_fence_text_end);
						this.chomp(length, true);
						continue;
					}

					// Count actual backticks at found_index for chomp
					let bt_end = found_index;
					while (bt_end < length && source.charCodeAt(bt_end) === BACKTICK) bt_end++;

					this.states.pop();
					this.states.push(state_kind.code_fence_text_end);
					this.out.set_value_end(current_node, found_nl);
					this.chomp(bt_end, true);
					continue;
				}

				case state_kind.code_fence_text_end: {
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
					this.emit_close(current_node, this.cursor);
					let ep = this.cursor;
					while (ep < length && source.charCodeAt(ep) !== LINEFEED) ep++;
					this.node_stack.pop();
					this.states.pop();
					this.chomp(ep, true);
					continue;
				}

				case state_kind.heading_marker: {
					// Streaming heading content. Accumulate until LINEFEED or EOF.
					if (code === LINEFEED || code !== code) {
						// Trim trailing whitespace from value
						let value_end = this.cursor;
						while (
							value_end > 0 &&
							(source.charCodeAt(value_end - 1) === SPACE ||
								source.charCodeAt(value_end - 1) === TAB)
						) {
							value_end--;
						}
						this.out.set_value_end(current_node, value_end);
						// Close heading without consuming \n — let parent handle it
						this.emit_close(current_node, this.cursor);
						this.node_stack.pop();
						this.states.pop();
						continue;
					}
					// Fast scan: heading content is everything until LINEFEED
					{
						const nl = source.indexOf('\n', this.cursor + 1);
						const p = nl === -1 ? length : nl;
						this.cursor = p;
						this.prev = classify(source.charCodeAt(p - 1));
						this.current = classify(source.charCodeAt(p));
						this.next_class = classify(source.charCodeAt(p + 1));
					}
					continue;
				}

				case state_kind.strong_emphasis: {
					if (
						code === ASTERISK &&
						this.prev & (char_mask.word | char_mask.punctuation) &&
						this.next_class & (char_mask.whitespace | char_mask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];
						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						// Pop trailing inline so parent state sees next char directly
						if (this.states[this.states.length - 1] === state_kind.inline) {
							this.states.pop();
						}
					} else if (code === LINEFEED && this.block_quote_depth > 0) {
						const next_pos = this.cursor + 1;
						const stripped = this.skip_bq_markers(next_pos, this.block_quote_depth);

						if (stripped !== -1 && !this.is_blank_at_pos(stripped) &&
							!this.is_heading_start(stripped) && !this.is_thematic_break_start(stripped)) {
							const sb_bq = this.emit_open(node_kind.soft_break, this.cursor, current_node);
							this.emit_close(sb_bq, this.cursor + 1);
							this.chomp(stripped, true);
							this.states.push(state_kind.inline);
						} else {
							this.states.pop();
							this.emit_close(current_node, this.cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.node_stack.pop();
						}
						continue;
					} else if (
						code === LINEFEED &&
						this.is_blank_line_after(this.cursor)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (
						code === LINEFEED &&
						this.is_heading_start(this.cursor + 1)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (
						code === LINEFEED &&
						this.is_thematic_break_start(this.cursor + 1)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else {
						this.states.push(state_kind.inline);
					}

					continue;
				}

				case state_kind.emphasis: {
					if (
						code === UNDERSCORE &&
						this.prev & (char_mask.word | char_mask.punctuation) &&
						this.next_class & (char_mask.whitespace | char_mask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];
						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						if (this.states[this.states.length - 1] === state_kind.inline) {
							this.states.pop();
						}
					} else if (code === LINEFEED && this.block_quote_depth > 0) {
						const next_pos = this.cursor + 1;
						const stripped = this.skip_bq_markers(next_pos, this.block_quote_depth);

						if (stripped !== -1 && !this.is_blank_at_pos(stripped) &&
							!this.is_heading_start(stripped) && !this.is_thematic_break_start(stripped)) {
							const sb_bq = this.emit_open(node_kind.soft_break, this.cursor, current_node);
							this.emit_close(sb_bq, this.cursor + 1);
							this.chomp(stripped, true);
							this.states.push(state_kind.inline);
						} else {
							this.states.pop();
							this.emit_close(current_node, this.cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.node_stack.pop();
						}
						continue;
					} else if (
						code === LINEFEED &&
						this.is_blank_line_after(this.cursor)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (
						code === LINEFEED &&
						this.is_heading_start(this.cursor + 1)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (
						code === LINEFEED &&
						this.is_thematic_break_start(this.cursor + 1)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else {
						this.states.push(state_kind.inline);
					}

					continue;
				}

				case state_kind.strikethrough: {
					// ~~ is a two-char token — hold back lone ~ at end of buffer
					if (code === TILDE && !this.finished && this.cursor + 1 >= length) {
						break main_loop;
					}
					// Close: ~~ with right-flanking
					if (
						code === TILDE &&
						source.charCodeAt(this.cursor + 1) === TILDE &&
						this.prev & (char_mask.word | char_mask.punctuation) &&
						classify(source.charCodeAt(this.cursor + 2)) & (char_mask.whitespace | char_mask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];
						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 2);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp(2);
						if (this.states[this.states.length - 1] === state_kind.inline) {
							this.states.pop();
						}
					} else if (
						code === LINEFEED &&
						this.is_blank_line_after(this.cursor)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (
						code === LINEFEED &&
						(this.is_heading_start(this.cursor + 1) || this.is_thematic_break_start(this.cursor + 1))
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else {
						this.states.push(state_kind.inline);
					}
					continue;
				}

				case state_kind.superscript: {
					// Close: ^ after content (no right-flanking needed —
					// ^ is unambiguous, and x^2^y must work)
					if (
						code === CARET &&
						this.prev & (char_mask.word | char_mask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];
						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						if (this.states[this.states.length - 1] === state_kind.inline) {
							this.states.pop();
						}
					} else if (
						code === LINEFEED &&
						this.is_blank_line_after(this.cursor)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (
						code === LINEFEED &&
						(this.is_heading_start(this.cursor + 1) || this.is_thematic_break_start(this.cursor + 1))
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else {
						this.states.push(state_kind.inline);
					}
					continue;
				}

				case state_kind.subscript: {
					// Close: single ~ after content (no right-flanking needed —
					// ~ is unambiguous inside subscript, and H~2~O must work)
					if (
						code === TILDE &&
						source.charCodeAt(this.cursor + 1) !== TILDE &&
						this.prev & (char_mask.word | char_mask.punctuation)
					) {
						const n_id = this.node_stack[this.node_stack.length - 1];
						this.out.set_value_end(n_id, this.cursor);
						this.emit_close(n_id, this.cursor + 1);
						this.pending_remove(n_id);
						this.states.pop();
						this.node_stack.pop();
						this.chomp1();
						if (this.states[this.states.length - 1] === state_kind.inline) {
							this.states.pop();
						}
					} else if (
						code === LINEFEED &&
						this.is_blank_line_after(this.cursor)
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (
						code === LINEFEED &&
						(this.is_heading_start(this.cursor + 1) || this.is_thematic_break_start(this.cursor + 1))
					) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else {
						this.states.push(state_kind.inline);
					}
					continue;
				}

				case state_kind.link_text: {
					// Inside [link text] or ![image alt] — stream content,
					// watch for closing ]
					if (code === CLOSE_SQUARE_BRACKET) {
						// Found ] — need to see what follows to decide
						const after = this.cursor + 1;

						// If ] is at end of buffer and more input may come,
						// hold back — ( might arrive next
						if (after >= length && !this.finished) {
							break main_loop;
						}

						if (after < length && source.charCodeAt(after) === OPEN_PAREN) {
							// Parse the (url "title") part
							let p = after + 1;
							// Skip whitespace
							while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

							let url_start = p;
							let url_end = p;

							// Check for angle-bracket URL
							if (p < length && source.charCodeAt(p) === OPEN_ANGLE_BRACKET) {
								p++;
								url_start = p;
								while (p < length && source.charCodeAt(p) !== CLOSE_ANGLE_BRACKET && source.charCodeAt(p) !== LINEFEED) p++;
								if (p < length && source.charCodeAt(p) === CLOSE_ANGLE_BRACKET) {
									url_end = p;
									p++;
								}
							} else if (p < length && source.charCodeAt(p) === CLOSE_PAREN) {
								// Empty URL: [text]()
								url_start = p;
								url_end = p;
							} else {
								// Regular URL — balanced parens, no spaces
								url_start = p;
								let paren_depth = 0;
								while (p < length) {
									const ch = source.charCodeAt(p);
									if (ch <= 0x20) break;
									if (ch === CLOSE_PAREN) { if (paren_depth === 0) break; paren_depth--; }
									if (ch === OPEN_PAREN) paren_depth++;
									if (ch === BACKSLASH && p + 1 < length) { p += 2; continue; }
									p++;
								}
								url_end = p;
							}

							// Skip whitespace
							while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

							// Optional title
							let title_start = -1;
							let title_end = -1;
							if (p < length) {
								const tc = source.charCodeAt(p);
								if (tc === 34 || tc === 39 || tc === OPEN_PAREN) {
									const close_char = tc === OPEN_PAREN ? CLOSE_PAREN : tc;
									p++;
									title_start = p;
									while (p < length && source.charCodeAt(p) !== close_char && source.charCodeAt(p) !== LINEFEED) {
										if (source.charCodeAt(p) === BACKSLASH && p + 1 < length) { p += 2; continue; }
										p++;
									}
									if (p < length && source.charCodeAt(p) === close_char) {
										title_end = p;
										p++;
									}
								}
							}

							// Skip trailing whitespace
							while (p < length && (source.charCodeAt(p) === SPACE || source.charCodeAt(p) === TAB)) p++;

							if (p < length && source.charCodeAt(p) === CLOSE_PAREN) {
								p++; // skip )
								// Success — set attrs and close
								const n_id = current_node;
								const url = source.slice(url_start, url_end);
								const is_image = this.node_kind_array[n_id] === node_kind.image;
								this.out.attr(n_id, is_image ? 'src' : 'href', url);
								if (title_start >= 0 && title_end >= 0) {
									this.out.attr(n_id, 'title', source.slice(title_start, title_end));
								}
								this.out.set_value_end(n_id, this.cursor);
								this.pending_remove(n_id);
								this.emit_close(n_id, p);
								this.node_stack.pop();
								this.states.pop();
								if (this.states[this.states.length - 1] === state_kind.inline) {
									this.states.pop();
								}
								this.chomp(p, true);
								continue;
							}

							// URL parsing didn't find ) — if we hit end of buffer
							// and more input may come, hold back
							if (!this.finished && p >= length) {
								break main_loop;
							}
							// ( found but URL is malformed — fall through to revoke
						}

						// Definitively not a link: ] followed by non-( character,
						// or malformed URL with all input available. Revoke.
						this.out.revoke(current_node);
						this.node_stack.pop();
						this.states.pop();
						continue;
					}

					if (code === LINEFEED && this.is_blank_line_after(this.cursor)) {
						// Paragraph boundary — revoke link
						this.out.revoke(current_node);
						this.node_stack.pop();
						this.states.pop();
						continue;
					}

					// Dispatch inline content inside the link text
					this.states.push(state_kind.inline);
					continue;
				}

				case state_kind.html_element: {
					// Inline HTML container state.
					// Check if current char starts a matching closing tag.
					if (code === OPEN_ANGLE_BRACKET) {
						// Stall if tag might be incomplete
						if (!this.finished && source.indexOf('>', this.cursor + 1) === -1) {
							break main_loop;
						}
						const close = this.try_parse_html_close_tag(this.cursor + 1);
						if (close) {
							const opener_idx = this.find_html_opener(close.tag);
							if (opener_idx !== -1 && this.html_tag_stack[opener_idx].id === current_node) {
								// Close intermediate unclosed HTML elements
								while (this.html_tag_stack.length > opener_idx + 1) {
									const intermediate = this.html_tag_stack.pop()!;
									this.close_html_inline(intermediate.id, this.cursor);
								}
								// Close this HTML element — commit the pending node
								this.html_tag_stack.pop();
								this.pending_remove(current_node);
								this.emit_close(current_node, close.end);
								this.node_stack.pop();
								this.states.pop();
								this.chomp(close.end, true);
								// Pop trailing inline state if present
								if (this.states[this.states.length - 1] === state_kind.inline) {
									this.states.pop();
								}
								continue;
							}
						}
					}

					if (!code) {
						if (!this.finished) break main_loop;
						// EOF: unwind stacks — _finalize will revoke the pending node
						if (this.html_tag_stack.length > 0 &&
							this.html_tag_stack[this.html_tag_stack.length - 1].id === current_node) {
							this.html_tag_stack.pop();
						}
						this.states.pop();
						this.node_stack.pop();
						continue;
					}

					// Dispatch to inline for content inside the element
					this.states.push(state_kind.inline);
					continue;
				}

				case state_kind.html_block_element: {
					// Block-level HTML container state.
					// Acts like root but also checks for closing tags.

					if (!code) {
						if (!this.finished) break main_loop;
						// EOF: unwind stacks — _finalize will revoke the pending node
						if (this.html_tag_stack.length > 0 &&
							this.html_tag_stack[this.html_tag_stack.length - 1].id === current_node) {
							this.html_tag_stack.pop();
						}
						this.html_block_depth--;
						this.states.pop();
						this.node_stack.pop();
						continue;
					}

					// Check for closing tag
					if (code === OPEN_ANGLE_BRACKET) {
						// Stall if tag might be incomplete
						if (!this.finished && source.indexOf('>', this.cursor + 1) === -1) {
							break main_loop;
						}
						const close = this.try_parse_html_close_tag(this.cursor + 1);
						if (close) {
							const opener_idx = this.find_html_opener(close.tag);
							if (opener_idx !== -1 && this.html_tag_stack[opener_idx].id === current_node) {
								// Close intermediate HTML elements
								while (this.html_tag_stack.length > opener_idx + 1) {
									const intermediate = this.html_tag_stack.pop()!;
									if (!this.closed_flags[intermediate.id]) {
										this.emit_close(intermediate.id, this.cursor);
									}
								}
								// Close this HTML element — commit the pending node
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

					// Skip linefeeds — they act as separators
					if (code === LINEFEED) {
						const lb_id = this.emit_open(node_kind.line_break, this.cursor, current_node);
						this.emit_close(lb_id, this.cursor + 1);
						this.chomp1();
						continue;
					}

					// Skip leading whitespace
					if (code === SPACE || code === TAB) {
						let pos = this.cursor;
						while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
							pos++;
						}
						if (pos < length && source.charCodeAt(pos) === LINEFEED) {
							const lb_id = this.emit_open(node_kind.line_break, this.cursor, current_node);
							this.emit_close(lb_id, pos + 1);
							this.chomp(pos + 1, true);
							continue;
						}
						this.chomp1();
						continue;
					}

					// Dispatch block-level content inside the HTML element
					// (headings, code fences, paragraphs, nested HTML, etc.)
					if (code === OCTOTHERP) {
						if (!this.start_heading(current_node)) break main_loop;
						continue;
					}

					if (code === BACKTICK) {
						this.states.push(state_kind.code_fence_start);
						this.extra = 0;
						continue;
					}

					if (code === OPEN_ANGLE_BRACKET) {
						// Nested HTML at block level
						const blk_comment = this.try_parse_html_comment(this.cursor + 1);
						if (blk_comment) {
							const c_id = this.emit_open(node_kind.html_comment, this.cursor, current_node);
							this.out.text(c_id, blk_comment.content_start, blk_comment.content_end);
							this.emit_close(c_id, blk_comment.end);
							this.chomp(blk_comment.end, true);
							continue;
						}

						const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
						if (blk_tag) {
							if (blk_tag.self_closing) {
								const html_id = this.emit_open(node_kind.html, this.cursor, current_node);
								this.out.attr(html_id, 'tag', blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, 'attributes', blk_tag.attributes);
								}
								this.out.attr(html_id, 'self_closing', true);
								this.emit_close(html_id, blk_tag.end);
								this.chomp(blk_tag.end, true);
							} else {
								const html_id = this.emit_open(node_kind.html, this.cursor, current_node, 0, true);
								this.out.attr(html_id, 'tag', blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, 'attributes', blk_tag.attributes);
								}
								this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
								this.node_stack.push(html_id);
								this.states.push(state_kind.html_block_element);
								this.html_block_depth++;
								this.chomp(blk_tag.end, true);
							}
							continue;
						}
					}

					// Default: start a paragraph for text content
					this.states.push(state_kind.paragraph);
					const blk_html_para = this.emit_open(node_kind.paragraph, this.cursor, current_node);
					this.node_stack.push(blk_html_para);
					continue;
				}

				case state_kind.svelte_branch: {
					// Container state for svelte block branches.
					// Dispatches block content like root, but also handles
					// {:tag} (new branch) and {/tag} (close block).

					if (!code) {
						if (!this.finished) break main_loop;
						// EOF: close branch + block
						this.emit_close(this.svelte_branch_id, this.cursor);
						this.node_stack.pop(); // branch
						this.emit_close(this.svelte_block_id, this.cursor);
						this.node_stack.pop(); // block
						this.states.pop();
						this.svelte_block_depth--;
						if (this.svelte_block_depth > 0 && this.svelte_block_stack.length > 0) {
							const prev = this.svelte_block_stack.pop()!;
							this.svelte_block_id = prev.block_id;
							this.svelte_branch_id = prev.branch_id;
							this.svelte_block_tag = prev.tag;
						}
						continue;
					}

					if (code === OPEN_BRACE) {
						// Stall if closing brace not visible
						if (!this.finished) {
							const probe = this.find_matching_brace(this.cursor + 1);
							if (probe === -1) break main_loop;
						}
						const token = this.try_parse_svelte_block_token(this.cursor);
						if (token) {
							if (token.kind === ':') {
								// Close current branch, open new one
								this.emit_close(this.svelte_branch_id, this.cursor);
								this.node_stack.pop(); // pop old branch

								const branch_id = this.emit_open(node_kind.svelte_branch, this.cursor, this.svelte_block_id);
								this.out.attr(branch_id, 'tag', token.tag);
								if (token.expr_start !== 0 || token.expr_end !== 0) {
									this.out.set_value_start(branch_id, token.expr_start);
									this.out.set_value_end(branch_id, token.expr_end);
								}
								this.svelte_branch_id = branch_id;
								this.node_stack.push(branch_id);
								this.chomp(token.end, true);
								continue;
							}
							if (token.kind === '/') {
								// Close branch + block
								this.emit_close(this.svelte_branch_id, this.cursor);
								this.node_stack.pop(); // branch
								this.emit_close(this.svelte_block_id, token.end);
								this.node_stack.pop(); // block
								this.states.pop();
								this.svelte_block_depth--;
								if (this.svelte_block_depth > 0 && this.svelte_block_stack.length > 0) {
									const prev = this.svelte_block_stack.pop()!;
									this.svelte_block_id = prev.block_id;
									this.svelte_branch_id = prev.branch_id;
									this.svelte_block_tag = prev.tag;
								}
								this.chomp(token.end, true);
								continue;
							}
							if (token.kind === '#') {
								// Nested svelte block — open it within this branch
								this.start_svelte_block(token, current_node);
								continue;
							}
						}
					}

					// Skip linefeeds
					if (code === LINEFEED) {
						const lb_id = this.emit_open(node_kind.line_break, this.cursor, current_node);
						this.emit_close(lb_id, this.cursor + 1);
						this.chomp1();
						continue;
					}

					// Skip leading whitespace
					if (code === SPACE || code === TAB) {
						let pos = this.cursor;
						while (pos < length && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) {
							pos++;
						}
						if (pos < length && source.charCodeAt(pos) === LINEFEED) {
							const lb_id = this.emit_open(node_kind.line_break, this.cursor, current_node);
							this.emit_close(lb_id, pos + 1);
							this.chomp(pos + 1, true);
							continue;
						}
						this.chomp1();
						continue;
					}

					// Dispatch block-level content
					if (code === OCTOTHERP) {
						if (!this.start_heading(current_node)) break main_loop;
						continue;
					}

					if (code === BACKTICK) {
						this.states.push(state_kind.code_fence_start);
						this.extra = 0;
						continue;
					}

					if (code === CLOSE_ANGLE_BRACKET) {
						let p = this.cursor + 1;
						if (p < length && source.charCodeAt(p) === SPACE) p++;
						this.block_quote_depth++;
						const bq_id = this.emit_open(node_kind.block_quote, this.cursor, current_node);
						this.node_stack.push(bq_id);
						this.states.push(state_kind.block_quote);
						this.chomp(p, true);
						continue;
					}

					if (code === OPEN_ANGLE_BRACKET) {
						if (!this.finished && source.indexOf('>', this.cursor + 1) === -1) {
							break main_loop;
						}
						const blk_tag = this.try_parse_html_open_tag(this.cursor + 1);
						if (blk_tag) {
							if (blk_tag.self_closing) {
								const html_id = this.emit_open(node_kind.html, this.cursor, current_node);
								this.out.attr(html_id, 'tag', blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, 'attributes', blk_tag.attributes);
								}
								this.out.attr(html_id, 'self_closing', true);
								this.emit_close(html_id, blk_tag.end);
								this.chomp(blk_tag.end, true);
							} else {
								const html_id = this.emit_open(node_kind.html, this.cursor, current_node, 0, true);
								this.out.attr(html_id, 'tag', blk_tag.tag);
								if (Object.keys(blk_tag.attributes).length > 0) {
									this.out.attr(html_id, 'attributes', blk_tag.attributes);
								}
								this.html_tag_stack.push({ id: html_id, tag: blk_tag.tag });
								this.node_stack.push(html_id);
								this.states.push(state_kind.html_block_element);
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
							while (line_end < length && source.charCodeAt(line_end) !== LINEFEED) line_end++;
							const tb_id = this.emit_open(node_kind.thematic_break, this.cursor, current_node);
							this.emit_close(tb_id, line_end);
							this.chomp(line_end, true);
							continue;
						}
					}

					// Default: start a paragraph
					this.states.push(state_kind.paragraph);
					const svelte_para = this.emit_open(node_kind.paragraph, this.cursor, current_node);
					this.node_stack.push(svelte_para);
					continue;
				}

				case state_kind.block_quote: {
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
									const lb_id = this.emit_open(node_kind.line_break, this.cursor, current_node);
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
							this.states.push(state_kind.code_fence_start);
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
								while (line_end < length && source.charCodeAt(line_end) !== LINEFEED) {
									line_end++;
								}
								const break_end = line_end < length ? line_end : line_end;

								const tb_id = this.emit_open(node_kind.thematic_break, this.cursor, current_node);
								this.emit_close(tb_id, break_end);

								this.chomp(break_end, true);
								continue;
							}
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && source.charCodeAt(p) === SPACE) p++;

							this.block_quote_depth++;
							const bq_id = this.emit_open(node_kind.block_quote, this.cursor, current_node);
							this.node_stack.push(bq_id);
							this.states.push(state_kind.block_quote);
							this.chomp(p, true);
							continue;
						}

						case PIPE: {
							const result = this.try_start_table(current_node);
							if (result === false) break main_loop;
							if (result === true) continue;
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}

						default: {
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}
					}
				}

				case state_kind.list_item: {
					if (!code) {
						if (!this.finished) break main_loop;
						this.end_list();
						continue;
					}

					switch (code) {
						case LINEFEED: {
							const next_pos = this.cursor + 1;

							// In feed mode, if nothing after \n, hold back —
							// next line hasn't arrived yet
							if (next_pos >= length && !this.finished) {
								break main_loop;
							}

							const cur_is_blank = this.cursor === 0 || source.charCodeAt(this.cursor - 1) === LINEFEED;
							if (next_pos >= length || cur_is_blank || this.is_blank_at_pos(next_pos)) {
								let p = next_pos;
								while (p < length) {
									if (!this.is_blank_at_pos(p)) break;
									while (p < length && source.charCodeAt(p) !== LINEFEED) p++;
									if (p < length) p++;
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
										if (marker_after.indent >= this.list_marker_indent && marker_after.ordered === this.list_ordered && marker_after.marker_char === this.list_marker) {
											this.list_is_loose = true;
											this.emit_close(current_node, this.cursor);
											this.node_stack.pop();
											const new_item_id = this.emit_open(node_kind.list_item, p, this.list_node_id);
											this.node_stack.push(new_item_id);
											this.list_content_offset = marker_after.content_offset;
											this.chomp(marker_after.content_start, true);
											continue;
										}
										this.end_list();
										continue;
									}

									let indent_count = 0;
									let ip = p;
									while (ip < length && source.charCodeAt(ip) === SPACE) {
										indent_count++;
										ip++;
									}
									if (indent_count >= this.list_content_offset && ip < length && source.charCodeAt(ip) !== LINEFEED) {
										this.list_is_loose = true;
										this.chomp(p + this.list_content_offset, true);
										continue;
									}
								}

								this.end_list();
								continue;
							}

							// Check for list marker on next line
							const marker = this.try_parse_list_marker(next_pos);
							if (marker) {
								if (marker.indent >= this.list_content_offset) {
									this.chomp(next_pos, true);
									this.start_list(marker, current_node);
									continue;
								}
								if (marker.indent >= this.list_marker_indent && marker.ordered === this.list_ordered && marker.marker_char === this.list_marker) {
									this.emit_close(current_node, this.cursor);
									this.node_stack.pop();
									const new_item_id = this.emit_open(node_kind.list_item, next_pos, this.list_node_id);
									this.node_stack.push(new_item_id);
									this.list_content_offset = marker.content_offset;
									this.chomp(marker.content_start, true);
									continue;
								}
								this.end_list();
								continue;
							}

							// Check for block-level content: if indented enough, it's
							// inside the list item; otherwise it interrupts the list.
							{
								let indent_count = 0;
								let ip = next_pos;
								while (ip < length && source.charCodeAt(ip) === SPACE) {
									indent_count++;
									ip++;
								}
								if (indent_count >= this.list_content_offset && ip < length && source.charCodeAt(ip) !== LINEFEED) {
									// Content indented to list item's content column —
									// strip indent and continue as list item content
									this.chomp(next_pos + this.list_content_offset, true);
									continue;
								}
							}

							// Block-level interrupts at outer indent level end the list
							if (this.is_heading_start(next_pos) || this.is_thematic_break_start(next_pos) || this.is_block_quote_start(next_pos)) {
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
							this.states.push(state_kind.code_fence_start);
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
								while (line_end < length && source.charCodeAt(line_end) !== LINEFEED) line_end++;
								const break_end = line_end < length ? line_end : line_end;
								const tb_id = this.emit_open(node_kind.thematic_break, this.cursor, current_node);
								this.emit_close(tb_id, break_end);
								this.chomp(break_end, true);
								continue;
							}
							if (code !== UNDERSCORE) {
								const nested = this.try_parse_list_marker(this.cursor);
								if (nested) {
									if (nested.indent >= this.list_content_offset) {
										// Nested sub-list inside this item
										this.start_list(nested, current_node);
									} else if (nested.indent >= this.list_marker_indent && nested.ordered === this.list_ordered && nested.marker_char === this.list_marker) {
										// Same list, new sibling item (e.g. after code fence in item)
										this.emit_close(current_node, this.cursor);
										this.node_stack.pop();
										const new_item_id = this.emit_open(node_kind.list_item, this.cursor, this.list_node_id);
										this.node_stack.push(new_item_id);
										this.list_content_offset = nested.content_offset;
										this.chomp(nested.content_start, true);
									} else {
										// Marker at outer list level — end this list
										this.end_list();
									}
									continue;
								}
							}
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}

						case CLOSE_ANGLE_BRACKET: {
							let p = this.cursor + 1;
							if (p < length && source.charCodeAt(p) === SPACE) p++;
							this.block_quote_depth++;
							const bq_id = this.emit_open(node_kind.block_quote, this.cursor, current_node);
							this.node_stack.push(bq_id);
							this.states.push(state_kind.block_quote);
							this.chomp(p, true);
							continue;
						}

						case PIPE: {
							const result = this.try_start_table(current_node);
							if (result === false) break main_loop;
							if (result === true) continue;
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}

						default: {
							const nested = this.try_parse_list_marker(this.cursor);
							if (nested) {
								if (nested.indent >= this.list_content_offset) {
									this.start_list(nested, current_node);
								} else if (nested.indent >= this.list_marker_indent && nested.ordered === this.list_ordered && nested.marker_char === this.list_marker) {
									this.emit_close(current_node, this.cursor);
									this.node_stack.pop();
									const new_item_id = this.emit_open(node_kind.list_item, this.cursor, this.list_node_id);
									this.node_stack.push(new_item_id);
									this.list_content_offset = nested.content_offset;
									this.chomp(nested.content_start, true);
								} else {
									this.end_list();
								}
								continue;
							}
							this.states.push(state_kind.paragraph);
							const para_id = this.emit_open(node_kind.paragraph, this.cursor, current_node);
							this.node_stack.push(para_id);
							continue;
						}
					}
				}

				case state_kind.inline: {
					// In table cells, | and \n break through all inline content
					if (this.in_table && (code === PIPE || code === LINEFEED || !code)) {
						this.states.pop(); // pop inline
						continue; // let table_row_content handle it
					}
					switch (code) {
						case BACKTICK: {
							this.states.push(state_kind.code_span_start);
							this.extra = 0;
							continue;
						}
						case LINEFEED: {
							// Need to see next line — hold back at end of buffer
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
								let ind = 0;
								let tp = np;
								while (tp < length && source.charCodeAt(tp) === SPACE) { ind++; tp++; }
								if (ind >= this.list_content_offset) {
									const stripped = np + this.list_content_offset;
									if (stripped < length && this.try_parse_list_marker(stripped) !== null) {
										this.states.pop();
										continue;
									}
								}
								// Soft line break — newline is preserved in the text content
								this.chomp1();
								continue;
							} else {
								// Soft line break — newline is preserved in the text content
								this.chomp1();
								continue;
							}
						}
						case ASTERISK: {
							if (
								this.prev & (char_mask.whitespace | char_mask.punctuation) &&
								this.next_class & (char_mask.word | char_mask.punctuation)
							) {
								const n_id = this.emit_open(
									node_kind.strong_emphasis,
									this.cursor,
									current_node,
									0,
									true
								);

								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(state_kind.strong_emphasis);
							} else {
								const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(state_kind.text);
							}

							this.chomp1();
							continue;
						}

						case UNDERSCORE: {
							if (
								this.prev & (char_mask.whitespace | char_mask.punctuation) &&
								this.next_class & (char_mask.word | char_mask.punctuation)
							) {
								const n_id = this.emit_open(
									node_kind.emphasis,
									this.cursor,
									current_node,
									0,
									true
								);

								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(state_kind.emphasis);
							} else {
								const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(state_kind.text);
							}

							this.chomp1();
							continue;
						}

						case TILDE: {
							// ~~ is a two-char token. If only one ~ is available
							// and more input is expected, hold back.
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							// Strikethrough: ~~ must be double tilde with flanking
							if (
								source.charCodeAt(this.cursor + 1) === TILDE &&
								this.prev & (char_mask.whitespace | char_mask.punctuation) &&
								classify(source.charCodeAt(this.cursor + 2)) & (char_mask.word | char_mask.punctuation)
							) {
								const n_id = this.emit_open(
									node_kind.strikethrough,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.set_value_start(n_id, this.cursor + 2);
								this.node_stack.push(n_id);
								this.states.push(state_kind.strikethrough);
								this.chomp(2);
							} else if (
								// Subscript: single ~ with next char word/punctuation
								source.charCodeAt(this.cursor + 1) !== TILDE &&
								this.next_class & (char_mask.word | char_mask.punctuation)
							) {
								const n_id = this.emit_open(
									node_kind.subscript,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(state_kind.subscript);
								this.chomp1();
							} else {
								const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(state_kind.text);
								this.chomp1();
							}
							continue;
						}

						case CARET: {
							// Superscript: ^ opens if next char is word/punctuation
							// (no left-flanking constraint — x^2^ is valid)
							if (
								this.next_class & (char_mask.word | char_mask.punctuation)
							) {
								const n_id = this.emit_open(
									node_kind.superscript,
									this.cursor,
									current_node,
									0,
									true,
								);
								this.out.set_value_start(n_id, this.cursor + 1);
								this.node_stack.push(n_id);
								this.states.push(state_kind.superscript);
							} else {
								const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
								this.out.set_value_start(t_id, this.cursor);
								this.node_stack.push(t_id);
								this.states.push(state_kind.text);
							}
							this.chomp1();
							continue;
						}

						case CLOSE_SQUARE_BRACKET: {
							// If inside a link_text state, pop inline to let it handle ]
							if (this.states.length >= 2 && this.states[this.states.length - 2] === state_kind.link_text) {
								this.states.pop();
								continue;
							}
							// Otherwise ] is just text
							const t_id_br = this.emit_open(node_kind.text, this.cursor, current_node);
							this.out.set_value_start(t_id_br, this.cursor);
							this.node_stack.push(t_id_br);
							this.states.push(state_kind.text);
							this.chomp1();
							continue;
						}

						case BACKSLASH: {
							// \ is a two-char token (escape or hard break) — hold back
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							const next_code = source.charCodeAt(this.cursor + 1);
							if (next_code === LINEFEED) {
								// In block quotes, need to see past > and space
								// before committing the hard break
								if (!this.finished && this.block_quote_depth > 0 && !this.can_decide_after_lf(this.cursor + 1)) {
									break main_loop;
								}
								const hb_id = this.emit_open(node_kind.hard_break, this.cursor, current_node);
								this.emit_close(hb_id, this.cursor + 2);
								this.chomp(2);
								// Strip block quote markers
								if (this.block_quote_depth > 0) {
									const stripped = this.skip_bq_markers(this.cursor, this.block_quote_depth);
									if (stripped !== -1) this.chomp(stripped, true);
								}
								// Skip leading spaces
								while (this.cursor < length && source.charCodeAt(this.cursor) === SPACE) {
									this.chomp1();
								}
								continue;
							}
							const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
							this.out.set_value_start(t_id, this.cursor);
							this.node_stack.push(t_id);
							this.states.push(state_kind.text);

							if (this.is_ascii_punctuation(next_code)) {
								this.chomp(2);
							} else {
								this.chomp1();
							}
							continue;
						}

						case OPEN_SQUARE_BRACKET: {
							// Speculatively open a link — [ is a link until proven otherwise
							const link_id = this.emit_open(node_kind.link, this.cursor, current_node, 0, true);
							this.node_stack.push(link_id);
							this.states.push(state_kind.link_text);
							this.chomp1(); // skip [
							continue;
						}

						case EXCLAMATION_MARK: {
							// ![ is a two-char token — hold back lone ! at end of buffer
							if (!this.finished && this.cursor + 1 >= length) {
								break main_loop;
							}
							// ![  → speculatively open an image
							if (source.charCodeAt(this.cursor + 1) === OPEN_SQUARE_BRACKET) {
								const img_id = this.emit_open(node_kind.image, this.cursor, current_node, 0, true);
								this.node_stack.push(img_id);
								this.states.push(state_kind.link_text);
								this.chomp(2); // skip ![
								continue;
							}

							// Just ! — text
							const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
							this.node_stack.push(t_id);
							this.out.set_value_start(t_id, this.cursor);
							this.states.push(state_kind.text);
							this.chomp1();
							continue;
						}

						case OPEN_ANGLE_BRACKET: {
							// In incremental mode, stall if the tag might be incomplete
							if (!this.finished && source.indexOf('>', this.cursor + 1) === -1) {
								break main_loop;
							}

							const uri_end = this.try_parse_uri_autolink(this.cursor + 1);
							if (uri_end !== -1) {
								const link_id = this.emit_open(node_kind.link, this.cursor, current_node);
								this.out.set_value_start(link_id, this.cursor + 1);
								this.out.set_value_end(link_id, uri_end - 1);
								this.emit_close(link_id, uri_end);

								const text_id = this.emit_open(node_kind.text, this.cursor + 1, link_id);
								this.out.set_value_start(text_id, this.cursor + 1);
								this.out.set_value_end(text_id, uri_end - 1);
								this.emit_close(text_id, uri_end - 1);

								this.chomp(uri_end, true);
								this.states.pop();
								continue;
							}

							const email_end = this.try_parse_email_autolink(this.cursor + 1);
							if (email_end !== -1) {
								const email_text = source.slice(this.cursor + 1, email_end - 1);
								const link_id = this.emit_open(node_kind.link, this.cursor, current_node);
								this.out.set_value_start(link_id, this.cursor + 1);
								this.out.set_value_end(link_id, email_end - 1);
								this.emit_close(link_id, email_end);
								this.out.attr(link_id, 'href', 'mailto:' + email_text);

								const text_id = this.emit_open(node_kind.text, this.cursor + 1, link_id);
								this.out.set_value_start(text_id, this.cursor + 1);
								this.out.set_value_end(text_id, email_end - 1);
								this.emit_close(text_id, email_end - 1);

								this.chomp(email_end, true);
								this.states.pop();
								continue;
							}

							// Try HTML comment: <!--
							const comment = this.try_parse_html_comment(this.cursor + 1);
							if (comment) {
								const c_id = this.emit_open(node_kind.html_comment, this.cursor, current_node);
								this.out.text(c_id, comment.content_start, comment.content_end);
								this.emit_close(c_id, comment.end);
								this.chomp(comment.end, true);
								this.states.pop();
								continue;
							}

							// Try HTML closing tag: </tag>
							const close = this.try_parse_html_close_tag(this.cursor + 1);
							if (close) {
								const opener_idx = this.find_html_opener(close.tag);
								if (opener_idx !== -1) {
									// Close all intermediate unclosed HTML elements
									while (this.html_tag_stack.length > opener_idx + 1) {
										const intermediate = this.html_tag_stack.pop()!;
										// Unwind states and node stack for intermediate
										this.close_html_inline(intermediate.id, this.cursor);
									}
									// Close the matching opener
									const opener = this.html_tag_stack.pop()!;
									this.close_html_inline(opener.id, close.end);
									this.chomp(close.end, true);
									continue;
								}
								// No matching opener — treat as text
							}

							// Try HTML opening tag: <tag ...> or <tag ... />
							const open_tag = this.try_parse_html_open_tag(this.cursor + 1);
							if (open_tag) {
								if (open_tag.self_closing) {
									const html_id = this.emit_open(node_kind.html, this.cursor, current_node);
									this.out.attr(html_id, 'tag', open_tag.tag);
									if (Object.keys(open_tag.attributes).length > 0) {
										this.out.attr(html_id, 'attributes', open_tag.attributes);
									}
									this.out.attr(html_id, 'self_closing', true);
									this.emit_close(html_id, open_tag.end);
									this.chomp(open_tag.end, true);
									this.states.pop();
								} else {
									const html_id = this.emit_open(node_kind.html, this.cursor, current_node, 0, true);
									this.out.attr(html_id, 'tag', open_tag.tag);
									if (Object.keys(open_tag.attributes).length > 0) {
										this.out.attr(html_id, 'attributes', open_tag.attributes);
									}
									this.html_tag_stack.push({ id: html_id, tag: open_tag.tag });
									this.node_stack.push(html_id);
									this.states.push(state_kind.html_element);
									this.chomp(open_tag.end, true);
								}
								continue;
							}

							// Not an autolink or HTML tag, treat < as text
							const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
							this.node_stack.push(t_id);
							this.out.set_value_start(t_id, this.cursor);
							this.states.push(state_kind.text);
							this.chomp1();
							continue;
						}

						case OPEN_BRACE: {
							// In incremental mode, stall if we can't see the closing brace
							if (!this.finished) {
								const probe = this.find_matching_brace(this.cursor + 1);
								if (probe === -1) break main_loop;
							}
							const expr_end = this.find_matching_brace(this.cursor + 1);
							if (expr_end !== -1) {
								// Svelte void tag: {@tag ...}
								if (source.charCodeAt(this.cursor + 1) === AT) {
									// Find the tag name: scan word chars after @
									let tp = this.cursor + 2;
									while (tp < expr_end - 1 && source.charCodeAt(tp) !== SPACE && source.charCodeAt(tp) !== TAB && source.charCodeAt(tp) !== LINEFEED && source.charCodeAt(tp) !== CLOSE_BRACE) tp++;
									const tag_name = source.slice(this.cursor + 2, tp);
									if (tag_name.length > 0) {
										const st_id = this.emit_open(node_kind.svelte_tag, this.cursor, current_node);
										this.out.attr(st_id, 'tag', tag_name);
										// Skip whitespace after tag name to find expression start
										while (tp < expr_end - 1 && (source.charCodeAt(tp) === SPACE || source.charCodeAt(tp) === TAB)) tp++;
										if (tp < expr_end - 1) {
											this.out.set_value_start(st_id, tp);
											this.out.set_value_end(st_id, expr_end - 1);
										}
										this.emit_close(st_id, expr_end);
										this.chomp(expr_end, true);
										continue;
									}
								}
								// Plain Svelte expression: {expr}
								const m_id = this.emit_open(node_kind.mustache, this.cursor, current_node);
								this.out.set_value_start(m_id, this.cursor + 1);
								this.out.set_value_end(m_id, expr_end - 1);
								this.emit_close(m_id, expr_end);
								this.chomp(expr_end, true);
								continue;
							}
							// Unmatched { — treat as text
							const t_id_brace = this.emit_open(node_kind.text, this.cursor, current_node);
							this.out.set_value_start(t_id_brace, this.cursor);
							this.node_stack.push(t_id_brace);
							this.states.push(state_kind.text);
							this.chomp1();
							continue;
						}

						case PIPE: {
							// Transparent intraword delimiter — provides flanking
							// context for _ and * without producing output.
							// fan|_tas_|tic → fan<em>tas</em>tic
							if (!this.in_table) {
								this.chomp1();
								continue;
							}
							// In table context, | is a cell separator — fall through
						}
						// falls through
						default: {
							if (!code) {
								this.states.pop();
								continue;
							}
							const t_id = this.emit_open(node_kind.text, this.cursor, current_node);
							this.out.set_value_start(t_id, this.cursor);
							this.node_stack.push(t_id);

							this.states.push(state_kind.text);
							this.chomp1();
							continue;
						}
					}
				}

				case state_kind.text: {
					// In table cells, | and \n unwind all inline states
					if (this.in_table && (code === PIPE || code === LINEFEED || !code)) {
						this.unwind_inline_for_table();
						continue; // let table_row_content handle it
					}

					// Pipe in non-table context: transparent intraword delimiter.
					// Close the text node and let inline consume the pipe.
					if (code === PIPE && !this.in_table) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					}

					// Handle backslash escapes within text
					if (code === BACKSLASH) {
						if (!this.finished && this.cursor + 1 >= length) {
							break main_loop;
						}
						const next_code = source.charCodeAt(this.cursor + 1);
						if (next_code === LINEFEED) {
							if (!this.finished && this.block_quote_depth > 0 && !this.can_decide_after_lf(this.cursor + 1)) {
								break main_loop;
							}
							this.emit_close(current_node, this.cursor);
							this.out.set_value_end(current_node, this.cursor);
							this.node_stack.pop();
							this.states.pop(); // pop text
							const parent_id = this.node_stack[this.node_stack.length - 1];
							const hb_id = this.emit_open(node_kind.hard_break, this.cursor, parent_id);
							this.emit_close(hb_id, this.cursor + 2);
							this.chomp(2);
							// Strip block quote markers
							if (this.block_quote_depth > 0) {
								const stripped = this.skip_bq_markers(this.cursor, this.block_quote_depth);
								if (stripped !== -1) this.chomp(stripped, true);
							}
							// Skip leading spaces
							while (this.cursor < length && source.charCodeAt(this.cursor) === SPACE) {
								this.chomp1();
							}
							continue;
						}
						if (this.is_ascii_punctuation(next_code)) {
							this.chomp(2);
							continue;
						}
					}

					// At LINEFEED: hold back if next line isn't available yet
					if (code === LINEFEED && !this.finished && !this.can_decide_after_lf(this.cursor)) {
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

					if (!code || (code === LINEFEED && this.is_block_interrupt(this.cursor + 1))) {
						this.states.pop();
						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						continue;
					} else if (code === LINEFEED && this.list_depth > 0) {
						const np = this.cursor + 1;
						let ind = 0;
						let tp = np;
						while (tp < length && source.charCodeAt(tp) === SPACE) { ind++; tp++; }
						if (ind >= this.list_content_offset) {
							const stripped = np + this.list_content_offset;
							if (stripped < length && this.try_parse_list_marker(stripped) !== null) {
								this.states.pop();
								this.emit_close(current_node, this.cursor);
								this.out.set_value_end(current_node, this.cursor);
								this.node_stack.pop();
								continue;
							}
						}
						this.chomp1();
						continue;
					} else if (code === ASTERISK || code === UNDERSCORE || code === TILDE || code === CARET || code === OPEN_ANGLE_BRACKET || code === OPEN_SQUARE_BRACKET || code === CLOSE_SQUARE_BRACKET || code === EXCLAMATION_MARK || code === BACKTICK || code === OPEN_BRACE) {
						this.states.pop();

						this.emit_close(current_node, this.cursor);
						this.out.set_value_end(current_node, this.cursor);
						this.node_stack.pop();
						this.states.pop();

						continue;
					}
					// Fast scan: skip plain text in a tight loop instead of
					// re-entering the main loop per character. Stops at any
					// delimiter, escape, line break, or end of buffer.
					{
						let p = this.cursor + 1;
						while (p < length) {
							const ch = source.charCodeAt(p);
							if (text_break[ch]) break;
							p++;
						}
						this.cursor = p;
						this.prev = classify(source.charCodeAt(p - 1));
						this.current = classify(source.charCodeAt(p));
						this.next_class = classify(source.charCodeAt(p + 1));
					}
					continue;
				}

				case state_kind.code_span_start: {
					if (this.extra > 2) {
						this.states.pop();
						this.states.push(state_kind.text);
						const t_id = this.emit_open(node_kind.text, this.cursor - this.extra, current_node);
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
							if (source.charCodeAt(this.cursor + 1) === EXCLAMATION_MARK) {
								this.chomp(2);
								this.states.pop();
								this.states.push(state_kind.code_span_info);
								this.info_start_pos = this.cursor;
								continue;
							}
							// # without ! — treat as normal code span content
							this.states.pop();
							this.states.push(state_kind.code_span_end);
							const cs_id_h = this.emit_open(node_kind.code_span, this.cursor - this.extra, current_node);
							this.node_stack.push(cs_id_h);
							this.out.set_value_start(cs_id_h, this.cursor);
							continue;
						}
						case SPACE: {
							this.checkpoint_cursor = this.cursor;
							this.states.pop();
							this.states.push(state_kind.code_span_content_leading_space);
							const cs_id = this.emit_open(node_kind.code_span, this.cursor - this.extra, current_node);
							this.node_stack.push(cs_id);
							this.out.set_value_start(cs_id, this.cursor + 1);

							this.chomp(2);

							continue;
						}
						default: {
							this.states.pop();
							this.states.push(state_kind.code_span_end);
							const cs_id = this.emit_open(node_kind.code_span, this.cursor - this.extra, current_node);
							this.node_stack.push(cs_id);
							this.out.set_value_start(cs_id, this.cursor);

							continue;
						}
					}
				}

				case state_kind.code_span_info: {
					switch (code) {
						case SPACE: {
							this.info_end_pos = this.cursor;
							this.checkpoint_cursor = this.cursor + 1;
							this.states.pop();
							if (source.charCodeAt(this.cursor + 1) === SPACE) {
								this.states.push(state_kind.code_span_content_leading_space);
								this.chomp(2);
							} else {
								this.states.push(state_kind.code_span_end);
								this.chomp1();
							}

							const cs_id = this.emit_open(
								node_kind.code_span,
								this.info_start_pos - 2 - this.extra,
								current_node
							);
							this.node_stack.push(cs_id);

							this.out.attr(cs_id, 'info_start', this.info_start_pos);
							this.out.attr(cs_id, 'info_end', this.info_end_pos);

							this.out.set_value_start(cs_id, this.cursor);

							continue;
						}
						default: {
							this.chomp1();
							continue;
						}
					}
				}

				case state_kind.code_span_content_leading_space: {
					if (code === SPACE && source.charCodeAt(this.cursor + 1) === BACKTICK) {
						this.chomp1();
						this.states.pop();
						this.states.push(state_kind.code_span_leading_space_end);
						continue;
					} else if (code === BACKTICK && source.charCodeAt(this.cursor - 1) !== BACKTICK) {
						if (
							(this.extra === 1 && source.charCodeAt(this.cursor + 1) !== BACKTICK) ||
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
						this.states.push(state_kind.code_span_end);
						continue;
					} else {
						this.chomp1();
						continue;
					}
				}

				case state_kind.code_span_leading_space_end: {
					if (
						this.extra === 1 &&
						code === BACKTICK &&
						source.charCodeAt(this.cursor + 1) !== BACKTICK
					) {
						this.states.pop();
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
						this.emit_close(current_node, this.cursor + this.extra);
						this.out.set_value_end(current_node, this.cursor - 1);
						this.node_stack.pop();
					} else {
						this.states.pop();
						this.states.push(state_kind.code_span_content_leading_space);
					}
					this.chomp(this.extra);
					continue;
				}

				case state_kind.code_span_end: {
					// In table cells, | breaks through code spans
					if (this.in_table && (code === PIPE || code === LINEFEED)) {
						this.unwind_inline_for_table();
						continue;
					}
					if (code === BACKTICK) {
						if (
							(this.extra === 1 && source.charCodeAt(this.cursor + 1) !== BACKTICK) ||
							(this.extra === 2 &&
								source.charCodeAt(this.cursor + 1) === BACKTICK &&
								source.charCodeAt(this.cursor + 2) !== BACKTICK)
						) {
							this.out.set_value_end(current_node, this.cursor);
							this.states.pop();
							this.emit_close(current_node, this.cursor + this.extra);
							this.node_stack.pop();
							this.chomp(this.extra);
							continue;
						}
					}

					if (
						(code === LINEFEED && this.is_blank_line_after(this.cursor)) ||
						code !== code
					) {
						// Code span failure — revoke the code_span node and fall back to text.
						// Start text at the opening backtick(s) so they render as literal text.
						// Cursor moves past the backtick(s) so we don't re-enter code_span_start.
						const text_start = this.checkpoint_cursor;
						this.chomp(this.checkpoint_cursor + this.extra, true);
						this.out.revoke(this.node_stack[this.node_stack.length - 1]);
						this.node_stack.pop();
						this.states.pop();
						this.states.push(state_kind.text);
						const t_id = this.emit_open(
							node_kind.text,
							text_start,
							this.node_stack[this.node_stack.length - 1]
						);
						this.node_stack.push(t_id);
						this.out.set_value_start(t_id, text_start);

						continue;
					}
					this.chomp1();
					continue;
				}

				case state_kind.table_body: {
					// At start of a potential data row line.
					if (!code) {
						if (!this.finished) break main_loop;
						this.end_table();
						continue;
					}

					if (code === LINEFEED) {
						// Blank line → end table
						this.end_table();
						continue;
					}

					// Block-level interrupts end the table
					if (code === OCTOTHERP && this.is_heading_start(this.cursor)) {
						this.end_table();
						continue;
					}
					if (code === BACKTICK && this.cursor + 2 < length &&
						source.charCodeAt(this.cursor + 1) === BACKTICK &&
						source.charCodeAt(this.cursor + 2) === BACKTICK) {
						this.end_table();
						continue;
					}
					if (code === CLOSE_ANGLE_BRACKET) {
						this.end_table();
						continue;
					}
					if ((code === ASTERISK || code === DASH || code === UNDERSCORE) &&
						this.is_thematic_break_start(this.cursor)) {
						this.end_table();
						continue;
					}

					// Start a new data row eagerly
					this.table_row_id = this.emit_open(node_kind.table_row, this.cursor, this.table_node_id);
					this.table_cell_col = 0;

					// Skip leading pipe
					if (code === PIPE) {
						this.chomp1();
					}

					// Open first cell and push onto node_stack for inline content
					this.table_cell_start = this.cursor;
					this.table_cell_id = this.emit_open(node_kind.table_cell, this.cursor, this.table_row_id, this.table_cell_col);
					this.table_cell_has_content = false;
					this.node_stack.push(this.table_cell_id);
					this.states.push(state_kind.table_row_content);
					continue;
				}

				case state_kind.table_row_content: {
					// We arrive here when inline states pop back due to | or \n

					// Sentinel mode: used by parse_inline_range to stop the loop
					if (this.inline_range_parse && !code) {
						break main_loop;
					}

					if (!code) {
						if (!this.finished) break main_loop;
						// EOF — close current cell + row, pad remaining cols
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

						// Open next cell eagerly — don't push inline yet,
						// let the fallthrough handle whitespace skipping first
						if (this.table_cell_col < this.table_col_count) {
							this.table_cell_start = this.cursor;
							this.table_cell_id = this.emit_open(node_kind.table_cell, this.cursor, this.table_row_id, this.table_cell_col);
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

					// Skip leading whitespace before cell content
					if (!this.table_cell_has_content && (code === SPACE || code === TAB)) {
						this.chomp1();
						continue;
					}

					// Push inline to handle cell content
					this.table_cell_has_content = true;
					this.states.push(state_kind.inline);
					continue;
				}

				default: {
					this.chomp1();
					continue;
				}
			}

		}
	}

	// -----------------------------------------------------------
	// Table helpers
	// -----------------------------------------------------------

	/**
	 * Try to start a table at the current cursor position.
	 * Requires seeing the full header row + full delimiter row.
	 * @returns true = table started, false = hold back, null = not a table
	 */
	private try_start_table(parent: number): boolean | null {
		const source = this.source;
		const length = source.length;

		// Find end of header row
		let header_end = this.cursor;
		while (header_end < length && source.charCodeAt(header_end) !== LINEFEED) header_end++;
		if (header_end >= length && !this.finished) return false; // hold back — need \n

		// Parse header cells
		const header_cells = this.parse_table_row_cells(this.cursor, header_end);
		if (header_cells.length === 0) return null;

		// Find delimiter row
		const delim_start = header_end + 1;
		if (delim_start >= length && !this.finished) return false; // hold back

		let delim_end = delim_start;
		while (delim_end < length && source.charCodeAt(delim_end) !== LINEFEED) delim_end++;
		if (delim_end >= length && !this.finished) return false; // hold back — need full delimiter row

		// Parse delimiter row
		const alignments = this.parse_delimiter_row(delim_start, delim_end);
		if (!alignments || alignments.length !== header_cells.length) return null; // not a table

		// Confirmed table — emit structure
		const col_count = header_cells.length;
		const table_id = this.emit_open(node_kind.table, this.cursor, parent);
		this.out.attr(table_id, 'alignments', alignments);
		this.out.attr(table_id, 'col_count', col_count);

		// Store table state
		this.table_col_count = col_count;
		this.table_alignments = alignments;
		this.table_node_id = table_id;
		this.in_table = true;

		// Emit header row using the inline state machinery:
		// Open header node, then parse each cell through inline
		const header_id = this.emit_open(node_kind.table_header, this.cursor, table_id);
		for (let i = 0; i < header_cells.length; i++) {
			const cell = header_cells[i];
			const trimmed = this.trim_cell_range(cell.start, cell.end);
			this.table_cell_id = this.emit_open(node_kind.table_cell, cell.start, header_id, i);
			if (trimmed.start < trimmed.end) {
				// Parse cell content through inline machinery
				this.node_stack.push(this.table_cell_id);
				this.parse_inline_range(trimmed.start, trimmed.end);
				this.node_stack.pop();
			}
			this.emit_close(this.table_cell_id, cell.end);
		}
		this.emit_close(header_id, header_end);

		// Push table node + state
		this.node_stack.push(table_id);
		this.states.push(state_kind.table_body);

		// Advance cursor past delimiter row
		const after_delim = delim_end < length ? delim_end + 1 : delim_end;
		this.chomp(after_delim, true);
		return true;
	}

	/**
	 * Parse cells from a table row between start and end positions.
	 * Handles leading/trailing pipes and escaped pipes.
	 */
	private parse_table_row_cells(start: number, end: number): { start: number; end: number }[] {
		const source = this.source;
		let pos = start;

		// Skip leading whitespace
		while (pos < end && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) pos++;

		// Skip leading pipe
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

		// Trailing content after last pipe (only if no leading pipe — GFM allows pipeless rows)
		if (cell_start < end) {
			// Check if the content is just whitespace
			let all_ws = true;
			for (let i = cell_start; i < end; i++) {
				const c = source.charCodeAt(i);
				if (c !== SPACE && c !== TAB) { all_ws = false; break; }
			}
			if (!all_ws) {
				cells.push({ start: cell_start, end: end });
			}
		}

		return cells;
	}

	/**
	 * Parse a delimiter row. Returns alignment array or null if invalid.
	 */
	private parse_delimiter_row(start: number, end: number): string[] | null {
		const source = this.source;
		let pos = start;

		// Skip leading whitespace
		while (pos < end && (source.charCodeAt(pos) === SPACE || source.charCodeAt(pos) === TAB)) pos++;

		// Skip leading pipe
		if (pos < end && source.charCodeAt(pos) === PIPE) pos++;

		const alignments: string[] = [];

		while (pos < end) {
			// Skip whitespace
			while (pos < end && source.charCodeAt(pos) === SPACE) pos++;
			if (pos >= end) break;

			// Check for trailing pipe at end
			if (source.charCodeAt(pos) === PIPE && pos + 1 >= end) break;

			let left_colon = false;
			if (source.charCodeAt(pos) === COLON) { left_colon = true; pos++; }

			let dash_count = 0;
			while (pos < end && source.charCodeAt(pos) === DASH) { dash_count++; pos++; }
			if (dash_count === 0) return null; // invalid delimiter cell

			let right_colon = false;
			if (pos < end && source.charCodeAt(pos) === COLON) { right_colon = true; pos++; }

			// Skip whitespace
			while (pos < end && source.charCodeAt(pos) === SPACE) pos++;

			// Expect pipe or end
			if (pos < end) {
				if (source.charCodeAt(pos) === PIPE) {
					pos++;
				} else {
					return null; // unexpected char
				}
			}

			if (left_colon && right_colon) alignments.push('center');
			else if (right_colon) alignments.push('right');
			else if (left_colon) alignments.push('left');
			else alignments.push('none');
		}

		return alignments.length > 0 ? alignments : null;
	}

	/**
	 * Trim whitespace from cell content range.
	 */
	private trim_cell_range(start: number, end: number): { start: number; end: number } {
		const source = this.source;
		let s = start, e = end;
		while (s < e && (source.charCodeAt(s) === SPACE || source.charCodeAt(s) === TAB)) s++;
		while (e > s && (source.charCodeAt(e - 1) === SPACE || source.charCodeAt(e - 1) === TAB)) e--;
		return { start: s, end: e };
	}

	/**
	 * Emit a data row with cells, padding/truncating to table_col_count.
	 */
	private emit_table_row(row_start: number, row_end: number, parent: number): void {
		const cells = this.parse_table_row_cells(row_start, row_end);
		const row_id = this.emit_open(node_kind.table_row, row_start, parent);

		for (let i = 0; i < this.table_col_count; i++) {
			if (i < cells.length) {
				const cell = cells[i];
				const trimmed = this.trim_cell_range(cell.start, cell.end);
				const cell_id = this.emit_open(node_kind.table_cell, cell.start, row_id, i);
				if (trimmed.start < trimmed.end) {
					this.out.text(cell_id, trimmed.start, trimmed.end);
				}
				this.emit_close(cell_id, cell.end);
			} else {
				// Pad with empty cells
				const cell_id = this.emit_open(node_kind.table_cell, row_end, row_id, i);
				this.emit_close(cell_id, row_end);
			}
		}

		this.emit_close(row_id, row_end);
	}

	/**
	 * Parse inline content for a specific byte range. Used for header cells
	 * where the full content is available atomically.
	 * Saves/restores parser state, uses a sentinel state to prevent leaking
	 * into block-level parsing.
	 */
	private parse_inline_range(start: number, end: number): void {
		const saved_cursor = this.cursor;
		const saved_finished = this.finished;
		const saved_prev = this.prev;

		this.cursor = start;
		this.finished = true;
		this.prev = char_mask.whitespace;
		this.current = classify(this.source.charCodeAt(start));
		this.next_class = classify(this.source.charCodeAt(start + 1));

		// Use a sentinel on the state stack so _run() stops here
		const sentinel = this.states.length;
		this.states.push(state_kind.table_row_content); // sentinel
		this.states.push(state_kind.inline);

		const save_source = this.source;
		this.source = this.source.slice(0, end);
		this.inline_range_parse = true;

		this._run();

		this.source = save_source;
		this.inline_range_parse = false;

		// Unwind anything left above the sentinel
		while (this.states.length > sentinel) {
			const top = this.states[this.states.length - 1];
			if (top === state_kind.text || top === state_kind.emphasis ||
				top === state_kind.strong_emphasis || top === state_kind.strikethrough ||
				top === state_kind.superscript || top === state_kind.subscript || top === state_kind.link_text) {
				const node_id = this.node_stack[this.node_stack.length - 1];
				this.out.set_value_end(node_id, end);
				this.emit_close(node_id, end);
				this.node_stack.pop();
			}
			this.states.pop();
		}

		// Restore
		this.cursor = saved_cursor;
		this.finished = saved_finished;
		this.prev = saved_prev;
		this.current = classify(this.source.charCodeAt(this.cursor));
		this.next_class = classify(this.source.charCodeAt(this.cursor + 1));
	}

	/**
	 * Unwind all inline states back to table_row_content.
	 * Called when `|` or `\n` is encountered inside inline content within a table cell.
	 * Closes text nodes, pops inline states, closes pending inline constructs.
	 */
	private unwind_inline_for_table(): void {
		while (this.states.length > 0) {
			const top = this.states[this.states.length - 1];
			if (top === state_kind.table_row_content) break;

			if (top === state_kind.text) {
				const text_id = this.node_stack[this.node_stack.length - 1];
				// Trim trailing whitespace from the text value
				let ve = this.cursor;
				while (ve > 0 && (this.source.charCodeAt(ve - 1) === SPACE || this.source.charCodeAt(ve - 1) === TAB)) {
					ve--;
				}
				this.out.set_value_end(text_id, ve);
				this.emit_close(text_id, this.cursor);
				this.node_stack.pop();
				this.states.pop();
			} else if (top === state_kind.inline) {
				this.states.pop();
			} else if (
				top === state_kind.code_span_end ||
				top === state_kind.code_span_start ||
				top === state_kind.code_span_content_leading_space ||
				top === state_kind.code_span_leading_space_end ||
				top === state_kind.code_span_info
			) {
				// Revoke the code span and emit a text node for the
				// backtick(s) + content so nothing is lost
				const cs_id = this.node_stack[this.node_stack.length - 1];
				this.out.revoke(cs_id);
				this.node_stack.pop();
				this.states.pop();
				// Create replacement text covering backticks + content
				const parent_id = this.node_stack[this.node_stack.length - 1];
				const t_id = this.emit_open(node_kind.text, this.checkpoint_cursor, parent_id);
				this.out.set_value_start(t_id, this.checkpoint_cursor);
				this.out.set_value_end(t_id, this.cursor);
				this.emit_close(t_id, this.cursor);
				// Don't push to node_stack — this text node is immediately closed
			} else {
				// emphasis, strong, strikethrough, superscript, link_text
				const node_id = this.node_stack[this.node_stack.length - 1];
				if (this.pending_has(node_id)) {
					// Speculative node never closed — revoke it now
					// so the delimiter becomes literal text
					this.out.revoke(node_id);
					this.pending_remove(node_id);
				} else {
					// Already committed (closed normally) — just close
					this.out.set_value_end(node_id, this.cursor);
					this.emit_close(node_id, this.cursor);
				}
				this.node_stack.pop();
				this.states.pop();
			}
		}
	}

	/**
	 * Close the current table cell. Pops cell from node_stack.
	 */
	private close_table_cell(): void {
		this.emit_close(this.table_cell_id, this.cursor);
		if (this.node_stack[this.node_stack.length - 1] === this.table_cell_id) {
			this.node_stack.pop();
		}
	}

	/**
	 * Pad remaining columns with empty cells and close the current row.
	 */
	private pad_and_close_row(): void {
		for (let i = this.table_cell_col; i < this.table_col_count; i++) {
			const cell_id = this.emit_open(node_kind.table_cell, this.cursor, this.table_row_id, i);
			this.emit_close(cell_id, this.cursor);
		}
		this.emit_close(this.table_row_id, this.cursor);
	}

	/**
	 * Close the current table and pop state.
	 */
	private end_table(): void {
		this.emit_close(this.table_node_id, this.cursor);
		this.states.pop(); // pop table_body
		this.node_stack.pop(); // pop table node
		this.table_col_count = 0;
		this.table_alignments = [];
		this.table_node_id = 0;
		this.table_row_id = 0;
		this.table_cell_id = 0;
		this.table_cell_col = 0;
		this.table_cell_start = 0;
		this.table_text_id = 0;
		this.in_table = false;
	}

	private _finalize(): void {
		const length = this.source.length;

		// Close unclosed nodes gently (set end if not already set)
		// Skip pending nodes — those will be revoked below.
		for (let i = 0; i < this.node_stack.length; i++) {
			const id = this.node_stack[i];
			if (!this.closed_flags[id] && !this.pending_has(id)) {
				this.out.set_value_end(id, length - 1);
				this.emit_close(id, length - 1);
			}
		}

		// Revoke any remaining pending nodes (unclosed HTML, unclosed emphasis, etc.)
		for (let pi = 0; pi < this.pending_count; pi++) {
			this.out.revoke(this.pending_ids[pi]);
		}
		this.pending_count = 0;
	}
}

/**
 * Parse markdown that may include Svelte syntax into tokens and nodes.
 * @param input Source markdown string.
 * @param options Parser configuration and reusable storage.
 * @returns Arena-backed parse result and collected tokens.
 */
export function parse_markdown_svelte(
	input: string,
	options: parse_options = {}
): { nodes: node_buffer; errors: error_collector } {
	const tree = new TreeBuilder((input.length >> 3) || 128);
	const parser = new PFMParser(tree);
	const { errors } = parser.parse(input, options.introspector);
	return { nodes: tree.get_buffer(), errors };
}
