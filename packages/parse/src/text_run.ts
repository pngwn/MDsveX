import {
	type NodeBuffer,
	NodeField,
	NodeKind,
	string_to_kind,
} from './utils.js';
import {
	type NodeView,
	type TextSource,
	type ViewCache,
	content_of,
} from './node_view.js';
import { unlink_child } from './undo_log.js';

const NONE = 0xffffffff;

const STALE_RUN =
	'a TextRun was used after its document, a run is only valid during the parse that made it';

/**
 * the text nodes of one run of neighbours and what a handler put in their
 * place, in order, every run cut from the neighbours shares it, so a node one
 * of them splits is the node the others see
 * @internal
 */
export class RunPieces {
	readonly buf: NodeBuffer;
	readonly source: TextSource;
	readonly cache: ViewCache;
	readonly parent: number;
	/** the sibling after the last text node, NONE when the run ends its parent */
	readonly after: number;
	/** the text of every piece, in order */
	readonly text: string;
	/** by piece, its node, where its text starts in text and how long it is */
	private nodes: number[];
	private at: number[];
	private len: number[];
	/** by piece, true for a node a replace made, its span of text is spent */
	private made: boolean[];

	constructor(
		buf: NodeBuffer,
		source: TextSource,
		cache: ViewCache,
		parent: number,
		after: number,
		text: string,
		nodes: number[],
		at: number[],
		len: number[]
	) {
		this.buf = buf;
		this.source = source;
		this.cache = cache;
		this.parent = parent;
		this.after = after;
		this.text = text;
		this.nodes = nodes;
		this.at = at;
		this.len = len;
		const made: boolean[] = [];
		for (let i = 0; i < nodes.length; i++) made.push(false);
		this.made = made;
	}

	/** true when a replace already took part of the span, or a node sits inside it */
	private taken(start: number, end: number): boolean {
		const at = this.at;
		const len = this.len;
		const made = this.made;
		for (let i = 0; i < at.length; i++) {
			if (!made[i]) continue;
			const from = at[i];
			const to = from + len[i];
			if (from === to) {
				// a node put in at a point, it may sit at either end of a span
				if (start < from && from < end) return true;
			} else if (start === end) {
				if (from < start && start < to) return true;
			} else if (from < end && start < to) return true;
		}
		return false;
	}

	/** cut the text node of a piece in two at an offset of its text */
	private split(piece: number, at: number): void {
		const buf = this.buf;
		const node = this.nodes[piece];
		const parent = buf.parent_at(node);
		let next = buf.next_at(node);
		if (next !== NONE && buf.parent_at(next) !== parent) next = NONE;

		const tail = buf.push(NodeKind.text, buf.start_at(node));
		const n = buf._n;
		const b = node * NodeField.stride;
		const t = tail * NodeField.stride;
		// text a plugin made stays text a plugin made
		n[t + NodeField.pending] = n[b + NodeField.pending];
		const start = n[b + NodeField.value_start];
		const end = n[b + NodeField.value_end];
		const closed = n[b + NodeField.end];
		const stored = buf._strings[node];
		if (stored === undefined || end - start === stored.length) {
			// the value is the text as written, so each half keeps its own source
			const cut = start + at;
			n[b + NodeField.value_end] = cut;
			n[t + NodeField.start] = cut;
			n[t + NodeField.value_start] = cut;
			n[t + NodeField.value_end] = end;
			if (closed !== NONE) n[b + NodeField.end] = cut;
		} else {
			n[t + NodeField.value_start] = start;
			n[t + NodeField.value_end] = end;
		}
		n[t + NodeField.end] = closed;
		if (stored !== undefined) {
			const strings = buf.own_strings();
			strings[node] = stored.slice(0, at);
			strings[tail] = stored.slice(at);
		}
		const source = this.source;
		if (source.split !== undefined) source.split(node, at, tail);
		buf.insert_before(tail, parent, next);

		this.nodes.splice(piece + 1, 0, tail);
		this.at.splice(piece + 1, 0, this.at[piece] + at);
		this.len.splice(piece + 1, 0, this.len[piece] - at);
		this.made.splice(piece + 1, 0, false);
		this.len[piece] = at;
	}

	/**
	 * the first piece that starts at an offset, after cutting the text node
	 * the offset falls inside, nodes a replace put in at that point come ahead
	 * of it, the count of pieces for the end of the text
	 */
	private piece_at(offset: number): number {
		const at = this.at;
		const len = this.len;
		for (let i = 0; i < at.length; i++) {
			if (len[i] === 0) continue;
			if (at[i] === offset) return i;
			if (at[i] < offset && offset < at[i] + len[i]) {
				this.split(i, offset - at[i]);
				return i + 1;
			}
		}
		return at.length;
	}

	/** where the text of a piece starts in the source, a node a plugin made is where it was put */
	private source_start(piece: number): number {
		const buf = this.buf;
		const node = this.nodes[piece];
		return buf.synthetic_at(node)
			? buf.start_at(node)
			: buf.value_start_at(node);
	}

	private source_end(piece: number): number {
		const buf = this.buf;
		const node = this.nodes[piece];
		if (!buf.synthetic_at(node)) return buf.value_end_at(node);
		const end = buf.end_at(node);
		return end === NONE ? buf.start_at(node) : end;
	}

	replace(
		start: number,
		end: number,
		kind: NodeKind,
		attrs: Record<string, any> | undefined,
		text: string | undefined
	): number {
		if (this.taken(start, end)) {
			throw new RangeError(
				`replace: ${start} to ${end} overlaps a range of this run that was already replaced`
			);
		}
		const buf = this.buf;
		const nodes = this.nodes;
		const at = this.at;
		const first = this.piece_at(start);
		let last = first;
		if (end !== start) {
			last = this.piece_at(end);
			// a node put in at the end of the range stays after it
			while (last > first && at[last - 1] === end) last--;
		}
		// read before the nodes go, the new node spans the source it replaced
		let from = NONE;
		let to = NONE;
		if (this.source.point !== undefined) {
			if (first < nodes.length) from = this.source_start(first);
			else if (first > 0) from = this.source_end(first - 1);
			to = last > first ? this.source_end(last - 1) : from;
			if (to < from) to = from;
		}
		const parent = this.parent;
		for (let i = first; i < last; i++) unlink_child(buf, parent, nodes[i]);
		const node = buf.push_synthetic(kind, 0, NONE, 0, attrs);
		if (from !== NONE) {
			buf.set_start(node, from);
			buf.set_end(node, to);
		}
		if (text !== undefined) buf.own_strings()[node] = text;
		buf.insert_before(
			node,
			parent,
			last < nodes.length ? nodes[last] : this.after
		);

		const count = last - first;
		nodes.splice(first, count, node);
		at.splice(first, count, start);
		this.len.splice(first, count, end - start);
		this.made.splice(first, count, true);
		return node;
	}
}

/**
 * a run of text as a text handler gets it, the text of neighbouring text
 * nodes joined, cut where the author escaped a character
 *
 * @example
 * text(run) {
 *   for (const match of run.text.matchAll(/:tada:/g)) {
 *     const end = match.index + match[0].length;
 *     run.replace(match.index, end, 'text', 'party');
 *   }
 * }
 */
export class TextRun {
	/** @internal */
	private _pieces: RunPieces;
	/** @internal where the run starts in the text of its pieces */
	private _from: number;
	/** @internal the generation of the cache when this run was made */
	private _gen: number;
	/** the text of the run as written, a character reference is not decoded */
	readonly text: string;

	/** @internal */
	constructor(pieces: RunPieces, from: number, to: number) {
		this._pieces = pieces;
		this._from = from;
		this._gen = pieces.cache.gen;
		this.text = pieces.text.slice(from, to);
	}

	/** the node that holds the run */
	get parent(): NodeView {
		const pieces = this._pieces;
		if (this._gen !== pieces.cache.gen) throw new Error(STALE_RUN);
		return pieces.cache.get(pieces.parent)!;
	}

	/**
	 * put a node in place of a range of the run, a text node takes its text in
	 * place of attrs, start and end index text and keep doing so after a
	 * replace, a range may not overlap one that was replaced, an empty range
	 * puts the node in at that point, returns a view of the new node
	 *
	 * @example
	 * run.replace(0, 6, 'text', '\u{1f389}');
	 * run.replace(8, 13, 'link', { href: '/u/ada' }).append('text', '@ada');
	 */
	replace(start: number, end: number, type: 'text', text: string): NodeView;
	replace(
		start: number,
		end: number,
		type: string,
		attrs?: Record<string, any>
	): NodeView;
	replace(
		start: number,
		end: number,
		type: string,
		given?: Record<string, any> | string
	): NodeView {
		const pieces = this._pieces;
		if (this._gen !== pieces.cache.gen) throw new Error(STALE_RUN);
		if (!Number.isInteger(start) || !Number.isInteger(end)) {
			throw new TypeError(
				'replace takes the start and the end of a range of run.text, both whole numbers'
			);
		}
		const length = this.text.length;
		if (start < 0 || end < start || end > length) {
			throw new RangeError(
				`replace: ${start} to ${end} is not a range of a run of ${length} characters`
			);
		}
		const kind = string_to_kind(type);
		if (kind === undefined) throw new Error(`Unknown node type: ${type}`);
		const attrs = content_of(kind, type, given);
		const from = this._from;
		const node = pieces.replace(
			from + start,
			from + end,
			kind,
			attrs,
			typeof given === 'string' ? given : undefined
		);
		return pieces.cache.get(node)!;
	}
}
