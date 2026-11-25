/**
 * buffer utilities for svelte components.
 *
 * pure functions that read from NodeBuffer accessors.
 * no cursor state, no allocations beyond the returned arrays.
 */

import type { NodeBuffer } from './utils.js';

const NONE = 0xffffffff;

/** get child indices for a node. */
export function buf_children(buf: NodeBuffer, idx: number): number[] {
	const result: number[] = [];
	let child = buf.first_child_at(idx);
	while (child !== NONE) {
		result.push(child);
		const next = buf.next_at(child);
		if (next === NONE || buf.parent_at(next) !== idx) break;
		child = next;
	}
	return result;
}

/** get text content for a node (value range or pre-materialized string). */
export function buf_text(buf: NodeBuffer, idx: number, source: string): string {
	const s = buf._strings[idx];
	if (s !== undefined) return s;
	const vs = buf.value_start_at(idx);
	const ve = buf.value_end_at(idx);
	if (vs === NONE || ve === NONE || ve <= vs) return '';
	return source.slice(vs, ve);
}

/**
 * buf_text for a tree that is still being parsed, a text node the parser has
 * not closed yet gives the source from its start up to the parser's cursor,
 * so a run shows as it arrives and never shows a character the parser holds
 *
 * @example
 * parser.feed('A metro');
 * buf_live_text(buf, text, 'A metro'); // 'A metro', buf_text gives ''
 */
export function buf_live_text(
	buf: NodeBuffer,
	idx: number,
	source: string
): string {
	if (buf.end_at(idx) !== NONE || buf._strings[idx] !== undefined)
		return buf_text(buf, idx, source);
	const vs = buf.value_start_at(idx);
	const cursor = buf.cursor;
	return vs === NONE || cursor <= vs ? '' : source.slice(vs, cursor);
}

/** collect all text content from a node and its children recursively. */
export function buf_text_content(
	buf: NodeBuffer,
	idx: number,
	source: string
): string {
	// Check own value first
	const own = buf_text(buf, idx, source);
	if (own) return own;
	// Walk children
	let text = '';
	let child = buf.first_child_at(idx);
	while (child !== NONE) {
		text += buf_text_content(buf, child, source);
		const next = buf.next_at(child);
		if (next === NONE || buf.parent_at(next) !== idx) break;
		child = next;
	}
	return text;
}

/**
 * the code of a fence or a code span, or the text of a comment, its own text
 * and then the text of the nodes a plugin put in it, where a break is a line
 * end, a comment adds nothing
 *
 * @example
 * fence.append('text', 'let a = 1;'); // buf_code of the fence is 'let a = 1;'
 */
export function buf_code(
	buf: NodeBuffer,
	idx: number,
	source: SourceSlice
): string {
	const own = own_text(buf, idx, source);
	const first = buf.first_child_at(idx);
	return first === NONE ? own : own + held_code(buf, idx, first, source);
}

/**
 * buf_code for a tree that is still being parsed, an open code span gives its
 * code up to the parser's cursor, an open fence gives what was fed of it, less
 * a last line that is blank or starts with a backtick so far, which may be its
 * closing fence
 *
 * a fence in a block quote or a list item, or an indented one, gives nothing
 * until it closes, the parser takes what is in front of its lines off then
 *
 * @example
 * parser.feed('```js\nlet a');
 * buf_live_code(buf, fence, '```js\nlet a'); // 'let a', buf_code gives ''
 */
export function buf_live_code(
	buf: NodeBuffer,
	idx: number,
	source: string
): string {
	if (buf.end_at(idx) !== NONE || buf._strings[idx] !== undefined)
		return buf_code(buf, idx, source);
	const start = buf.start_at(idx);
	const vs = buf.value_start_at(idx);
	// the value start is past the opening backticks once it is known
	if (vs === NONE || vs <= start) return buf_code(buf, idx, source);
	const kind = buf.kind_at(idx) as number;
	if (kind === CODE_SPAN) {
		const cursor = buf.cursor;
		return cursor > vs ? source.slice(vs, cursor) : '';
	}
	if (
		kind !== CODE_FENCE ||
		buf.parent_at(idx) !== 0 ||
		(start !== 0 && source.charCodeAt(start - 1) !== 10)
	)
		return buf_code(buf, idx, source);
	let end = source.length;
	if (end <= vs) return '';
	let line = source.lastIndexOf('\n', end - 1) + 1;
	if (line < vs) line = vs;
	let p = line;
	let ch = source.charCodeAt(p);
	while (ch === 32 || ch === 9) ch = source.charCodeAt(++p);
	// a line of only spaces and tabs so far may still get its backticks
	if (ch === 96 || p >= end) end = line;
	// the linefeed before the closing fence is not code, so the last one waits
	if (end > vs && source.charCodeAt(end - 1) === 10) end--;
	return source.slice(vs, end);
}

/** what buf_code reads offsets of the source through, a string is one */
export interface SourceSlice {
	slice(start: number, end: number): string;
}

/** buf_text through a SourceSlice */
function own_text(buf: NodeBuffer, idx: number, source: SourceSlice): string {
	const s = buf._strings[idx];
	if (s !== undefined) return s;
	const vs = buf.value_start_at(idx);
	const ve = buf.value_end_at(idx);
	if (vs === NONE || ve === NONE || ve <= vs) return '';
	return source.slice(vs, ve);
}

function held_code(
	buf: NodeBuffer,
	idx: number,
	child: number,
	source: SourceSlice
): string {
	let text = '';
	while (child !== NONE && buf.parent_at(child) === idx) {
		const kind = buf.kind_at(child) as number;
		if (kind === LINE_BREAK || kind === HARD_BREAK || kind === SOFT_BREAK)
			text += '\n';
		else if (kind === TEXT || kind === CODE_SPAN || kind === CODE_FENCE)
			text += buf_code(buf, child, source);
		else if (kind !== HTML_COMMENT) {
			const first = buf.first_child_at(child);
			if (first !== NONE) text += held_code(buf, child, first, source);
		}
		child = buf.next_at(child);
	}
	return text;
}

// must follow NodeKind
const TEXT = 1;
const CODE_FENCE = 5;
const LINE_BREAK = 6;
const CODE_SPAN = 8;
const HARD_BREAK = 17;
const SOFT_BREAK = 18;
const HTML_COMMENT = 26;
const FOOTNOTE_REFERENCE = 36;
const FOOTNOTE_DEFINITION = 37;

/** what a document gets wrong about its footnotes, node is the reference or the definition */
export interface FootnoteProblem {
	/**
	 * footnote_undefined is a reference with no definition, footnote_duplicate
	 * a definition of a label that has one, footnote_empty a definition with
	 * nothing in it, footnote_unused a definition no reference reaches
	 */
	code:
		| 'footnote_undefined'
		| 'footnote_duplicate'
		| 'footnote_empty'
		| 'footnote_unused';
	label: string;
	node: number;
}

/** the footnotes of a document as it renders them, numbered by first reference */
export interface FootnoteIndex {
	/** the label of each footnote, footnote n is at n - 1 */
	labels: string[];
	/** the definition node of each footnote, NONE for a label that has none */
	definitions: number[];
	/** how many references each footnote has */
	counts: number[];
	/**
	 * by reference node, its footnote number times 65536 plus which reference
	 * to that footnote it is, from 1, a reference no footnote was numbered for
	 * is not in it
	 */
	references: Map<number, number>;
	/** in document order, the references of the body before those inside definitions */
	problems: FootnoteProblem[];
	/**
	 * the id each footnote id is given in its place, by that id, when a
	 * heading was given it first, see HeadingIds, unset or null for none
	 */
	moved?: Map<string, string> | null;
}

/** the id of the definition of a footnote, by its label so a link to it survives a renumbering */
export function footnote_id(label: string): string {
	return 'fn-' + label;
}

/** the id of a reference, nth is which reference to footnote number it is, from 1 */
export function footnote_ref_id(number: number, nth: number): string {
	return nth === 1 ? 'fnref-' + number : 'fnref-' + number + '-' + nth;
}

/** every id the footnotes of a document take, so nothing else is given one of them */
export function footnote_ids(index: FootnoteIndex): string[] {
	const ids: string[] = [];
	for (let i = 0; i < index.labels.length; i++) {
		if (index.definitions[i] !== NONE) ids.push(footnote_id(index.labels[i]));
		for (let nth = 1; nth <= index.counts[i]; nth++)
			ids.push(footnote_ref_id(i + 1, nth));
	}
	return ids;
}

function footnote_label(buf: NodeBuffer, node: number): string {
	const label = buf.metadata_at(node)?.label;
	return typeof label === 'string' ? label : '';
}

/**
 * numbers the footnotes of a document by first reference, the references of
 * the body first and then those inside each definition as it is written out,
 * null for a document with no footnote node
 *
 * a reference with no definition is a problem and gets no number, as a second
 * definition of a label and a definition nothing refers to get no place, with
 * optimistic set such a reference is numbered and linked all the same, which
 * suits a document that is still arriving, and no problem is reported
 */
export function footnote_index(
	buf: NodeBuffer,
	optimistic = false
): FootnoteIndex | null {
	const defined = new Map<string, number>();
	const problems: FootnoteProblem[] = [];
	/** reference nodes by the definition they are in, NONE for the body */
	const held = new Map<number, number[]>();
	const owners: number[] = [];
	let owner = NONE;
	let any = false;

	let node = buf.first_child_at(0);
	while (node !== NONE) {
		const kind = buf.kind_at(node) as number;
		let down = buf.first_child_at(node);
		if (kind === FOOTNOTE_REFERENCE) {
			any = true;
			const refs = held.get(owner);
			if (refs === undefined) held.set(owner, [node]);
			else refs.push(node);
		} else if (kind === FOOTNOTE_DEFINITION) {
			any = true;
			const label = footnote_label(buf, node);
			if (defined.has(label)) {
				if (!optimistic)
					problems.push({ code: 'footnote_duplicate', label, node });
				// nothing in it renders, so nothing in it is numbered
				down = NONE;
			} else {
				defined.set(label, node);
				if (down !== NONE) {
					owners.push(owner);
					owner = node;
				} else if (!optimistic)
					problems.push({ code: 'footnote_empty', label, node });
			}
		}
		if (down !== NONE) {
			node = down;
			continue;
		}
		// the next node in document order
		for (;;) {
			const next = buf.next_at(node);
			const parent = buf.parent_at(node);
			if (next !== NONE && buf.parent_at(next) === parent) {
				node = next;
				break;
			}
			if (parent === 0 || parent === NONE) {
				node = NONE;
				break;
			}
			node = parent;
			if (node === owner) owner = owners.pop()!;
		}
	}
	if (!any) return null;

	const labels: string[] = [];
	const definitions: number[] = [];
	const counts: number[] = [];
	const references = new Map<number, number>();
	const numbers = new Map<string, number>();
	const number_all = (refs: number[] | undefined): void => {
		if (refs === undefined) return;
		for (let i = 0; i < refs.length; i++) {
			const ref = refs[i];
			const label = footnote_label(buf, ref);
			let number = numbers.get(label);
			if (number === undefined) {
				const definition = defined.get(label);
				if (definition === undefined && !optimistic) {
					problems.push({ code: 'footnote_undefined', label, node: ref });
					continue;
				}
				number = labels.push(label);
				definitions.push(definition === undefined ? NONE : definition);
				counts.push(0);
				numbers.set(label, number);
			}
			references.set(ref, number * 65536 + ++counts[number - 1]);
		}
	};
	number_all(held.get(NONE));
	// a definition may refer to a footnote the body does not, which then follows
	for (let i = 0; i < definitions.length; i++) {
		if (definitions[i] !== NONE) number_all(held.get(definitions[i]));
	}
	if (!optimistic) {
		for (const [label, definition] of defined) {
			if (!numbers.has(label))
				problems.push({ code: 'footnote_unused', label, node: definition });
		}
	}
	return { labels, definitions, counts, references, problems };
}
