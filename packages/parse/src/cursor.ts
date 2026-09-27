/**
 * cursor, zero-allocation tree traversal over NodeBuffer.
 *
 * single reusable object that provides tree-traversal semantics
 * (gotofirstchild / gotonextsibling / gotoparent) while reading
 * directly from the node words underneath. no per-node
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

import { Idx, NodeField, type NodeBuffer } from './utils';

export class Cursor {
	private buf: NodeBuffer;
	/** the full source string for lazy text slicing. */
	private src: string;
	/** current node index into the buffer. */
	private idx: number;
	/** idx times NodeField.stride */
	private b: number;
	/** cached buf._n */
	private n: Uint32Array;

	constructor(buf: NodeBuffer, source: string) {
		this.buf = buf;
		this.src = source;
		this.idx = 0; // root
		this.b = 0;
		this.n = buf._n;
	}

	/** numeric kind of current node. */
	get kind(): number {
		return this.n[this.b] & 0xff;
	}

	/** kind-specific extra value (eg heading depth). */
	get extra(): number {
		return this.n[this.b] >>> 8;
	}

	/** current node index (for external id tracking / keyed lists). */
	get index(): number {
		return this.idx;
	}

	/** if the current node is closed (end offset has been set). */
	get closed(): boolean {
		return this.n[this.b + NodeField.end] !== Idx.NONE;
	}

	/** if the current node is pending (speculative, may be revoked). */
	get pending(): boolean {
		return this.n[this.b + NodeField.pending] === 1;
	}

	/** parent kind of the current node,  -1 if at root. */
	get parent_kind(): number {
		const p = this.n[this.b + NodeField.parent];
		return p === Idx.NONE ? -1 : this.n[p * NodeField.stride] & 0xff;
	}

	/** byte offset where the current node starts in source. */
	get start(): number {
		return this.n[this.b + NodeField.start];
	}

	/** byte offset where the current node ends in source. */
	get end(): number {
		return this.n[this.b + NodeField.end];
	}

	/** byte offset where the current node's value content starts. */
	get value_start(): number {
		return this.n[this.b + NodeField.value_start];
	}

	/** byte offset where the current node's value content ends. */
	get value_end(): number {
		return this.n[this.b + NodeField.value_end];
	}

	/** get text content for the current node. prebuilt strings
	  (from wiretreebuilder) are returned directly; otherwise sliced lazily. */
	text(): string {
		const s = this.buf._strings[this.idx];
		if (s !== undefined) return s;
		const vs = this.n[this.b + NodeField.value_start];
		const ve = this.n[this.b + NodeField.value_end];
		if (vs === Idx.NONE || ve === Idx.NONE || ve <= vs) return '';
		return this.src.slice(vs, ve);
	}

	get source(): string {
		return this.src;
	}

	/** undefined when text slices the source */
	get prebuilt(): string | undefined {
		return this.buf._strings[this.idx];
	}

	/** get metadata for the current node, or undefined if none. */
	meta(): Record<string, unknown> | undefined {
		const slot = this.n[this.b + NodeField.meta];
		return slot === 0 ? undefined : this.buf._meta[slot - 1];
	}

	/** slice the source string by byte offsets. for resolving metadata offset pairs. */
	slice(start: number, end: number): string {
		return this.src.slice(start, end);
	}

	goto_first_child(): boolean {
		const child = this.n[this.b + NodeField.first_child];
		if (child === Idx.NONE) return false;
		this.idx = child;
		this.b = child * NodeField.stride;
		return true;
	}

	goto_next_sibling(): boolean {
		const n = this.n;
		const next = n[this.b + NodeField.next];
		if (next === Idx.NONE) return false;
		// verify it's actually a sibling (same parent)
		const b = next * NodeField.stride;
		if (n[b + NodeField.parent] !== n[this.b + NodeField.parent]) return false;
		this.idx = next;
		this.b = b;
		return true;
	}

	goto_parent(): boolean {
		const parent = this.n[this.b + NodeField.parent];
		if (parent === Idx.NONE) return false;
		this.idx = parent;
		this.b = parent * NodeField.stride;
		return true;
	}

	reset(): void {
		this.idx = 0;
		this.b = 0;
	}

	/** get child indices as an array (for svelte {#each} iteration). */
	children(): number[] {
		const n = this.n;
		const result: number[] = [];
		let child = n[this.b + NodeField.first_child];
		while (child !== Idx.NONE) {
			result.push(child);
			const next = n[child * NodeField.stride + NodeField.next];
			if (
				next === Idx.NONE ||
				n[next * NodeField.stride + NodeField.parent] !==
					n[child * NodeField.stride + NodeField.parent]
			)
				break;
			child = next;
		}
		return result;
	}

	/** a cursor kept for reuse must not pin the source */
	release(): void {
		this.src = '';
	}

	/** re-inits cursor with a (potentially grown) buffer and new source. */
	reinit(buf: NodeBuffer, source: string): void {
		this.buf = buf;
		this.src = source;
		this.idx = 0;
		this.b = 0;
		this.n = buf._n;
	}
}
