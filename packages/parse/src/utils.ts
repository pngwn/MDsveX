/** Default number of token entries to preallocate. */
const DEFAULT_TOKEN_CAPACITY = 128;

/** Default number of error entries to preallocate. */
const DEFAULT_ERROR_CAPACITY = 32;

/** Default node capacity for the arena allocator. */
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
}

/**
 * Calculate the next power-of-two capacity for typed array storage.
 * @param value Minimum desired capacity.
 * @returns Smallest power of two greater than or equal to `value`.
 */
function next_power_of_two(value: number): number {
	let result = 1;
	while (result < value) {
		result <<= 1;
	}
	return result;
}

/**
 * Convert a node kind to a string
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
	}
};

/**
 * Convert a node extra to a string
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
 * Buffer that stores node metadata with typed arrays.
 */
export class node_buffer {
	private capacity: number;
	private kinds: Uint8Array;
	private starts: Uint32Array;
	private ends: Uint32Array;
	private extras: Uint16Array;
	private value_starts: Uint32Array;
	private value_ends: Uint32Array;
	private has_metadata: Uint8Array;
	private metadata: Map<number, any>;
	private parents: Uint32Array;
	private next_siblings: Uint32Array;
	private prev_siblings: Uint32Array;
	private children_starts: Uint32Array;
	private pending_nodes: Uint32Array;

	private kind_map: Map<node_kind, number[]> = new Map();

	private _size: number;

	/**
	 * Create a buffer that stores token metadata with typed arrays.
	 * @param initial_capacity Requested starting capacity for tokens.
	 */
	constructor(initial_capacity = DEFAULT_TOKEN_CAPACITY) {
		const capacity = next_power_of_two(initial_capacity);
		this.capacity = capacity;
		this.kinds = new Uint8Array(capacity);
		this.starts = new Uint32Array(capacity);
		this.ends = new Uint32Array(capacity);
		this.extras = new Uint16Array(capacity);
		this.value_starts = new Uint32Array(capacity);
		this.value_ends = new Uint32Array(capacity);
		this.has_metadata = new Uint8Array(Math.max(1, capacity >> 3));
		this.metadata = new Map();
		this.parents = new Uint32Array(capacity);
		this.next_siblings = new Uint32Array(capacity);
		this.prev_siblings = new Uint32Array(capacity);
		this.children_starts = new Uint32Array(capacity);
		this.pending_nodes = new Uint32Array(capacity);

		let kinds = [
			node_kind.text,
			node_kind.heading,
			node_kind.code_fence,
			node_kind.paragraph,
			node_kind.root,
			node_kind.code_span,
			node_kind.emphasis,
			node_kind.strong_emphasis,
			node_kind.thematic_break,
			node_kind.line_break,
			node_kind.link,
			node_kind.image,
			node_kind.block_quote,
		];

		this._size = 0;

		for (let i = 0; i < kinds.length; i++) {
			this.kind_map.set(kinds[i], []);
		}

		this.push(node_kind.root, 0);
	}

	/** Clear previously pushed tokens without reallocating storage. */
	reset(): void {
		this._size = 0;
	}

	/** Number of tokens currently stored. */
	get size(): number {
		return this._size;
	}

	/**
	 * Push a token descriptor into the buffer.
	 * @param kind Token category.
	 * @param cursor cursor position
	 * @param parent Index of the parent node, or -1 for root.
	 * @param extra Extra metadata stored alongside the token.
	 * @param metadata Optional metadata associated with the node.
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

		this.kinds[index] = kind;
		this.starts[index] = cursor >>> 0;
		this.ends[index] = 0xffffffff;
		this.extras[index] = extra & 0xffff;
		this._size = index + 1;
		this.parents[index] = parent;
		this.next_siblings[index] = 0xffffffff;
		this.prev_siblings[index] = 0xffffffff;
		this.children_starts[index] = 0xffffffff;

		this.add_kind(index, kind);

		if (parent !== 0xffffffff) {
			// If this is the first child of the parent
			if (this.children_starts[parent] === 0xffffffff) {
				this.children_starts[parent] = index;
			} else {
				// Find the last child of this parent and link to it
				let last_child = this.children_starts[parent];
				while (
					this.next_siblings[last_child] !== 0xffffffff &&
					this.parents[this.next_siblings[last_child]] === parent
				) {
					last_child = this.next_siblings[last_child];
				}
				if (last_child !== index) {
					this.next_siblings[last_child] = index;
					this.prev_siblings[index] = last_child;
				}
			}
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
		const index = this._size;
		if (index >= this.capacity) {
			this.grow();
		}

		this.push(kind, cursor, parent, extra, metadata);
		this.pending_nodes[index] = 1;
		return index;
	}

	commit_node(index: number): void {
		this.pending_nodes[index] = 0;
	}

	get_pending(): number[] {
		const result: number[] = [];
		for (let i = 0; i < this._size; i++) {
			if (this.pending_nodes[i] !== 0) {
				result.push(i);
			}
		}
		return result;
	}

	handle_repair(index: number): void {
		const parent = this.parents[index];
		const first_child = this.children_starts[index];

		// Convert to text
		this.set_kind(index, node_kind.text);

		if (first_child === 0xffffffff) {
			// No children, nothing to reparent
			this.children_starts[index] = 0xffffffff;
			return;
		}

		// Walk sibling chain and reparent ONLY direct children
		let child = first_child;
		let last_child = first_child;

		while (child !== 0xffffffff && this.parents[child] === index) {
			this.parents[child] = parent;
			last_child = child;
			child = this.next_siblings[child];
		}

		// If exactly one child and it's text, merge the delimiter into it
		if (last_child === first_child && this.kinds[first_child] === node_kind.text) {
			this.value_starts[index] = this.starts[index];
			this.value_ends[index] = this.ends[first_child];
			this.ends[index] = this.ends[first_child];

			// Skip the child in the sibling chain
			this.next_siblings[index] = this.next_siblings[first_child];
			if (this.next_siblings[first_child] !== 0xffffffff) {
				this.prev_siblings[this.next_siblings[first_child]] = index;
			}

			this.children_starts[index] = 0xffffffff;
			return;
		}

		// Now insert pending node as sibling before first_child
		// Save what was first_child's prev (should be null if first child)
		const first_child_prev = this.prev_siblings[first_child];

		// Link: prev <- pending_node <-> first_child
		this.next_siblings[index] = first_child;
		this.prev_siblings[first_child] = index;

		if (first_child_prev !== 0xffffffff) {
			this.next_siblings[first_child_prev] = index;
			this.prev_siblings[index] = first_child_prev;
		}

		// Update parent's children tracking
		if (this.children_starts[parent] === index) {
			// Pending node was first child, keep it as first
			// (it's still first, just converted to text)
		}

		// Clear pending node's children references
		this.children_starts[index] = 0xffffffff;

		this.value_starts[index] = this.starts[index];
		this.value_ends[index] = this.value_starts[first_child];
		this.ends[index] = this.value_ends[index];
	}

	repair(): void {
		const pending_nodes = this.pending_nodes.forEach((node, index) => {
			if (node !== 0) {
				this.handle_repair(index);
			}
		});
	}

	pop(): void {
		this._size -= 1;
	}

	/**
	 * Set the parent kind of the node at the given index
	 * @param index index of the node whose parent kind to update
	 * @param kind new parent kind
	 */
	add_kind(index: number, kind: node_kind): void {
		this.kind_map.get(kind)?.push(index);
	}

	set_parent_kind(index: number, kind: node_kind): void {
		const parent_index = this.parents[index];
		if (parent_index !== 0xffffffff) {
			this.kinds[parent_index] = kind;
		}
	}

	get_kinds(index: number): number[] {
		return this.kind_map.get(index) || [];
	}

	/**
	 * Get the token kind recorded at the supplied index.
	 * @param index Token index.
	 */
	kind_at(index: number): node_kind {
		return this.kinds[index] as node_kind;
	}

	/**
	 * Set the kind of the node at the given index
	 * @param index index of the node whose kind to update
	 * @param kind new kind
	 */
	set_kind(index: number, kind: node_kind): void {
		this.kinds[index] = kind;
	}

	/**
	 * Set the extra of the node at the given index
	 * @param index index of the node whose extra to update
	 * @param extra new extra
	 */
	set_extra(index: number, extra: number): void {
		this.extras[index] = extra & 0xffff;
	}

	/**
	 * Set the end position of the node at the given index
	 * @param index index of the node whose end position to update
	 * @param end new end position
	 */
	set_end(index: number, end: number): void {
		this.ends[index] = end >>> 0;
	}

	gently_set_end(index: number, end: number): void {
		if (this.ends[index] !== 0xffffffff) return;
		this.ends[index] = end >>> 0;
	}

	gently_set_value_end(index: number, end: number): void {
		if (this.value_ends[index] !== 0xffffffff) return;
		this.value_ends[index] = end >>> 0;
	}

	/** Double the backing storage when capacity is exhausted. */
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
		const next_pending_nodes = new Uint32Array(next);
		const next_has_metadata = new Uint8Array(Math.max(1, next >> 3));

		next_kinds.set(this.kinds);
		next_starts.set(this.starts);
		next_ends.set(this.ends);
		next_extras.set(this.extras);
		next_value_starts.set(this.value_starts);
		next_value_ends.set(this.value_ends);
		next_parents.set(this.parents);
		next_next_siblings.set(this.next_siblings);
		next_prev_siblings.set(this.prev_siblings);
		next_children_starts.set(this.children_starts);
		next_pending_nodes.set(this.pending_nodes);
		next_has_metadata.set(this.has_metadata);

		this.capacity = next;
		this.kinds = next_kinds;
		this.starts = next_starts;
		this.ends = next_ends;
		this.extras = next_extras;
		this.value_starts = next_value_starts;
		this.value_ends = next_value_ends;
		this.parents = next_parents;
		this.next_siblings = next_next_siblings;
		this.prev_siblings = next_prev_siblings;
		this.children_starts = next_children_starts;
		this.pending_nodes = next_pending_nodes;
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
		this.value_starts[index] = value_start;
		this.value_ends[index] = value_end;
	}

	set_value_start(index: number, value_start: number): void {
		this.value_starts[index] = value_start;
	}

	set_value_end(index: number, value_end: number): void {
		this.value_ends[index] = value_end;
	}

	/**
	 * Get the node at the given index or the root node if no index is provided
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
		const extra_string = extra_to_string(this.kinds[index]);
		const extras_object = extra_string
			? { [extra_string]: this.extras[index] }
			: {};

		const _children = [];

		// Walk sibling chain to get all direct children
		let child = this.children_starts[index];
		while (child !== 0xffffffff && this.parents[child] === index) {
			_children.push(child);
			child = this.next_siblings[child];
		}

		return {
			kind: kind_to_string(this.kinds[index]),
			start: this.starts[index],
			end: this.ends[index],
			metadata: {
				...this.metadata_at(index),
				...extras_object,
			},
			parent: this.parents[index] === 0xffffffff ? null : this.parents[index],
			next:
				this.next_siblings[index] === 0xffffffff
					? null
					: this.next_siblings[index],
			prev:
				this.prev_siblings[index] === 0xffffffff
					? null
					: this.prev_siblings[index],
			value: [this.value_starts[index], this.value_ends[index]],
			children: _children,
			index: index,
		};
	}
}

/** Collects indices for parse errors encountered during tokenization. */
export class error_collector {
	private capacity: number;
	private indices: Uint32Array;
	private _size: number;

	/**
	 * Create a collector that records error indices encountered while parsing.
	 * @param initial_capacity Requested starting capacity for error indices.
	 */
	constructor(initial_capacity = DEFAULT_ERROR_CAPACITY) {
		const capacity = next_power_of_two(initial_capacity);
		this.capacity = capacity;
		this.indices = new Uint32Array(capacity);
		this._size = 0;
	}

	/** Clear previously stored errors. */
	reset(): void {
		this._size = 0;
	}

	/** Number of errors recorded so far. */
	get size(): number {
		return this._size;
	}

	/**
	 * Append an error position to the collector, growing storage as needed.
	 * @param index Offset in the source string where the error occurred.
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
	 * Get the stored error index at the given position.
	 * @param position Position within the collector.
	 */
	at(position: number): number {
		return this.indices[position];
	}

	/** Create a view over the recorded errors. */
	slice(): Uint32Array {
		return this.indices.subarray(0, this._size);
	}

	/** Double the backing storage when capacity is exhausted. */
	private grow(): void {
		const next = this.capacity << 1;
		const next_indices = new Uint32Array(next);
		next_indices.set(this.indices);
		this.capacity = next;
		this.indices = next_indices;
	}
}
