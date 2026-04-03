/**
 * PFMCursor — zero-allocation tree traversal over node_buffer.
 *
 * Single reusable object that provides tree-traversal semantics
 * (gotoFirstChild / gotoNextSibling / gotoParent) while reading
 * directly from the SOA typed arrays underneath. No per-node
 * objects are created — text is lazily sliced from the source
 * string only when requested.
 *
 * Inspired by tree-sitter's TreeCursor and libxml2's xmlTextReader.
 *
 * Usage:
 *
 *   const tree = new TreeBuilder(128);
 *   const parser = new PFMParser(tree);
 *   parser.parse(source);
 *   const cursor = new PFMCursor(tree.get_buffer(), source);
 *
 *   // Walk tree
 *   if (cursor.gotoFirstChild()) {
 *     do { process(cursor); } while (cursor.gotoNextSibling());
 *     cursor.gotoParent();
 *   }
 */

import type { node_buffer } from './utils';

const NONE = 0xffffffff;

export class PFMCursor {
	/** The backing SOA buffer. */
	private buf: node_buffer;
	/** The full source string for lazy text slicing. */
	private src: string;
	/** Current node index into the buffer. */
	private idx: number;

	// ── Direct array references (grabbed once, avoids repeated property lookup) ──

	private _kinds: Uint8Array;
	private _extras: Uint16Array;
	private _ends: Uint32Array;
	private _value_starts: Uint32Array;
	private _value_ends: Uint32Array;
	private _parents: Uint32Array;
	private _next_siblings: Uint32Array;
	private _children_starts: Uint32Array;

	constructor(buf: node_buffer, source: string) {
		this.buf = buf;
		this.src = source;
		this.idx = 0; // root

		// Cache array references for hot-path access
		this._kinds = buf._kinds;
		this._extras = buf._extras;
		this._ends = buf._ends;
		this._value_starts = buf._value_starts;
		this._value_ends = buf._value_ends;
		this._parents = buf._parents;
		this._next_siblings = buf._next_siblings;
		this._children_starts = buf._children_starts;
	}

	// ── Properties (zero-cost reads from typed arrays) ──────────

	/** Numeric kind of the current node. */
	get kind(): number {
		return this._kinds[this.idx];
	}

	/** Kind-specific extra value (e.g. heading depth). */
	get extra(): number {
		return this._extras[this.idx];
	}

	/** Current node index (for external ID tracking / keyed lists). */
	get index(): number {
		return this.idx;
	}

	/** Whether the current node is closed (end offset has been set). */
	get closed(): boolean {
		return this._ends[this.idx] !== NONE;
	}

	// ── Text ────────────────────────────────────────────────────

	/** Get the text content for the current node. Pre-materialized strings
	 *  (from WireTreeBuilder) are returned directly; otherwise sliced lazily. */
	text(): string {
		const s = this.buf._strings[this.idx];
		if (s !== undefined) return s;
		const vs = this._value_starts[this.idx];
		const ve = this._value_ends[this.idx];
		if (vs === NONE || ve === NONE || ve <= vs) return '';
		return this.src.slice(vs, ve);
	}

	// ── Metadata (sparse — bitmask fast path in node_buffer) ────

	/** Get metadata for the current node, or undefined if none. */
	meta(): Record<string, unknown> | undefined {
		return this.buf.metadata_at(this.idx);
	}

	/** Slice the source string by byte offsets. For resolving metadata offset pairs. */
	slice(start: number, end: number): string {
		return this.src.slice(start, end);
	}

	// ── Traversal (mutates cursor position, returns success) ────

	/** Move to the first child of the current node. Returns false if no children. */
	gotoFirstChild(): boolean {
		const child = this._children_starts[this.idx];
		if (child === NONE) return false;
		this.idx = child;
		return true;
	}

	/** Move to the next sibling. Returns false if no more siblings. */
	gotoNextSibling(): boolean {
		const next = this._next_siblings[this.idx];
		if (next === NONE) return false;
		// Verify it's actually a sibling (same parent)
		if (this._parents[next] !== this._parents[this.idx]) return false;
		this.idx = next;
		return true;
	}

	/** Move to the parent node. Returns false if already at root. */
	gotoParent(): boolean {
		const parent = this._parents[this.idx];
		if (parent === NONE) return false;
		this.idx = parent;
		return true;
	}

	/** Reset cursor to root (index 0). */
	reset(): void {
		this.idx = 0;
	}

	/** Reinitialize cursor with a (potentially grown) buffer and new source. */
	reinit(buf: node_buffer, source: string): void {
		this.buf = buf;
		this.src = source;
		this.idx = 0;
		this._kinds = buf._kinds;
		this._extras = buf._extras;
		this._ends = buf._ends;
		this._value_starts = buf._value_starts;
		this._value_ends = buf._value_ends;
		this._parents = buf._parents;
		this._next_siblings = buf._next_siblings;
		this._children_starts = buf._children_starts;
	}
}
