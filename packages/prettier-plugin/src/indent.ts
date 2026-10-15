import type { Edit, SvxNode, SvxRoot } from './ast';

/**
 * the changes that tidy the indent of lists and the markers of block quotes:
 *
 * - the spaces after a list marker fold to one, the content column of an
 *   item is one space past its marker whatever follows, so nothing else moves
 * - a list sits at the content column of the item that holds it, at the
 *   left edge of the root or of a quote otherwise, its lines move with it so
 *   what they hold keeps its shape, unless a line after it would join it
 * - a > followed straight by text gets a space, the space a > may take
 *
 * a line whose spaces are content, in a template string or a <pre>, is left
 * alone, so is anything indented with tabs
 */
export function indent_edits(root: SvxRoot): Edit[] {
	return new Indenter(root.text).run(root);
}

/** the parts of a document a line may start in without its indent being markdown */
const KEPT = new Set([
	'mustache',
	'svelte_tag',
	'code_span',
	'html_comment',
	'frontmatter',
	'import_statement',
	'raw',
]);

class Indenter {
	text: string;
	/** the offset each line starts at */
	lines: number[] = [0];
	/** how far each line moves, by its index, and the quotes in front of it */
	shift = new Map<number, { by: number; quotes: number }>();
	/** the ranges whose lines keep their indent */
	kept: [number, number][] = [];
	/** the column of the content of each item after it moved */
	content_column = new Map<SvxNode, number>();
	edits = new Map<number, Edit>();
	/** the offsets after a > that already have a space added */
	spaced = new Set<number>();

	constructor(text: string) {
		this.text = text;
		for (let i = 0; i < text.length; i++) {
			if (text.charCodeAt(i) === 10) this.lines.push(i + 1);
		}
	}

	run(root: SvxRoot): Edit[] {
		this.collect_kept(root);
		for (const child of root.children) this.visit(child, [root]);
		for (const [line, { by, quotes }] of this.shift)
			this.move(line, by, quotes);
		return [...this.edits.values()].sort((a, b) => a.at - b.at);
	}

	collect_kept(node: SvxNode) {
		if (KEPT.has(node.type)) {
			this.kept.push([node.start, node.end]);
			return;
		}
		if (node.type === 'html') {
			const tag = node.meta?.tag;
			const raw =
				tag === 'script' ||
				tag === 'style' ||
				tag === 'pre' ||
				tag === 'textarea';
			// the open tag, whose quoted values may run over lines
			this.kept.push([node.start, raw ? node.end : node.value_start]);
			if (raw) return;
		}
		if (node.type === 'svelte_branch') {
			this.kept.push([node.value_start, node.value_end]);
		}
		for (const child of node.children) this.collect_kept(child);
	}

	visit(node: SvxNode, ancestors: SvxNode[]) {
		const quotes = placed(ancestors);
		if (node.type === 'block_quote' && ancestors.every(is_quote_or_root)) {
			this.space_markers(node, quotes + 1);
		}
		if (quotes !== -1) {
			if (node.type === 'list') this.place_list(node, ancestors, quotes);
			if (node.type === 'list_item') this.tidy_item(node, quotes);
		}
		const path = [...ancestors, node];
		for (const child of node.children) this.visit(child, path);
	}

	/** a list at the content column of its item, or at the left edge */
	place_list(list: SvxNode, ancestors: SvxNode[], quotes: number) {
		const parent = ancestors[ancestors.length - 1];
		const target =
			parent.type === 'list_item' ? this.content_column.get(parent) : 0;
		if (target === undefined) return;
		const first = this.line_of(list.start);
		const line = this.line_text(first, quotes);
		if (line === undefined || /^[ \t]*\t/.test(line.rest)) return;
		// a list on the line of the marker of its item, `- - foo`, sits where it is
		if (this.text.slice(line.start, list.start).trim() !== '') return;
		const column = line.rest.length - line.rest.trimStart().length;
		const by = target - (column + this.shift_of(first));
		if (by === 0) return;
		const last = this.line_of(list.end);
		for (let l = first; l <= last; l++) {
			if (l !== first && this.is_kept(this.lines[l])) continue;
			if (/^[ \t]*\t/.test(this.line_text(l, quotes)?.rest ?? '')) return;
		}
		// the content column of an item is two columns past the list at least,
		// a line after the list indented that far would become part of it
		const next = this.next_line(last + 1, quotes);
		if (next !== undefined && columns(next) >= target + 2) return;
		this.shift_lines(first, list.end, by, quotes);
	}

	/** the first line from l with more than space after the quote markers */
	next_line(l: number, quotes: number): string | undefined {
		for (; l < this.lines.length; l++) {
			const line = this.line_text(l, quotes);
			if (line === undefined) return undefined;
			if (line.rest.trim() !== '') return line.rest;
		}
		return undefined;
	}

	/** one space after the marker, the rest of the item moves with its content */
	tidy_item(item: SvxNode, quotes: number) {
		const first = this.line_of(item.start);
		const line = this.line_text(first, quotes);
		if (line === undefined) return;
		const match = /^( *)([-*+]|\d{1,9}[.)])( +)(?=\S)/.exec(line.rest);
		if (match === null) return;
		const [, indent, marker, spaces] = match;
		const column = indent.length + this.shift_of(first);
		this.content_column.set(item, column + marker.length + 1);
		const extra = spaces.length - 1;
		if (extra === 0) return;
		this.edit(line.start + indent.length + marker.length + 1, extra, '');
	}

	/** a space after each > that has none and text after it */
	space_markers(quote: SvxNode, depth: number) {
		const text = this.text;
		const last = this.line_of(quote.end);
		for (let l = this.line_of(quote.start); l <= last; l++) {
			let pos = this.lines[l];
			if (this.is_kept(pos) && l !== this.line_of(quote.start)) continue;
			for (let m = 0; m < depth; m++) {
				while (text[pos] === ' ' || text[pos] === '\t') pos++;
				if (text[pos] !== '>') break;
				pos++;
				const next = text[pos];
				if (
					next !== undefined &&
					next !== ' ' &&
					next !== '\t' &&
					next !== '\n' &&
					!this.spaced.has(pos)
				) {
					// an outer and an inner quote both see the markers of a line
					this.spaced.add(pos);
					this.edit(pos, 0, ' ');
				}
			}
		}
	}

	shift_lines(from: number, end: number, by: number, quotes: number) {
		const last = this.line_of(end);
		for (let l = from; l <= last; l++) {
			const start = this.lines[l];
			if (l !== from && this.is_kept(start)) continue;
			const prev = this.shift.get(l);
			this.shift.set(l, { by: (prev?.by ?? 0) + by, quotes });
		}
	}

	/** the indent of a line after its quote markers moved by `by` columns */
	move(l: number, by: number, quotes: number) {
		if (by === 0) return;
		const line = this.line_text(l, quotes);
		if (line === undefined || line.rest.trim() === '') return;
		const indent = /^[ \t]*/.exec(line.rest)![0];
		if (indent.includes('\t')) return;
		if (by > 0) this.edit(line.start, 0, ' '.repeat(by));
		else this.edit(line.start, Math.min(-by, indent.length), '');
	}

	edit(at: number, remove: number, insert: string) {
		const prev = this.edits.get(at);
		if (prev === undefined) this.edits.set(at, { at, remove, insert });
		else
			this.edits.set(at, {
				at,
				remove: prev.remove + remove,
				insert: prev.insert + insert,
			});
	}

	shift_of(l: number): number {
		return this.shift.get(l)?.by ?? 0;
	}

	/** a line after `quotes` quote markers, each with the space it may take */
	line_text(
		l: number,
		quotes: number
	): { start: number; rest: string } | undefined {
		const begin = this.lines[l];
		const end =
			l + 1 < this.lines.length ? this.lines[l + 1] - 1 : this.text.length;
		let pos = begin;
		const text = this.text;
		for (let m = 0; m < quotes; m++) {
			while (text[pos] === ' ' || text[pos] === '\t') pos++;
			if (text[pos] !== '>') return undefined;
			pos++;
			if (text[pos] === ' ') pos++;
		}
		return { start: pos, rest: text.slice(pos, end) };
	}

	line_of(offset: number): number {
		let lo = 0;
		let hi = this.lines.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.lines[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	/** a line starting at pos is inside a part that keeps its indent */
	is_kept(pos: number): boolean {
		for (const [start, end] of this.kept)
			if (pos > start && pos < end) return true;
		return false;
	}
}

/** the columns of the indent of a line, a tab takes two as the parser counts it */
function columns(line: string): number {
	let n = 0;
	for (const c of line) {
		if (c === ' ') n++;
		else if (c === '\t') n += 2;
		else break;
	}
	return n;
}

function is_quote_or_root(node: SvxNode): boolean {
	return node.type === 'root' || node.type === 'block_quote';
}

/**
 * the quote markers in front of the lines of a node whose ancestors are
 * quotes, lists and items, a quote only outside every list, -1 for a node
 * somewhere else, in an element or a block of svelte its indent is the author's
 */
function placed(ancestors: SvxNode[]): number {
	let quotes = 0;
	let in_list = false;
	for (const node of ancestors) {
		if (node.type === 'root') continue;
		if (node.type === 'block_quote') {
			if (in_list) return -1;
			quotes++;
		} else if (node.type === 'list' || node.type === 'list_item') {
			in_list = true;
		} else {
			return -1;
		}
	}
	return quotes;
}
