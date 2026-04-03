/**
 * DocumentBuilder — Emitter that builds a PFMNode tree directly.
 *
 * Same result as WireEmitter → PFMDocument, but without the
 * serialize→deserialize roundtrip. Use for same-process batch
 * rendering where no network transport is needed.
 *
 *   const builder = new DocumentBuilder();
 *   builder.set_source(source);
 *   const parser = new PFMParser(builder);
 *   parser.parse(source);
 *   const root = builder.root;
 */

import type { Emitter } from './opcodes';
import type { PFMNode } from './pfm_document';
import { node_kind } from './utils';

/** Kind names indexed by node_kind value. */
const KIND_NAMES: string[] = [
	'root', 'text', 'html', 'heading', 'mustache', 'code_fence',
	'line_break', 'paragraph', 'code_span', 'emphasis', 'strong_emphasis',
	'thematic_break', 'link', 'image', 'block_quote', 'list', 'list_item',
	'hard_break', 'soft_break', 'strikethrough', 'superscript', 'subscript',
	'table', 'table_header', 'table_row', 'table_cell', 'html_comment',
];

function is_content_leaf(kind: node_kind): boolean {
	return (
		kind === node_kind.heading ||
		kind === node_kind.code_fence ||
		kind === node_kind.code_span ||
		kind === node_kind.html_comment
	);
}

function get_delimiter(kind: node_kind | undefined): string {
	switch (kind) {
		case node_kind.emphasis: return '_';
		case node_kind.strong_emphasis: return '*';
		case node_kind.strikethrough: return '~~';
		case node_kind.superscript: return '^';
		case node_kind.subscript: return '~';
		case node_kind.link: return '[';
		case node_kind.image: return '![';
		case node_kind.code_span: return '`';
		case node_kind.html: return '<';
		default: return '';
	}
}

interface TextState {
	start: number;
	sent: number;
	target: PFMNode;
	done: boolean;
}

export class DocumentBuilder implements Emitter {
	private source = '';
	/** All nodes by ID. */
	private nodes: Map<number, PFMNode> = new Map();
	/** Maps text node ID → kind. */
	private kinds: Map<number, node_kind> = new Map();
	/** Maps text node ID → wire-visible parent node. */
	private text_parents: Map<number, PFMNode> = new Map();
	/** Progressive text state. */
	private text_state: Map<number, TextState> = new Map();
	/** Buffered info_start offsets. */
	private info_starts: Map<number, number> = new Map();

	/** The root node of the built tree. */
	root: PFMNode | null = null;

	set_source(source: string): void {
		this.source = source;
	}

	// ── Emitter interface ──────────────────────────────────────

	open(
		id: number,
		kind: node_kind,
		_start: number,
		parent: number,
		extra: number,
		pending: boolean,
	): void {
		this.kinds.set(id, kind);

		// Suppress text nodes — map to wire-visible parent
		if (kind === node_kind.text) {
			const parentKind = this.kinds.get(parent);
			const parentNode =
				parentKind === node_kind.text
					? (this.text_parents.get(parent) ?? this.nodes.get(parent)!)
					: this.nodes.get(parent)!;
			this.text_parents.set(id, parentNode);
			return;
		}

		const parentNode = this.nodes.get(parent) ?? null;
		const node: PFMNode = {
			id,
			kind,
			kindName: KIND_NAMES[kind] ?? String(kind),
			extra,
			parent: parentNode,
			content: [],
			attrs: {},
			pending,
			closed: false,
		};
		this.nodes.set(id, node);

		if (parentNode) {
			parentNode.content.push(node);
		}

		if (parent === -1) {
			this.root = node;
		}
	}

	close(id: number, _end: number): void {
		if (this.kinds.get(id) === node_kind.text) return;

		const node = this.nodes.get(id);
		if (!node) return;
		node.closed = true;
		node.pending = false;
	}

	text(parent: number, start: number, end: number): void {
		if (end <= start) return;
		const content = this.source.slice(start, end);
		if (!content) return;
		const node = this.nodes.get(parent);
		if (!node) return;
		this._append_text(node, content);
	}

	attr(id: number, key: string, value: unknown): void {
		// ── value_start / value_end → text content ──

		if (key === 'value_start') {
			const kind = this.kinds.get(id);
			if (kind !== node_kind.text && (kind === undefined || !is_content_leaf(kind))) return;

			const target =
				kind === node_kind.text
					? (this.text_parents.get(id) ?? this.nodes.get(id)!)
					: this.nodes.get(id)!;
			this.text_state.set(id, {
				start: value as number,
				sent: value as number,
				target,
				done: false,
			});
			return;
		}

		if (key === 'value_end') {
			const state = this.text_state.get(id);
			if (state && (value as number) > state.sent) {
				const content = this.source.slice(state.sent, value as number);
				if (content) {
					this._append_text(state.target, content);
					state.sent = value as number;
				}
			}
			if (state) state.done = true;
			return;
		}

		// ── info_start / info_end → resolved 'info' attr ──

		if (key === 'info_start') {
			this.info_starts.set(id, value as number);
			return;
		}

		if (key === 'info_end') {
			const info_start = this.info_starts.get(id);
			if (info_start !== undefined) {
				const info = this.source.slice(info_start, value as number);
				if (info) {
					const node = this.nodes.get(id);
					if (node) node.attrs.info = info;
				}
				this.info_starts.delete(id);
			}
			return;
		}

		// ── Skip attrs for suppressed text nodes ──

		if (this.kinds.get(id) === node_kind.text) return;

		// ── Pass through all other attrs ──

		const node = this.nodes.get(id);
		if (node) node.attrs[key] = value;
	}

	set_value_start(id: number, pos: number): void {
		this.attr(id, 'value_start', pos);
	}

	set_value_end(id: number, pos: number): void {
		this.attr(id, 'value_end', pos);
	}

	cursor(_pos: number): void {
		// No-op for batch mode — no streaming flush needed.
	}

	revoke(id: number): void {
		const kind = this.kinds.get(id);
		const delimiter = get_delimiter(kind);

		const node = this.nodes.get(id);
		if (!node) return;

		const parent = node.parent;
		if (!parent) return;

		const idx = parent.content.indexOf(node);
		if (idx === -1) return;

		// Build replacement: delimiter + node's content
		const items: (string | PFMNode)[] = [];
		if (delimiter) items.push(delimiter);
		for (let i = 0; i < node.content.length; i++) {
			const item = node.content[i];
			if (typeof item !== 'string') {
				item.parent = parent;
			}
			items.push(item);
		}

		parent.content.splice(idx, 1, ...items);

		// Merge adjacent strings
		let j = 0;
		while (j < parent.content.length - 1) {
			if (typeof parent.content[j] === 'string' && typeof parent.content[j + 1] === 'string') {
				parent.content[j] = (parent.content[j] as string) + (parent.content[j + 1] as string);
				parent.content.splice(j + 1, 1);
			} else {
				j++;
			}
		}

		this.nodes.delete(id);
		this.text_state.delete(id);
	}

	// ── Public API ─────────────────────────────────────────────

	/** Reset for a new parse. */
	reset(): void {
		this.source = '';
		this.root = null;
		this.nodes.clear();
		this.kinds.clear();
		this.text_parents.clear();
		this.text_state.clear();
		this.info_starts.clear();
	}

	// ── Internal ───────────────────────────────────────────────

	private _append_text(node: PFMNode, content: string): void {
		const last = node.content.length - 1;
		if (last >= 0 && typeof node.content[last] === 'string') {
			node.content[last] = (node.content[last] as string) + content;
		} else {
			node.content.push(content);
		}
	}
}
