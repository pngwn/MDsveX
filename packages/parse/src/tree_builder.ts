import type { Emitter } from "./opcodes";
import { node_buffer, node_kind } from "./utils";

/**
 * consumes opcodes from PFMParser and builds a node_buffer.
 * this is the backward-compatibility layer: the opcode stream is the
 * primary output, but existing tests and consumers expect a node_buffer.
 */
export class TreeBuilder implements Emitter {
	private nodes: node_buffer;
	/** maps opcode id -> node_buffer index. plain array, ids are sequential integers. */
	private id_to_index: number[] = [];
	/** maps opcode id -> node_kind. plain array for o(1) lookup. */
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
		// root (id=0) is auto-created by node_buffer constructor, skip
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
		// pending paragraphs inside list_items are tight-list speculation
		// wrappers, they stay pending after close until the list closes
		// and the parser either revokes (tight) or commits (loose) them.
		const kind = this.id_to_kind[id];
		const parent_kind = this.nodes._kinds[
			this.nodes._parents[idx]
		] as node_kind;
		if (
			!(
				kind === node_kind.paragraph &&
				parent_kind === node_kind.list_item &&
				this.nodes._pending_nodes[idx] === 1
			)
		) {
			this.nodes.commit_node(idx);
		}

		// tight list unwrapping: if this is a list with tight=true, walk
		// items and unwrap their paragraph children. safe no-op when the
		// parser already revoked them via finalize_list_pending_paras.
		if (kind === node_kind.list) {
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

		// nodes that store content as a value range (no child text node)
		if (
			parent_kind === node_kind.heading ||
			parent_kind === node_kind.code_fence ||
			parent_kind === node_kind.code_span ||
			parent_kind === node_kind.html_comment
		) {
			this.nodes.set_value(parent_idx, start, end);
		} else {
			// create a child text node
			const idx = this.nodes.push(node_kind.text, start, parent_idx);
			this.nodes.set_value(idx, start, end);
			this.nodes.set_end(idx, end);
		}
	}

	attr(id: number, key: string, value: any): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;

		switch (key) {
			case "value":
				this.nodes.set_value(idx, value[0], value[1]);
				break;
			case "value_start":
				this.nodes.set_value_start(idx, value);
				break;
			case "value_end":
				this.nodes.set_value_end(idx, value);
				break;
			default: {
				// merge into metadata map
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

	revoke(id: number, source_text?: string): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
		this.nodes.handle_repair(idx, source_text);
	}

	commit(id: number): void {
		const idx = this.id_to_index[id];
		if (idx === undefined) return;
		this.nodes.commit_node(idx);
	}

	cursor(_pos: number): void {}

	/** extract the built node_buffer. */
	get_buffer(): node_buffer {
		return this.nodes;
	}
}
