/**
 * WireTreeBuilder — populates a node_buffer from wire format batches.
 *
 * Client-side counterpart to TreeBuilder. Consumes the same JSON
 * opcode batches that WireEmitter produces and builds the same SOA
 * node_buffer structure. The resulting buffer is walkable by PFMCursor
 * with identical semantics.
 *
 * Text strings from the wire format are stored directly in the buffer's
 * _strings array — no slicing needed at render time.
 *
 * Usage:
 *
 *   const builder = new WireTreeBuilder();
 *   builder.apply(batch);          // after each SSE/WS message
 *   const cursor = builder.cursor(); // reusable cursor over the buffer
 *   const html = renderCursor(cursor);
 */

import { node_buffer, node_kind } from './utils';
import { PFMCursor } from './cursor';

const NONE = 0xffffffff;

export class WireTreeBuilder {
	/** The SOA buffer. */
	private buf: node_buffer;
	/** Maps wire node ID → buffer index. */
	private id_to_index: number[];
	/** Schema kind names (from S opcode). */
	private schema: string[] | null;

	constructor(capacity = 128) {
		this.buf = new node_buffer(capacity);
		this.id_to_index = [0]; // root ID 0 → buffer index 0
		this.schema = null;
	}

	/**
	 * Apply a batch of wire opcodes to the buffer.
	 * Call after each SSE/WebSocket message.
	 */
	apply(batch: unknown[][]): void {
		// Ensure capacity — ~1 node per 2 opcodes is a good heuristic
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
						op[5] as number,
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
				case 'X':
					this._clear(op[1] as number);
					break;
			}
		}
	}

	/** Get a cursor over the current buffer state. */
	cursor(): PFMCursor {
		return new PFMCursor(this.buf, '');
	}

	/** Get the underlying node_buffer. */
	get_buffer(): node_buffer {
		return this.buf;
	}

	/** Reset for a new document. */
	reset(): void {
		this.buf = new node_buffer(128);
		this.id_to_index = [0];
		this.schema = null;
	}

	// ── Internal opcode handlers ───────────────────────────────

	private _open(
		id: number,
		kind: number,
		parent: number,
		pending: boolean,
		extra: number,
	): void {
		// Root (id=0) is auto-created by node_buffer constructor
		if (id === 0) return;

		const parent_idx = parent === -1 ? NONE : (this.id_to_index[parent] ?? NONE);
		const idx = pending
			? this.buf.push_pending(kind as node_kind, 0, parent_idx, extra)
			: this.buf.push(kind as node_kind, 0, parent_idx, extra);
		this.id_to_index[id] = idx;
	}

	private _close(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
		this.buf.set_end(idx, 1);
		this.buf.commit_node(idx);

		// Tight list unwrapping — walk sibling chains directly
		if (this.buf._kinds[idx] === node_kind.list) {
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
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		const kind = this.buf._kinds[idx];
		const strings = this.buf._strings;

		// Content leaves: store string directly on the node
		if (
			kind === node_kind.heading ||
			kind === node_kind.code_fence ||
			kind === node_kind.code_span ||
			kind === node_kind.html_comment
		) {
			// Consecutive T opcodes: concatenate
			const existing = strings[idx];
			strings[idx] = existing !== undefined ? existing + content : content;
			return;
		}

		// Container nodes: create a child text node with the string stored directly
		const text_idx = this.buf.push(node_kind.text, 0, idx);
		strings[text_idx] = content;
		this.buf._ends[text_idx] = 1;
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

		const parent_idx = this.buf._parents[idx];
		if (parent_idx === NONE) return;

		// Convert revoked node to text node with the delimiter
		if (delimiter) {
			this.buf.set_kind(idx, node_kind.text);
			this.buf._strings[idx] = delimiter;
			this.buf.set_end(idx, 1);
		}

		// Reparent children to grandparent
		const first_child = this.buf._children_starts[idx];
		if (first_child !== NONE) {
			// Walk to find last child
			let child = first_child;
			let last_child = first_child;
			while (child !== NONE) {
				this.buf._parents[child] = parent_idx;
				last_child = child;
				child = this.buf._next_siblings[child];
			}

			// Link: idx -> first_child ... last_child -> idx.next
			const idx_next = this.buf._next_siblings[idx];
			this.buf._next_siblings[idx] = first_child;
			this.buf.prev_siblings_set(first_child, idx);
			this.buf._next_siblings[last_child] = idx_next;
			if (idx_next !== NONE) {
				this.buf.prev_siblings_set(idx_next, last_child);
			} else {
				this.buf.children_ends_set(parent_idx, last_child);
			}

			// Clear revoked node's children
			this.buf._children_starts[idx] = NONE;
			this.buf.children_ends_set(idx, NONE);
		} else if (!delimiter) {
			this.buf.unwrap_node(idx);
		}
	}

	private _clear(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
	}
}
