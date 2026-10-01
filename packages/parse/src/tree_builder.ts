import type { Emitter } from './opcodes';
import {
	NodeBuffer,
	NodeField,
	NodeKind,
	make_meta,
	merge_meta,
} from './utils';
import type { PluginDispatcher } from './plugin_dispatch';
import type { IdRegister } from './plugin_types';

const NONE = 0xffffffff;

/** open_wants of a builder without plugins, never written */
const NO_WANTS = new Uint8Array(64);

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
	/**
	 * buffer index and kind at open of each node a revoke rewrote, read only
	 * for a close or text that does not pass the kind
	 */
	private revoked: number[] | null = null;
	/** kind at open by index, built from revoked on the first read */
	private revoked_map: Map<number, number> | null = null;
	/** entries of revoked already copied into revoked_map */
	private revoked_mapped = 0;
	/** optional plugin dispatcher. null when no plugins registered. */
	private dispatcher: PluginDispatcher | null;
	/** kinds whose open goes to the dispatcher, see PluginDispatcher.open_wants */
	private wants: Uint8Array;

	/** callback for dispatcher to register synthetic node ids. */
	private register_id: IdRegister | null = null;

	constructor(capacity: number, dispatcher?: PluginDispatcher) {
		this.nodes = new NodeBuffer(capacity);
		this.dispatcher = dispatcher ?? null;
		this.wants = dispatcher !== undefined ? dispatcher.open_wants : NO_WANTS;
		// NodeBuffer constructor auto-creates root at index 0
		if (this.dispatcher !== null) {
			// only plugins register synthetic ids, so only they pay for the closure
			this.register_id = (synthetic_id: number, buf_idx: number): void => {
				(this.id_to_index ?? this.start_id_map())[synthetic_id] = buf_idx;
			};
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
		if (this.revoked !== null) {
			this.revoked = null;
			this.revoked_map = null;
			this.revoked_mapped = 0;
		}
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

	/** for callers that do not pass the kind, a revoke may have rewritten it */
	private opened_kind(idx: number): number {
		// plugins rewrite kinds too, the dispatcher logs every rewrite
		const revoked =
			this.dispatcher !== null ? this.dispatcher.kind_log() : this.revoked;
		if (revoked !== null) {
			let map = this.revoked_map;
			if (map === null) map = this.revoked_map = new Map();
			// the first revoke of an index holds the kind at open
			for (let i = this.revoked_mapped; i < revoked.length; i += 2) {
				if (!map.has(revoked[i])) map.set(revoked[i], revoked[i + 1]);
			}
			this.revoked_mapped = revoked.length;
			const kind = map.get(idx);
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
		const nodes = this.nodes;
		// ids are buffer indices and parents are opened ids below this one,
		// the root (id 0) never matches, the buffer creates it. a plugin open
		// of a kind no handler wants is the same push, so it stays here and
		// the slow path is rare enough that V8 keeps it out of this body
		if (
			this.id_to_index === null &&
			id === nodes._size &&
			!this.wants[kind]
		) {
			// >>> 0 turns the -1 of no parent into NONE
			nodes.push_node(kind, start, parent >>> 0, extra, pending);
			return;
		}
		if (id !== 0) this.open_slow(id, kind, start, parent, extra, pending);
	}

	/** an open a plugin wants, or once ids stopped being buffer indices */
	private open_slow(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		const nodes = this.nodes;
		const dispatcher = this.dispatcher;
		if (
			dispatcher !== null &&
			this.id_to_index === null &&
			id === nodes._size
		) {
			let parent_idx = parent === -1 ? NONE : parent;
			if (!dispatcher.wants_open(kind)) {
				nodes.push_node(kind, start, parent_idx, extra, pending);
				return;
			}
			// children of a wrap_inner parent go to its wrapper
			if (parent_idx !== NONE) {
				const redirect = dispatcher.get_redirect(parent_idx);
				if (redirect !== undefined) parent_idx = redirect;
			}
			const idx = nodes.push_node(kind, start, parent_idx, extra, pending);
			if (dispatcher.has_handlers(kind)) {
				dispatcher.dispatch_open(idx, kind, nodes, this.register_id!);
				this.wants = dispatcher.open_wants;
			}
			return;
		}
		this.open_mapped(id, kind, start, parent, extra, pending);
	}

	/** an open once a plugin pushed nodes without ids or ids skipped a slot */
	private open_mapped(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean
	): void {
		const nodes = this.nodes;
		const dispatcher = this.dispatcher;
		const map = this.id_to_index ?? this.start_id_map();

		let parent_idx = parent === -1 ? NONE : (map[parent] ?? NONE);

		// plugin redirect: if parent has a wrap_inner wrapper, children go there
		if (dispatcher !== null && parent_idx !== NONE) {
			const redirect = dispatcher.get_redirect(parent_idx);
			if (redirect !== undefined) parent_idx = redirect;
		}

		const idx = nodes.push_node(kind, start, parent_idx, extra, pending);
		map[id] = idx;

		if (dispatcher !== null && dispatcher.has_handlers(kind)) {
			dispatcher.dispatch_open(idx, kind, nodes, this.register_id!);
			this.wants = dispatcher.open_wants;
		}
	}

	close(id: number, end: number, kind?: NodeKind): void {
		const idx = this.index_of(id);
		if (idx === undefined) return;
		const nodes = this.nodes;
		const b = idx * NodeField.stride;
		nodes._n[b + NodeField.end] = end;
		// fire close callbacks before committing, a quiet dispatcher has none
		const dispatcher = this.dispatcher;
		if (dispatcher !== null && !dispatcher.quiet()) {
			dispatcher.dispatch_close(idx, nodes);
		}

		// pending paragraphs inside list_items are tight-list speculation
		// wrappers, they stay pending after close until the list closes
		// and the parser either revokes (tight) or commits (loose) them.
		// dispatch_close already committed the undo log of a node not pending
		if (kind === undefined) kind = this.opened_kind(idx);
		const n = nodes._n;
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

	text(
		parent: number,
		start: number,
		end: number,
		parent_kind?: NodeKind
	): void {
		let parent_idx = this.index_of(parent);
		if (parent_idx === undefined) return;

		if (this.dispatcher !== null) {
			if (parent_kind === undefined) parent_kind = this.opened_kind(parent_idx);
			// plugin redirect: text targeting a wrapped parent goes to the wrapper
			const redirect = this.dispatcher.get_redirect(parent_idx);
			if (redirect !== undefined) parent_idx = redirect;
		} else if (parent_kind === undefined) {
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

	revoke(id: number, source_text?: string, text_start?: number): void {
		const idx = this.index_of(id);
		if (idx === undefined) return;
		const nodes = this.nodes;

		// plugin revoke: undo mutations before handle_repair
		if (this.dispatcher !== null) {
			this.dispatcher.dispatch_revoke(idx, nodes);
			const kind = nodes.kind_at(idx);
			nodes.handle_repair(idx, source_text, text_start);
			if (nodes.kind_at(idx) !== kind) this.dispatcher.log_kind(idx, kind);
			return;
		}

		const kind = nodes.kind_at(idx);
		nodes.handle_repair(idx, source_text, text_start);
		// close and text act on the kind at open, callers that omit it read it here
		if (nodes.kind_at(idx) !== kind) {
			const revoked = this.revoked;
			if (revoked === null) this.revoked = [idx, kind];
			else revoked.push(idx, kind);
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

	/** an incremental document is complete, give its unused slab tail back */
	end(): void {
		this.nodes.trim();
	}

	/** extract the built NodeBuffer. */
	get_buffer(): NodeBuffer {
		return this.nodes;
	}
}
