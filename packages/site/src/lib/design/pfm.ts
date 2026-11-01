// the real parser in the browser, so a score shows what mdsvex reads rather than
// a picture of it. From lib/experiments/pfm.ts on p/mdsvex-1.0-design, without
// pfm_html, which nothing in lib/design renders
import { parse_markdown_svelte, PFMParser } from '@mdsvex/parse';
import type { Emitter } from '@mdsvex/parse';

export interface PfmNode {
	type: string;
	start: number;
	end: number;
	/** the text of a leaf, like text and code */
	value?: string;
	/** where the content sits inside the node, a code span's code or a fence's lines */
	value_range?: [number, number];
	children?: PfmNode[];
	[key: string]: unknown;
}

/** the document as plain objects, the same tree the compile renders */
export function pfm_tree(source: string): PfmNode {
	const { nodes, source: normal } = parse_markdown_svelte(source);

	function build(index: number): PfmNode {
		const node = nodes.get_node(index);
		const out: PfmNode = { type: node.kind, start: node.start, end: node.end };

		// a list's start is its first number, it must not replace the offset
		for (const [key, value] of Object.entries(node.metadata ?? {})) {
			if (value !== undefined) out[key in out ? `meta_${key}` : key] = value;
		}
		out.value_range = node.value;

		if (node.children.length > 0) {
			out.children = node.children.map(build);
			return out;
		}

		// containers span their children, so only leaves show their text
		const [value_start, value_end] = node.value;
		if (value_end > value_start) out.value = normal.slice(value_start, value_end);
		return out;
	}

	return build(0);
}

/** NodeKind is a const enum, its names by number for the opcodes */
export const KIND_NAMES = [
	'root', 'text', 'html', 'heading', 'mustache', 'code_fence', 'line_break',
	'paragraph', 'code_span', 'emphasis', 'strong_emphasis', 'thematic_break',
	'link', 'image', 'block_quote', 'list', 'list_item', 'hard_break',
	'soft_break', 'strikethrough', 'superscript', 'subscript', 'table',
	'table_header', 'table_row', 'table_cell', 'html_comment', 'svelte_tag',
	'svelte_block', 'svelte_branch', 'directive_inline', 'directive_leaf',
	'directive_container', 'frontmatter', 'import_statement', 'directive_label',
	'footnote_reference', 'footnote_definition', 'definition',
] as const;

export type KindName = (typeof KIND_NAMES)[number];

// headings, fences, code spans and comments keep their text as a range, the rest get a text child
const VALUE_KINDS = new Set([3, 5, 8, 26]);

export type Op =
	| { op: 'open'; id: number; kind: KindName; start: number; parent: number; pending: boolean }
	| { op: 'close'; id: number; end: number }
	| { op: 'text'; id: number | null; parent: number; start: number; end: number }
	| { op: 'attr'; id: number; key: string; value: unknown }
	| { op: 'revoke'; id: number }
	| { op: 'commit'; id: number };

export interface LiveNode {
	id: number | null;
	kind: KindName;
	start: number;
	/** -1 while open */
	end: number;
	/** speculative, the parser may still revoke it */
	pending: boolean;
	attrs: Record<string, unknown>;
	children: LiveNode[];
	parent: LiveNode | null;
}

export interface StreamFrame {
	/** how much of the source the parser has been fed */
	fed: number;
	/** how far the parser has read, fed minus cursor is the lookahead it is holding */
	cursor: number;
	/** the opcodes this chunk produced, in order */
	ops: Op[];
	/** the tree as it stands after this chunk, a fresh copy per frame */
	tree: LiveNode;
}

/**
 * feed the incremental parser chunk by chunk and record what it says, the
 * opcodes and the tree they build, pending nodes and revokes included
 */
export function pfm_stream(source: string, chunk_size = 1): StreamFrame[] {
	const by_id = new Map<number, LiveNode>();
	const root: LiveNode = {
		id: 0, kind: 'root', start: 0, end: -1, pending: false,
		attrs: {}, children: [], parent: null,
	};
	by_id.set(0, root);
	let next_id = 1;
	let ops: Op[] = [];
	let cursor = 0;

	function add(node: LiveNode, parent_id: number) {
		const parent = by_id.get(parent_id) ?? root;
		node.parent = parent;
		parent.children.push(node);
		if (node.id !== null) by_id.set(node.id, node);
	}

	const emitter: Emitter = {
		open(id, kind, start, parent, _extra, pending) {
			if (id === 0) return;
			next_id = Math.max(next_id, id + 1);
			const name = KIND_NAMES[kind] ?? 'text';
			ops.push({ op: 'open', id, kind: name, start, parent, pending });
			add({ id, kind: name, start, end: -1, pending, attrs: {}, children: [], parent: null }, parent);
		},
		close(id, end) {
			ops.push({ op: 'close', id, end });
			const node = by_id.get(id);
			if (!node) return;
			node.end = end;
			// a close settles a guess, except a paragraph, which waits for a commit or a revoke
			if (node.kind !== 'paragraph') node.pending = false;
		},
		text(parent, start, end, parent_kind) {
			const kind = parent_kind ?? KIND_NAMES.indexOf(by_id.get(parent)?.kind ?? 'text');
			if (VALUE_KINDS.has(kind)) {
				ops.push({ op: 'text', id: null, parent, start, end });
				const node = by_id.get(parent);
				if (node) node.attrs.value = [start, end];
				return;
			}
			const id = next_id++;
			ops.push({ op: 'text', id, parent, start, end });
			add({ id, kind: 'text', start, end, pending: false, attrs: {}, children: [], parent: null }, parent);
		},
		attr(id, key, value) {
			ops.push({ op: 'attr', id, key, value });
			const node = by_id.get(id);
			if (node) node.attrs[key] = value;
		},
		set_value_start(id, pos) {
			const node = by_id.get(id);
			if (node) node.attrs.value_start = pos;
		},
		set_value_end(id, pos) {
			const node = by_id.get(id);
			if (node) node.attrs.value_end = pos;
		},
		revoke(id) {
			ops.push({ op: 'revoke', id });
			const node = by_id.get(id);
			const parent = node?.parent;
			if (!node || !parent) return;
			// children move up to the grandparent, the delimiter becomes text
			const at = parent.children.indexOf(node);
			for (const child of node.children) child.parent = parent;
			parent.children.splice(at, 1, ...node.children);
			by_id.delete(id);
		},
		commit(id) {
			ops.push({ op: 'commit', id });
			const node = by_id.get(id);
			if (node) node.pending = false;
		},
		cursor(pos) {
			cursor = pos;
		},
	};

	const parser = new PFMParser(emitter);
	parser.init();
	const frames: StreamFrame[] = [];
	for (let fed = 0; fed < source.length; ) {
		const next = Math.min(source.length, fed + chunk_size);
		parser.feed(source.slice(fed, next));
		fed = next;
		frames.push({ fed, cursor, ops, tree: copy(root, null) });
		ops = [];
	}
	parser.finish();
	frames.push({ fed: source.length, cursor, ops, tree: copy(root, null) });
	return frames;
}

function copy(node: LiveNode, parent: LiveNode | null): LiveNode {
	const out: LiveNode = { ...node, attrs: { ...node.attrs }, parent, children: [] };
	out.children = node.children.map((child) => copy(child, out));
	return out;
}
