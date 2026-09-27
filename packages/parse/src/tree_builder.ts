import type { Emitter } from './opcodes';
import { NodeBuffer, NodeKind } from './utils';
import type { PluginDispatcher } from './plugin_dispatch';

/**
 * consumes opcodes from PFMParser and builds a NodeBuffer.
 * this is the backward-compatibility layer: the opcode stream is the
 * primary output, but existing tests and consumers expect a NodeBuffer.
 *
 * the parser keeps ids dense (see Emitter), so every id is its own buffer
 * index and the builder needs no translation. an id that does not land on
 * the next free slot, a revoke that pushed a repair node, or a plugin
 * dispatcher that pushes synthetic nodes switches the builder to an id map
 * for the rest of the document.
 */
export class TreeBuilder implements Emitter {
	private nodes: NodeBuffer;
	/** opcode id -> buffer index, null while ids equal indices. */
	private id_to_index: number[] | null = null;
	/** opcode id -> kind at open, only kept for plugins because they rewrite kinds. */
	private id_to_kind: number[] | null = null;
	/** buffer index -> kind at open for nodes a revoke rewrote, null until one does. */
	private revoked_kinds: Map<number, number> | null = null;
	/** optional plugin dispatcher. null when no plugins registered. */
	private dispatcher: PluginDispatcher | null;

	/** callback for dispatcher to register synthetic node ids. */
	private register_id = (synthetic_id: number, buf_idx: number): void => {
		this.id_to_index![synthetic_id] = buf_idx;
	};

	constructor(capacity: number, dispatcher?: PluginDispatcher) {
		this.nodes = new NodeBuffer(capacity);
		this.dispatcher = dispatcher ?? null;
		// NodeBuffer constructor auto-creates root at index 0
		if (this.dispatcher !== null) {
			this.id_to_index = [0];
			this.id_to_kind = [NodeKind.root];
		}
	}

	/**
	 * Reset a no-plugin builder for another complete document.
	 *
	 * A plugin dispatcher owns a source-specific TextSource, so those builders
	 * cannot be safely reused for a different document.
	 */
	reset(): void {
		if (this.dispatcher !== null) {
			throw new Error('TreeBuilder with plugins cannot be reset');
		}
		this.nodes.reset();
		this.nodes.push(NodeKind.root, 0);
		this.id_to_index = null;
		this.revoked_kinds = null;
	}

	/** buffer index for an opcode id, undefined when the id was never opened. */
	private index_of(id: number): number | undefined {
		const map = this.id_to_index;
		return map === null ? id : map[id];
	}

	/** stop treating ids as indices, every id opened so far is its own index. */
	private start_id_map(): number[] {
		const size = this.nodes._size;
		const map: number[] = [];
		for (let i = 0; i < size; i++) map.push(i);
		this.id_to_index = map;
		return map;
	}

	open(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		// root (id=0) is auto-created by NodeBuffer constructor, skip
		if (id === 0) return;

		const nodes = this.nodes;
		let map = this.id_to_index;
		if (map === null) {
			if (id === nodes._size) {
				// parents are opened ids below this one, so they are indices too
				const parent_idx = parent === -1 ? 0xffffffff : parent;
				if (pending) nodes.push_pending(kind, start, parent_idx, extra);
				else nodes.push(kind, start, parent_idx, extra);
				return;
			}
			map = this.start_id_map();
		}

		let parent_idx = parent === -1 ? 0xffffffff : (map[parent] ?? 0xffffffff);

		const dispatcher = this.dispatcher;
		// plugin redirect: if parent has a wrap_inner wrapper, children go there
		if (dispatcher !== null && parent_idx !== 0xffffffff) {
			const redirect = dispatcher.get_redirect(parent_idx);
			if (redirect !== undefined) parent_idx = redirect;
		}

		const idx = pending
			? nodes.push_pending(kind, start, parent_idx, extra)
			: nodes.push(kind, start, parent_idx, extra);
		map[id] = idx;

		if (dispatcher !== null) {
			this.id_to_kind![id] = kind;
			// plugin dispatch
			if (dispatcher.has_handlers(kind)) {
				dispatcher.dispatch_open(idx, kind, nodes, this.register_id);
			}
		}
	}

	close(id: number, end: number): void {
		if (this.dispatcher !== null) {
			this.close_with_plugins(id, end);
			return;
		}
		const idx = this.index_of(id);
		if (idx === undefined) return;
		const nodes = this.nodes;
		nodes.set_end(idx, end);

		const kind = nodes._kinds[idx];
		if (kind === NodeKind.paragraph) {
			// pending paragraphs inside list_items are tight-list speculation
			// wrappers, they stay pending after close until the list closes
			// and the parser either revokes (tight) or commits (loose) them.
			// a revoke can rewrite another kind into a paragraph, that one
			// was not opened as a wrapper
			if (
				nodes._pending_nodes[idx] === 1 &&
				nodes._kinds[nodes._parents[idx]] === NodeKind.list_item &&
				!this.was_revoked_from_other_kind(idx)
			) {
				return;
			}
		} else if (kind === NodeKind.list) {
			nodes.commit_node(idx);
			this.unwrap_tight_list(idx);
			return;
		}
		nodes.commit_node(idx);
	}

	/** whether a revoke turned this node from another kind into a paragraph. */
	private was_revoked_from_other_kind(idx: number): boolean {
		const revoked = this.revoked_kinds;
		if (revoked === null) return false;
		const kind = revoked.get(idx);
		return kind !== undefined && kind !== NodeKind.paragraph;
	}

	/**
	 * tight list unwrapping: if this is a list with tight=true, walk items and
	 * unwrap their paragraph children. safe no-op when the parser already
	 * revoked them via finalize_list_pending_paras.
	 */
	private unwrap_tight_list(idx: number): void {
		const nodes = this.nodes;
		const meta = nodes.metadata_at(idx);
		if (!meta || !meta.tight) return;
		const parents = nodes._parents;
		const next_siblings = nodes._next_siblings;
		let item = nodes._children_starts[idx];
		while (item !== 0xffffffff && parents[item] === idx) {
			let child = nodes._children_starts[item];
			while (child !== 0xffffffff && parents[child] === item) {
				// read the next sibling first, unwrapping splices the
				// paragraph's children in where it was
				const next = next_siblings[child];
				if (nodes._kinds[child] === NodeKind.paragraph) {
					nodes.unwrap_node(child);
				}
				child = next;
			}
			item = next_siblings[item];
		}
	}

	private close_with_plugins(id: number, end: number): void {
		const idx = this.id_to_index![id];
		if (idx === undefined) return;
		const nodes = this.nodes;
		const dispatcher = this.dispatcher!;
		nodes.set_end(idx, end);

		// capture pending state before close dispatch / commit
		const was_pending = nodes._pending_nodes[idx] === 1;

		// plugin close dispatch: fire close callbacks before committing
		dispatcher.dispatch_close(idx, nodes);

		// pending paragraphs inside list_items are tight-list speculation
		// wrappers, they stay pending after close until the list closes
		// and the parser either revokes (tight) or commits (loose) them.
		const kind = this.id_to_kind![id];
		const keep_pending =
			kind === NodeKind.paragraph &&
			nodes._pending_nodes[idx] === 1 &&
			nodes._kinds[nodes._parents[idx]] === NodeKind.list_item;
		if (!keep_pending) {
			nodes.commit_node(idx);
			if (!was_pending) {
				dispatcher.dispatch_commit(idx);
			}
		}

		if (kind === NodeKind.list) {
			this.unwrap_tight_list(idx);
		}
	}

	text(parent: number, start: number, end: number): void {
		let parent_idx = this.index_of(parent);
		if (parent_idx === undefined) return;

		let parent_kind: number;
		if (this.dispatcher !== null) {
			parent_kind = this.id_to_kind![parent];
			// plugin redirect: text targeting a wrapped parent goes to the wrapper
			const redirect = this.dispatcher.get_redirect(parent_idx);
			if (redirect !== undefined) parent_idx = redirect;
		} else {
			parent_kind = this.opened_kind(parent_idx);
		}

		// nodes that store content as a value range (no child text node)
		if (
			parent_kind === NodeKind.heading ||
			parent_kind === NodeKind.code_fence ||
			parent_kind === NodeKind.code_span ||
			parent_kind === NodeKind.html_comment
		) {
			this.nodes.set_value(parent_idx, start, end);
		} else {
			// create a child text node, in the slot of the id the parser reserved for it
			const idx = this.nodes.push(NodeKind.text, start, parent_idx);
			this.nodes.set_value(idx, start, end);
			this.nodes.set_end(idx, end);
		}
	}

	/** kind a node was opened with, a revoke may have rewritten the buffer kind since. */
	private opened_kind(idx: number): number {
		const revoked = this.revoked_kinds;
		if (revoked !== null) {
			const kind = revoked.get(idx);
			if (kind !== undefined) return kind;
		}
		return this.nodes._kinds[idx];
	}

	attr(id: number, key: string, value: any): void {
		const idx = this.index_of(id);
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
		const idx = this.index_of(id);
		if (idx !== undefined) this.nodes.set_value_start(idx, pos);
	}

	set_value_end(id: number, pos: number): void {
		const idx = this.index_of(id);
		if (idx !== undefined) this.nodes.set_value_end(idx, pos);
	}

	revoke(id: number, source_text?: string): void {
		const idx = this.index_of(id);
		if (idx === undefined) return;
		const nodes = this.nodes;

		// plugin revoke: undo mutations before handle_repair
		if (this.dispatcher !== null) {
			this.dispatcher.dispatch_revoke(idx, nodes);
			nodes.handle_repair(idx, source_text);
			return;
		}

		const kind = nodes._kinds[idx];
		nodes.handle_repair(idx, source_text);
		// close and text still act on the kind the node was opened with
		if (nodes._kinds[idx] !== kind) {
			let revoked = this.revoked_kinds;
			if (revoked === null) revoked = this.revoked_kinds = new Map();
			if (!revoked.has(idx)) revoked.set(idx, kind);
		}
	}

	commit(id: number): void {
		const idx = this.index_of(id);
		if (idx === undefined) return;
		this.nodes.commit_node(idx);
		if (this.dispatcher) {
			this.dispatcher.dispatch_commit(idx);
		}
	}

	cursor(_pos: number): void {}

	/** extract the built NodeBuffer. */
	get_buffer(): NodeBuffer {
		return this.nodes;
	}
}
