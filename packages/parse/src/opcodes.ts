import type { node_kind } from './utils';

/**
 * Emitter interface for PFM parser opcodes.
 *
 * The parser calls these methods as it processes input. Implementations
 * decide what to do with each opcode:
 * - TreeBuilder: reconstructs a node_buffer (backward compat)
 * - SSEEmitter: serializes to SSE wire format (streaming)
 */
export interface Emitter {
	/**
	 * Open a new node.
	 * @param id Monotonic node ID (unique within this parse).
	 * @param kind Node kind (heading, paragraph, emphasis, etc.).
	 * @param start Source byte offset where this node starts.
	 * @param parent ID of the parent node (-1 for root's parent).
	 * @param extra Kind-specific extra value (e.g. heading depth).
	 * @param pending True if this node is speculative (may be revoked).
	 */
	open(
		id: number,
		kind: node_kind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean,
	): void;

	/**
	 * Close a previously opened node. Implicitly commits pending nodes.
	 * @param id ID of the node to close.
	 * @param end Source byte offset where this node ends.
	 */
	close(id: number, end: number): void;

	/**
	 * Emit leaf text content within a node.
	 * For paragraphs/emphasis/links: creates a child text node.
	 * For headings/code_fences/code_spans: sets the node's value range.
	 * @param parent ID of the parent node.
	 * @param start Source byte offset of text start.
	 * @param end Source byte offset of text end.
	 */
	text(parent: number, start: number, end: number): void;

	/**
	 * Set or update an attribute on a node.
	 * Used for metadata (href, title, info), value ranges, and list properties.
	 * @param id ID of the node.
	 * @param key Attribute key.
	 * @param value Attribute value.
	 */
	attr(id: number, key: string, value: any): void;

	/** Set the value start position for a node. */
	set_value_start(id: number, pos: number): void;

	/** Set the value end position for a node. */
	set_value_end(id: number, pos: number): void;

	/**
	 * Revoke a speculative node. The node is removed from the tree:
	 * - If it has no children: simply removed.
	 * - If it has children: children reparent to grandparent,
	 *   opening delimiter becomes literal text.
	 * @param id ID of the node to revoke.
	 */
	revoke(id: number): void;

	/**
	 * Report the parser's current cursor position. Called at the end of
	 * each feed() and finish(). Emitters can use this as the boundary
	 * for eager text emission during streaming.
	 * @param pos Current byte offset in the source.
	 */
	cursor(pos: number): void;
}
