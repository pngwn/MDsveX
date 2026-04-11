import type { NodeKind } from "./utils";

/**
 * emitter interface for pfm parser opcodes.
 *
 * the parser calls these methods as it processes input. implementations
 * decide what to do with each opcode:
 * - treebuilder: reconstructs a NodeBuffer (backward compat)
 * - sseemitter: serializes to sse wire format (streaming)
 */
export interface Emitter {
	/**
	 * open a new node.
	 * @param id monotonic node id (unique within this parse).
	 * @param kind node kind (heading, paragraph, emphasis, etc.).
	 * @param start source byte offset where this node starts.
	 * @param parent id of the parent node (-1 for root's parent).
	 * @param extra kind-specific extra value (e.g. heading depth).
	 * @param pending true if this node is speculative (may be revoked).
	 */
	open(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		extra: number,
		pending: boolean,
	): void;

	/**
	 * close a previously opened node. implicitly commits pending nodes.
	 * @param id id of the node to close.
	 * @param end source byte offset where this node ends.
	 */
	close(id: number, end: number): void;

	/**
	 * emit leaf text content within a node.
	 * for paragraphs/emphasis/links: creates a child text node.
	 * for headings/code_fences/code_spans: sets the node's value range.
	 * @param parent id of the parent node.
	 * @param start source byte offset of text start.
	 * @param end source byte offset of text end.
	 */
	text(parent: number, start: number, end: number): void;

	/**
	 * set or update an attribute on a node.
	 * used for metadata (href, title, info), value ranges, and list properties.
	 * @param id id of the node.
	 * @param key attribute key.
	 * @param value attribute value.
	 */
	attr(id: number, key: string, value: any): void;

	/** set the value start position for a node. */
	set_value_start(id: number, pos: number): void;

	/** set the value end position for a node. */
	set_value_end(id: number, pos: number): void;

	/**
	 * revoke a speculative node. the node is removed from the tree:
	 * - if it has no children: simply removed.
	 * - if it has children: children reparent to grandparent,
	 *   opening delimiter becomes literal text.
	 * @param id id of the node to revoke.
	 * @param source_text optional raw source text for the revoked node.
	 *   used for block-level revocations where the content must be
	 *   reconstructed (e.g. failed html tags becoming paragraph text).
	 */
	revoke(id: number, source_text?: string): void;

	/**
	 * clear the pending flag on a node without touching its structure.
	 * used for tight-list speculation: paragraphs inside list_items are
	 * opened pending so renderers can hide their wrapper during streaming;
	 * when the list turns out to be loose we commit each one so the wrapper
	 * becomes visible.
	 * @param id id of the node to commit.
	 */
	commit(id: number): void;

	/**
	 * report the parser's current cursor position. called at the end of
	 * each feed() and finish(). emitters can use this as the boundary
	 * for eager text emission during streaming.
	 * @param pos current byte offset in the source.
	 */
	cursor(pos: number): void;
}
