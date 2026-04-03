import type { Emitter } from './opcodes';
import { node_buffer, node_kind } from './utils';

/**
 * Consumes opcodes from PFMParser and builds a node_buffer.
 * This is the backward-compatibility layer: the opcode stream is the
 * primary output, but existing tests and consumers expect a node_buffer.
 */
export class TreeBuilder implements Emitter {
	private nodes: node_buffer;
	/** Maps opcode ID → node_buffer index. Plain array — IDs are sequential integers. */
	private id_to_index: number[] = [];
	/** Maps opcode ID → node_kind. Plain array for O(1) lookup. */
	private id_to_kind: number[] = [];

	constructor(capacity: number) {
		this.nodes = new node_buffer(capacity);
		// node_buffer constructor auto-creates root at index 0
		this.id_to_index[0] = 0;
		this.id_to_kind[0] = node_kind.root;
	}

	open(
		id: number,
		kind: node_kind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean,
	): void {
		// Root (id=0) is auto-created by node_buffer constructor — skip
		if (id === 0) return;

		const parent_idx =
			parent === -1 ? 0xffffffff : (this.id_to_index[parent] ?? 0xffffffff);
		const idx = pending
			? this.nodes.push_pending(kind, start, parent_idx, extra)
			: this.nodes.push(kind, start, parent_idx, extra);
		this.id_to_index[id] = idx;
		this.id_to_kind[id] = kind;
	}

	close(id: number, end: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
		this.nodes.set_end(idx, end);
		// Closing a pending node commits it
		this.nodes.commit_node(idx);

		// Tight list unwrapping: if this is a list with tight=true,
		// walk items and unwrap their paragraph children
		if (this.id_to_kind[id] === node_kind.list) {
			const meta = this.nodes.metadata_at(idx);
			if (meta && meta.tight) {
				const list_node = this.nodes.get_node(idx);
				for (const item_idx of list_node.children) {
					const item = this.nodes.get_node(item_idx);
					for (const child_idx of item.children) {
						if (this.nodes.kind_at(child_idx) === node_kind.paragraph) {
							this.nodes.unwrap_node(child_idx);
						}
					}
				}
			}
		}
	}

	text(parent: number, start: number, end: number): void {
		const parent_idx = this.id_to_index[parent];
		if (parent_idx === undefined) return;
		const parent_kind = this.id_to_kind[parent];

		// Nodes that store content as a value range (no child text node)
		if (
			parent_kind === node_kind.heading ||
			parent_kind === node_kind.code_fence ||
			parent_kind === node_kind.code_span ||
			parent_kind === node_kind.html_comment
		) {
			this.nodes.set_value(parent_idx, start, end);
		} else {
			// Create a child text node
			const idx = this.nodes.push(node_kind.text, start, parent_idx);
			this.nodes.set_value(idx, start, end);
			this.nodes.set_end(idx, end);
		}
	}

	attr(id: number, key: string, value: any): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		switch (key) {
			case 'value':
				this.nodes.set_value(idx, value[0], value[1]);
				break;
			case 'value_start':
				this.nodes.set_value_start(idx, value);
				break;
			case 'value_end':
				this.nodes.set_value_end(idx, value);
				break;
			default: {
				// Merge into metadata map
				const existing = this.nodes.metadata_at(idx);
				if (existing) {
					existing[key] = value;
					this.nodes.set_metadata(idx, existing);
				} else {
					this.nodes.set_metadata(idx, { [key]: value });
				}
				break;
			}
		}
	}

	set_value_start(id: number, pos: number): void {
		const idx = this.id_to_index[id];
		if (idx !== undefined) this.nodes.set_value_start(idx, pos);
	}

	set_value_end(id: number, pos: number): void {
		const idx = this.id_to_index[id];
		if (idx !== undefined) this.nodes.set_value_end(idx, pos);
	}

	revoke(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		const node = this.nodes.get_node(idx);
		if (node.children.length === 0) {
			// Empty node (e.g. failed code span) — remove from tree
			this.nodes.unwrap_node(idx);
			// If this is the last node in the buffer, reclaim it
			if (idx === this.nodes.size - 1) {
				this.nodes.pop();
			}
		} else {
			// Has children (e.g. unclosed emphasis) — convert to text, reparent children
			this.nodes.handle_repair(idx);
		}
	}

	cursor(_pos: number): void {}

	/** Extract the built node_buffer. */
	get_buffer(): node_buffer {
		return this.nodes;
	}
}
