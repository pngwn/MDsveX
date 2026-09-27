/** default number of token entries to preallocate. */
const DEFAULT_TOKEN_CAPACITY = 128;

/**
 * smallest node capacity. a carve this size costs well under 2 kb of slab,
 * which is cheaper than the resize a slightly larger document would need.
 */
const MIN_NODE_CAPACITY = 32;

/** size of each shared slab that small node buffers are carved from. */
const SLAB_BYTES = 65536;

/**
 * largest node buffer carved from a slab, larger ones get their own
 * arraybuffer. it caps the tail a full slab can waste at an eighth.
 */
const SLAB_MAX_CARVE = 8192;

/** largest reset cleared by plain stores rather than a fill call per field. */
const RESET_LOOP_MAX = 32;

/** number of u32 fields carved out of the shared node arraybuffer. */
const U32_FIELDS = 10;

/** placeholders so every typed array field is stored by the constructor. */
const EMPTY_U8 = new Uint8Array(0);
const EMPTY_U16 = new Uint16Array(0);
const EMPTY_U32 = new Uint32Array(0);

/**
 * the slab small node buffers are carved from. a region is handed out once
 * and never reused, so every carve starts zeroed like a fresh arraybuffer and
 * costs thirteen views instead of a backing store. the trade-off is retention:
 * a live small buffer keeps its whole slab alive, at most 64 kb each.
 */
let slab = new ArrayBuffer(0);
let slab_used = SLAB_BYTES;

/** default number of error entries to preallocate. */
const DEFAULT_ERROR_CAPACITY = 32;

export const enum NodeKind {
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
export const kind_to_string = (kind: NodeKind): string => {
	switch (kind) {
		case NodeKind.root:
			return 'root';
		case NodeKind.text:
			return 'text';
		case NodeKind.html:
			return 'html';
		case NodeKind.heading:
			return 'heading';
		case NodeKind.mustache:
			return 'mustache';
		case NodeKind.code_fence:
			return 'code_fence';
		case NodeKind.line_break:
			return 'line_break';
		case NodeKind.paragraph:
			return 'paragraph';
		case NodeKind.code_span:
			return 'code_span';
		case NodeKind.emphasis:
			return 'emphasis';
		case NodeKind.strong_emphasis:
			return 'strong_emphasis';
		case NodeKind.thematic_break:
			return 'thematic_break';
		case NodeKind.link:
			return 'link';
		case NodeKind.image:
			return 'image';
		case NodeKind.block_quote:
			return 'block_quote';
		case NodeKind.list:
			return 'list';
		case NodeKind.list_item:
			return 'list_item';
		case NodeKind.hard_break:
			return 'hard_break';
		case NodeKind.soft_break:
			return 'soft_break';
		case NodeKind.strikethrough:
			return 'strikethrough';
		case NodeKind.superscript:
			return 'superscript';
		case NodeKind.subscript:
			return 'subscript';
		case NodeKind.table:
			return 'table';
		case NodeKind.table_header:
			return 'table_header';
		case NodeKind.table_row:
			return 'table_row';
		case NodeKind.table_cell:
			return 'table_cell';
		case NodeKind.html_comment:
			return 'html_comment';
		case NodeKind.svelte_tag:
			return 'svelte_tag';
		case NodeKind.svelte_block:
			return 'svelte_block';
		case NodeKind.svelte_branch:
			return 'svelte_branch';
		case NodeKind.directive_inline:
			return 'directive_inline';
		case NodeKind.directive_leaf:
			return 'directive_leaf';
		case NodeKind.directive_container:
			return 'directive_container';
		case NodeKind.frontmatter:
			return 'frontmatter';
		case NodeKind.import_statement:
			return 'import_statement';
	}
};

/** reverse mapping from string name to numeric NodeKind. built once at module load. */
const _string_to_kind = new Map<string, NodeKind>();
for (let i = 0; i <= 34; i++) {
	_string_to_kind.set(kind_to_string(i as NodeKind), i as NodeKind);
}

/**
 * convert a string name to a NodeKind value.
 * @param name node kind name (e.g. 'heading', 'paragraph').
 * @returns the numeric kind, or undefined if unknown.
 */
export const string_to_kind = (name: string): NodeKind | undefined => {
	return _string_to_kind.get(name);
};

/**
 * convert a node extra to a string
 * @param kind node extra
 * @returns string
 */
const extra_to_string = (kind: NodeKind): string | undefined => {
	switch (kind) {
		case NodeKind.heading:
			return 'depth';
	}
};

/**
 * build a one-key metadata object. a computed-key literal goes through a
 * slow generic define, so the keys the parser emits get constant-key
 * literals. unknown keys keep the computed literal, which also keeps
 * `__proto__` an own property.
 */
export function make_meta(key: string, value: any): Record<string, any> {
	switch (key) {
		case 'tag':
			return { tag: value };
		case 'href':
			return { href: value };
		case 'src':
			return { src: value };
		case 'ordered':
			return { ordered: value };
		case 'info_start':
			return { info_start: value };
		case 'name':
			return { name: value };
		case 'alignments':
			return { alignments: value };
		case 'attributes':
			return { attributes: value };
		case 'self_closing':
			return { self_closing: value };
		case 'title':
			return { title: value };
		case 'start':
			return { start: value };
		case 'tight':
			return { tight: value };
		case 'info_end':
			return { info_end: value };
		case 'args':
			return { args: value };
		case 'col_count':
			return { col_count: value };
		default:
			return { [key]: value };
	}
}

/**
 * add or overwrite one key on an existing metadata object. named stores
 * keep each site monomorphic where a keyed store would go megamorphic
 * across every node shape.
 */
export function merge_meta(
	meta: Record<string, any>,
	key: string,
	value: any
): void {
	switch (key) {
		case 'attributes':
			meta.attributes = value;
			return;
		case 'start':
			meta.start = value;
			return;
		case 'tight':
			meta.tight = value;
			return;
		case 'title':
			meta.title = value;
			return;
		case 'self_closing':
			meta.self_closing = value;
			return;
		case 'info_end':
			meta.info_end = value;
			return;
		case 'col_count':
			meta.col_count = value;
			return;
		case 'args':
			meta.args = value;
			return;
		case 'tag':
			meta.tag = value;
			return;
		case 'href':
			meta.href = value;
			return;
		case 'src':
			meta.src = value;
			return;
		case 'ordered':
			meta.ordered = value;
			return;
		case 'info_start':
			meta.info_start = value;
			return;
		case 'name':
			meta.name = value;
			return;
		case 'alignments':
			meta.alignments = value;
			return;
		default:
			meta[key] = value;
	}
}

/**
 * buffer that stores node metadata with typed arrays.
 */
export class NodeBuffer {
	// every field is initialized here rather than only in alloc_fields,
	// because v8 sizes the in-object slots from the stores it sees in the
	// constructor body and would otherwise spill the tail fields out of line
	private capacity = 0;
	/** @internal exposed for cursor access. do not mutate externally. */
	_kinds: Uint8Array = EMPTY_U8;
	/** @internal exposed for cursor access. do not mutate externally. */
	_starts: Uint32Array = EMPTY_U32;
	/** @internal */
	_ends: Uint32Array = EMPTY_U32;
	/** @internal */
	_extras: Uint16Array = EMPTY_U16;
	/** @internal */
	_value_starts: Uint32Array = EMPTY_U32;
	/** @internal */
	_value_ends: Uint32Array = EMPTY_U32;
	private has_metadata: Uint8Array = EMPTY_U8;
	private metadata: Map<number, any> = new Map();
	/** @internal pre-materialized text strings (used by wiretreebuilder). index -> string. */
	_strings: (string | undefined)[] = [];
	/** @internal */
	_parents: Uint32Array = EMPTY_U32;
	/** @internal */
	_next_siblings: Uint32Array = EMPTY_U32;
	/** @internal */
	_prev_siblings: Uint32Array = EMPTY_U32;
	/** @internal */
	_children_starts: Uint32Array = EMPTY_U32;
	/** @internal */
	_children_ends: Uint32Array = EMPTY_U32;
	/** @internal */
	_pending_nodes: Uint32Array = EMPTY_U32;

	/** @internal slots in use, read by TreeBuilder to check ids against indices. */
	_size = 0;

	/**
	 * create a buffer that stores token metadata with typed arrays.
	 * @param initial_capacity requested starting capacity for tokens.
	 */
	constructor(initial_capacity = DEFAULT_TOKEN_CAPACITY) {
		// the comparison also sends a nan capacity to the floor
		this.alloc_fields(
			next_power_of_two(
				initial_capacity > MIN_NODE_CAPACITY
					? initial_capacity
					: MIN_NODE_CAPACITY
			)
		);
		this.push(NodeKind.root, 0);
	}

	/**
	 * point every field at fresh zeroed storage of the given capacity. all
	 * fields share one region, carved from the current slab when it is small
	 * and from a dedicated arraybuffer otherwise.
	 */
	private alloc_fields(capacity: number): void {
		// capacity is a power of two of at least MIN_NODE_CAPACITY, so the
		// metadata bitset is a whole number of bytes. the ten u32 fields come
		// first, then u16, then u8, so each view starts on a multiple of its
		// element size, and regions are rounded to 8 bytes to keep that true
		// for the next carve
		const u32 = capacity << 2;
		const u16_offset = u32 * U32_FIELDS;
		const u8_offset = u16_offset + (capacity << 1);
		const bytes = (u8_offset + capacity + (capacity >> 3) + 7) & ~7;
		let buffer: ArrayBuffer;
		let base = 0;
		if (bytes <= SLAB_MAX_CARVE) {
			if (slab_used + bytes > SLAB_BYTES) {
				slab = new ArrayBuffer(SLAB_BYTES);
				slab_used = 0;
			}
			buffer = slab;
			base = slab_used;
			slab_used = base + bytes;
		} else {
			buffer = new ArrayBuffer(bytes);
		}
		this.capacity = capacity;
		this._kinds = new Uint8Array(buffer, base + u8_offset, capacity);
		this._starts = new Uint32Array(buffer, base, capacity);
		this._ends = new Uint32Array(buffer, base + u32, capacity);
		this._extras = new Uint16Array(buffer, base + u16_offset, capacity);
		this._value_starts = new Uint32Array(buffer, base + u32 * 2, capacity);
		this._value_ends = new Uint32Array(buffer, base + u32 * 3, capacity);
		this.has_metadata = new Uint8Array(
			buffer,
			base + u8_offset + capacity,
			capacity >> 3
		);
		this._parents = new Uint32Array(buffer, base + u32 * 4, capacity);
		this._next_siblings = new Uint32Array(buffer, base + u32 * 5, capacity);
		this._prev_siblings = new Uint32Array(buffer, base + u32 * 6, capacity);
		this._children_starts = new Uint32Array(buffer, base + u32 * 7, capacity);
		this._children_ends = new Uint32Array(buffer, base + u32 * 8, capacity);
		this._pending_nodes = new Uint32Array(buffer, base + u32 * 9, capacity);
	}

	/** clear previously pushed tokens without reallocating storage. */
	reset(): void {
		const size = this._size;
		if (size > RESET_LOOP_MAX) {
			this._value_starts.fill(0, 0, size);
			this._value_ends.fill(0, 0, size);
			this._pending_nodes.fill(0, 0, size);
			this.has_metadata.fill(0, 0, (size + 7) >> 3);
		} else if (size !== 0) {
			// a builtin call per field costs more than a small document's stores
			const value_starts = this._value_starts;
			const value_ends = this._value_ends;
			const pending = this._pending_nodes;
			for (let i = 0; i < size; i++) {
				value_starts[i] = 0;
				value_ends[i] = 0;
				pending[i] = 0;
			}
			const has_metadata = this.has_metadata;
			const bytes = (size + 7) >> 3;
			for (let i = 0; i < bytes; i++) has_metadata[i] = 0;
		}
		// clear and a length store are runtime calls even when empty
		if (this.metadata.size !== 0) this.metadata.clear();
		if (this._strings.length !== 0) this._strings.length = 0;
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
		kind: NodeKind,
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
		this._starts[index] = cursor >>> 0;
		this._ends[index] = 0xffffffff;
		this._extras[index] = extra & 0xffff;
		this._size = index + 1;
		this._parents[index] = parent;
		this._next_siblings[index] = 0xffffffff;
		this._prev_siblings[index] = 0xffffffff;
		this._children_starts[index] = 0xffffffff;
		this._children_ends[index] = 0xffffffff;

		if (parent !== 0xffffffff) {
			const last = this._children_ends[parent];
			if (last === 0xffffffff) {
				// first child
				this._children_starts[parent] = index;
			} else {
				// append after last child, o(1)
				this._next_siblings[last] = index;
				this._prev_siblings[index] = last;
			}
			this._children_ends[parent] = index;
		}

		if (metadata !== undefined) {
			this.metadata.set(index, metadata);
			// bitmask for metadata
			this.has_metadata[index >> 3] |= 1 << (index & 7);
		}

		return index;
	}

	push_pending(
		kind: NodeKind,
		cursor: number,
		parent = 0xffffffff,
		extra = 0,
		metadata?: any
	): number {
		const index = this.push(kind, cursor, parent, extra, metadata);
		this._pending_nodes[index] = 1;
		return index;
	}

	/**
	 * allocate a node slot without linking it into any parent's child list.
	 * the caller is responsible for setting _parents and linking into the
	 * sibling chain manually. used by plugin structural mutations (prepend).
	 * @param kind node kind.
	 * @param cursor source position.
	 * @param extra kind-specific extra value.
	 * @param metadata optional metadata.
	 * @returns buffer index of the new node.
	 */
	push_unlinked(
		kind: NodeKind,
		cursor: number,
		extra = 0,
		metadata?: any
	): number {
		const index = this._size;
		if (index >= this.capacity) {
			this.grow();
		}

		this._kinds[index] = kind;
		this._starts[index] = cursor >>> 0;
		this._ends[index] = 0xffffffff;
		this._extras[index] = extra & 0xffff;
		this._size = index + 1;
		this._parents[index] = 0xffffffff;
		this._next_siblings[index] = 0xffffffff;
		this._prev_siblings[index] = 0xffffffff;
		this._children_starts[index] = 0xffffffff;
		this._children_ends[index] = 0xffffffff;

		if (metadata !== undefined) {
			this.metadata.set(index, metadata);
			this.has_metadata[index >> 3] |= 1 << (index & 7);
		}

		return index;
	}

	/**
	 * insert a new wrapper node between a parent and all its current children.
	 * the new node becomes the sole child of parent, and all prior children
	 * become children of the new wrapper.
	 *
	 * @param parent_idx buffer index of the parent node.
	 * @param new_kind kind for the wrapper node.
	 * @param extra kind-specific extra value for the wrapper.
	 * @param metadata optional metadata for the wrapper.
	 * @returns buffer index of the new wrapper node.
	 */
	wrap_children(
		parent_idx: number,
		new_kind: NodeKind,
		extra = 0,
		metadata?: any
	): number {
		const first_child = this._children_starts[parent_idx];
		const last_child = this._children_ends[parent_idx];

		// detach children from parent
		this._children_starts[parent_idx] = 0xffffffff;
		this._children_ends[parent_idx] = 0xffffffff;

		// push wrapper as sole child of parent (auto-links via push)
		const wrapper_idx = this.push(new_kind, 0, parent_idx, extra, metadata);

		// reattach old children to wrapper
		if (first_child !== 0xffffffff) {
			this._children_starts[wrapper_idx] = first_child;
			this._children_ends[wrapper_idx] = last_child;

			// update parent pointers on all moved children
			let child = first_child;
			while (child !== 0xffffffff && this._parents[child] === parent_idx) {
				this._parents[child] = wrapper_idx;
				child = this._next_siblings[child];
			}
		}

		return wrapper_idx;
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
	 * all repair logic lives here, treebuilder and wiretreebuilder
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
		const kind = this._kinds[index] as NodeKind;
		const parent_kind =
			parent !== 0xffffffff ? (this._kinds[parent] as NodeKind) : undefined;

		// tight-list speculation repair
		// a pending paragraph inside a list_item represents the "loose"
		// wrapper that tight lists don't need. revoking it simply drops
		// the wrapper and reparents children to the list_item.
		if (kind === NodeKind.paragraph && parent_kind === NodeKind.list_item) {
			this.unwrap_node(index);
			return;
		}

		// block-level repair
		// if the parent is a block container, the revoked node (typically an
		// unclosed html block) is replaced by a paragraph containing the literal
		// open-tag text. children that were parsed inside are reparented to the
		// grandparent so already-recognized structure is preserved.
		if (
			parent_kind === NodeKind.root ||
			parent_kind === NodeKind.block_quote ||
			parent_kind === NodeKind.list_item
		) {
			const start = this._starts[index];
			let end: number;

			if (delimiter_text !== undefined) {
				// wire path: delimiter_text is the literal open-tag source
				end = start + delimiter_text.length;
			} else {
				// source path: prefer the node's recorded end; fall back to the
				// nearest meaningful child position so we never collapse to start.
				end = this._ends[index];
				if (end === 0xffffffff) {
					let child = this._children_starts[index];
					while (child !== 0xffffffff && this._parents[child] === index) {
						if (this._kinds[child] === NodeKind.line_break) {
							const lb_start = this._starts[child];
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

			// reparent children to the grandparent so trailing parsed content
			// (e.g. block elements that followed the unclosed open tag) is kept.
			const child_chain = this._children_starts[index];
			this._children_starts[index] = 0xffffffff;
			this._children_ends[index] = 0xffffffff;

			// convert this node into a paragraph holding the literal open-tag text.
			this.set_kind(index, NodeKind.paragraph);
			this.metadata.delete(index);
			this._ends[index] = end;

			const text_idx = this.push(NodeKind.text, start, index);
			this._value_starts[text_idx] = start;
			this._value_ends[text_idx] = end;
			this._ends[text_idx] = end;
			if (delimiter_text !== undefined) {
				this._strings[text_idx] = delimiter_text;
			}

			// splice the original children in after the rewritten node so they
			// appear as siblings under the parent.
			if (child_chain !== 0xffffffff) {
				const original_next = this._next_siblings[index];
				let last_child = child_chain;
				let scan = child_chain;
				while (scan !== 0xffffffff && this._parents[scan] === index) {
					this._parents[scan] = parent;
					last_child = scan;
					scan = this._next_siblings[scan];
				}
				this._next_siblings[last_child] = original_next;
				if (original_next !== 0xffffffff) {
					this._prev_siblings[original_next] = last_child;
				} else if (
					parent !== 0xffffffff &&
					this._children_ends[parent] === index
				) {
					this._children_ends[parent] = last_child;
				}
				this._next_siblings[index] = child_chain;
				this._prev_siblings[child_chain] = index;
			}
			return;
		}

		// inline repair
		const first_child = this._children_starts[index];

		// convert the wrapper to a plain text node whose value is the
		// literal delimiter (e.g. "~" for subscript, "<div>" for an
		// inline html open tag). any children stay in the document,
		// they are reparented to the grandparent so the streamed
		// content is preserved after revocation.
		this.set_kind(index, NodeKind.text);

		if (delimiter_text !== undefined) {
			this._strings[index] = delimiter_text;
			const start = this._starts[index];
			const end = start + delimiter_text.length;
			this._value_starts[index] = start;
			this._value_ends[index] = end;
			this._ends[index] = end;

			if (first_child === 0xffffffff) {
				this._children_starts[index] = 0xffffffff;
				this._children_ends[index] = 0xffffffff;
				return;
			}

			// reparent children and splice them in after this text node.
			let child = first_child;
			let last_child = first_child;
			while (child !== 0xffffffff && this._parents[child] === index) {
				this._parents[child] = parent;
				last_child = child;
				child = this._next_siblings[child];
			}
			const node_next = this._next_siblings[index];
			this._next_siblings[index] = first_child;
			this._prev_siblings[first_child] = index;
			if (node_next !== 0xffffffff && this._parents[node_next] === parent) {
				this._next_siblings[last_child] = node_next;
				this._prev_siblings[node_next] = last_child;
			} else {
				this._next_siblings[last_child] = 0xffffffff;
			}
			if (this._children_ends[parent] === index) {
				this._children_ends[parent] = last_child;
			}
			this._children_starts[index] = 0xffffffff;
			this._children_ends[index] = 0xffffffff;
			return;
		}

		// source-based fallback, derive the delimiter byte range from
		// the node's own start offset.
		if (first_child === 0xffffffff) {
			this._children_starts[index] = 0xffffffff;
			this._children_ends[index] = 0xffffffff;
			this._value_starts[index] = this._starts[index];
			if (this._ends[index] === 0xffffffff) {
				this._value_ends[index] = this._starts[index] + 1;
				this._ends[index] = this._starts[index] + 1;
			} else {
				this._value_ends[index] = this._ends[index];
			}
			return;
		}

		// walk sibling chain and reparent only direct children
		let child = first_child;
		let last_child = first_child;

		while (child !== 0xffffffff && this._parents[child] === index) {
			this._parents[child] = parent;
			last_child = child;
			child = this._next_siblings[child];
		}

		// if exactly one child and it's text, merge the delimiter into it
		if (
			last_child === first_child &&
			this._kinds[first_child] === NodeKind.text
		) {
			this._value_starts[index] = this._starts[index];
			this._value_ends[index] = this._ends[first_child];
			this._ends[index] = this._ends[first_child];

			// skip the child in the sibling chain
			this._next_siblings[index] = this._next_siblings[first_child];
			if (this._next_siblings[first_child] !== 0xffffffff) {
				this._prev_siblings[this._next_siblings[first_child]] = index;
			}

			this._children_starts[index] = 0xffffffff;
			this._children_ends[index] = 0xffffffff;
			return;
		}

		// insert converted node as sibling before first_child, reparent rest
		const first_child_prev = this._prev_siblings[first_child];

		this._next_siblings[index] = first_child;
		this._prev_siblings[first_child] = index;

		if (first_child_prev !== 0xffffffff) {
			this._next_siblings[first_child_prev] = index;
			this._prev_siblings[index] = first_child_prev;
		}

		if (this._children_ends[parent] === index) {
			this._children_ends[parent] = last_child;
		}

		// clear children references
		this._children_starts[index] = 0xffffffff;
		this._children_ends[index] = 0xffffffff;

		this._value_starts[index] = this._starts[index];
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
	 * the node is effectively "unwrapped", its children take its place
	 * in the parent's child list.
	 */
	unwrap_node(index: number): void {
		const parent = this._parents[index];
		const first_child = this._children_starts[index];

		if (first_child === 0xffffffff) {
			// no children, remove from sibling chain
			const prev_sib = this._prev_siblings[index];
			const next_sib = this._next_siblings[index];
			if (prev_sib !== 0xffffffff) {
				this._next_siblings[prev_sib] = next_sib;
			} else if (parent !== 0xffffffff) {
				this._children_starts[parent] = next_sib;
			}
			if (next_sib !== 0xffffffff) {
				this._prev_siblings[next_sib] = prev_sib;
			}
			// update parent's last child if we removed the tail
			if (parent !== 0xffffffff && this._children_ends[parent] === index) {
				this._children_ends[parent] = prev_sib; // 0xffffffff if was only child
			}
			return;
		}

		// reparent all children and find last child
		let child = first_child;
		let last_child = first_child;
		while (child !== 0xffffffff && this._parents[child] === index) {
			this._parents[child] = parent;
			last_child = child;
			child = this._next_siblings[child];
		}

		// splice children into parent's child list where this node was
		const prev_sib = this._prev_siblings[index];
		const next_sib =
			this._next_siblings[last_child] !== 0xffffffff &&
			this._parents[this._next_siblings[last_child]] === index
				? 0xffffffff
				: this._next_siblings[last_child];

		// the actual next sibling of the unwrapped node (not of last_child)
		const node_next = this._next_siblings[index];

		if (prev_sib !== 0xffffffff) {
			this._next_siblings[prev_sib] = first_child;
			this._prev_siblings[first_child] = prev_sib;
		} else if (parent !== 0xffffffff) {
			this._children_starts[parent] = first_child;
			this._prev_siblings[first_child] = 0xffffffff;
		}

		// link last child to the unwrapped node's next sibling
		if (node_next !== 0xffffffff && node_next !== first_child) {
			this._next_siblings[last_child] = node_next;
			this._prev_siblings[node_next] = last_child;
		} else {
			this._next_siblings[last_child] = 0xffffffff;
		}

		// update parent's last child if we replaced the tail
		if (parent !== 0xffffffff && this._children_ends[parent] === index) {
			this._children_ends[parent] = last_child;
		}

		// clear the unwrapped node's links
		this._children_starts[index] = 0xffffffff;
		this._children_ends[index] = 0xffffffff;
	}

	set_parent_kind(index: number, kind: NodeKind): void {
		const parent_index = this._parents[index];
		if (parent_index !== 0xffffffff) {
			this._kinds[parent_index] = kind;
		}
	}

	/** return indices of all nodes matching the given kind (lazy scan). */
	get_kinds(kind: NodeKind): number[] {
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
	kind_at(index: number): NodeKind {
		return this._kinds[index] as NodeKind;
	}

	/**
	 * set the kind of the node at the given index
	 * @param index index of the node whose kind to update
	 * @param kind new kind
	 */
	set_kind(index: number, kind: NodeKind): void {
		this._kinds[index] = kind;
	}

	/** @internal set prev_siblings for wiretreebuilder revoke. */
	prev_siblings_set(index: number, value: number): void {
		this._prev_siblings[index] = value;
	}

	/** @internal set children_ends for wiretreebuilder revoke. */
	children_ends_set(index: number, value: number): void {
		this._children_ends[index] = value;
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
		let next = this.capacity;
		if (next >= needed) return;
		while (next < needed) next <<= 1;
		this.resize(next);
	}

	/** double the backing storage when capacity is exhausted. */
	private grow(): void {
		this.resize(this.capacity << 1);
	}

	/** move every field into fresh storage of a larger capacity. */
	private resize(next: number): void {
		const kinds = this._kinds;
		const starts = this._starts;
		const ends = this._ends;
		const extras = this._extras;
		const value_starts = this._value_starts;
		const value_ends = this._value_ends;
		const has_metadata = this.has_metadata;
		const parents = this._parents;
		const next_siblings = this._next_siblings;
		const prev_siblings = this._prev_siblings;
		const children_starts = this._children_starts;
		const children_ends = this._children_ends;
		const pending_nodes = this._pending_nodes;

		this.alloc_fields(next);

		this._kinds.set(kinds);
		this._starts.set(starts);
		this._ends.set(ends);
		this._extras.set(extras);
		this._value_starts.set(value_starts);
		this._value_ends.set(value_ends);
		this.has_metadata.set(has_metadata);
		this._parents.set(parents);
		this._next_siblings.set(next_siblings);
		this._prev_siblings.set(prev_siblings);
		this._children_starts.set(children_starts);
		this._children_ends.set(children_ends);
		this._pending_nodes.set(pending_nodes);
	}

	set_metadata(index: number, metadata: any): void {
		this.metadata.set(index, metadata);
		this.has_metadata[index >> 3] |= 1 << (index & 7);
	}

	metadata_at(index: number): any | undefined {
		// check bit first
		if (!(this.has_metadata[index >> 3] & (1 << (index & 7)))) {
			return undefined; // fast path: no map lookup
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

		// walk sibling chain to get all direct children
		let child = this._children_starts[index];
		while (child !== 0xffffffff && this._parents[child] === index) {
			_children.push(child);
			child = this._next_siblings[child];
		}

		return {
			kind: kind_to_string(this._kinds[index]),
			start: this._starts[index],
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
				this._prev_siblings[index] === 0xffffffff
					? null
					: this._prev_siblings[index],
			value: [this._value_starts[index], this._value_ends[index]],
			children: _children,
			index: index,
		};
	}
}

/** collects indices for parse errors encountered during tokenization. */
export class ErrorCollector {
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
