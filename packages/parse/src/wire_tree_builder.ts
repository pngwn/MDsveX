/**
 * WireTreeBuilder, populates a NodeBuffer from wire format batches.
 *
 * client-side counterpart to TreeBuilder. consumes the same json
 * opcode batches that WireEmitter produces and builds the same
 * NodeBuffer structure. the resulting buffer is walkable by Cursor
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

import { NodeBuffer, NodeKind, make_meta, merge_meta } from './utils';
import { Cursor } from './cursor';
import type { PluginDispatcher } from './plugin_dispatch';
import { WireTextSource } from './node_view';

const NONE = 0xffffffff;

export class WireTreeBuilder {
	private buf: NodeBuffer;
	/** maps wire node id -> buffer index. */
	private id_to_index: number[];
	/** schema kind names (from s opcode). */
	private schema: string[] | null;
	/** optional plugin dispatcher. null when no plugins registered. */
	private dispatcher: PluginDispatcher | null;

	constructor(capacity = 128, dispatcher?: PluginDispatcher) {
		this.buf = new NodeBuffer(capacity);
		this.id_to_index = [0]; // root id 0 -> buffer index 0
		this.schema = null;
		this.dispatcher = dispatcher ?? null;
		this.bind_strings();
	}

	/** a new buffer shares the empty strings every buffer starts with */
	private bind_strings(): void {
		// this builder writes strings in place and its text source holds the array
		const strings = this.buf.own_strings();

		// wire mode: point the dispatcher's text source at the buffer's
		// _strings array so NodeView.text_content resolves correctly.
		if (this.dispatcher) {
			this.dispatcher.set_text_source(new WireTextSource(strings));
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
				case 'S':
					this.schema = op[1] as string[];
					break;
				case 'O':
					this._open(
						op[1] as number,
						op[2] as number,
						op[3] as number,
						(op[4] as number) === 1,
						op[5] as number
					);
					break;
				case 'C':
					this._close(op[1] as number);
					break;
				case 'T':
					this._text(op[1] as number, op[2] as string);
					break;
				case 'A':
					this._attr(op[1] as number, op[2] as string, op[3]);
					break;
				case 'R':
					this._revoke(op[1] as number, op[2] as string);
					break;
				case 'K':
					this._commit(op[1] as number);
					break;
				case 'X':
					this._clear(op[1] as number);
					break;
			}
		}
	}

	/** get a cursor over the current buffer state. */
	cursor(): Cursor {
		return new Cursor(this.buf, '');
	}

	/** get the underlying NodeBuffer. */
	get_buffer(): NodeBuffer {
		return this.buf;
	}

	/** reset for a new document. */
	reset(): void {
		this.buf = new NodeBuffer(128);
		this.id_to_index = [0];
		this.schema = null;
		// redirects, undo logs and close callbacks hold indices of the old buffer
		if (this.dispatcher) this.dispatcher.reset();
		this.bind_strings();
	}

	// internal opcode handlers

	private _open(
		id: number,
		kind: number,
		parent: number,
		pending: boolean,
		extra: number
	): void {
		// root (id=0) is auto-created by NodeBuffer constructor
		if (id === 0) return;

		let parent_idx = parent === -1 ? NONE : (this.id_to_index[parent] ?? NONE);

		// a handled node opens under its source parent, the dispatcher moves it
		// into an open wrapper after its handlers ran, any other node goes
		// straight to the innermost open wrapper
		const dispatcher = this.dispatcher;
		const handled =
			dispatcher !== null && dispatcher.has_handlers(kind as NodeKind);
		if (dispatcher !== null && !handled && parent_idx !== NONE) {
			parent_idx = dispatcher.resolve(parent_idx);
		}

		const idx = pending
			? this.buf.push_pending(kind as NodeKind, 0, parent_idx, extra)
			: this.buf.push(kind as NodeKind, 0, parent_idx, extra);
		this.id_to_index[id] = idx;

		if (handled) dispatcher!.dispatch_open(idx, kind as NodeKind, this.buf);
	}

	private _close(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
		this.buf.set_end(idx, 1);

		// capture pending state BEFORE close dispatch / commit.
		// pending nodes may still be revoked after close, so their
		// undo logs must be preserved until explicit commit or revoke.
		const was_pending = this.buf.pending_at(idx) === 1;

		// plugin close dispatch
		if (this.dispatcher) {
			this.dispatcher.dispatch_close(idx, this.buf);
		}

		// pending paragraphs inside list_items are tight-list speculation
		// wrappers, they stay pending after close until the list closes
		// and the parser either revokes (tight) or commits (loose) them.
		const kind = this.buf.kind_at(idx);
		const parent_kind = this.buf.kind_at(this.buf.parent_at(idx));
		if (
			!(
				kind === NodeKind.paragraph &&
				parent_kind === NodeKind.list_item &&
				this.buf.pending_at(idx) === 1
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
		if (kind === NodeKind.list) {
			const meta = this.buf.metadata_at(idx);
			if (meta && meta.tight) {
				let item = this.buf.first_child_at(idx);
				while (item !== NONE) {
					const next_item = this.buf.next_at(item);
					let child = this.buf.first_child_at(item);
					while (child !== NONE) {
						const next_child = this.buf.next_at(child);
						if (this.buf.kind_at(child) === NodeKind.paragraph) {
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

		// text of a wrapped parent goes to its innermost open wrapper
		if (this.dispatcher) idx = this.dispatcher.resolve(idx);

		const kind = this.buf.kind_at(idx);
		const strings = this.buf._strings;

		// content leaves: store string directly on the node
		if (
			kind === NodeKind.code_fence ||
			kind === NodeKind.code_span ||
			kind === NodeKind.html_comment
		) {
			// consecutive t opcodes: concatenate
			const existing = strings[idx];
			strings[idx] = existing !== undefined ? existing + content : content;
			return;
		}

		// raw-text html elements (script, style): content lives on the html
		// node itself, not as a text child. mirrors the treebuilder path where
		// the parser writes value_start/value_end directly on the html node.
		if (kind === NodeKind.html) {
			const meta = this.buf.metadata_at(idx);
			if (meta && (meta.tag === 'script' || meta.tag === 'style')) {
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

		const text_idx = this.buf.push(NodeKind.text, 0, idx);
		strings[text_idx] = content;
		this.buf.set_end(text_idx, 1);
	}

	/**
	 * return the buffer index of the last child of `idx` if and only if that
	 * child is a text node. returns none otherwise. used by _text (coalesce)
	 * and _clear (discard in-progress text).
	 */
	private _last_text_child(idx: number): number {
		let child = this.buf.first_child_at(idx);
		if (child === NONE) return NONE;
		let last = child;
		while (true) {
			const next = this.buf.next_at(last);
			if (next === NONE || this.buf.parent_at(next) !== idx) break;
			last = next;
		}
		return this.buf.kind_at(last) === NodeKind.text ? last : NONE;
	}

	private _attr(id: number, key: string, value: unknown): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		const existing = this.buf.metadata_at(idx);
		if (existing) {
			merge_meta(existing, key, value);
		} else {
			this.buf.set_metadata(idx, make_meta(key, value));
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
