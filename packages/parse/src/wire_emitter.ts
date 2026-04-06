import type { Emitter } from './opcodes';
import { node_kind } from './utils';

/**
 * wire format for PFM parser opcode streaming.
 *
 * events are batched as JSON arrays of opcode tuples (one batch per feed() call):
 *
 *   [["S", [...kinds]], ["O", 1, 7, 0, 0, 0], ["T", 1, "Hello"], ...]
 *
 * opcodes:
 *
 *   S  Schema    ["S", kinds: string[]]
 *                sent once as the first opcode. Maps numeric kind codes to names.
 *
 *   O  Open      ["O", id, kind, parent, pending, extra]
 *                opens a new node. pending=1 for speculative (optimistic rendering).
 *                extra is kind-specific (heading depth, backtick count, etc.).
 *
 *   C  Close     ["C", id]
 *                closes a node. Implicitly commits if pending.
 *
 *   T  Text      ["T", id, content]
 *                appends text content to a node. multiple T opcodes for the same id
 *                are concatenated by the client. Text nodes (kind=1) are suppressed
 *                on the wire — their content becomes T opcodes on the parent.
 *
 *   A  Attr      ["A", id, key, value]
 *                sets an attribute on a node (href, title, info, ordered, etc.).
 *                byte-offset attrs (value_start, value_end, info_start, info_end)
 *                are resolved to content strings before emission.
 *
 *   R  Revoke    ["R", id, delimiter]
 *                revokes a speculative node. children reparent to grandparent.
 *                delimiter is the literal text for the opening marker ("_", "*", etc.).
 *
 *   X  Clear     ["X", id]
 *                clears all children/text of a node. used when content is
 *                restructured (e.g., raw paragraph text replaced by inline-parsed
 *                structure). reserved for future use.
 *
 * Design:
 *   - optimistic: speculative nodes are sent immediately, revocation is the rare path
 *   - text nodes (kind=1) are invisible on the wire — flattened into T on parent
 *   - byte offsets resolved server-side — client never needs the source string
 *   - one batch per feed() call; transport layer decides framing
 */

/** kind names indexed by node_kind value. */
const KIND_NAMES: string[] = [
	'root',
	'text',
	'html',
	'heading',
	'mustache',
	'code_fence',
	'line_break',
	'paragraph',
	'code_span',
	'emphasis',
	'strong_emphasis',
	'thematic_break',
	'link',
	'image',
	'block_quote',
	'list',
	'list_item',
	'hard_break',
	'soft_break',
	'strikethrough',
	'superscript',
	'subscript',
	'table',
	'table_header',
	'table_row',
	'table_cell',
	'html_comment',
	'svelte_tag',
	'svelte_block',
	'svelte_branch',
];

/** tracks progressive text emission for a node. */
interface TextState {
	/** byte offset where content starts in source. */
	start: number;
	/** byte offset up to which content has been sent. */
	sent: number;
	/** wire target id: parent id for text nodes, self id for leaves. */
	target: number;
	/** true once value_end has been received (node text is finalized). */
	done: boolean;
	/** true if this is a code_fence node (needs backtick holdback). */
	is_fence: boolean;
}

/**
 * kinds where value_start/value_end on the node itself should produce t events.
 * container nodes (emphasis, strong, link, etc.) also receive value_start/value_end
 * as range markers, but their content is delivered via child text nodes — we must
 * not double-emit.
 *
 * note: html nodes are handled specially by the attr() switch below — for the
 * raw-text variants (script, style) they are treated as content leaves too,
 * but the decision requires the tag which arrives as a separate attr.
 */
function is_content_leaf(kind: node_kind): boolean {
	return (
		kind === node_kind.code_fence ||
		kind === node_kind.code_span ||
		kind === node_kind.html_comment
	);
}

// biome-ignore lint/suspicious/noConstEnum: matches project convention
export const enum WireOp {
	Schema = 'S',
	Open = 'O',
	Close = 'C',
	Text = 'T',
	Attr = 'A',
	Revoke = 'R',
	Commit = 'K',
	Clear = 'X',
}

export class WireEmitter implements Emitter {
	/** current source string. updated via set_source(). */
	private source = '';
	/** accumulated opcodes for the current batch. */
	private batch: unknown[][] = [];
	/** whether the schema opcode has been emitted. */
	private schema_emitted = false;

	/** maps node id -> node_kind (for all nodes, including suppressed text nodes). */
	private kinds: Map<number, node_kind> = new Map();
	/** maps pending node id -> source start offset (for revoke source reconstruction). */
	private pending_starts: Map<number, number> = new Map();
	/** maps text node id -> wire-visible parent id. */
	private text_parents: Map<number, number> = new Map();
	/** tracks progressive text state per node id. */
	private text_state: Map<number, TextState> = new Map();
	/** buffers info_start offsets until info_end arrives. */
	private info_starts: Map<number, number> = new Map();
	/** tags for html nodes whose content is delivered as value range (script, style). */
	private raw_html_ids: Set<number> = new Set();
	/** parser cursor position, updated via cursor(). */
	private parser_cursor = 0;

	/**
	 * set the current source string. in incremental mode, call this
	 * with the accumulated source before each feed() call.
	 */
	set_source(source: string): void {
		this.source = source;
	}

	// ── Emitter interface ──────────────────────────────────────

	open(
		id: number,
		kind: node_kind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		this.kinds.set(id, kind);

		// Suppress text nodes — map to wire-visible parent
		if (kind === node_kind.text) {
			const wire_parent =
				this.kinds.get(parent) === node_kind.text
					? (this.text_parents.get(parent) ?? parent)
					: parent;
			this.text_parents.set(id, wire_parent);
			return;
		}

		if (pending) {
			this.pending_starts.set(id, start);
		}
		this.batch.push([WireOp.Open, id, kind, parent, pending ? 1 : 0, extra]);
	}

	close(id: number, _end: number): void {
		// Suppress close for text nodes
		if (this.kinds.get(id) === node_kind.text) return;

		this.batch.push([WireOp.Close, id]);
	}

	text(parent: number, start: number, end: number): void {
		// The text() opcode creates an inline text child (used for table cells).
		// Resolve to string and emit T on the parent directly.
		if (end > start) {
			const content = this.source.slice(start, end);
			if (content) {
				this.batch.push([WireOp.Text, parent, content]);
			}
		}
	}

	attr(id: number, key: string, value: unknown): void {
		// ── tag on html: remember raw-text variants so their value range
		//    (script/style content) becomes T events on self. The 'tag' attr
		//    is always set before value_start/value_end by the parser. ──

		if (
			key === 'tag' &&
			this.kinds.get(id) === node_kind.html &&
			(value === 'script' || value === 'style')
		) {
			this.raw_html_ids.add(id);
		}

		// ── value_start / value_end -> progressive T events ──

		if (key === 'value_start') {
			const kind = this.kinds.get(id);
			// Track value ranges for text nodes (suppressed -> T on parent),
			// content leaves (heading, code_fence, code_span -> T on self),
			// and raw-text html elements (script, style -> T on self).
			// Container nodes (emphasis, link, etc.) also get value_start but
			// their content arrives via child text nodes.
			const is_raw_html = kind === node_kind.html && this.raw_html_ids.has(id);
			if (
				kind !== node_kind.text &&
				!is_raw_html &&
				(kind === undefined || !is_content_leaf(kind))
			) {
				return;
			}

			const target =
				kind === node_kind.text ? (this.text_parents.get(id) ?? id) : id;

			// If value_start is re-set after we've already sent text,
			// emit a Clear so the client discards the stale content.
			const existing = this.text_state.get(id);
			if (existing && existing.sent > (value as number)) {
				this.batch.push([WireOp.Clear, existing.target]);
			}

			this.text_state.set(id, {
				start: value as number,
				sent: value as number,
				target,
				done: false,
				is_fence: kind === node_kind.code_fence,
			});
			return;
		}

		if (key === 'value_end') {
			const state = this.text_state.get(id);
			if (state) {
				if ((value as number) > state.sent) {
					// Unsent content remains — send the rest
					const content = this.source.slice(state.sent, value as number);
					if (content) {
						this.batch.push([WireOp.Text, state.target, content]);
						state.sent = value as number;
					}
				} else if (state.sent > (value as number)) {
					// Over-sent: eagerly flushed past the final end.
					// Clear and re-send the correct range.
					this.batch.push([WireOp.Clear, state.target]);
					const content = this.source.slice(state.start, value as number);
					if (content) {
						this.batch.push([WireOp.Text, state.target, content]);
					}
					state.sent = value as number;
				}
				state.done = true;
			}
			return;
		}

		// ── info_start / info_end -> resolved 'info' attr ──

		if (key === 'info_start') {
			this.info_starts.set(id, value as number);
			return;
		}

		if (key === 'info_end') {
			const info_start = this.info_starts.get(id);
			if (info_start !== undefined) {
				const info = this.source.slice(info_start, value as number);
				if (info) {
					this.batch.push([WireOp.Attr, id, 'info', info]);
				}
				this.info_starts.delete(id);
			}
			return;
		}

		// ── Skip attrs for suppressed text nodes ──

		if (this.kinds.get(id) === node_kind.text) return;

		// ── Pass through all other attrs ──

		this.batch.push([WireOp.Attr, id, key, value]);
	}

	set_value_start(id: number, pos: number): void {
		this.attr(id, 'value_start', pos);
	}

	set_value_end(id: number, pos: number): void {
		this.attr(id, 'value_end', pos);
	}

	cursor(pos: number): void {
		this.parser_cursor = pos;
	}

	revoke(id: number, source_text?: string): void {
		const kind = this.kinds.get(id);
		// Use source_text if provided (block-level revocations),
		// otherwise derive delimiter from kind (inline revocations).
		const content = source_text ?? get_delimiter(kind);
		this.batch.push([WireOp.Revoke, id, content]);

		// Clean up
		this.text_state.delete(id);
		this.pending_starts.delete(id);
		this.raw_html_ids.delete(id);
	}

	commit(id: number): void {
		this.batch.push([WireOp.Commit, id]);
		this.pending_starts.delete(id);
	}

	// ── Batch control ──────────────────────────────────────────

	/**
	 * flush accumulated opcodes. returns the batch as an array of
	 * opcode tuples. the first flush includes the schema as the
	 * first opcode.
	 *
	 * call this after each feed() in incremental mode, or once
	 * after parse() in batch mode.
	 */
	flush(): unknown[][] {
		// Eagerly emit unsent text for nodes still being streamed
		// (value_start set, value_end not yet received).
		//
		// For code fences: use source.length as boundary (the parser
		// stalls internally but the content is safe to show). Hold
		// back the trailing line only if it starts with backticks
		// (potential closing fence).
		//
		// For everything else: use the parser cursor as boundary
		// (the parser advances through confirmed content).
		const fed_end = this.source.length;
		for (const [, state] of this.text_state) {
			if (state.done) continue;

			let end: number;
			if (state.is_fence) {
				end = fed_end;
				if (end > state.sent) {
					const text = this.source.slice(state.sent, end);
					const last_nl = text.lastIndexOf('\n');
					if (last_nl !== -1) {
						const tail = text.slice(last_nl + 1);
						let ti = 0;
						while (
							ti < tail.length &&
							(tail.charCodeAt(ti) === 0x20 || tail.charCodeAt(ti) === 0x09)
						)
							ti++;
						if (ti < tail.length && tail.charCodeAt(ti) === 0x60) {
							end = state.sent + last_nl;
						}
					} else {
						let ti = 0;
						while (
							ti < text.length &&
							(text.charCodeAt(ti) === 0x20 || text.charCodeAt(ti) === 0x09)
						)
							ti++;
						if (ti < text.length && text.charCodeAt(ti) === 0x60) {
							continue;
						}
					}
				}
			} else {
				end = this.parser_cursor;
			}

			if (end > state.sent) {
				const content = this.source.slice(state.sent, end);
				if (content) {
					this.batch.push([WireOp.Text, state.target, content]);
					state.sent = end;
				}
			}
		}

		const result: unknown[][] = [];

		if (!this.schema_emitted) {
			result.push([WireOp.Schema, KIND_NAMES]);
			this.schema_emitted = true;
		}

		for (let i = 0; i < this.batch.length; i++) {
			result.push(this.batch[i]);
		}
		this.batch.length = 0;

		return result;
	}

	/**
	 * flush and serialize to json. convenience for transports
	 * that need a string.
	 */
	flush_json(): string {
		return JSON.stringify(this.flush());
	}

	/**
	 * reset all state. call when reusing the emitter for a new parse.
	 */
	reset(): void {
		this.source = '';
		this.batch.length = 0;
		this.schema_emitted = false;
		this.kinds.clear();
		this.text_parents.clear();
		this.text_state.clear();
		this.pending_starts.clear();
		this.info_starts.clear();
		this.raw_html_ids.clear();
		this.parser_cursor = 0;
	}
}

/** derive the opening delimiter string from a node kind. */
function get_delimiter(kind: node_kind | undefined): string {
	switch (kind) {
		case node_kind.emphasis:
			return '_';
		case node_kind.strong_emphasis:
			return '*';
		case node_kind.strikethrough:
			return '~~';
		case node_kind.superscript:
			return '^';
		case node_kind.subscript:
			return '~';
		case node_kind.link:
			return '[';
		case node_kind.image:
			return '![';
		case node_kind.code_span:
			return '`';
		case node_kind.html:
			return '<';
		default:
			return '';
	}
}
