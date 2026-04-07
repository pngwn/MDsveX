/**
 * WireTreeBuilder, populates a node_buffer from wire format batches.
 *
 * client-side counterpart to TreeBuilder. consumes the same json
 * opcode batches that WireEmitter produces and builds the same soa
 * node_buffer structure. the resulting buffer is walkable by Cursor
 * with identical semantics.
 *
 * text strings from the wire format are stored directly in the buffer's
 * _strings array, no slicing needed at render time.
 *
 * Usage:
 *
 *   const builder = new WireTreeBuilder();
 *   builder.apply(batch);          // after each sse/ws message
 *   const cursor = builder.cursor(); // reusable cursor over the buffer
 *   const html = renderCursor(cursor);
 */

import { node_buffer, node_kind } from "./utils";
import { Cursor } from "./cursor";
import type { PluginDispatcher } from "./plugin_dispatch";
import { WireTextSource } from "./node_view";

const NONE = 0xffffffff;

export class WireTreeBuilder {
	/** the soa buffer. */
	private buf: node_buffer;
	/** maps wire node id -> buffer index. */
	private id_to_index: number[];
	/** schema kind names (from s opcode). */
	private schema: string[] | null;
	/** optional plugin dispatcher. null when no plugins registered. */
	private dispatcher: PluginDispatcher | null;

	/** callback for dispatcher to register synthetic node ids. */
	private register_id = (synthetic_id: number, buf_idx: number): void => {
		this.id_to_index[synthetic_id] = buf_idx;
	};

	constructor(capacity = 128, dispatcher?: PluginDispatcher) {
		this.buf = new node_buffer(capacity);
		this.id_to_index = [0]; // root id 0 -> buffer index 0
		this.schema = null;
		this.dispatcher = dispatcher ?? null;

		// wire mode: point the dispatcher's text source at the buffer's
		// _strings array so NodeView.textContent resolves correctly.
		if (this.dispatcher) {
			this.dispatcher.set_text_source(
				new WireTextSource(this.buf._strings),
			);
		}
	}

	/**
	 * apply a batch of wire opcodes to the buffer.
	 * call after each sse/websocket message.
	 */
	apply(batch: unknown[][]): void {
		// ensure capacity, ~1 node per 2 opcodes is a good heuristic
		this.buf.ensure_capacity(this.buf.size + (batch.length >> 1));

		for (let i = 0; i < batch.length; i++) {
			const op = batch[i];
			switch (op[0]) {
				case "S":
					this.schema = op[1] as string[];
					break;
				case "O":
					this._open(
						op[1] as number,
						op[2] as number,
						op[3] as number,
						(op[4] as number) === 1,
						op[5] as number,
					);
					break;
				case "C":
					this._close(op[1] as number);
					break;
				case "T":
					this._text(op[1] as number, op[2] as string);
					break;
				case "A":
					this._attr(op[1] as number, op[2] as string, op[3]);
					break;
				case "R":
					this._revoke(op[1] as number, op[2] as string);
					break;
				case "K":
					this._commit(op[1] as number);
					break;
				case "X":
					this._clear(op[1] as number);
					break;
			}
		}
	}

	/** get a cursor over the current buffer state. */
	cursor(): Cursor {
		return new Cursor(this.buf, "");
	}

	/** get the underlying node_buffer. */
	get_buffer(): node_buffer {
		return this.buf;
	}

	/** reset for a new document. */
	reset(): void {
		this.buf = new node_buffer(128);
		this.id_to_index = [0];
		this.schema = null;
	}

	// internal opcode handlers

	private _open(
		id: number,
		kind: number,
		parent: number,
		pending: boolean,
		extra: number,
	): void {
		// root (id=0) is auto-created by node_buffer constructor
		if (id === 0) return;

		let parent_idx =
			parent === -1 ? NONE : (this.id_to_index[parent] ?? NONE);

		// plugin redirect: if parent has a wrapInner wrapper, children go there
		if (this.dispatcher && parent_idx !== NONE) {
			const redirect = this.dispatcher.get_redirect(parent_idx);
			if (redirect !== undefined) parent_idx = redirect;
		}

		const idx = pending
			? this.buf.push_pending(kind as node_kind, 0, parent_idx, extra)
			: this.buf.push(kind as node_kind, 0, parent_idx, extra);
		this.id_to_index[id] = idx;

		// plugin dispatch
		if (this.dispatcher && this.dispatcher.has_handlers(kind as node_kind)) {
			this.dispatcher.dispatch_open(
				idx,
				kind as node_kind,
				this.buf,
				this.register_id,
			);
		}
	}

	private _close(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
		this.buf.set_end(idx, 1);

		// capture pending state BEFORE close dispatch / commit.
		// pending nodes may still be revoked after close, so their
		// undo logs must be preserved until explicit commit or revoke.
		const was_pending = this.buf._pending_nodes[idx] === 1;

		// plugin close dispatch
		if (this.dispatcher) {
			this.dispatcher.dispatch_close(idx, this.buf);
		}

		// pending paragraphs inside list_items are tight-list speculation
		// wrappers, they stay pending after close until the list closes
		// and the parser either revokes (tight) or commits (loose) them.
		const kind = this.buf._kinds[idx];
		const parent_kind = this.buf._kinds[this.buf._parents[idx]];
		if (
			!(
				kind === node_kind.paragraph &&
				parent_kind === node_kind.list_item &&
				this.buf._pending_nodes[idx] === 1
			)
		) {
			this.buf.commit_node(idx);
			// only commit undo log if the node was NOT pending at close time.
			// pending nodes keep their undo logs until explicit commit/revoke.
			if (this.dispatcher && !was_pending) {
				this.dispatcher.dispatch_commit(idx);
			}
		}

		// tight list unwrapping, walk sibling chains directly. safe no-op
		// when the parser already revoked them via finalize_list_pending_paras.
		if (kind === node_kind.list) {
			const meta = this.buf.metadata_at(idx);
			if (meta && meta.tight) {
				let item = this.buf._children_starts[idx];
				while (item !== NONE) {
					const next_item = this.buf._next_siblings[item];
					let child = this.buf._children_starts[item];
					while (child !== NONE) {
						const next_child = this.buf._next_siblings[child];
						if (this.buf._kinds[child] === node_kind.paragraph) {
							this.buf.unwrap_node(child);
						}
						child = next_child;
					}
					item = next_item;
				}
			}
		}
	}

	private _text(id: number, content: string): void {
		let idx = this.id_to_index[id];
		if (idx === undefined) return;

		// plugin redirect: text targeting a wrapped parent goes to the wrapper
		if (this.dispatcher) {
			const redirect = this.dispatcher.get_redirect(idx);
			if (redirect !== undefined) idx = redirect;
		}

		const kind = this.buf._kinds[idx];
		const strings = this.buf._strings;

		// content leaves: store string directly on the node
		if (
			kind === node_kind.code_fence ||
			kind === node_kind.code_span ||
			kind === node_kind.html_comment
		) {
			// consecutive t opcodes: concatenate
			const existing = strings[idx];
			strings[idx] = existing !== undefined ? existing + content : content;
			return;
		}

		// raw-text html elements (script, style): content lives on the html
		// node itself, not as a text child. mirrors the treebuilder path where
		// the parser writes value_start/value_end directly on the html node.
		if (kind === node_kind.html) {
			const meta = this.buf.metadata_at(idx);
			if (meta && (meta.tag === "script" || meta.tag === "style")) {
				const existing = strings[idx];
				strings[idx] = existing !== undefined ? existing + content : content;
				return;
			}
		}

		// container nodes: coalesce consecutive t opcodes into a single child
		// text node. if the last child is already a text node, append to it;
		// otherwise create a new child. this keeps clear semantics simple
		// (remove the trailing in-progress text child) and matches the parser's
		// model where each parser text node maps to one wire text child.
		const last_text_idx = this._last_text_child(idx);
		if (last_text_idx !== NONE) {
			const existing = strings[last_text_idx];
			strings[last_text_idx] =
				existing !== undefined ? existing + content : content;
			return;
		}

		const text_idx = this.buf.push(node_kind.text, 0, idx);
		strings[text_idx] = content;
		this.buf._ends[text_idx] = 1;
	}

	/**
	 * return the buffer index of the last child of `idx` if and only if that
	 * child is a text node. returns none otherwise. used by _text (coalesce)
	 * and _clear (discard in-progress text).
	 */
	private _last_text_child(idx: number): number {
		let child = this.buf._children_starts[idx];
		if (child === NONE) return NONE;
		let last = child;
		while (true) {
			const next = this.buf._next_siblings[last];
			if (next === NONE || this.buf._parents[next] !== idx) break;
			last = next;
		}
		return this.buf._kinds[last] === node_kind.text ? last : NONE;
	}

	private _attr(id: number, key: string, value: unknown): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		const existing = this.buf.metadata_at(idx);
		if (existing) {
			existing[key] = value;
			this.buf.set_metadata(idx, existing);
		} else {
			this.buf.set_metadata(idx, { [key]: value });
		}
	}

	private _revoke(id: number, delimiter: string): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		// plugin revoke: undo mutations before handle_repair
		if (this.dispatcher) {
			this.dispatcher.dispatch_revoke(idx, this.buf);
		}

		this.buf.handle_repair(idx, delimiter || undefined);
	}

	private _commit(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
		this.buf.commit_node(idx);
		if (this.dispatcher) {
			this.dispatcher.dispatch_commit(idx);
		}
	}

	private _clear(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		// content leaves store text on the node itself, drop it.
		delete this.buf._strings[idx];

		// container nodes store text as a trailing child text node created by
		// _text. clear means a value range was corrected mid-stream (e.g.
		// trailing whitespace trimmed), so the in-progress text child must be
		// discarded. a committed non-text sibling after it would mean the text
		// child is no longer the tail, in that case there is nothing to undo.
		const last_text_idx = this._last_text_child(idx);
		if (last_text_idx === NONE) return;
		delete this.buf._strings[last_text_idx];
		// unwrap_node of a childless node removes it from the sibling chain.
		this.buf.unwrap_node(last_text_idx);
	}
}
