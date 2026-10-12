import { ParseStallError, parse_markdown_svelte } from '../src/main';
import type { NodeBuffer } from '../src/utils';
import { contained, pieces_of, smaller, spaced } from './grammar';
import type { Container, Level, Piece, Seen } from './grammar';
import {
	every_tree,
	fed_mismatch,
	misplaced_text,
	problems,
} from './stream_shape';

const NONE = 0xffffffff;

/** a node without its positions, block line breaks left out and neighbouring text joined */
export interface Shape {
	kind: string;
	meta: string;
	value: string | null;
	kids: Shape[];
}

// the value of a heading is the range of its children
const VALUES = new Set([
	'code_fence',
	'code_span',
	'html_comment',
	'mustache',
	'svelte_tag',
	'svelte_branch',
	'frontmatter',
	'import_statement',
]);

// source offsets, which move with the container
const OFFSETS = new Set(['info_start', 'info_end']);

function meta_of(nodes: NodeBuffer, index: number, source: string | null) {
	const meta = nodes.metadata_at(index);
	if (!meta) return '';
	const all: Record<string, unknown> = { ...meta };
	// the wire carries the info string, a tree built from the source its range
	if (source !== null && meta.info_end > meta.info_start) {
		all.info = source.slice(meta.info_start, meta.info_end);
	}
	const parts: string[] = [];
	for (const key of Object.keys(all).sort()) {
		if (all[key] === undefined || OFFSETS.has(key)) continue;
		parts.push(`${key}=${JSON.stringify(all[key])}`);
	}
	return parts.join(' ');
}

/** source null for a tree built from the wire, which keeps text but no value ranges */
export function shape_of(
	nodes: NodeBuffer,
	source: string | null,
	index = 0
): Shape {
	const node = nodes.get_node(index);
	const kids: Shape[] = [];
	for (const child of node.children) {
		const kid = shape_of(nodes, source, child);
		if (kid.kind === 'line_break') continue;
		const last = kids[kids.length - 1];
		if (kid.kind === 'text' && last !== undefined && last.kind === 'text') {
			last.value = last.value! + kid.value!;
		} else kids.push(kid);
	}
	let value: string | null = null;
	const stored = nodes._strings[index];
	if (node.kind === 'text') {
		value = stored ?? source?.slice(node.value[0], node.value[1]) ?? '';
	} else if (source !== null && VALUES.has(node.kind)) {
		const [start, end] = node.value;
		if (stored !== undefined) value = stored;
		else if (start !== NONE && end !== NONE && end > start) {
			value = source.slice(start, end);
		}
	}
	return { kind: node.kind, meta: meta_of(nodes, index, source), value, kids };
}

export function print(shape: Shape, depth = 0, out: string[] = []): string[] {
	let row = '  '.repeat(depth) + shape.kind;
	if (shape.meta !== '') row += ` ${shape.meta}`;
	if (shape.value !== null) row += ` ${JSON.stringify(shape.value)}`;
	out.push(row);
	for (const kid of shape.kids) print(kid, depth + 1, out);
	return out;
}

function node(kind: string, meta: string, kids: Shape[]): Shape {
	return { kind, meta, value: null, kids };
}

/** the first row two trees differ at, empty when they are the same */
function first_difference(expected: string[], actual: string[]): string {
	const length = Math.max(expected.length, actual.length);
	for (let i = 0; i < length; i++) {
		if (expected[i] === actual[i]) continue;
		const want = expected[i]?.trim() ?? 'nothing';
		const got = actual[i]?.trim() ?? 'nothing';
		return `expected ${want}, got ${got}`;
	}
	return '';
}

export type Site = Container | 'table_cell';

/** a rule about what a container holds, an intended exception or a known failure with its issue */
export interface Rule {
	what: string;
	/** a piece the rule is about, taken out of the document before it is placed */
	drop?: (seen: Seen) => boolean;
	/** the children the document has at the root, changed to what the container makes of them */
	expect?: (kids: Shape[], site: Site, tight: boolean) => Shape[];
}

function without(
	site: Site,
	blocks: Piece[],
	drop: (seen: Seen) => boolean
): Piece[] {
	const outer = site === 'root' || site === 'table_cell' ? [] : [site];
	for (;;) {
		const gone = new Set<Piece>();
		for (const seen of pieces_of(blocks, outer)) {
			if (drop(seen)) gone.add(seen.piece);
		}
		if (gone.size === 0) return blocks;
		// what held only dropped pieces goes with them
		const keep = (list: Piece[]): Piece[] => {
			const kept: Piece[] = [];
			for (const p of list) {
				if (gone.has(p)) continue;
				const kids = keep(p.kids);
				if (kids.length > 0 || p.kids.length === 0) kept.push({ ...p, kids });
			}
			return kept;
		};
		blocks = keep(blocks);
	}
}

/** what the site is given, the document less the pieces the rules take out */
export function placed(
	site: Site,
	blocks: Piece[],
	rules: readonly Rule[]
): Piece[] {
	// taking one piece out can put another where a rule drops it
	for (;;) {
		let next = blocks;
		for (const rule of rules) {
			if (rule.drop !== undefined) next = without(site, next, rule.drop);
		}
		if (next === blocks) return spaced(blocks);
		blocks = next;
	}
}

function tree(source: string): Shape {
	return shape_of(parse_markdown_svelte(source).nodes, source);
}

function around(container: Container, kids: Shape[], tight: boolean): Shape {
	switch (container) {
		case 'block_quote':
			return node('block_quote', '', kids);
		case 'list_item':
			return node('list', `ordered=false start=0 tight=${tight}`, [
				node('list_item', '', kids),
			]);
		case 'html_element':
			return node('html', 'tag="div"', kids);
		case 'svelte_branch':
			return node('svelte_block', 'tag="if"', [
				{ kind: 'svelte_branch', meta: 'tag="if"', value: 'x', kids },
			]);
		case 'directive_container':
			return node('directive_container', 'name="box"', kids);
	}
	throw new Error(`no node for ${container}`);
}

/** a list item is loose when a blank line sits between two of its blocks, two lists of one marker are one list */
// a line of these goes on with a paragraph that is open above it
const LINES = ['paragraph', 'component', 'svelte_tag', 'comment'];

/** the last piece a list ends with */
function tail(piece: Piece): Piece {
	const last = piece.kids[piece.kids.length - 1];
	return (piece.kind === 'list' || piece.kind === 'list_item') &&
		last !== undefined
		? tail(last)
		: piece;
}

export function is_tight(blocks: Piece[]): boolean {
	// the block a blank line would stand after, a line of text or tags under a list goes on with its last item
	let last: Piece | null = null;
	for (const block of blocks) {
		if (last !== null && block.join !== '\n') {
			// the ordered markers are the two last forms, 1. and 7. are one list
			const one_list =
				block.kind === 'list' &&
				last.kind === 'list' &&
				(block.form === last.form || (block.form > 2 && last.form > 2));
			if (!one_list) return false;
		}
		const lazy =
			last !== null &&
			last.kind === 'list' &&
			block.join === '\n' &&
			LINES.includes(block.kind) &&
			LINES.includes(tail(last).kind);
		if (!lazy) last = block;
	}
	return true;
}

/**
 * container invariance, the tree of a document inside a container is its tree at the
 * root one level down, empty when it is and the first row that differs when not
 */
export function container_mismatch(
	container: Container,
	rows: string[],
	tight: boolean,
	rules: readonly Rule[]
): string {
	if (rows.length === 0) return '';
	let kids = tree(`${rows.join('\n')}\n`).kids;
	for (const rule of rules) {
		if (rule.expect !== undefined) kids = rule.expect(kids, container, tight);
	}
	const expected = node('root', '', [around(container, kids, tight)]);
	const actual = tree(`${contained(container, rows).join('\n')}\n`);
	return first_difference(print(expected), print(actual));
}

function cell_kids(source: string, row: number): Shape[] | null {
	const table = tree(source).kids[0];
	if (table?.kind !== 'table') return null;
	const cells = table.kids[row]?.kids;
	return cells?.length === 1 ? cells[0].kids : null;
}

/** a paragraph of the same source, or its children when it is one of only tags */
function line_kids(source: string): Shape[] {
	const kids = tree(source).kids;
	return kids.length === 1 && kids[0].kind === 'paragraph'
		? kids[0].kids
		: kids;
}

function print_all(kids: Shape[]): string[] {
	return kids.flatMap((kid) => print(kid));
}

/**
 * one cell source as a header cell, a body cell and a line of a paragraph, cell with what
 * differs when the two cells differ and container when both differ from the line
 */
export function cell_mismatch(
	text: string,
	rules: readonly Rule[]
): ['cell' | 'container', string] | null {
	if (text === '') return null;
	const header = cell_kids(`| ${text} |\n|---|\n`, 0);
	const body = cell_kids(`| x |\n|---|\n| ${text} |\n`, 1);
	if (header === null) return ['cell', 'the header row is no table'];
	if (body === null) return ['cell', 'the body row is not one cell'];
	const cells = first_difference(print_all(header), print_all(body));
	if (cells !== '') return ['cell', cells];
	let kids = line_kids(`${text}\n`);
	for (const rule of rules) {
		if (rule.expect !== undefined) kids = rule.expect(kids, 'table_cell', true);
	}
	const line = first_difference(print_all(kids), print_all(body));
	return line === '' ? null : ['container', line];
}

function strings_of(value: unknown, out: string[]): void {
	if (typeof value === 'string') out.push(value);
	else if (Array.isArray(value)) for (const v of value) strings_of(v, out);
	else if (value !== null && typeof value === 'object') {
		for (const [key, v] of Object.entries(value)) {
			out.push(key);
			strings_of(v, out);
		}
	}
}

/** the table rows with more cells than the table has columns, whose last cells are left out */
function excess_rows(source: string, start: number, end: number, cols: number) {
	const rows = source.slice(start, end).split('\n');
	return rows
		.filter((row) => {
			const cells = row
				.trim()
				.replace(/^\||\|$/g, '')
				.split('|').length;
			return cells > cols;
		})
		.join(' ');
}

/** the words of a tree, those of text and values and those of metadata */
function words_of(nodes: NodeBuffer, source: string): [string, string] {
	let text = '';
	const meta: string[] = [];
	const walk = (index: number): void => {
		const n = nodes.get_node(index);
		if (n.kind === 'table') {
			meta.push(excess_rows(source, n.start, n.end, n.metadata.col_count));
		}
		const stored = nodes._strings[index];
		const [start, end] = n.value;
		if (n.kind === 'text' || VALUES.has(n.kind) || n.kind === 'html') {
			if (stored !== undefined) text += ` ${stored}`;
			else if (start !== NONE && end !== NONE && end > start) {
				text += ` ${source.slice(start, end)}`;
			}
		}
		const data = nodes.metadata_at(index);
		strings_of(data, meta);
		if (data?.info_end > data?.info_start) {
			meta.push(source.slice(data.info_start, data.info_end));
		}
		for (const child of n.children) walk(child);
	};
	walk(0);
	return [text, meta.join(' ')];
}

const WORD = /q\d{3}/g;

function counted(words: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
	return counts;
}

/**
 * no input is lost, each word of the source is in the tree, as text or a value as often
 * as it was written or in metadata, and the words of the text are in source order
 */
export function lost_words(source: string): string[] {
	const out: string[] = [];
	const nodes = parse_markdown_svelte(source).nodes;
	const [text, meta] = words_of(nodes, source);
	const found = text.match(WORD) ?? [];
	const counts = counted(found);
	const written = source.match(WORD) ?? [];
	for (const [word, times] of counted(written)) {
		const count = counts.get(word) ?? 0;
		if (count > times) out.push(`${word} is in the tree ${count} times`);
		if (count === 0 && !meta.includes(word)) out.push(`${word} is lost`);
	}
	const order = written.filter((word) => counts.has(word));
	if (out.length === 0 && order.join() !== found.join()) {
		out.push('the words are not in source order');
	}
	return out;
}

function wire_mismatch(source: string): string {
	let whole: string[] = [];
	for (const [name, nodes] of every_tree(source)) {
		// a wire tree has no value ranges, so every tree is read without them
		const rows = print(shape_of(nodes, null));
		if (name === 'whole') {
			const text = shape_of(nodes, source);
			whole = print(strip_values(text));
		} else if (name.startsWith('wire')) {
			const difference = first_difference(whole, rows);
			if (difference !== '') return `${name}: ${difference}`;
		}
	}
	return '';
}

function strip_values(shape: Shape): Shape {
	return {
		...shape,
		value: shape.kind === 'text' ? shape.value : null,
		kids: shape.kids.map(strip_values),
	};
}

/** whole against fed with text joined, a difference here is a different tree and not a different split */
function fed_tree_mismatch(source: string): string {
	let whole: string[] = [];
	for (const [name, nodes] of every_tree(source)) {
		if (name.startsWith('wire')) continue;
		const rows = print(shape_of(nodes, source));
		if (name === 'whole') whole = rows;
		else {
			const difference = first_difference(whole, rows);
			if (difference !== '') return `${name}: ${difference}`;
		}
	}
	return '';
}

export type Invariant =
	| 'container'
	| 'cell'
	| 'fed'
	| 'fed split'
	| 'wire'
	| 'stream'
	| 'placed'
	| 'guard'
	| 'content';

const CHECKS: [Invariant, (source: string) => string][] = [
	['content', (source) => lost_words(source)[0] ?? ''],
	[
		'stream',
		(source) => {
			for (const chunk of [0, 1, 2, 3]) {
				const found = problems(source, chunk);
				if (found.length > 0) return `fed ${chunk}: ${found[0]}`;
			}
			return '';
		},
	],
	[
		'placed',
		(source) => {
			const nodes = parse_markdown_svelte(source).nodes;
			return misplaced_text(nodes, source)[0] ?? '';
		},
	],
	['fed', fed_tree_mismatch],
	// the same tree with its text split at other offsets
	[
		'fed split',
		(source) => (fed_tree_mismatch(source) === '' ? fed_mismatch(source) : ''),
	],
	['wire', wire_mismatch],
];

/** what one source breaks, by invariant, a thrown error under the invariant that met it */
export function broken_by(
	source: string,
	only?: Invariant
): Map<Invariant, string> {
	const out = new Map<Invariant, string>();
	for (const [invariant, run] of CHECKS) {
		if (only !== undefined && only !== invariant && only !== 'guard') continue;
		let found: string;
		try {
			found = run(source);
		} catch (error) {
			found = `threw ${String(error)}`;
			if (error instanceof ParseStallError) out.set('guard', GUARD);
		}
		if (found !== '') out.set(invariant, found);
	}
	return out;
}

const GUARD = 'the loop guard stopped the parse';

/** container_mismatch, with a parse the loop guard stopped told apart from a different tree */
export function container_broken(
	site: Container,
	rows: string[],
	tight: boolean,
	rules: Rule[]
): ['container' | 'guard', string] | null {
	try {
		const found = container_mismatch(site, rows, tight, rules);
		return found === '' ? null : ['container', found];
	} catch (error) {
		if (error instanceof ParseStallError) return ['guard', GUARD];
		throw error;
	}
}

/** the smallest document found that still fails, by taking one piece out or apart at a time */
export function shrink(
	blocks: Piece[],
	fails: (blocks: Piece[]) => boolean,
	level: Level = 'block'
): Piece[] {
	for (let round = 0; round < 200; round++) {
		const next = smaller(blocks, level).find(fails);
		if (next === undefined) break;
		blocks = next;
	}
	return blocks;
}
