/** default number of token entries to preallocate. */
const DEFAULT_TOKEN_CAPACITY = 128;

/** default number of error entries to preallocate. */
const DEFAULT_ERROR_CAPACITY = 32;

/** default node capacity for the arena allocator. */
const DEFAULT_NODE_CAPACITY = 128;

export const enum node_kind {
	root = 0,
	text = 1,
	html = 2,
	heading = 3,
	mustache = 4,
	code_fence = 5,
	line_break = 6,
	paragraph = 7,
	code_span = 8,
	emphasis = 9,
	strong_emphasis = 10,
	thematic_break = 11,
	link = 12,
	image = 13,
	block_quote = 14,
	list = 15,
	list_item = 16,
	hard_break = 17,
	soft_break = 18,
	strikethrough = 19,
	superscript = 20,
	subscript = 21,
	table = 22,
	table_header = 23,
	table_row = 24,
	table_cell = 25,
	html_comment = 26,
	svelte_tag = 27,
	svelte_block = 28,
	svelte_branch = 29,
	directive_inline = 30,
	directive_leaf = 31,
	directive_container = 32,
	frontmatter = 33,
	import_statement = 34,
}

/**
 * calculate the next power-of-two capacity for typed array storage.
 * @param value minimum desired capacity.
 * @returns smallest power of two greater than or equal to `value`.
 */
function next_power_of_two(value: number): number {
	let result = 1;
	while (result < value) {
		result <<= 1;
	}
	return result;
}

/**
 * convert a node kind to a string
 * @param kind node kind
 * @returns string
 */
export const kind_to_string = (kind: node_kind): string => {
	switch (kind) {
		case node_kind.root:
			return 'root';
		case node_kind.text:
			return 'text';
		case node_kind.html:
			return 'html';
		case node_kind.heading:
			return 'heading';
		case node_kind.mustache:
			return 'mustache';
		case node_kind.code_fence:
			return 'code_fence';
		case node_kind.line_break:
			return 'line_break';
		case node_kind.paragraph:
			return 'paragraph';
		case node_kind.code_span:
			return 'code_span';
		case node_kind.emphasis:
			return 'emphasis';
		case node_kind.strong_emphasis:
			return 'strong_emphasis';
		case node_kind.thematic_break:
			return 'thematic_break';
		case node_kind.link:
			return 'link';
		case node_kind.image:
			return 'image';
		case node_kind.block_quote:
			return 'block_quote';
		case node_kind.list:
			return 'list';
		case node_kind.list_item:
			return 'list_item';
		case node_kind.hard_break:
			return 'hard_break';
		case node_kind.soft_break:
			return 'soft_break';
		case node_kind.strikethrough:
			return 'strikethrough';
		case node_kind.superscript:
			return 'superscript';
		case node_kind.subscript:
			return 'subscript';
		case node_kind.table:
			return 'table';
		case node_kind.table_header:
			return 'table_header';
		case node_kind.table_row:
			return 'table_row';
		case node_kind.table_cell:
			return 'table_cell';
		case node_kind.html_comment:
			return 'html_comment';
		case node_kind.svelte_tag:
			return 'svelte_tag';
		case node_kind.svelte_block:
			return 'svelte_block';
		case node_kind.svelte_branch:
			return 'svelte_branch';
		case node_kind.directive_inline:
			return 'directive_inline';
		case node_kind.directive_leaf:
			return 'directive_leaf';
		case node_kind.directive_container:
			return 'directive_container';
		case node_kind.frontmatter:
			return 'frontmatter';
		case node_kind.import_statement:
			return 'import_statement';
	}
};

/**
 * convert a node extra to a string
 * @param kind node extra
 * @returns string
 */
const extra_to_string = (kind: node_kind): string | undefined => {
	switch (kind) {
		case node_kind.heading:
			return 'depth';
	}
};

/**
 * buffer that stores node metadata with typed arrays.
 */
export class node_buffer {
	private capacity: number;
	/** @internal exposed for cursor access. do not mutate externally. */
	_kinds: Uint8Array;
	private starts: Uint32Array;
	/** @internal */
	_ends: Uint32Array;
	/** @internal */
	_extras: Uint16Array;
	/** @internal */
	_value_starts: Uint32Array;
	/** @internal */
	_value_ends: Uint32Array;
	private has_metadata: Uint8Array;
	private metadata: Map<number, any>;
	/** @internal pre-materialized text strings (used by wiretreebuilder). index -> string. */
	_strings: (string | undefined)[];
	/** @internal */
	_parents: Uint32Array;
	/** @internal */
	_next_siblings: Uint32Array;
	private prev_siblings: Uint32Array;
	/** @internal */
	_children_starts: Uint32Array;
	private children_ends: Uint32Array;
	/** @internal */
	_pending_nodes: Uint32Array;

	private _size: number;

	/**
	 * create a buffer that stores token metadata with typed arrays.
	 * @param initial_capacity requested starting capacity for tokens.
	 */
	constructor(initial_capacity = DEFAULT_TOKEN_CAPACITY) {
		const capacity = next_power_of_two(initial_capacity);
		this.capacity = capacity;
		this._kinds = new Uint8Array(capacity);
		this.starts = new Uint32Array(capacity);
		this._ends = new Uint32Array(capacity);
		this._extras = new Uint16Array(capacity);
		this._value_starts = new Uint32Array(capacity);
		this._value_ends = new Uint32Array(capacity);
		this.has_metadata = new Uint8Array(Math.max(1, capacity >> 3));
		this.metadata = new Map();
		this._strings = [];
		this._parents = new Uint32Array(capacity);
		this._next_siblings = new Uint32Array(capacity);
		this.prev_siblings = new Uint32Array(capacity);
		this._children_starts = new Uint32Array(capacity);
		this.children_ends = new Uint32Array(capacity);
		this._pending_nodes = new Uint32Array(capacity);

		this._size = 0;

		this.push(node_kind.root, 0);
	}

	/** clear previously pushed tokens without reallocating storage. */
	reset(): void {
		this._size = 0;
	}

	/** number of tokens currently stored. */
	get size(): number {
		return this._size;
	}

	/**
	 * push a token descriptor into the buffer.
	 * @param kind token category.
	 * @param cursor cursor position
	 * @param parent index of the parent node, or -1 for root.
	 * @param extra extra metadata stored alongside the token.
	 * @param metadata optional metadata associated with the node.
	 */
	push(
		kind: node_kind,
		cursor: number,
		parent = 0xffffffff,
		extra = 0,
		metadata?: any
	): number {
		const index = this._size;
		if (index >= this.capacity) {
			this.grow();
		}

		this._kinds[index] = kind;
		this.starts[index] = cursor >>> 0;
		this._ends[index] = 0xffffffff;
		this._extras[index] = extra & 0xffff;
		this._size = index + 1;
		this._parents[index] = parent;
		this._next_siblings[index] = 0xffffffff;
		this.prev_siblings[index] = 0xffffffff;
		this._children_starts[index] = 0xffffffff;
		this.children_ends[index] = 0xffffffff;

		if (parent !== 0xffffffff) {
			const last = this.children_ends[parent];
			if (last === 0xffffffff) {
				// First child
				this._children_starts[parent] = index;
			} else {
				// Append after last child — O(1)
				this._next_siblings[last] = index;
				this.prev_siblings[index] = last;
			}
			this.children_ends[parent] = index;
		}

		if (metadata !== undefined) {
			this.metadata.set(index, metadata);
			// bitmask for metadata
			this.has_metadata[index >> 3] |= 1 << (index & 7);
		}

		return index;
	}

	push_pending(
		kind: node_kind,
		cursor: number,
		parent = 0xffffffff,
		extra = 0,
		metadata?: any
	): number {
		const index = this.push(kind, cursor, parent, extra, metadata);
		this._pending_nodes[index] = 1;
		return index;
	}

	commit_node(index: number): void {
		this._pending_nodes[index] = 0;
	}

	get_pending(): number[] {
		const result: number[] = [];
		for (let i = 0; i < this._size; i++) {
			if (this._pending_nodes[i] !== 0) {
				result.push(i);
			}
		}
		return result;
	}

	/**
	 * repair a revoked (pending) node.
	 *
	 * all repair logic lives here — treebuilder and wiretreebuilder
	 * both delegate to this method. the strategy depends on context:
	 *
	 * **inline revocation** (parent is paragraph, emphasis, link, etc.):
	 *   convert the node to text (the delimiter), reparent children to grandparent.
	 *
	 * **block-level revocation** (parent is root, block_quote, list_item):
	 *   convert the node to a paragraph, create a text child with the raw source.
	 *   existing children (e.g. line_breaks from html block parsing) are discarded.
	 *
	 * @param index buffer index of the node to repair.
	 * @param delimiter_text optional pre-resolved delimiter string (wire path).
	 *   if provided, stored in _strings. if absent, value range is set from
	 *   the node's start position.
	 */
	handle_repair(index: number, delimiter_text?: string): void {
		const parent = this._parents[index];
		const kind = this._kinds[index] as node_kind;
		const parent_kind =
			parent !== 0xffffffff ? (this._kinds[parent] as node_kind) : undefined;

		// ── Tight-list speculation repair ───────────────────────
		// A pending paragraph inside a list_item represents the "loose"
		// wrapper that tight lists don't need. Revoking it simply drops
		// the wrapper and reparents children to the list_item.
		if (kind === node_kind.paragraph && parent_kind === node_kind.list_item) {
			this.unwrap_node(index);
			return;
		}

		// ── Block-level repair ──────────────────────────────────
		// If the parent is a block container, the revoked node (typically HTML)
		// needs to become a paragraph with a text child spanning the source range.
		if (
			parent_kind === node_kind.root ||
			parent_kind === node_kind.block_quote ||
			parent_kind === node_kind.list_item
		) {
			// Wire path: delimiter_text has the full content — skip byte offset logic.
			// Source path: compute end from node/children byte offsets.
			const start = this.starts[index];
			let end = start; // fallback

			if (delimiter_text === undefined) {
				// Source path: find end from node end or children
				end = this._ends[index];
				if (end === 0xffffffff) {
					let child = this._children_starts[index];
					while (child !== 0xffffffff && this._parents[child] === index) {
						if (this._kinds[child] === node_kind.line_break) {
							const lb_start = this.starts[child];
							if (lb_start > 0 && (end === 0xffffffff || lb_start > end)) {
								end = lb_start;
							}
						} else {
							const child_end = this._ends[child];
							if (
								child_end !== 0xffffffff &&
								(end === 0xffffffff || child_end > end)
							) {
								end = child_end;
							}
						}
						child = this._next_siblings[child];
					}
				}
				if (end === 0xffffffff || end <= start) {
					this.unwrap_node(index);
					return;
				}
			}

			// Discard existing children (line_breaks, nested content)
			let discard = this._children_starts[index];
			while (discard !== 0xffffffff && this._parents[discard] === index) {
				const next = this._next_siblings[discard];
				// Orphan the child
				this._parents[discard] = 0xffffffff;
				this._next_siblings[discard] = 0xffffffff;
				this.prev_siblings[discard] = 0xffffffff;
				discard = next;
			}
			this._children_starts[index] = 0xffffffff;
			this.children_ends[index] = 0xffffffff;

			// Convert to paragraph
			this.set_kind(index, node_kind.paragraph);
			this.metadata.delete(index);
			this._ends[index] = end;

			// Create text child with the raw source range
			const text_idx = this.push(node_kind.text, start, index);
			this._value_starts[text_idx] = start;
			this._value_ends[text_idx] = end;
			this._ends[text_idx] = end;
			if (delimiter_text !== undefined) {
				this._strings[text_idx] = delimiter_text;
			}
			return;
		}

		// ── Inline repair ───────────────────────────────────────
		const first_child = this._children_starts[index];

		// Convert the wrapper to a plain text node whose value is the
		// literal delimiter (e.g. "~" for subscript, "<div>" for an
		// inline HTML open tag). Any children stay in the document —
		// they are reparented to the grandparent so the streamed
		// content is preserved after revocation.
		this.set_kind(index, node_kind.text);

		if (delimiter_text !== undefined) {
			this._strings[index] = delimiter_text;
			const start = this.starts[index];
			const end = start + delimiter_text.length;
			this._value_starts[index] = start;
			this._value_ends[index] = end;
			this._ends[index] = end;

			if (first_child === 0xffffffff) {
				this._children_starts[index] = 0xffffffff;
				this.children_ends[index] = 0xffffffff;
				return;
			}

			// Reparent children and splice them in AFTER this text node.
			let child = first_child;
			let last_child = first_child;
			while (child !== 0xffffffff && this._parents[child] === index) {
				this._parents[child] = parent;
				last_child = child;
				child = this._next_siblings[child];
			}
			const node_next = this._next_siblings[index];
			this._next_siblings[index] = first_child;
			this.prev_siblings[first_child] = index;
			if (node_next !== 0xffffffff && this._parents[node_next] === parent) {
				this._next_siblings[last_child] = node_next;
				this.prev_siblings[node_next] = last_child;
			} else {
				this._next_siblings[last_child] = 0xffffffff;
			}
			if (this.children_ends[parent] === index) {
				this.children_ends[parent] = last_child;
			}
			this._children_starts[index] = 0xffffffff;
			this.children_ends[index] = 0xffffffff;
			return;
		}

		// Source-based fallback — derive the delimiter byte range from
		// the node's own start offset.
		if (first_child === 0xffffffff) {
			this._children_starts[index] = 0xffffffff;
			this.children_ends[index] = 0xffffffff;
			this._value_starts[index] = this.starts[index];
			if (this._ends[index] === 0xffffffff) {
				this._value_ends[index] = this.starts[index] + 1;
				this._ends[index] = this.starts[index] + 1;
			} else {
				this._value_ends[index] = this._ends[index];
			}
			return;
		}

		// Walk sibling chain and reparent ONLY direct children
		let child = first_child;
		let last_child = first_child;

		while (child !== 0xffffffff && this._parents[child] === index) {
			this._parents[child] = parent;
			last_child = child;
			child = this._next_siblings[child];
		}

		// If exactly one child and it's text, merge the delimiter into it
		if (
			last_child === first_child &&
			this._kinds[first_child] === node_kind.text
		) {
			this._value_starts[index] = this.starts[index];
			this._value_ends[index] = this._ends[first_child];
			this._ends[index] = this._ends[first_child];

			// Skip the child in the sibling chain
			this._next_siblings[index] = this._next_siblings[first_child];
			if (this._next_siblings[first_child] !== 0xffffffff) {
				this.prev_siblings[this._next_siblings[first_child]] = index;
			}

			this._children_starts[index] = 0xffffffff;
			this.children_ends[index] = 0xffffffff;
			return;
		}

		// Insert converted node as sibling before first_child, reparent rest
		const first_child_prev = this.prev_siblings[first_child];

		this._next_siblings[index] = first_child;
		this.prev_siblings[first_child] = index;

		if (first_child_prev !== 0xffffffff) {
			this._next_siblings[first_child_prev] = index;
			this.prev_siblings[index] = first_child_prev;
		}

		if (this.children_ends[parent] === index) {
			this.children_ends[parent] = last_child;
		}

		// Clear children references
		this._children_starts[index] = 0xffffffff;
		this.children_ends[index] = 0xffffffff;

		this._value_starts[index] = this.starts[index];
		this._value_ends[index] = this._value_starts[first_child];
		this._ends[index] = this._value_ends[index];
	}

	repair(): void {
		const pending_nodes = this._pending_nodes.forEach((node, index) => {
			if (node !== 0) {
				this.handle_repair(index);
			}
		});
	}

	pop(): void {
		this._size -= 1;
	}

	/**
	 * remove a node from the tree and reparent its children to its parent.
	 * the node is effectively "unwrapped" — its children take its place
	 * in the parent's child list.
	 */
	unwrap_node(index: number): void {
		const parent = this._parents[index];
		const first_child = this._children_starts[index];

		if (first_child === 0xffffffff) {
			// No children — remove from sibling chain
			const prev_sib = this.prev_siblings[index];
			const next_sib = this._next_siblings[index];
			if (prev_sib !== 0xffffffff) {
				this._next_siblings[prev_sib] = next_sib;
			} else if (parent !== 0xffffffff) {
				this._children_starts[parent] = next_sib;
			}
			if (next_sib !== 0xffffffff) {
				this.prev_siblings[next_sib] = prev_sib;
			}
			// Update parent's last child if we removed the tail
			if (parent !== 0xffffffff && this.children_ends[parent] === index) {
				this.children_ends[parent] = prev_sib; // 0xffffffff if was only child
			}
			return;
		}

		// Reparent all children and find last child
		let child = first_child;
		let last_child = first_child;
		while (child !== 0xffffffff && this._parents[child] === index) {
			this._parents[child] = parent;
			last_child = child;
			child = this._next_siblings[child];
		}

		// Splice children into parent's child list where this node was
		const prev_sib = this.prev_siblings[index];
		const next_sib =
			this._next_siblings[last_child] !== 0xffffffff &&
			this._parents[this._next_siblings[last_child]] === index
				? 0xffffffff
				: this._next_siblings[last_child];

		// The actual next sibling of the unwrapped node (not of last_child)
		const node_next = this._next_siblings[index];

		if (prev_sib !== 0xffffffff) {
			this._next_siblings[prev_sib] = first_child;
			this.prev_siblings[first_child] = prev_sib;
		} else if (parent !== 0xffffffff) {
			this._children_starts[parent] = first_child;
			this.prev_siblings[first_child] = 0xffffffff;
		}

		// Link last child to the unwrapped node's next sibling
		if (node_next !== 0xffffffff && node_next !== first_child) {
			this._next_siblings[last_child] = node_next;
			this.prev_siblings[node_next] = last_child;
		} else {
			this._next_siblings[last_child] = 0xffffffff;
		}

		// Update parent's last child if we replaced the tail
		if (parent !== 0xffffffff && this.children_ends[parent] === index) {
			this.children_ends[parent] = last_child;
		}

		// Clear the unwrapped node's links
		this._children_starts[index] = 0xffffffff;
		this.children_ends[index] = 0xffffffff;
	}

	set_parent_kind(index: number, kind: node_kind): void {
		const parent_index = this._parents[index];
		if (parent_index !== 0xffffffff) {
			this._kinds[parent_index] = kind;
		}
	}

	/** return indices of all nodes matching the given kind (lazy scan). */
	get_kinds(kind: node_kind): number[] {
		const result: number[] = [];
		for (let i = 0; i < this._size; i++) {
			if (this._kinds[i] === kind) result.push(i);
		}
		return result;
	}

	/**
	 * get the token kind recorded at the supplied index.
	 * @param index token index.
	 */
	kind_at(index: number): node_kind {
		return this._kinds[index] as node_kind;
	}

	/**
	 * set the kind of the node at the given index
	 * @param index index of the node whose kind to update
	 * @param kind new kind
	 */
	set_kind(index: number, kind: node_kind): void {
		this._kinds[index] = kind;
	}

	/** @internal set prev_siblings for wiretreebuilder revoke. */
	prev_siblings_set(index: number, value: number): void {
		this.prev_siblings[index] = value;
	}

	/** @internal set children_ends for wiretreebuilder revoke. */
	children_ends_set(index: number, value: number): void {
		this.children_ends[index] = value;
	}

	/**
	 * set the extra of the node at the given index
	 * @param index index of the node whose extra to update
	 * @param extra new extra
	 */
	set_extra(index: number, extra: number): void {
		this._extras[index] = extra & 0xffff;
	}

	/**
	 * set the end position of the node at the given index
	 * @param index index of the node whose end position to update
	 * @param end new end position
	 */
	set_end(index: number, end: number): void {
		this._ends[index] = end >>> 0;
	}

	gently_set_end(index: number, end: number): void {
		if (this._ends[index] !== 0xffffffff) return;
		this._ends[index] = end >>> 0;
	}

	gently_set_value_end(index: number, end: number): void {
		if (this._value_ends[index] !== 0xffffffff) return;
		this._value_ends[index] = end >>> 0;
	}

	/** pre-grow to avoid repeated resizes when the final size is estimable. */
	ensure_capacity(needed: number): void {
		while (this.capacity < needed) this.grow();
	}

	/** double the backing storage when capacity is exhausted. */
	private grow(): void {
		const next = this.capacity << 1;
		const next_kinds = new Uint8Array(next);
		const next_starts = new Uint32Array(next);
		const next_ends = new Uint32Array(next);
		const next_extras = new Uint16Array(next);
		const next_value_starts = new Uint32Array(next);
		const next_value_ends = new Uint32Array(next);
		const next_parents = new Uint32Array(next);
		const next_next_siblings = new Uint32Array(next);
		const next_prev_siblings = new Uint32Array(next);
		const next_children_starts = new Uint32Array(next);
		const next_children_ends = new Uint32Array(next);
		const next_pending_nodes = new Uint32Array(next);
		const next_has_metadata = new Uint8Array(Math.max(1, next >> 3));

		next_kinds.set(this._kinds);
		next_starts.set(this.starts);
		next_ends.set(this._ends);
		next_extras.set(this._extras);
		next_value_starts.set(this._value_starts);
		next_value_ends.set(this._value_ends);
		next_parents.set(this._parents);
		next_next_siblings.set(this._next_siblings);
		next_prev_siblings.set(this.prev_siblings);
		next_children_starts.set(this._children_starts);
		next_children_ends.set(this.children_ends);
		next_pending_nodes.set(this._pending_nodes);
		next_has_metadata.set(this.has_metadata);

		this.capacity = next;
		this._kinds = next_kinds;
		this.starts = next_starts;
		this._ends = next_ends;
		this._extras = next_extras;
		this._value_starts = next_value_starts;
		this._value_ends = next_value_ends;
		this._parents = next_parents;
		this._next_siblings = next_next_siblings;
		this.prev_siblings = next_prev_siblings;
		this._children_starts = next_children_starts;
		this.children_ends = next_children_ends;
		this._pending_nodes = next_pending_nodes;
		this.has_metadata = next_has_metadata;
	}

	set_metadata(index: number, metadata: any): void {
		this.metadata.set(index, metadata);
		this.has_metadata[index >> 3] |= 1 << (index & 7);
	}

	metadata_at(index: number): any | undefined {
		// Check bit first
		if (!(this.has_metadata[index >> 3] & (1 << (index & 7)))) {
			return undefined; // Fast path: no Map lookup
		}
		return this.metadata.get(index);
	}

	set_value(index: number, value_start: number, value_end: number): void {
		this._value_starts[index] = value_start;
		this._value_ends[index] = value_end;
	}

	set_value_start(index: number, value_start: number): void {
		this._value_starts[index] = value_start;
	}

	set_value_end(index: number, value_end: number): void {
		this._value_ends[index] = value_end;
	}

	/**
	 * get the node at the given index or the root node if no index is provided
	 * @param index index of the node to get
	 * @returns node
	 */
	get_node(index: number = 0): {
		kind: string;
		start: number;
		end: number;
		metadata: any;
		parent: number | null;
		next: number | null;
		prev: number | null;
		children: number[];
		value: [number, number];
		index: number;
	} {
		const extra_string = extra_to_string(this._kinds[index]);
		const extras_object = extra_string
			? { [extra_string]: this._extras[index] }
			: {};

		const _children = [];

		// Walk sibling chain to get all direct children
		let child = this._children_starts[index];
		while (child !== 0xffffffff && this._parents[child] === index) {
			_children.push(child);
			child = this._next_siblings[child];
		}

		return {
			kind: kind_to_string(this._kinds[index]),
			start: this.starts[index],
			end: this._ends[index],
			metadata: {
				...this.metadata_at(index),
				...extras_object,
			},
			parent: this._parents[index] === 0xffffffff ? null : this._parents[index],
			next:
				this._next_siblings[index] === 0xffffffff
					? null
					: this._next_siblings[index],
			prev:
				this.prev_siblings[index] === 0xffffffff
					? null
					: this.prev_siblings[index],
			value: [this._value_starts[index], this._value_ends[index]],
			children: _children,
			index: index,
		};
	}
}

/** collects indices for parse errors encountered during tokenization. */
export class error_collector {
	private capacity: number;
	private indices: Uint32Array;
	private _size: number;

	/**
	 * create a collector that records error indices encountered while parsing.
	 * @param initial_capacity requested starting capacity for error indices.
	 */
	constructor(initial_capacity = DEFAULT_ERROR_CAPACITY) {
		const capacity = next_power_of_two(initial_capacity);
		this.capacity = capacity;
		this.indices = new Uint32Array(capacity);
		this._size = 0;
	}

	/** clear previously stored errors. */
	reset(): void {
		this._size = 0;
	}

	/** number of errors recorded so far. */
	get size(): number {
		return this._size;
	}

	/**
	 * append an error position to the collector, growing storage as needed.
	 * @param index offset in the source string where the error occurred.
	 */
	push(index: number): void {
		const next_index = this._size;
		if (next_index >= this.capacity) {
			this.grow();
		}

		this.indices[next_index] = index >>> 0;
		this._size = next_index + 1;
	}

	/**
	 * get the stored error index at the given position.
	 * @param position position within the collector.
	 */
	at(position: number): number {
		return this.indices[position];
	}

	/** create a view over the recorded errors. */
	slice(): Uint32Array {
		return this.indices.subarray(0, this._size);
	}

	/** double the backing storage when capacity is exhausted. */
	private grow(): void {
		const next = this.capacity << 1;
		const next_indices = new Uint32Array(next);
		next_indices.set(this.indices);
		this.capacity = next;
		this.indices = next_indices;
	}
}
