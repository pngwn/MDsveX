import { expect } from 'vitest';

import { PFMParser, WireEmitter, parse_markdown_svelte } from '../src/main';
import type { SyntaxOptions } from '../src/main';
import type { Emitter } from '../src/opcodes';
import { TreeBuilder } from '../src/tree_builder';
import { NodeKind, kind_to_string } from '../src/utils';
import type { NodeBuffer } from '../src/utils';
import { WireOp } from '../src/wire_emitter';
import { WireTreeBuilder } from '../src/wire_tree_builder';
import { run_batch, run_wire, shape as joined_shape } from './plugin_harness';
import { print_ast } from './print';

const enum Seen {
	open,
	closed,
	revoked,
}

/** every node opened once and ended once, what a builder needs of the stream */
class Stream implements Emitter {
	private kinds: NodeKind[] = [];
	private seen: Seen[] = [];
	private value_starts: number[] = [];
	private value_ends: number[] = [];
	broken: string[] = [];

	private fail(what: string, id: number): void {
		const kind = id === undefined ? 'no' : kind_to_string(this.kinds[id]);
		this.broken.push(`${what}: ${kind} ${id}`);
	}

	private add(id: number, kind: NodeKind, parent: number, seen: Seen): void {
		if (this.seen[id] !== undefined) this.fail('opened twice', id);
		if (parent !== -1 && this.seen[parent] === undefined) {
			this.fail('opened under an unknown parent', id);
		}
		this.kinds[id] = kind;
		this.seen[id] = seen;
	}

	open(id: number, kind: NodeKind, _start: number, parent: number): void {
		this.add(id, kind, parent, Seen.open);
	}
	leaf(
		id: number,
		kind: NodeKind,
		_start: number,
		parent: number,
		value_start: number,
		value_end: number
	): void {
		this.add(id, kind, parent, Seen.closed);
		this.value_starts[id] = value_start;
		this.value_ends[id] = value_end;
	}
	close(id: number): void {
		if (this.seen[id] === undefined) this.fail('closed but never opened', id);
		else if (this.seen[id] === Seen.closed) this.fail('closed twice', id);
		else if (this.seen[id] === Seen.revoked)
			this.fail('closed after a revoke', id);
		this.seen[id] = Seen.closed;
	}
	revoke(id: number): void {
		if (this.seen[id] === undefined) this.fail('revoked but never opened', id);
		else if (this.seen[id] === Seen.revoked) this.fail('revoked twice', id);
		this.seen[id] = Seen.revoked;
	}
	commit(): void {}
	text(parent: number, start: number, end: number): void {
		if (end <= start) this.fail('empty text under', parent);
	}
	attr(): void {}
	set_value_start(id: number, pos: number): void {
		this.value_starts[id] = pos;
	}
	set_value_end(id: number, pos: number): void {
		this.value_ends[id] = pos;
	}
	cursor(): void {}

	finish(): string[] {
		for (let id = 0; id < this.seen.length; id++) {
			if (this.seen[id] === Seen.open) this.fail('never closed', id);
			if (
				this.kinds[id] === NodeKind.text &&
				!(this.value_ends[id] > this.value_starts[id])
			) {
				this.fail('empty', id);
			}
		}
		return this.broken;
	}
}

function run(parser: PFMParser, source: string, chunk: number): void {
	if (chunk === 0) parser.parse(source);
	else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			parser.feed(source.slice(i, i + chunk));
		}
		parser.finish();
	}
}

export function broken(source: string, chunk: number): string[] {
	const stream = new Stream();
	run(new PFMParser(stream), source, chunk);
	return stream.finish();
}

/** every opcode to both, so one parse checks the stream and builds the tree */
function tee(stream: Stream, tree: TreeBuilder): Emitter {
	return {
		open(id, kind, start, parent, extra, pending) {
			stream.open(id, kind, start, parent);
			tree.open(id, kind, start, parent, extra, pending);
		},
		leaf(id, kind, start, parent, value_start, value_end, end) {
			stream.leaf(id, kind, start, parent, value_start, value_end);
			tree.leaf(id, kind, start, parent, value_start, value_end, end);
		},
		close(id, end, kind) {
			stream.close(id);
			tree.close(id, end, kind);
		},
		text(parent, start, end, kind) {
			stream.text(parent, start, end);
			tree.text(parent, start, end, kind);
		},
		attr(id, key, value) {
			tree.attr(id, key, value);
		},
		set_value_start(id, pos) {
			stream.set_value_start(id, pos);
			tree.set_value_start(id, pos);
		},
		set_value_end(id, pos) {
			stream.set_value_end(id, pos);
			tree.set_value_end(id, pos);
		},
		revoke(id, text, at) {
			stream.revoke(id);
			tree.revoke(id, text, at);
		},
		commit(id) {
			tree.commit(id);
		},
		cursor(pos) {
			tree.cursor(pos);
		},
	};
}

/** what the stream, the batch tree and the wire of a document get wrong, one parse each */
export function problems(source: string, chunk: number): string[] {
	const stream = new Stream();
	const tree = new TreeBuilder(source.length || 16);
	run(new PFMParser(tee(stream, tree)), source, chunk);
	const found = stream.finish();
	for (const problem of unsound(tree.get_buffer(), source)) found.push(problem);
	const ops = wire_ops(source, chunk);
	const ids = revoked(ops);
	if (new Set(ids).size !== ids.length) found.push('revoked twice on the wire');
	const wire = new WireTreeBuilder(128);
	wire.apply(ops);
	for (const problem of unsound(wire.get_buffer(), null)) {
		found.push(`wire ${problem}`);
	}
	return found;
}

function fed(source: string, chunk: number): string {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree);
	parser.init();
	for (let i = 0; i < source.length; i += chunk) {
		parser.feed(source.slice(i, i + chunk));
	}
	parser.finish();
	return print_ast(tree.get_buffer(), source);
}

export function checked_tree(source: string): string {
	for (const chunk of [0, 1, 2, 3]) {
		expect(broken(source, chunk), `fed ${chunk}`).toEqual([]);
	}
	const whole = print_ast(parse_markdown_svelte(source).nodes, source);
	for (const chunk of [1, 2, 3]) {
		expect(fed(source, chunk), `fed ${chunk}`).toBe(whole);
	}
	return whole;
}

function wire_ops(source: string, chunk: number): unknown[][] {
	const emitter = new WireEmitter();
	const parser = new PFMParser(emitter);
	const ops: unknown[][] = [];
	if (chunk === 0) {
		emitter.set_source(source);
		parser.parse(source);
	} else {
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			emitter.set_source(source.slice(0, i + chunk));
			parser.feed(source.slice(i, i + chunk));
			ops.push(...emitter.flush());
		}
		emitter.set_source(source);
		parser.finish();
	}
	ops.push(...emitter.flush());
	return ops;
}

function revoked(ops: unknown[][]): number[] {
	return ops
		.filter((op) => op[0] === WireOp.Revoke)
		.map((op) => op[1] as number);
}

/** the ids the wire revokes, one entry per revoke, whole or fed in chunks */
export function wire_revokes(source: string, chunk: number): number[] {
	return revoked(wire_ops(source, chunk));
}

/** no path revokes a node twice, the stream whole and fed and the wire the same */
export function revoked_once(source: string): void {
	for (const chunk of [0, 1, 2, 3]) {
		const twice = broken(source, chunk).filter((b) =>
			b.startsWith('revoked twice')
		);
		expect(twice, `fed ${chunk}`).toEqual([]);
		const ids = wire_revokes(source, chunk);
		expect(new Set(ids).size, `wire fed ${chunk}`).toBe(ids.length);
	}
}

/**
 * checked_tree, and the wire builder whole and fed makes the same tree,
 * neighbouring text is joined as the two builders split it differently
 */
export function every_path(source: string): string {
	const whole = checked_tree(source);
	revoked_once(source);
	const options = { merge_text: true };
	const tree = joined_shape(run_batch(source).nodes, source, 0, options);
	for (const chunk of [0, 1, 2, 3]) {
		const wire = run_wire(source, undefined, chunk);
		expect(
			joined_shape(wire.nodes, null, 0, options),
			`wire fed ${chunk}`
		).toEqual(tree);
	}
	return whole;
}

/** each node of the given kinds that has metadata, with its keys */
export function with_metadata(
	nodes: NodeBuffer,
	kinds: string[],
	index = 0,
	out: string[] = []
): string[] {
	const node = nodes.get_node(index);
	if (kinds.includes(node.kind)) {
		const meta = nodes.metadata_at(index);
		const keys = meta
			? Object.keys(meta).filter((key) => meta[key] !== undefined)
			: [];
		if (keys.length !== 0) out.push(`${node.kind} ${keys.sort().join(',')}`);
	}
	for (const child of node.children) with_metadata(nodes, kinds, child, out);
	return out;
}

/** each text node with no text or with metadata, no built tree holds one */
export function unsound(nodes: NodeBuffer, source: string | null): string[] {
	const out = with_metadata(nodes, ['text']);
	const walk = (index: number): void => {
		const node = nodes.get_node(index);
		if (node.kind === 'text') {
			// a repair and the wire keep text as a string
			const stored = nodes._strings[index];
			const [start, end] = node.value;
			if (
				stored !== undefined ? stored === '' : source === null || !(end > start)
			)
				out.push(`empty text ${index}`);
		}
		for (const child of node.children) walk(child);
	};
	walk(0);
	return out;
}

/** the printed tree, then every node with its positions, which print_ast leaves out */
function shape(nodes: NodeBuffer, source: string): string {
	const rows = [print_ast(nodes, source)];
	const walk = (index: number): void => {
		const node = nodes.get_node(index);
		rows.push(`${node.kind} ${node.start} ${node.end} ${node.value}`);
		for (const child of node.children) walk(child);
	};
	walk(0);
	return rows.join('\n');
}

function shape_fed(
	source: string,
	cuts: number[],
	options?: SyntaxOptions
): string {
	const tree = new TreeBuilder(source.length);
	const parser = new PFMParser(tree, 2, options);
	parser.init();
	let from = 0;
	for (const cut of cuts) {
		parser.feed(source.slice(from, cut));
		from = cut;
	}
	parser.feed(source.slice(from));
	parser.finish();
	return shape(tree.get_buffer(), source);
}

/**
 * the first feeding of source whose tree is not the one a whole parse builds, in
 * chunks of 1, 2 and 3 then cut in two at each offset, '' when they all match
 */
export function fed_mismatch(source: string, options?: SyntaxOptions): string {
	const tree = new TreeBuilder(source.length);
	new PFMParser(tree, 2, options).parse(source);
	const whole = shape(tree.get_buffer(), source);
	for (const size of [1, 2, 3]) {
		const cuts: number[] = [];
		for (let at = size; at < source.length; at += size) cuts.push(at);
		if (shape_fed(source, cuts, options) !== whole) return `chunks of ${size}`;
	}
	for (let at = 1; at < source.length; at++) {
		if (shape_fed(source, [at], options) !== whole) return `cut at ${at}`;
	}
	return '';
}

export function lines(...rows: string[]): string {
	return rows.join('\n');
}

function row(kind: string, cells: string[][]): string[] {
	const out = [`    ${kind}`];
	for (const cell of cells) {
		out.push('      table_cell');
		for (const child of cell) out.push(`        ${child}`);
	}
	return out;
}

/** the row as the header of one table and as the body row of another, each cell with the same children */
export function both(source: string, ...cells: string[][]): void {
	const cols = cells.length;
	const delimiters = `${'|-'.repeat(cols)}|\n`;
	const table = `  table alignments=[${Array(cols).fill('"none"').join(',')}] col_count=${cols}`;
	expect(checked_tree(`|${source}|\n${delimiters}`), 'header').toBe(
		lines('root', table, ...row('table_header', cells))
	);
	const titles = cells.map(() => ['text "x"']);
	for (const end of ['|\n', '\n', '']) {
		expect(
			checked_tree(`${'|x'.repeat(cols)}|\n${delimiters}|${source}${end}`),
			`body ${JSON.stringify(end)}`
		).toBe(
			lines(
				'root',
				table,
				...row('table_header', titles),
				...row('table_row', cells)
			)
		);
	}
}

export function random(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function pick(rand: () => number, from: string[]): string {
	return from[Math.floor(rand() * from.length)];
}

/** the tree a whole parse, a feed in chunks and the wire each build, by name */
export function every_tree(source: string): [string, NodeBuffer][] {
	const out: [string, NodeBuffer][] = [
		['whole', parse_markdown_svelte(source).nodes],
	];
	for (const chunk of [1, 2, 3]) {
		const tree = new TreeBuilder(source.length || 16);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < source.length; i += chunk) {
			parser.feed(source.slice(i, i + chunk));
		}
		parser.finish();
		out.push([`fed ${chunk}`, tree.get_buffer()]);
	}
	for (const chunk of [0, 1, 3]) {
		const emitter = new WireEmitter();
		const parser = new PFMParser(emitter);
		const builder = new WireTreeBuilder();
		if (chunk === 0) {
			emitter.set_source(source);
			parser.parse(source);
		} else {
			parser.init();
			for (let i = 0; i < source.length; i += chunk) {
				emitter.set_source(source.slice(0, i + chunk));
				parser.feed(source.slice(i, i + chunk));
				builder.apply(emitter.flush());
			}
			parser.finish();
		}
		builder.apply(emitter.flush());
		out.push([
			chunk === 0 ? 'wire' : `wire fed ${chunk}`,
			builder.get_buffer(),
		]);
	}
	return out;
}

/** text of a node, a builder with no source keeps the string */
function text_of(nodes: NodeBuffer, index: number, source: string): string {
	const kept = nodes._strings[index];
	if (kept !== undefined) return kept;
	return source.slice(nodes.value_start_at(index), nodes.value_end_at(index));
}

/** kind per line with text runs joined, the wire splits text where a feed does */
export function joined_tree(nodes: NodeBuffer, source: string): string {
	const rows: string[] = [];
	const walk = (index: number, depth: number): void => {
		const indent = '  '.repeat(depth);
		let text: string | null = null;
		for (const child of nodes.get_node(index).children) {
			const kind = kind_to_string(nodes.kind_at(child));
			if (kind === 'text') {
				text = (text ?? '') + text_of(nodes, child, source);
				continue;
			}
			if (text !== null) rows.push(indent + JSON.stringify(text));
			text = null;
			const tag = nodes.metadata_at(child)?.tag;
			rows.push(indent + (tag === undefined ? kind : `${kind} ${tag}`));
			walk(child, depth + 1);
		}
		if (text !== null) rows.push(indent + JSON.stringify(text));
	};
	walk(0, 0);
	return rows.join('\n');
}

// inline content that a paragraph has to hold
const INLINE = new Set([
	'text',
	'code_span',
	'emphasis',
	'strong_emphasis',
	'strikethrough',
	'superscript',
	'subscript',
	'link',
]);

/**
 * what is wrong with a tree, text that repeats or is out of source order and
 * inline content right under root, a block quote or a loose list item
 */
export function misplaced_text(nodes: NodeBuffer, source: string): string[] {
	const out: string[] = [];
	let text = '';
	const walk = (index: number): void => {
		const node = nodes.get_node(index);
		if (node.kind === 'text') text += text_of(nodes, index, source);
		let needs_paragraph = node.kind === 'root' || node.kind === 'block_quote';
		if (node.kind === 'list_item') {
			needs_paragraph = nodes.get_node(node.parent!).metadata.tight === false;
		}
		for (const child of node.children) {
			const kind = kind_to_string(nodes.kind_at(child));
			// the space after a line of only tags stays where it is
			const blank =
				kind === 'text' && text_of(nodes, child, source).trim() === '';
			if (needs_paragraph && INLINE.has(kind) && !blank) {
				out.push(`${kind} right under ${node.kind}`);
			}
			walk(child);
		}
	};
	walk(0);
	// every char of the text is in the source, in order and once
	let at = 0;
	for (let i = 0; i < text.length; i++) {
		at = source.indexOf(text[i], at) + 1;
		if (at === 0) {
			out.push(`text is not the source in order: ${JSON.stringify(text)}`);
			break;
		}
	}
	return out;
}

/** the joined tree of a whole parse, after checking every other path builds the same sound tree */
export function sound_tree(source: string): string {
	let whole = '';
	for (const [name, nodes] of every_tree(source)) {
		expect(misplaced_text(nodes, source), name).toEqual([]);
		const from = name.startsWith('wire') ? null : source;
		expect(unsound(nodes, from), name).toEqual([]);
		const tree = joined_tree(nodes, source);
		if (name === 'whole') whole = tree;
		else expect(tree, name).toBe(whole);
	}
	return whole;
}
