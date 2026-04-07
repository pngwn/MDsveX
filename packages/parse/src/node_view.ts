import { type node_buffer, node_kind, kind_to_string, string_to_kind } from "./utils";
import { type UndoLog, ATTR_DID_NOT_EXIST } from "./undo_log";

const NONE = 0xffffffff;

/**
 * abstracts text resolution between batch mode (source string slicing)
 * and wire mode (pre-materialized _strings).
 */
export interface TextSource {
	slice(start: number, end: number): string;
	get_string(index: number): string | undefined;
}

/** treebuilder text source: slices from the source string. */
export class SourceTextSource implements TextSource {
	private source: string;
	constructor(source: string) {
		this.source = source;
	}
	slice(start: number, end: number): string {
		return this.source.slice(start, end);
	}
	get_string(_index: number): string | undefined {
		return undefined;
	}
	/** update source for incremental parsing. */
	set_source(source: string): void {
		this.source = source;
	}
}

/** wiretreebuilder text source: reads from _strings array. */
export class WireTextSource implements TextSource {
	private strings: (string | undefined)[];
	constructor(strings: (string | undefined)[]) {
		this.strings = strings;
	}
	slice(_start: number, _end: number): string {
		return "";
	}
	get_string(index: number): string | undefined {
		return this.strings[index];
	}
}

/**
 * per-dispatch identity cache for node views.
 * ensures two handlers accessing the same node get the same view object.
 * short-lived: created before handler invocation, cleared after.
 */
export class ViewCache {
	private views: Map<number, NodeView> = new Map();
	private buf: node_buffer;
	private text_source: TextSource;
	private undo: UndoLog;
	private handler_node: number;

	constructor(
		buf: node_buffer,
		text_source: TextSource,
		undo: UndoLog,
		handler_node: number,
	) {
		this.buf = buf;
		this.text_source = text_source;
		this.undo = undo;
		this.handler_node = handler_node;
	}

	/** get or create a NodeView for the given buffer index. */
	get(index: number): NodeView | null {
		if (index === NONE) return null;
		let view = this.views.get(index);
		if (view === undefined) {
			view = new NodeView(
				index,
				this.buf,
				this.text_source,
				this,
				this.undo,
				this.handler_node,
			);
			this.views.set(index, view);
		}
		return view;
	}

	/** discard all cached views. */
	clear(): void {
		this.views.clear();
	}

	/** update the handler node (for re-use across dispatches). */
	set_handler_node(handler_node: number): void {
		this.handler_node = handler_node;
	}
}

/**
 * a view over a single node in the SoA backing store.
 *
 * reads are getters that look up the current state of the node
 * in the soa. writes are setters that update the backing store
 * and record in the undo log for revocation.
 *
 * plugin handlers receive node views and interact with the tree
 * exclusively through them.
 */
export class NodeView {
	/** @internal buffer index of this node. */
	readonly _index: number;
	/** @internal the backing soa buffer. */
	private _buf: node_buffer;
	/** @internal text resolution strategy. */
	private _text_source: TextSource;
	/** @internal identity cache for this dispatch. */
	private _cache: ViewCache;
	/** @internal undo log for recording mutations. */
	private _undo: UndoLog;
	/** @internal which handler node's undo log to attribute mutations to. */
	private _handler_node: number;
	/** lazily created attrs proxy. */
	private _attrs: Record<string, any> | null = null;

	constructor(
		index: number,
		buf: node_buffer,
		text_source: TextSource,
		cache: ViewCache,
		undo: UndoLog,
		handler_node: number,
	) {
		this._index = index;
		this._buf = buf;
		this._text_source = text_source;
		this._cache = cache;
		this._undo = undo;
		this._handler_node = handler_node;
	}

	// --- type ---

	get type(): string {
		return kind_to_string(this._buf._kinds[this._index] as node_kind);
	}

	set type(value: string) {
		const numeric = string_to_kind(value);
		if (numeric === undefined) return;
		const prior = this._buf._kinds[this._index];
		this._undo.record_type_change(this._index, prior);
		this._buf._kinds[this._index] = numeric;
	}

	// --- traversal ---

	get parent(): NodeView | null {
		return this._cache.get(this._buf._parents[this._index]);
	}

	get firstChild(): NodeView | null {
		return this._cache.get(this._buf._children_starts[this._index]);
	}

	get lastChild(): NodeView | null {
		return this._cache.get(this._buf._children_ends[this._index]);
	}

	get next(): NodeView | null {
		const n = this._buf._next_siblings[this._index];
		if (n === NONE) return null;
		if (this._buf._parents[n] !== this._buf._parents[this._index])
			return null;
		return this._cache.get(n);
	}

	get prev(): NodeView | null {
		const p = this._buf._prev_siblings[this._index];
		if (p === NONE) return null;
		return this._cache.get(p);
	}

	// --- text content ---

	/**
	 * flattened text of all descendants.
	 * only guaranteed complete in the close callback.
	 */
	get textContent(): string {
		return this._collect_text(this._index);
	}

	private _collect_text(idx: number): string {
		const buf = this._buf;
		const kind = buf._kinds[idx] as node_kind;

		// leaf text node
		if (kind === node_kind.text) {
			const s = this._text_source.get_string(idx);
			if (s !== undefined) return s;
			const vs = buf._value_starts[idx];
			const ve = buf._value_ends[idx];
			if (vs === NONE || ve === NONE || ve <= vs) return "";
			return this._text_source.slice(vs, ve);
		}

		// content-leaf nodes: text stored as value range on the node itself
		if (
			kind === node_kind.code_fence ||
			kind === node_kind.code_span ||
			kind === node_kind.html_comment ||
			kind === node_kind.heading
		) {
			const s = this._text_source.get_string(idx);
			if (s !== undefined) return s;
			const vs = buf._value_starts[idx];
			const ve = buf._value_ends[idx];
			if (vs === NONE || ve === NONE || ve <= vs) return "";
			return this._text_source.slice(vs, ve);
		}

		// container node: walk children, concatenate
		let result = "";
		let child = buf._children_starts[idx];
		while (child !== NONE && buf._parents[child] === idx) {
			result += this._collect_text(child);
			child = buf._next_siblings[child];
		}
		return result;
	}

	// --- type-specific properties ---

	/** heading depth (1-6). only meaningful when type === 'heading'. */
	get depth(): number | undefined {
		if (this._buf._kinds[this._index] !== node_kind.heading) return undefined;
		return this._buf._extras[this._index];
	}

	/** code block language/info string. */
	get lang(): string | undefined {
		const kind = this._buf._kinds[this._index];
		if (kind !== node_kind.code_fence) return undefined;
		const meta = this._buf.metadata_at(this._index);
		if (!meta) return undefined;
		if (meta.info) return meta.info as string;
		if (meta.info_start != null && meta.info_end != null) {
			return this._text_source.slice(meta.info_start, meta.info_end);
		}
		return undefined;
	}

	/** link/image href. */
	get href(): string | undefined {
		const meta = this._buf.metadata_at(this._index);
		return meta?.href as string | undefined;
	}

	/** link/image title. */
	get title(): string | undefined {
		const meta = this._buf.metadata_at(this._index);
		return meta?.title as string | undefined;
	}

	/** list: ordered flag. */
	get ordered(): boolean | undefined {
		const meta = this._buf.metadata_at(this._index);
		return meta?.ordered as boolean | undefined;
	}

	/** list: start number. */
	get start(): number | undefined {
		const meta = this._buf.metadata_at(this._index);
		return meta?.start as number | undefined;
	}

	/** list: tight flag. */
	get tight(): boolean | undefined {
		const meta = this._buf.metadata_at(this._index);
		return meta?.tight as boolean | undefined;
	}

	// --- attrs proxy ---

	get attrs(): Record<string, any> {
		if (this._attrs !== null) return this._attrs;

		const buf = this._buf;
		const idx = this._index;
		const undo = this._undo;

		this._attrs = new Proxy({} as Record<string, any>, {
			get(_target, prop: string): any {
				const meta = buf.metadata_at(idx);
				return meta ? meta[prop] : undefined;
			},

			set(_target, prop: string, value: any): boolean {
				const meta = buf.metadata_at(idx);
				const prior =
					meta && prop in meta ? meta[prop] : ATTR_DID_NOT_EXIST;
				undo.record_attr_set(idx, prop, prior);

				if (meta) {
					meta[prop] = value;
					buf.set_metadata(idx, meta);
				} else {
					buf.set_metadata(idx, { [prop]: value });
				}
				return true;
			},

			deleteProperty(_target, prop: string): boolean {
				const meta = buf.metadata_at(idx);
				if (!meta || !(prop in meta)) return true;

				const prior = meta[prop];
				undo.record_attr_delete(idx, prop, prior);
				delete meta[prop];
				buf.set_metadata(idx, meta);
				return true;
			},

			has(_target, prop: string): boolean {
				const meta = buf.metadata_at(idx);
				return meta ? prop in meta : false;
			},

			ownKeys(): string[] {
				const meta = buf.metadata_at(idx);
				return meta ? Object.keys(meta) : [];
			},

			getOwnPropertyDescriptor(_target, prop: string) {
				const meta = buf.metadata_at(idx);
				if (meta && prop in meta) {
					return {
						configurable: true,
						enumerable: true,
						value: meta[prop],
					};
				}
				return undefined;
			},
		});
		return this._attrs;
	}

	// --- structural mutations ---

	/**
	 * insert a new node between this node and its current children.
	 * all current children become children of the new wrapper.
	 * returns a view for the new wrapper node.
	 */
	wrapInner(type: string, attrs?: Record<string, any>): NodeView {
		const kind_num = string_to_kind(type);
		if (kind_num === undefined)
			throw new Error(`Unknown node type: ${type}`);

		const buf = this._buf;
		const idx = this._index;

		// capture prior state
		const prior_first_child = buf._children_starts[idx];
		const prior_last_child = buf._children_ends[idx];

		// wrap_children does the atomic operation
		const wrapper_idx = buf.wrap_children(idx, kind_num, 0, attrs);

		// record undo
		this._undo.record_wrap_inner(
			idx,
			wrapper_idx,
			prior_first_child,
			prior_last_child,
		);

		return this._cache.get(wrapper_idx)!;
	}

	/**
	 * insert a new node as the first child of this node.
	 * returns a view for the new node.
	 */
	prepend(type: string, attrs?: Record<string, any>): NodeView {
		const kind_num = string_to_kind(type);
		if (kind_num === undefined)
			throw new Error(`Unknown node type: ${type}`);

		const buf = this._buf;
		const idx = this._index;
		const prior_first_child = buf._children_starts[idx];

		if (prior_first_child === NONE) {
			// no existing children: push is equivalent to prepend
			const new_idx = buf.push(kind_num, 0, idx, 0, attrs);
			this._undo.record_prepend(idx, new_idx, prior_first_child);
			return this._cache.get(new_idx)!;
		}

		// allocate unlinked and manually wire as first child
		const new_idx = buf.push_unlinked(kind_num, 0, 0, attrs);
		buf._parents[new_idx] = idx;
		buf._next_siblings[new_idx] = prior_first_child;
		buf._prev_siblings[prior_first_child] = new_idx;
		buf._children_starts[idx] = new_idx;

		this._undo.record_prepend(idx, new_idx, prior_first_child);
		return this._cache.get(new_idx)!;
	}

	/**
	 * insert a new node as the last child of this node.
	 * returns a view for the new node.
	 */
	append(type: string, attrs?: Record<string, any>): NodeView {
		const kind_num = string_to_kind(type);
		if (kind_num === undefined)
			throw new Error(`Unknown node type: ${type}`);

		const buf = this._buf;
		const idx = this._index;
		const prior_last_child = buf._children_ends[idx];

		// push() already appends as last child
		const new_idx = buf.push(kind_num, 0, idx, 0, attrs);

		this._undo.record_append(idx, new_idx, prior_last_child);
		return this._cache.get(new_idx)!;
	}
}
