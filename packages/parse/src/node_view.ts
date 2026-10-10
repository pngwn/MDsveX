import {
	type NodeBuffer,
	NodeKind,
	kind_to_string,
	make_meta,
	merge_meta,
	string_to_kind,
} from './utils';
import { type UndoLog, ATTR_DID_NOT_EXIST } from './undo_log';

const NONE = 0xffffffff;

const STALE_VIEW =
	'a NodeView was used after its document, a view is only valid during the parse that made it';

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
		return '';
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
	// most dispatches only view the handler node, so the map waits for a second view
	private first: NodeView | null = null;
	private views: Map<number, NodeView> | null = null;
	private buf: NodeBuffer;
	private text_source: TextSource;
	private undo: UndoLog;
	/** @internal the document the views are made for, a view of an earlier one throws */
	gen = 0;

	constructor(buf: NodeBuffer, text_source: TextSource, undo: UndoLog) {
		this.buf = buf;
		this.text_source = text_source;
		this.undo = undo;
	}

	/** get or create a NodeView for the given buffer index. */
	get(index: number): NodeView | null {
		if (index === NONE) return null;
		const first = this.first;
		if (first === null) {
			return (this.first = this.make(index));
		}
		if (first._index === index) return first;
		let views = this.views;
		if (views === null) views = this.views = new Map();
		let view = views.get(index);
		if (view === undefined) {
			view = this.make(index);
			views.set(index, view);
		}
		return view;
	}

	private make(index: number): NodeView {
		return new NodeView(index, this.buf, this.text_source, this, this.undo);
	}

	/** discard all cached views. */
	clear(): void {
		this.first = null;
		if (this.views !== null) this.views.clear();
	}

	/**
	 * the buffer is about to hold another document, a view kept from this one
	 * would read and write its nodes
	 */
	invalidate(): void {
		this.clear();
		this.gen++;
	}

	/** views made from here on read this buffer and text source */
	rebind(buf: NodeBuffer, text_source: TextSource): void {
		this.buf = buf;
		this.text_source = text_source;
	}
}

/**
 * attrs proxy target fields, symbol keyed so reflection through the traps
 * never meets them, one handler serves every proxy
 */
const VIEW: unique symbol = Symbol('view');
const IDX: unique symbol = Symbol('idx');
const UNDO: unique symbol = Symbol('undo');

class AttrsTarget {
	/** the buffer is read through the view, which throws once it is stale */
	[VIEW]: NodeView;
	[IDX]: number;
	[UNDO]: UndoLog;

	constructor(view: NodeView, idx: number, undo: UndoLog) {
		this[VIEW] = view;
		this[IDX] = idx;
		this[UNDO] = undo;
	}
}

const ATTRS_HANDLER: ProxyHandler<AttrsTarget> = {
	get(target, prop: string): any {
		const meta = target[VIEW]._live().metadata_at(target[IDX]);
		return meta ? meta[prop] : undefined;
	},

	set(target, prop: string, value: any): boolean {
		const buf = target[VIEW]._live();
		const idx = target[IDX];
		const meta = buf.metadata_at(idx);
		const undo = target[UNDO];
		if (undo.recording) {
			const prior = meta && prop in meta ? meta[prop] : ATTR_DID_NOT_EXIST;
			undo.record_attr_set(idx, prop, prior);
		}

		if (meta) {
			merge_meta(meta, prop, value);
		} else {
			buf.set_metadata(idx, make_meta(prop, value));
		}
		return true;
	},

	deleteProperty(target, prop: string): boolean {
		const buf = target[VIEW]._live();
		const idx = target[IDX];
		const meta = buf.metadata_at(idx);
		if (!meta || !(prop in meta)) return true;

		const prior = meta[prop];
		target[UNDO].record_attr_delete(idx, prop, prior);
		delete meta[prop];
		buf.set_metadata(idx, meta);
		return true;
	},

	has(target, prop: string): boolean {
		const meta = target[VIEW]._live().metadata_at(target[IDX]);
		return meta ? prop in meta : false;
	},

	ownKeys(target): string[] {
		const meta = target[VIEW]._live().metadata_at(target[IDX]);
		return meta ? Object.keys(meta) : [];
	},

	getOwnPropertyDescriptor(target, prop: string) {
		const meta = target[VIEW]._live().metadata_at(target[IDX]);
		if (meta && prop in meta) {
			return {
				configurable: true,
				enumerable: true,
				value: meta[prop],
			};
		}
		return undefined;
	},
};

/**
 * a view over a single node in the NodeBuffer.
 *
 * reads are getters that look up the current state of the node
 * in the buffer. writes are setters that update the backing store
 * and record in the undo log for revocation.
 *
 * plugin handlers receive node views and interact with the tree
 * exclusively through them.
 */
export class NodeView {
	/** @internal buffer index of this node. */
	readonly _index: number;
	/** @internal */
	private _buf: NodeBuffer;
	/** @internal text resolution strategy. */
	private _text_source: TextSource;
	/** @internal identity cache for this dispatch. */
	private _cache: ViewCache;
	/** @internal undo log for recording mutations. */
	private _undo: UndoLog;
	/** @internal the generation of the cache when this view was made */
	private _gen: number;
	/** lazily created attrs proxy. */
	private _attrs: Record<string, any> | null = null;

	constructor(
		index: number,
		buf: NodeBuffer,
		text_source: TextSource,
		cache: ViewCache,
		undo: UndoLog
	) {
		this._index = index;
		this._buf = buf;
		this._text_source = text_source;
		this._cache = cache;
		this._undo = undo;
		this._gen = cache.gen;
	}

	/**
	 * @internal the buffer, a view kept past its document throws here instead
	 * of touching the next one
	 */
	_live(): NodeBuffer {
		if (this._gen !== this._cache.gen) throw new Error(STALE_VIEW);
		return this._buf;
	}

	get type(): string {
		return kind_to_string(this._live().kind_at(this._index) as NodeKind);
	}

	set type(value: string) {
		const numeric = string_to_kind(value);
		if (numeric === undefined) return;
		const buf = this._live();
		const prior = buf.kind_at(this._index);
		this._undo.record_type_change(this._index, prior);
		buf.set_kind(this._index, numeric);
	}

	get parent(): NodeView | null {
		return this._cache.get(this._live().parent_at(this._index));
	}

	get first_child(): NodeView | null {
		return this._cache.get(this._live().first_child_at(this._index));
	}

	get last_child(): NodeView | null {
		return this._cache.get(this._live().last_child_at(this._index));
	}

	get next(): NodeView | null {
		const buf = this._live();
		const n = buf.next_at(this._index);
		if (n === NONE) return null;
		if (buf.parent_at(n) !== buf.parent_at(this._index)) return null;
		return this._cache.get(n);
	}

	get prev(): NodeView | null {
		const p = this._live().prev_at(this._index);
		if (p === NONE) return null;
		return this._cache.get(p);
	}

	/**
	 * flattened text of all descendants.
	 * only guaranteed complete in the close callback.
	 */
	get text_content(): string {
		this._live();
		return this._collect_text(this._index);
	}

	private _collect_text(idx: number): string {
		const buf = this._buf;
		const kind = buf.kind_at(idx) as NodeKind;

		// leaf text node
		if (kind === NodeKind.text) {
			const s = this._text_source.get_string(idx);
			if (s !== undefined) return s;
			const vs = buf.value_start_at(idx);
			const ve = buf.value_end_at(idx);
			if (vs === NONE || ve === NONE || ve <= vs) return '';
			return this._text_source.slice(vs, ve);
		}

		// content-leaf nodes: text stored as value range or string on the node itself.
		// heading is NOT a content-leaf here: in wire mode its text is in
		// child text nodes, and after wrap_inner children may be nested deeper.
		if (
			kind === NodeKind.code_fence ||
			kind === NodeKind.code_span ||
			kind === NodeKind.html_comment
		) {
			const s = this._text_source.get_string(idx);
			if (s !== undefined) return s;
			const vs = buf.value_start_at(idx);
			const ve = buf.value_end_at(idx);
			if (vs === NONE || ve === NONE || ve <= vs) return '';
			return this._text_source.slice(vs, ve);
		}

		// heading: try value range first (batch mode), fall through to
		// child walk if no value range is set (wire mode).
		if (kind === NodeKind.heading) {
			const s = this._text_source.get_string(idx);
			if (s !== undefined) return s;
			const vs = buf.value_start_at(idx);
			const ve = buf.value_end_at(idx);
			if (vs !== NONE && ve !== NONE && ve > vs) {
				return this._text_source.slice(vs, ve);
			}
			// fall through to child walk
		}

		// container node: walk children, concatenate
		let result = '';
		let child = buf.first_child_at(idx);
		while (child !== NONE && buf.parent_at(child) === idx) {
			result += this._collect_text(child);
			child = buf.next_at(child);
		}
		return result;
	}

	/** heading depth (1-6). only meaningful when type === 'heading'. */
	get depth(): number | undefined {
		const buf = this._live();
		if (buf.kind_at(this._index) !== NodeKind.heading) return undefined;
		return buf.extra_at(this._index);
	}

	/** code block language/info string. */
	get lang(): string | undefined {
		const buf = this._live();
		const kind = buf.kind_at(this._index);
		if (kind !== NodeKind.code_fence) return undefined;
		const meta = buf.metadata_at(this._index);
		if (!meta) return undefined;
		if (meta.info) return meta.info as string;
		if (meta.info_start != null && meta.info_end != null) {
			return this._text_source.slice(meta.info_start, meta.info_end);
		}
		return undefined;
	}

	/** link/image href. */
	get href(): string | undefined {
		const meta = this._live().metadata_at(this._index);
		return meta?.href as string | undefined;
	}

	/** link/image title. */
	get title(): string | undefined {
		const meta = this._live().metadata_at(this._index);
		return meta?.title as string | undefined;
	}

	/** list: ordered flag. */
	get ordered(): boolean | undefined {
		const meta = this._live().metadata_at(this._index);
		return meta?.ordered as boolean | undefined;
	}

	/** list: start number. */
	get start(): number | undefined {
		const meta = this._live().metadata_at(this._index);
		return meta?.start as number | undefined;
	}

	/** list: tight flag. */
	get tight(): boolean | undefined {
		const meta = this._live().metadata_at(this._index);
		return meta?.tight as boolean | undefined;
	}

	get attrs(): Record<string, any> {
		if (this._attrs !== null) return this._attrs;
		return (this._attrs = new Proxy(
			new AttrsTarget(this, this._index, this._undo) as any,
			ATTRS_HANDLER
		));
	}

	/**
	 * insert a new node between this node and its current children.
	 * all current children become children of the new wrapper.
	 * returns a view for the new wrapper node.
	 */
	wrap_inner(type: string, attrs?: Record<string, any>): NodeView {
		const kind_num = string_to_kind(type);
		if (kind_num === undefined) throw new Error(`Unknown node type: ${type}`);

		const buf = this._live();
		const idx = this._index;

		// capture prior state
		const prior_first_child = buf.first_child_at(idx);
		const prior_last_child = buf.last_child_at(idx);

		// wrap_children does the atomic operation
		const wrapper_idx = buf.wrap_children(idx, kind_num, 0, attrs);

		// record undo
		this._undo.record_wrap_inner(
			idx,
			wrapper_idx,
			prior_first_child,
			prior_last_child
		);

		return this._cache.get(wrapper_idx)!;
	}

	/**
	 * insert a new node as the first child of this node.
	 * returns a view for the new node.
	 */
	prepend(type: string, attrs?: Record<string, any>): NodeView {
		const kind_num = string_to_kind(type);
		if (kind_num === undefined) throw new Error(`Unknown node type: ${type}`);

		const buf = this._live();
		const idx = this._index;
		const prior_first_child = buf.first_child_at(idx);

		if (prior_first_child === NONE) {
			// no existing children: push is equivalent to prepend
			const new_idx = buf.push(kind_num, 0, idx, 0, attrs);
			this._undo.record_prepend(idx, new_idx, prior_first_child);
			return this._cache.get(new_idx)!;
		}

		// allocate unlinked and manually wire as first child
		const new_idx = buf.push_unlinked(kind_num, 0, 0, attrs);
		buf.set_parent(new_idx, idx);
		buf.set_next(new_idx, prior_first_child);
		buf.set_prev(prior_first_child, new_idx);
		buf.set_first_child(idx, new_idx);

		this._undo.record_prepend(idx, new_idx, prior_first_child);
		return this._cache.get(new_idx)!;
	}

	/**
	 * insert a new node as the last child of this node.
	 * returns a view for the new node.
	 */
	append(type: string, attrs?: Record<string, any>): NodeView {
		const kind_num = string_to_kind(type);
		if (kind_num === undefined) throw new Error(`Unknown node type: ${type}`);

		const buf = this._live();
		const idx = this._index;
		const prior_last_child = buf.last_child_at(idx);

		// push() already appends as last child
		const new_idx = buf.push(kind_num, 0, idx, 0, attrs);

		this._undo.record_append(idx, new_idx, prior_last_child);
		return this._cache.get(new_idx)!;
	}
}
