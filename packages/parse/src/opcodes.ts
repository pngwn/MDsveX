import type { NodeKind } from './utils';

/** the parser as an emitter that keeps ids equal to its slots sees it */
export interface IdSource {
	/** the next id is at least next, a call from an emitter the parser left does nothing */
	skip_ids(emitter: Emitter, next: number): void;
}

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
	 *
	 * ids are dense from root 0, each open and each text that creates a child
	 * node takes the next id, so a builder can use ids as slot indices
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
		pending: boolean
	): void;

	/**
	 * close a previously opened node, a pending node is final from here on
	 * unless it is a paragraph, which a commit or a revoke settles later
	 * @param id id of the node to close.
	 * @param end source byte offset where this node ends.
	 * @param kind kind at open, a revoke may have rewritten it since, omitting
	 *   it makes the builder track revokes
	 */
	close(id: number, end: number, kind?: NodeKind): void;

	/**
	 * close a pending delimiter that reached the end of its block with no
	 * closer, it is not final and its revoke follows once the parser is back
	 * at block level, when it is missing the parser calls close
	 */
	close_pending?(id: number, end: number, kind: NodeKind): void;

	/**
	 * emit leaf text content within a node.
	 * paragraphs, emphasis, links and table cells get a child text node, which
	 * takes the next id although no open names it
	 * headings, code fences, code spans and html comments get a value range and
	 * take no id
	 * @param parent id of the parent node.
	 * @param start source byte offset of text start.
	 * @param end source byte offset of text end.
	 * @param parent_kind parent kind at open, as for close
	 */
	text(
		parent: number,
		start: number,
		end: number,
		parent_kind?: NodeKind
	): void;

	/**
	 * open, set_value_start, set_value_end and close of a node with no extra in
	 * one call, when it is missing the parser emits those four opcodes
	 */
	leaf?(
		id: number,
		kind: NodeKind,
		start: number,
		parent: number,
		value_start: number,
		value_end: number,
		end: number
	): void;

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
	 * @param text_start source offset of source_text, at the node start a tree
	 *   that reads the source need not keep source_text
	 */
	revoke(id: number, source_text?: string, text_start?: number): void;

	/**
	 * clear the pending flag on a node without touching its structure.
	 * used for tight-list speculation: paragraphs inside list_items are
	 * opened pending so renderers can hide their wrapper during streaming;
	 * when the list turns out to be loose we commit each one so the wrapper
	 * becomes visible. a paragraph opened pending outside a list, one that
	 * starts with a tag or an image, is committed when it closes with text
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

	/** the incremental finish emitted the last opcode, reserved storage can go */
	end?(): void;

	/**
	 * the parser that emits here from now on, called when it is made or bound,
	 * an emitter that puts nodes of its own in id slots moves the next id past
	 * them with skip_ids so ids stay dense for it
	 */
	follow?(ids: IdSource): void;
}
