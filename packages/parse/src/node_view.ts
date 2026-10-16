import {
	type NodeBuffer,
	NodeKind,
	kind_to_string,
	make_meta,
	merge_meta,
	note_footnote,
	string_to_kind,
} from './utils';
import { buf_code } from './buf_utils';
import { type UndoLog, ATTR_DID_NOT_EXIST } from './undo_log';
import type { HeadingIds } from './heading_ids';

/** the kind a plugin names, a footnote it makes is noted as the parser notes one */
function kind_named(type: string): NodeKind | undefined {
	const kind = string_to_kind(type);
	if (
		kind === NodeKind.footnote_reference ||
		kind === NodeKind.footnote_definition
	)
		note_footnote();
	return kind;
}

const NONE = 0xffffffff;

const STALE_VIEW =
	'a NodeView was used after its document, a view is only valid during the parse that made it';

/** a place in the source, the offset indexes it with every newline a \n */
export interface Point {
	offset: number;
	/** from 1 */
	line: number;
	/** from 0, line and column hold in the document as it was written too */
	column: number;
}

/** where a node is in the source, end is undefined while the node is open */
export interface Position {
	start: Point;
	end: Point | undefined;
}

/**
 * abstracts text resolution between batch mode (source string slicing)
 * and wire mode (pre-materialized _strings).
 */
export interface TextSource {
	slice(start: number, end: number): string;
	get_string(index: number): string | undefined;
	/** the line and column of an offset, only a source that has offsets has it */
	point?(offset: number): Point;
	/**
	 * where in the text of a text node the characters the author escaped
	 * are, in order, null for none
	 */
	escapes(buf: NodeBuffer, index: number): readonly number[] | null;
	/** a text node was cut in two at an offset of its text, tail took the rest */
	split?(index: number, at: number, tail: number): void;
}

/** an escape opens its text node at the escaped character */
const FIRST_ESCAPED: readonly number[] = [0];

/** treebuilder text source: slices from the source string. */
export class SourceTextSource implements TextSource {
	private source: string;
	/** the offset each line starts at, built for the first point asked */
	private lines: number[] | null = null;
	constructor(source: string) {
		this.source = source;
	}
	slice(start: number, end: number): string {
		return this.source.slice(start, end);
	}
	get_string(_index: number): string | undefined {
		return undefined;
	}
	escapes(buf: NodeBuffer, index: number): readonly number[] | null {
		// a stored string is a repair or the text of a plugin, neither is escaped
		if (buf._strings[index] !== undefined) return null;
		const start = buf.value_start_at(index);
		const end = buf.value_end_at(index);
		if (start === NONE || end === NONE || end <= start) return null;
		const source = this.source;
		let at = start;
		while (at > 0 && source.charCodeAt(at - 1) === 92) at--;
		return ((start - at) & 1) === 1 ? FIRST_ESCAPED : null;
	}
	/** update source for incremental parsing. */
	set_source(source: string): void {
		this.source = source;
		this.lines = null;
	}
	point(offset: number): Point {
		let lines = this.lines;
		if (lines === null) {
			lines = this.lines = [0];
			const source = this.source;
			for (
				let i = source.indexOf('\n');
				i !== -1;
				i = source.indexOf('\n', i + 1)
			)
				lines.push(i + 1);
		}
		// the last line that starts at or before the offset
		let low = 0;
		let high = lines.length - 1;
		while (low < high) {
			const mid = (low + high + 1) >> 1;
			if (lines[mid] <= offset) low = mid;
			else high = mid - 1;
		}
		return { offset, line: low + 1, column: offset - lines[low] };
	}
}

/** wiretreebuilder text source: reads from _strings array. */
export class WireTextSource implements TextSource {
	private strings: (string | undefined)[];
	/** by text node, the offsets the wire flagged as escaped, null until the first */
	private escaped: Map<number, number[]> | null = null;
	constructor(strings: (string | undefined)[]) {
		this.strings = strings;
	}
	slice(_start: number, _end: number): string {
		return '';
	}
	get_string(index: number): string | undefined {
		return this.strings[index];
	}
	escapes(_buf: NodeBuffer, index: number): readonly number[] | null {
		const escaped = this.escaped;
		return escaped === null ? null : (escaped.get(index) ?? null);
	}
	/** the wire sent text that starts at an escaped character, it landed at this offset of a text node */
	escape(index: number, at: number): void {
		let escaped = this.escaped;
		if (escaped === null) escaped = this.escaped = new Map();
		const list = escaped.get(index);
		if (list === undefined) escaped.set(index, [at]);
		else list.push(at);
	}
	/** the text of a node was cleared */
	forget(index: number): void {
		if (this.escaped !== null) this.escaped.delete(index);
	}
	split(index: number, at: number, tail: number): void {
		const escaped = this.escaped;
		if (escaped === null) return;
		const list = escaped.get(index);
		if (list === undefined) return;
		let keep = 0;
		while (keep < list.length && list[keep] < at) keep++;
		if (keep === list.length) return;
		const moved: number[] = [];
		for (let i = keep; i < list.length; i++) moved.push(list[i] - at);
		escaped.set(tail, moved);
		if (keep === 0) escaped.delete(index);
		else list.length = keep;
	}
}

/** what the structural methods need from the dispatcher, which owns the redirect links */
export interface StructureHost {
	/** later children of parent go to the wrapper wrap_inner just made */
	link_inner(buf: NodeBuffer, parent: number, wrapper: number): void;
	/** wrap a node and send its later siblings into the wrapper, returns the wrapper */
	wrap_from(
		buf: NodeBuffer,
		node: number,
		kind: NodeKind,
		attrs: Record<string, any> | undefined
	): number;
	/** no later sibling joins the wrapper */
	close_wrapper(buf: NodeBuffer, wrapper: number): void;
	/** the parser may still revoke the node */
	pending(buf: NodeBuffer, node: number): boolean;
	/** take a node and everything in it out of the tree, throws where that is not sound */
	remove(buf: NodeBuffer, node: number): void;
	/** throws a TypeError when no handler runs, what names the write */
	check_write(what: string): void;
}

/** a directive arg reaches its component as a string prop, the renderer reads it as one */
export function check_args(kind: NodeKind, args: unknown): void {
	if (args == null) return;
	if (
		kind !== NodeKind.directive_container &&
		kind !== NodeKind.directive_leaf &&
		kind !== NodeKind.directive_inline
	)
		return;
	if (typeof args !== 'object' || Array.isArray(args)) {
		throw new TypeError(
			'the args of a directive must be an object of strings, got ' +
				(Array.isArray(args) ? 'an array' : typeof args)
		);
	}
	for (const key in args) {
		const value = (args as Record<string, unknown>)[key];
		if (typeof value !== 'string') {
			throw new TypeError(
				`the args of a directive must be strings, "${key}" is ` +
					(value === null ? 'null' : typeof value)
			);
		}
	}
}

/**
 * what prepend and append take after the type, the text of a text node, the
 * attrs of any other, a text node with no text throws, as does text for another type
 */
export function content_of(
	kind: NodeKind,
	type: string,
	given: Record<string, any> | string | undefined
): Record<string, any> | undefined {
	if (kind === NodeKind.text) {
		if (typeof given !== 'string') {
			throw new TypeError(
				`a text node takes its text, as in append('text', 'some text'), got ` +
					(given === undefined ? 'none' : typeof given)
			);
		}
		return undefined;
	}
	if (typeof given === 'string') {
		throw new TypeError(
			`only a text node takes text, the second argument of a ${type} node is its attrs`
		);
	}
	if (given !== undefined) check_args(kind, given.args);
	return given;
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
	/** @internal null for a cache with no dispatcher behind it, as in unit tests */
	host: StructureHost | null;
	/** @internal the document the views are made for, a view of an earlier one throws */
	gen = 0;
	/** @internal a heading whose close callbacks run before its id is made, NONE for none */
	lazy = NONE;
	/** @internal what makes the id of lazy */
	headings: HeadingIds | null = null;

	constructor(
		buf: NodeBuffer,
		text_source: TextSource,
		undo: UndoLog,
		host: StructureHost | null = null
	) {
		this.buf = buf;
		this.text_source = text_source;
		this.undo = undo;
		this.host = host;
	}

	/** the view of a wrap_from wrapper, it replaces a plain view of the same node */
	wrapper(index: number): WrapperView {
		const view = new WrapperView(
			index,
			this.buf,
			this.text_source,
			this,
			this.undo
		);
		const first = this.first;
		if (first === null || first._index === index) this.first = view;
		else {
			let views = this.views;
			if (views === null) views = this.views = new Map();
			views.set(index, view);
		}
		return view;
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

	/** @internal the buffer the views read */
	get buffer(): NodeBuffer {
		return this.buf;
	}

	/** @internal a callback reads the attrs of the heading whose id waits, it is made first */
	make_lazy(buf: NodeBuffer): void {
		const index = this.lazy;
		this.lazy = NONE;
		this.headings!.close(buf, index);
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

/** the metadata of the node, the id of a heading that waits for one is made first */
function meta_of(target: AttrsTarget): any {
	const buf = target[VIEW]._live();
	const idx = target[IDX];
	const cache = target[VIEW]._views();
	if (idx === cache.lazy) cache.make_lazy(buf);
	return buf.metadata_at(idx);
}

const ATTRS_HANDLER: ProxyHandler<AttrsTarget> = {
	get(target, prop: string): any {
		const meta = meta_of(target);
		return meta ? meta[prop] : undefined;
	},

	set(target, prop: string, value: any): boolean {
		const view = target[VIEW];
		const buf = view._live();
		view._writable('node.attrs');
		const idx = target[IDX];
		if (prop === 'args') check_args(buf.kind_at(idx), value);
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
		const view = target[VIEW];
		const buf = view._live();
		view._writable('delete node.attrs');
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
		const meta = meta_of(target);
		return meta ? prop in meta : false;
	},

	ownKeys(target): string[] {
		const meta = meta_of(target);
		return meta ? Object.keys(meta) : [];
	},

	getOwnPropertyDescriptor(target, prop: string) {
		const meta = meta_of(target);
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
	protected _cache: ViewCache;
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

	/** @internal the cache the view was made by */
	_views(): ViewCache {
		return this._cache;
	}

	/** @internal a write needs a handler that runs, a view without a dispatcher writes freely */
	_writable(what: string): void {
		const host = this._cache.host;
		if (host !== null) host.check_write(what);
	}

	get type(): string {
		return kind_to_string(this._live().kind_at(this._index) as NodeKind);
	}

	set type(value: string) {
		const numeric = kind_named(value);
		if (numeric === undefined) return;
		const buf = this._live();
		this._writable('node.type');
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
	 * flattened text of all descendants, the text a reader sees: a line end
	 * inside a paragraph is a space and a comment inside the node adds nothing,
	 * a comment node still gives its own text
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
			// the text of a wire node, of a repair, or of a node a plugin made
			const s = buf._strings[idx];
			if (s !== undefined) return s;
			const vs = buf.value_start_at(idx);
			const ve = buf.value_end_at(idx);
			if (vs === NONE || ve === NONE || ve <= vs) return '';
			return this._text_source.slice(vs, ve);
		}

		// content-leaf nodes: text stored as value range or string on the node itself.
		// a heading is none, its value range is the source as written, markup
		// included, and its text is in its children
		if (kind === NodeKind.code_fence)
			return buf_code(buf, idx, this._text_source);
		if (kind === NodeKind.code_span || kind === NodeKind.html_comment) {
			// read from the buffer, a source tree stores a string too when the text is not a source range
			const s = buf._strings[idx];
			if (s !== undefined) return s;
			const vs = buf.value_start_at(idx);
			const ve = buf.value_end_at(idx);
			if (vs === NONE || ve === NONE || ve <= vs) return '';
			return this._text_source.slice(vs, ve);
		}

		// container node: walk children, concatenate
		let result = '';
		let child = buf.first_child_at(idx);
		while (child !== NONE && buf.parent_at(child) === idx) {
			const inner = buf.kind_at(child) as NodeKind;
			// a reader sees a space where a line ends and nothing of a comment
			if (inner === NodeKind.soft_break || inner === NodeKind.hard_break)
				result += ' ';
			else if (inner !== NodeKind.html_comment)
				result += this._collect_text(child);
			child = buf.next_at(child);
		}
		return result;
	}

	/**
	 * true while the parser may still revoke the node, it opened it on a guess
	 * and has not settled it, wrap_from and close throw in a handler or a
	 * close callback of a node that is pending
	 *
	 * @example
	 * if (!node.pending) node.wrap_from('html', { tag: 'span' }).close();
	 */
	get pending(): boolean {
		const buf = this._live();
		const host = this._cache.host;
		return host === null
			? buf.pending_at(this._index) !== 0
			: host.pending(buf, this._index);
	}

	/** heading depth (1-6). only meaningful when type === 'heading'. */
	get depth(): number | undefined {
		const buf = this._live();
		if (buf.kind_at(this._index) !== NodeKind.heading) return undefined;
		return buf.extra_at(this._index);
	}

	/**
	 * true for a code span written as inline math, a code span in dollars, its
	 * text is the latex, false for any other code span, undefined for any other node
	 */
	get math(): boolean | undefined {
		const buf = this._live();
		if (buf.kind_at(this._index) !== NodeKind.code_span) return undefined;
		return buf.extra_at(this._index) === 1;
	}

	/**
	 * the info string of a code fence, its language and everything after it,
	 * '' for a fence with none, whole from its open handler on, undefined for
	 * any other node
	 */
	get info(): string | undefined {
		const buf = this._live();
		const kind = buf.kind_at(this._index);
		if (kind !== NodeKind.code_fence) return undefined;
		const meta = buf.metadata_at(this._index);
		if (!meta) return '';
		if (meta.info) return meta.info as string;
		if (meta.info_start != null && meta.info_end != null) {
			return this._text_source.slice(meta.info_start, meta.info_end);
		}
		return '';
	}

	/** the info string of a code fence, see info */
	get lang(): string | undefined {
		return this.info;
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

	/**
	 * where the node is in the source, undefined for a node a plugin made and
	 * for a tree built from the wire, which carries no offsets
	 */
	get position(): Position | undefined {
		const buf = this._live();
		const idx = this._index;
		const source = this._text_source;
		if (source.point === undefined || buf.synthetic_at(idx)) return undefined;
		const end = buf.end_at(idx);
		return {
			start: source.point(buf.start_at(idx)),
			end: end === NONE ? undefined : source.point(end),
		};
	}

	/** @internal the offsets a warning about this node carries, NONE for those it has none of */
	_span(): [number, number] {
		const buf = this._live();
		const idx = this._index;
		if (this._text_source.point === undefined || buf.synthetic_at(idx))
			return [NONE, NONE];
		return [buf.start_at(idx), buf.end_at(idx)];
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
		const kind_num = kind_named(type);
		if (kind_num === undefined) throw new Error(`Unknown node type: ${type}`);

		const buf = this._live();
		this._writable('wrap_inner');
		const idx = this._index;
		if (attrs !== undefined) check_args(kind_num, attrs.args);

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
		// linked at once, a wrap_from later in this handler places its wrapper by the links
		const host = this._cache.host;
		if (host !== null) host.link_inner(buf, idx, wrapper_idx);

		return this._cache.get(wrapper_idx)!;
	}

	/**
	 * wrap this node and every sibling after it in a new node, until close is
	 * called on the result or the parent closes, this node must be the last
	 * child of its parent
	 */
	wrap_from(type: string, attrs?: Record<string, any>): WrapperView {
		const kind_num = kind_named(type);
		if (kind_num === undefined) throw new Error(`Unknown node type: ${type}`);
		const buf = this._live();
		if (attrs !== undefined) check_args(kind_num, attrs.args);
		const host = this._cache.host;
		if (host === null) throw new Error('wrap_from needs a plugin dispatcher');
		host.check_write('wrap_from');
		const wrapper_idx = host.wrap_from(buf, this._index, kind_num, attrs);
		return this._cache.wrapper(wrapper_idx);
	}

	/**
	 * take this node and everything in it out of the tree, from its own close
	 * callback or that of a node that holds it, once that node closed for
	 * good, or from a sequential pass, anywhere else it throws, a node that is
	 * already out stays out
	 *
	 * @example
	 * html_comment: { parse: (node) => () => node.remove() }
	 */
	remove(): void {
		const buf = this._live();
		const host = this._cache.host;
		if (host === null) throw new Error('remove needs a plugin dispatcher');
		host.remove(buf, this._index);
	}

	/**
	 * insert a new node as the first child of this node, a text node takes
	 * its text in place of attrs, returns a view for the new node
	 *
	 * @example
	 * node.prepend('text', 'Step 1: ');
	 */
	prepend(type: 'text', text: string): NodeView;
	prepend(type: string, attrs?: Record<string, any>): NodeView;
	prepend(type: string, given?: Record<string, any> | string): NodeView {
		const kind_num = kind_named(type);
		if (kind_num === undefined) throw new Error(`Unknown node type: ${type}`);

		const buf = this._live();
		this._writable('prepend');
		const idx = this._index;
		const attrs = content_of(kind_num, type, given);
		const prior_first_child = buf.first_child_at(idx);

		let new_idx: number;
		if (prior_first_child === NONE) {
			// no existing children: push is equivalent to prepend
			new_idx = buf.push_synthetic(kind_num, 0, idx, 0, attrs);
		} else {
			// allocate unlinked and manually wire as first child
			new_idx = buf.push_synthetic(kind_num, 0, NONE, 0, attrs);
			buf.set_parent(new_idx, idx);
			buf.set_next(new_idx, prior_first_child);
			buf.set_prev(prior_first_child, new_idx);
			buf.set_first_child(idx, new_idx);
		}
		if (typeof given === 'string') buf.own_strings()[new_idx] = given;

		this._undo.record_prepend(idx, new_idx, prior_first_child);
		return this._cache.get(new_idx)!;
	}

	/**
	 * insert a new node as the last child of this node, a text node takes its
	 * text in place of attrs, returns a view for the new node
	 *
	 * @example
	 * link.append('text', ' (opens in a new tab)');
	 */
	append(type: 'text', text: string): NodeView;
	append(type: string, attrs?: Record<string, any>): NodeView;
	append(type: string, given?: Record<string, any> | string): NodeView {
		const kind_num = kind_named(type);
		if (kind_num === undefined) throw new Error(`Unknown node type: ${type}`);

		const buf = this._live();
		this._writable('append');
		const idx = this._index;
		const attrs = content_of(kind_num, type, given);
		const prior_last_child = buf.last_child_at(idx);

		const new_idx = buf.push_synthetic(kind_num, 0, idx, 0, attrs);
		if (typeof given === 'string') buf.own_strings()[new_idx] = given;

		this._undo.record_append(idx, new_idx, prior_last_child);
		return this._cache.get(new_idx)!;
	}
}

/** the view wrap_from returns */
export class WrapperView extends NodeView {
	/**
	 * no later sibling joins this wrapper, a child that is still open keeps it
	 * open until that child closes, a no op once the wrapper is closed
	 */
	close(): void {
		const buf = this._live();
		const host = this._cache.host;
		if (host !== null) host.close_wrapper(buf, this._index);
	}
}
