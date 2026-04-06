/**
 * pfm document client
 *
 * consumes wire format batches and maintains a stable, mutable document
 * tree. nodes are never recreated — only mutated in place. fires surgical
 * events on each mutation so renderers can apply minimum updates.
 *
 * architecture:
 *   wire batch -> pfmdocument (mutate nodes, fire events) -> renderer
 *
 * the renderer maintains its own id->artifact map (dom elements, svelte
 * components, html fragments, etc.) and reacts to events surgically.
 *
 * two consumption modes:
 *   1. applybatch() — bare sax-style dispatcher, no tree, no state
 *   2. pfmdocument  — tree builder with stable nodes and events
 */

// ── Types ────────────────────────────────────────────────────

/** a node in the pfm document tree. stable reference — mutated, never recreated. */
export interface PFMNode {
	/** unique node id (monotonic, from the parser). */
	readonly id: number;
	/** numeric kind code (maps to schema). */
	readonly kind: number;
	/** human-readable kind name (e.g., "paragraph", "emphasis"). */
	readonly kindName: string;
	/** kind-specific extra value (e.g., heading depth, backtick count). */
	readonly extra: number;
	/** parent node, or null for root. */
	parent: PFMNode | null;
	/**
	 * ordered content: interleaved text strings and child nodes.
	 * document order is preserved. consecutive t opcodes for the same
	 * node append to the last string (or push a new one after a child).
	 */
	content: (string | PFMNode)[];
	/** node attributes (href, title, info, ordered, etc.). */
	attrs: Record<string, unknown>;
	/** true if speculative (may be revoked). */
	pending: boolean;
	/** true if closed/finalized. */
	closed: boolean;
}

/**
 * handlers for bare batch dispatch (sax-style, no tree).
 * each method receives raw opcode fields.
 */
export interface PFMHandlers {
	schema?(kinds: string[]): void;
	open?(
		id: number,
		kind: number,
		parent: number,
		pending: boolean,
		extra: number
	): void;
	close?(id: number): void;
	text?(id: number, content: string): void;
	attr?(id: number, key: string, value: unknown): void;
	revoke?(id: number, delimiter: string): void;
	clear?(id: number): void;
}

// ── Bare dispatcher ──────────────────────────────────────────

/**
 * bare batch dispatcher. iterates opcodes and calls handlers directly.
 * no state, no tree — just forwarding. use when you want sax-style
 * processing without the tree overhead (e.g., streaming html).
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
					op[5] as number
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
 * pfm document — tree-building client for the wire format.
 *
 * maintains a stable, mutable tree of pfmnode instances. nodes are
 * created once and mutated in place — downstream references (dom
 * elements, component instances, etc.) stay valid.
 *
 * usage:
 *   const doc = new pfmdocument();
 *   doc.ontext = (node, idx, text) => updatedom(node.id, idx, text);
 *   doc.apply(json.parse(event.data));
 *   // doc.root is the live tree
 */
export class PFMDocument {
	/** kind name array from the schema opcode. */
	schema: string[] | null = null;
	/** root node of the document tree. */
	root: PFMNode | null = null;
	/** all nodes by id. stable references — never recreated. */
	nodes: Map<number, PFMNode> = new Map();

	// ── Event hooks ────────────────────────────────────────────

	/** fired when a new node is created and added to the tree. */
	onopen?: (node: PFMNode) => void;
	/** fired when a node is closed/finalized. pending becomes false. */
	onclose?: (node: PFMNode) => void;
	/**
	 * fired when text is appended to a node's content.
	 * @param node the target node.
	 * @param contentindex index in node.content where text was appended.
	 * @param appended the new text that was appended (not the full string).
	 */
	ontext?: (node: PFMNode, contentIndex: number, appended: string) => void;
	/** fired when an attribute is set on a node. */
	onattr?: (node: PFMNode, key: string, value: unknown) => void;
	/**
	 * fired after a node is revoked and its content spliced into the parent.
	 * the revoked node is detached from the tree but retains its id/kind.
	 * adjacent strings in parent.content have been merged.
	 */
	onrevoke?: (parent: PFMNode, revokedNode: PFMNode, delimiter: string) => void;
	/** fired when a node's content is cleared. */
	onclear?: (node: PFMNode) => void;

	// ── Public API ─────────────────────────────────────────────

	/**
	 * apply a batch of wire opcodes. mutates the tree in place
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
						op[5] as number
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

	/** reset all state for a new document. */
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
		extra: number
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

/** get all text content from a node, recursively. */
export function textContent(node: PFMNode): string {
	let result = '';
	for (let i = 0; i < node.content.length; i++) {
		const item = node.content[i];
		result += typeof item === 'string' ? item : textContent(item);
	}
	return result;
}

/** merge adjacent string entries in a content array in place. */
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
