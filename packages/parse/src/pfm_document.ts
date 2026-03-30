/**
 * PFM Document Client
 *
 * Consumes wire format batches and maintains a stable, mutable document
 * tree. Nodes are never recreated — only mutated in place. Fires surgical
 * events on each mutation so renderers can apply minimum updates.
 *
 * Architecture:
 *   Wire batch → PFMDocument (mutate nodes, fire events) → Renderer
 *
 * The renderer maintains its own id→artifact map (DOM elements, Svelte
 * components, HTML fragments, etc.) and reacts to events surgically.
 *
 * Two consumption modes:
 *   1. applyBatch() — bare SAX-style dispatcher, no tree, no state
 *   2. PFMDocument  — tree builder with stable nodes and events
 */

// ── Types ────────────────────────────────────────────────────

/** A node in the PFM document tree. Stable reference — mutated, never recreated. */
export interface PFMNode {
	/** Unique node ID (monotonic, from the parser). */
	readonly id: number;
	/** Numeric kind code (maps to schema). */
	readonly kind: number;
	/** Human-readable kind name (e.g., "paragraph", "emphasis"). */
	readonly kindName: string;
	/** Kind-specific extra value (e.g., heading depth, backtick count). */
	readonly extra: number;
	/** Parent node, or null for root. */
	parent: PFMNode | null;
	/**
	 * Ordered content: interleaved text strings and child nodes.
	 * Document order is preserved. Consecutive T opcodes for the same
	 * node append to the last string (or push a new one after a child).
	 */
	content: (string | PFMNode)[];
	/** Node attributes (href, title, info, ordered, etc.). */
	attrs: Record<string, unknown>;
	/** True if speculative (may be revoked). */
	pending: boolean;
	/** True if closed/finalized. */
	closed: boolean;
}

/**
 * Handlers for bare batch dispatch (SAX-style, no tree).
 * Each method receives raw opcode fields.
 */
export interface PFMHandlers {
	schema?(kinds: string[]): void;
	open?(id: number, kind: number, parent: number, pending: boolean, extra: number): void;
	close?(id: number): void;
	text?(id: number, content: string): void;
	attr?(id: number, key: string, value: unknown): void;
	revoke?(id: number, delimiter: string): void;
	clear?(id: number): void;
}

// ── Bare dispatcher ──────────────────────────────────────────

/**
 * Bare batch dispatcher. Iterates opcodes and calls handlers directly.
 * No state, no tree — just forwarding. Use when you want SAX-style
 * processing without the tree overhead (e.g., streaming HTML).
 */
export function applyBatch(batch: unknown[][], handlers: PFMHandlers): void {
	for (let i = 0; i < batch.length; i++) {
		const op = batch[i];
		switch (op[0]) {
			case 'S':
				handlers.schema?.(op[1] as string[]);
				break;
			case 'O':
				handlers.open?.(
					op[1] as number,
					op[2] as number,
					op[3] as number,
					(op[4] as number) === 1,
					op[5] as number,
				);
				break;
			case 'C':
				handlers.close?.(op[1] as number);
				break;
			case 'T':
				handlers.text?.(op[1] as number, op[2] as string);
				break;
			case 'A':
				handlers.attr?.(op[1] as number, op[2] as string, op[3]);
				break;
			case 'R':
				handlers.revoke?.(op[1] as number, op[2] as string);
				break;
			case 'X':
				handlers.clear?.(op[1] as number);
				break;
		}
	}
}

// ── PFMDocument ──────────────────────────────────────────────

/**
 * PFM Document — tree-building client for the wire format.
 *
 * Maintains a stable, mutable tree of PFMNode instances. Nodes are
 * created once and mutated in place — downstream references (DOM
 * elements, component instances, etc.) stay valid.
 *
 * Usage:
 *   const doc = new PFMDocument();
 *   doc.ontext = (node, idx, text) => updateDOM(node.id, idx, text);
 *   doc.apply(JSON.parse(event.data));
 *   // doc.root is the live tree
 */
export class PFMDocument {
	/** Kind name array from the schema opcode. */
	schema: string[] | null = null;
	/** Root node of the document tree. */
	root: PFMNode | null = null;
	/** All nodes by ID. Stable references — never recreated. */
	nodes: Map<number, PFMNode> = new Map();

	// ── Event hooks ────────────────────────────────────────────

	/** Fired when a new node is created and added to the tree. */
	onopen?: (node: PFMNode) => void;
	/** Fired when a node is closed/finalized. Pending becomes false. */
	onclose?: (node: PFMNode) => void;
	/**
	 * Fired when text is appended to a node's content.
	 * @param node The target node.
	 * @param contentIndex Index in node.content where text was appended.
	 * @param appended The new text that was appended (not the full string).
	 */
	ontext?: (node: PFMNode, contentIndex: number, appended: string) => void;
	/** Fired when an attribute is set on a node. */
	onattr?: (node: PFMNode, key: string, value: unknown) => void;
	/**
	 * Fired after a node is revoked and its content spliced into the parent.
	 * The revoked node is detached from the tree but retains its id/kind.
	 * Adjacent strings in parent.content have been merged.
	 */
	onrevoke?: (parent: PFMNode, revokedNode: PFMNode, delimiter: string) => void;
	/** Fired when a node's content is cleared. */
	onclear?: (node: PFMNode) => void;

	// ── Public API ─────────────────────────────────────────────

	/**
	 * Apply a batch of wire opcodes. Mutates the tree in place
	 * and fires events for each mutation.
	 */
	apply(batch: unknown[][]): void {
		for (let i = 0; i < batch.length; i++) {
			const op = batch[i];
			switch (op[0]) {
				case 'S':
					this.schema = op[1] as string[];
					break;
				case 'O':
					this._open(
						op[1] as number,
						op[2] as number,
						op[3] as number,
						(op[4] as number) === 1,
						op[5] as number,
					);
					break;
				case 'C':
					this._close(op[1] as number);
					break;
				case 'T':
					this._text(op[1] as number, op[2] as string);
					break;
				case 'A':
					this._attr(op[1] as number, op[2] as string, op[3]);
					break;
				case 'R':
					this._revoke(op[1] as number, op[2] as string);
					break;
				case 'X':
					this._clear(op[1] as number);
					break;
			}
		}
	}

	/** Reset all state for a new document. */
	reset(): void {
		this.schema = null;
		this.root = null;
		this.nodes.clear();
	}

	// ── Internal opcode handlers ───────────────────────────────

	private _open(
		id: number,
		kind: number,
		parent: number,
		pending: boolean,
		extra: number,
	): void {
		const parentNode = this.nodes.get(parent) ?? null;
		const node: PFMNode = {
			id,
			kind,
			kindName: this.schema?.[kind] ?? String(kind),
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

		this.onopen?.(node);
	}

	private _close(id: number): void {
		const node = this.nodes.get(id);
		if (!node) return;
		node.closed = true;
		node.pending = false;
		this.onclose?.(node);
	}

	private _text(id: number, content: string): void {
		const node = this.nodes.get(id);
		if (!node) return;

		const last = node.content.length - 1;
		if (last >= 0 && typeof node.content[last] === 'string') {
			// Append to existing text segment
			node.content[last] = (node.content[last] as string) + content;
			this.ontext?.(node, last, content);
		} else {
			// Push new text segment
			const idx = node.content.length;
			node.content.push(content);
			this.ontext?.(node, idx, content);
		}
	}

	private _attr(id: number, key: string, value: unknown): void {
		const node = this.nodes.get(id);
		if (!node) return;
		node.attrs[key] = value;
		this.onattr?.(node, key, value);
	}

	private _revoke(id: number, delimiter: string): void {
		const node = this.nodes.get(id);
		if (!node) return;

		const parent = node.parent;
		if (!parent) return;

		// Find the node in parent's content
		const idx = parent.content.indexOf(node);
		if (idx === -1) return;

		// Build replacement: delimiter text + node's content items
		const items: (string | PFMNode)[] = [];
		if (delimiter) items.push(delimiter);
		for (let i = 0; i < node.content.length; i++) {
			const item = node.content[i];
			if (typeof item !== 'string') {
				item.parent = parent; // reparent child nodes
			}
			items.push(item);
		}

		// Splice: remove revoked node, insert replacement
		parent.content.splice(idx, 1, ...items);

		// Merge adjacent strings
		merge_adjacent_strings(parent.content);

		// Remove from map
		this.nodes.delete(id);

		this.onrevoke?.(parent, node, delimiter);
	}

	private _clear(id: number): void {
		const node = this.nodes.get(id);
		if (!node) return;

		// Remove child node subtrees from the map
		for (let i = 0; i < node.content.length; i++) {
			const item = node.content[i];
			if (typeof item !== 'string') {
				this._remove_subtree(item);
			}
		}

		node.content.length = 0;
		this.onclear?.(node);
	}

	private _remove_subtree(node: PFMNode): void {
		this.nodes.delete(node.id);
		for (let i = 0; i < node.content.length; i++) {
			const item = node.content[i];
			if (typeof item !== 'string') {
				this._remove_subtree(item);
			}
		}
	}
}

// ── Utilities ────────────────────────────────────────────────

/** Get all text content from a node, recursively. */
export function textContent(node: PFMNode): string {
	let result = '';
	for (let i = 0; i < node.content.length; i++) {
		const item = node.content[i];
		result += typeof item === 'string' ? item : textContent(item);
	}
	return result;
}

/** Merge adjacent string entries in a content array in place. */
function merge_adjacent_strings(content: (string | PFMNode)[]): void {
	let i = 0;
	while (i < content.length - 1) {
		if (typeof content[i] === 'string' && typeof content[i + 1] === 'string') {
			content[i] = (content[i] as string) + (content[i + 1] as string);
			content.splice(i + 1, 1);
		} else {
			i++;
		}
	}
}
