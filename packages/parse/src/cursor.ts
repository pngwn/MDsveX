/**
 * cursor, zero-allocation tree traversal over node_buffer.
 *
 * single reusable object that provides tree-traversal semantics
 * (gotofirstchild / gotonextsibling / gotoparent) while reading
 * directly from the soa typed arrays underneath. no per-node
 * objects are created, text is lazily sliced from the source
 * string only when requested.
 *
 * inspired by tree-sitter's treecursor and libxml2's xmltextreader.
 *
 * usage:
 *
 *   const tree = new treebuilder(128);
 *   const parser = new pfmparser(tree);
 *   parser.parse(source);
 *   const cursor = new cursor(tree.get_buffer(), source);
 *
 *   // walk tree
 *   if (cursor.gotofirstchild()) {
 *     do { process(cursor); } while (cursor.gotonextsibling());
 *     cursor.gotoparent();
 *   }
 */

import type { node_buffer } from "./utils";

const NONE = 0xffffffff;

export class Cursor {
	/** the backing soa buffer. */
	private buf: node_buffer;
	/** the full source string for lazy text slicing. */
	private src: string;
	/** current node index into the buffer. */
	private idx: number;

	private _kinds: Uint8Array;
	private _extras: Uint16Array;
	private _starts: Uint32Array;
	private _ends: Uint32Array;
	private _value_starts: Uint32Array;
	private _value_ends: Uint32Array;
	private _parents: Uint32Array;
	private _next_siblings: Uint32Array;
	private _children_starts: Uint32Array;
	private _pending_nodes: Uint32Array;

	constructor(buf: node_buffer, source: string) {
		this.buf = buf;
		this.src = source;
		this.idx = 0; // root

		// cache array references for hot-path access
		this._kinds = buf._kinds;
		this._extras = buf._extras;
		this._starts = buf._starts;
		this._ends = buf._ends;
		this._value_starts = buf._value_starts;
		this._value_ends = buf._value_ends;
		this._parents = buf._parents;
		this._next_siblings = buf._next_siblings;
		this._children_starts = buf._children_starts;
		this._pending_nodes = buf._pending_nodes;
	}

	/** numeric kind of current node. */
	get kind(): number {
		return this._kinds[this.idx];
	}

	/** kind-specific extra value (eg heading depth). */
	get extra(): number {
		return this._extras[this.idx];
	}

	/** current node index (for external id tracking / keyed lists). */
	get index(): number {
		return this.idx;
	}

	/** if the current node is closed (end offset has been set). */
	get closed(): boolean {
		return this._ends[this.idx] !== NONE;
	}

	/** if the current node is pending (speculative, may be revoked). */
	get pending(): boolean {
		return this._pending_nodes[this.idx] === 1;
	}

	/** parent kind of the current node,  -1 if at root. */
	get parent_kind(): number {
		const p = this._parents[this.idx];
		return p === NONE ? -1 : this._kinds[p];
	}

	/** byte offset where the current node starts in source. */
	get start(): number {
		return this._starts[this.idx];
	}

	/** byte offset where the current node ends in source. */
	get end(): number {
		return this._ends[this.idx];
	}

	/** byte offset where the current node's value content starts. */
	get value_start(): number {
		return this._value_starts[this.idx];
	}

	/** byte offset where the current node's value content ends. */
	get value_end(): number {
		return this._value_ends[this.idx];
	}

	/** get text content for the current node. prebuilt strings
	  (from wiretreebuilder) are returned directly; otherwise sliced lazily. */
	text(): string {
		const s = this.buf._strings[this.idx];
		if (s !== undefined) return s;
		const vs = this._value_starts[this.idx];
		const ve = this._value_ends[this.idx];
		if (vs === NONE || ve === NONE || ve <= vs) return "";
		return this.src.slice(vs, ve);
	}

	/** get metadata for the current node, or undefined if none. */
	meta(): Record<string, unknown> | undefined {
		return this.buf.metadata_at(this.idx);
	}

	/** slice the source string by byte offsets. for resolving metadata offset pairs. */
	slice(start: number, end: number): string {
		return this.src.slice(start, end);
	}

	gotoFirstChild(): boolean {
		const child = this._children_starts[this.idx];
		if (child === NONE) return false;
		this.idx = child;
		return true;
	}

	gotoNextSibling(): boolean {
		const next = this._next_siblings[this.idx];
		if (next === NONE) return false;
		// verify it's actually a sibling (same parent)
		if (this._parents[next] !== this._parents[this.idx]) return false;
		this.idx = next;
		return true;
	}

	gotoParent(): boolean {
		const parent = this._parents[this.idx];
		if (parent === NONE) return false;
		this.idx = parent;
		return true;
	}

	reset(): void {
		this.idx = 0;
	}

	/** get child indices as an array (for svelte {#each} iteration). */
	children(): number[] {
		const result: number[] = [];
		let child = this._children_starts[this.idx];
		while (child !== NONE) {
			result.push(child);
			const next = this._next_siblings[child];
			if (next === NONE || this._parents[next] !== this._parents[child]) break;
			child = next;
		}
		return result;
	}

	/** re-inits cursor with a (potentially grown) buffer and new source. */
	reinit(buf: node_buffer, source: string): void {
		this.buf = buf;
		this.src = source;
		this.idx = 0;
		this._kinds = buf._kinds;
		this._extras = buf._extras;
		this._starts = buf._starts;
		this._ends = buf._ends;
		this._value_starts = buf._value_starts;
		this._value_ends = buf._value_ends;
		this._parents = buf._parents;
		this._next_siblings = buf._next_siblings;
		this._children_starts = buf._children_starts;
		this._pending_nodes = buf._pending_nodes;
	}
}
