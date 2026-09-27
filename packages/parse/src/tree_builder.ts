import type { Emitter } from './opcodes';
import {
	NodeBuffer,
	NodeField,
	NodeKind,
	make_meta,
	merge_meta,
} from './utils';
import type { PluginDispatcher } from './plugin_dispatch';

const NONE = 0xffffffff;

/**
 * consumes opcodes from PFMParser and builds a NodeBuffer.
 * this is the backward-compatibility layer: the opcode stream is the
 * primary output, but existing tests and consumers expect a NodeBuffer.
 *
 * ids are dense so each id is its own buffer index, an id that misses the next
 * free slot, as after a revoke pushes a repair node, switches to an id map for
 * the rest of the document, plugins always use the map since they push
 * synthetic nodes
 */
export class TreeBuilder implements Emitter {
	private nodes: NodeBuffer;
	/** null while ids equal buffer indices */
	private id_to_index: number[] | null = null;
	/** kind at open by id, only kept for plugins since they rewrite kinds */
	private id_to_kind: number[] | null = null;
	/** kind at open by buffer index for nodes a revoke rewrote */
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

	private index_of(id: number): number | undefined {
		const map = this.id_to_index;
		return map === null ? id : map[id];
	}

	private start_id_map(): number[] {
		const size = this.nodes._size;
		const map: number[] = [];
		for (let i = 0; i < size; i++) map.push(i);
		this.id_to_index = map;
		return map;
	}

	/** a revoke may have rewritten the buffer kind since open */
	private opened_kind(idx: number): number {
		const revoked = this.revoked_kinds;
		if (revoked !== null) {
			const kind = revoked.get(idx);
			if (kind !== undefined) return kind;
		}
		return this.nodes._n[idx * NodeField.stride] & 0xff;
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
				const parent_idx = parent === -1 ? NONE : parent;
				if (pending) nodes.push_pending(kind, start, parent_idx, extra);
				else nodes.push(kind, start, parent_idx, extra);
				return;
			}
			map = this.start_id_map();
		}

		let parent_idx = parent === -1 ? NONE : (map[parent] ?? NONE);

		const dispatcher = this.dispatcher;
		// plugin redirect: if parent has a wrap_inner wrapper, children go there
		if (dispatcher !== null && parent_idx !== NONE) {
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
		const n = this.nodes._n;
		const b = idx * NodeField.stride;
		n[b + NodeField.end] = end;

		// pending paragraphs inside list_items are tight-list speculation
		// wrappers, they stay pending after close until the list closes
		// and the parser either revokes (tight) or commits (loose) them.
		const kind = this.opened_kind(idx);
		if (
			kind === NodeKind.paragraph &&
			n[b + NodeField.pending] === 1 &&
			(n[n[b + NodeField.parent] * NodeField.stride] & 0xff) ===
				NodeKind.list_item
		) {
			return;
		}
		n[b + NodeField.pending] = 0;
		if (kind === NodeKind.list) this.unwrap_tight_list(idx);
	}

	private close_with_plugins(id: number, end: number): void {
		const idx = this.id_to_index![id];
		if (idx === undefined) return;
		const nodes = this.nodes;
		const dispatcher = this.dispatcher!;
		nodes.set_end(idx, end);

		// capture pending state before close dispatch / commit
		const was_pending = nodes.pending_at(idx) === 1;

		// plugin close dispatch: fire close callbacks before committing
		dispatcher.dispatch_close(idx, nodes);

		// pending paragraphs inside list_items are tight-list speculation
		// wrappers, they stay pending after close until the list closes
		// and the parser either revokes (tight) or commits (loose) them.
		const kind = this.id_to_kind![id];
		const keep_pending =
			kind === NodeKind.paragraph &&
			nodes.pending_at(idx) === 1 &&
			nodes.kind_at(nodes.parent_at(idx)) === NodeKind.list_item;
		if (!keep_pending) {
			nodes.commit_node(idx);
			if (!was_pending) {
				dispatcher.dispatch_commit(idx);
			}
		}

		if (kind === NodeKind.list) this.unwrap_tight_list(idx);
	}

	/** a no op when finalize_list_pending_paras already revoked the paragraphs */
	private unwrap_tight_list(idx: number): void {
		const nodes = this.nodes;
		const meta = nodes.metadata_at(idx);
		if (!meta || !meta.tight) return;
		// next is read before the unwrap, so children it splices in are skipped
		let item = nodes.first_child_at(idx);
		let more_items = item !== NONE && nodes.parent_at(item) === idx;
		while (more_items) {
			const next_item = nodes.next_at(item);
			more_items = next_item !== NONE && nodes.parent_at(next_item) === idx;
			let child = nodes.first_child_at(item);
			let more = child !== NONE && nodes.parent_at(child) === item;
			while (more) {
				const next = nodes.next_at(child);
				more = next !== NONE && nodes.parent_at(next) === item;
				if (nodes.kind_at(child) === NodeKind.paragraph) {
					nodes.unwrap_node(child);
				}
				child = next;
			}
			item = next_item;
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
			// fills the slot of the id the parser reserved for this text node
			this.nodes.push_text(start, end, parent_idx);
		}
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
				// mutated in place, so no set_metadata call is needed
				const nodes = this.nodes;
				const existing = nodes.metadata_at(idx);
				if (existing) {
					merge_meta(existing, key, value);
				} else {
					nodes.set_metadata(idx, make_meta(key, value));
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

		const kind = nodes.kind_at(idx);
		nodes.handle_repair(idx, source_text);
		// close and text still act on the kind the node was opened with
		if (nodes.kind_at(idx) !== kind) {
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
