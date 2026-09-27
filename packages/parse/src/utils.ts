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

/** placeholder so the node word field is stored by the constructor. */
const EMPTY_U32 = new Uint32Array(0);

/**
 * word offsets of a node's fields inside NodeBuffer._n. a node's fields are
 * written together on push and read together by the cursor, so they share
 * one stride of words instead of one typed array each. a const enum so every
 * offset builds to a literal.
 */
export const enum NodeField {
	/** kind in the low byte, extra in the sixteen bits above it. */
	kind = 0,
	start = 1,
	end = 2,
	value_start = 3,
	value_end = 4,
	parent = 5,
	next = 6,
	prev = 7,
	first_child = 8,
	last_child = 9,
	/** one while the node is speculative and may still be revoked. */
	pending = 10,
	/** one plus the node's slot in NodeBuffer._meta, zero without metadata. */
	meta = 11,
	/** words per node. */
	stride = 12,
}

/** bytes per node. */
const NODE_BYTES = NodeField.stride * 4;

/**
 * the slab small node buffers are carved from. a region is handed out once
 * and never reused, so every carve starts zeroed like a fresh arraybuffer and
 * costs one view instead of a backing store. the trade-off is retention:
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
 * buffer that stores nodes as fixed strides of words in one Uint32Array.
 * see NodeField for the layout.
 */
export class NodeBuffer {
	// every field is initialized here rather than only in alloc, because v8
	// sizes the in-object slots from the stores it sees in the constructor
	// body and would otherwise spill the tail fields out of line
	/** @internal node slots the storage holds. */
	_capacity = 0;
	/** @internal node words, NodeField.stride per node. do not mutate externally. */
	_n: Uint32Array = EMPTY_U32;
	/** @internal metadata objects, a node's meta word is one plus its slot. */
	_meta: any[] = [];
	/** @internal pre-materialized text strings (used by wiretreebuilder). index -> string. */
	_strings: (string | undefined)[] = [];

	/** @internal slots in use, read by TreeBuilder to check ids against indices. */
	_size = 0;

	/**
	 * create a buffer that stores nodes in one typed array.
	 * @param initial_capacity requested starting capacity for nodes.
	 */
	constructor(initial_capacity = DEFAULT_TOKEN_CAPACITY) {
		// the comparison also sends a nan capacity to the floor
		this.alloc(
			next_power_of_two(
				initial_capacity > MIN_NODE_CAPACITY
					? initial_capacity
					: MIN_NODE_CAPACITY
			)
		);
		this.push(NodeKind.root, 0);
	}

	/**
	 * point the node words at fresh zeroed storage of the given capacity,
	 * carved from the current slab when it is small and from a dedicated
	 * arraybuffer otherwise.
	 */
	private alloc(capacity: number): Uint32Array {
		// a node is a whole number of words, so every carve stays word aligned
		const bytes = capacity * NODE_BYTES;
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
		const n = new Uint32Array(buffer, base, capacity * NodeField.stride);
		this._capacity = capacity;
		this._n = n;
		return n;
	}

	/** clear previously pushed nodes without reallocating storage. */
	reset(): void {
		// push writes every word of a node, so the words the last document
		// left behind are never read and need no clearing. clear and a length
		// store are runtime calls even when empty
		if (this._meta.length !== 0) this._meta.length = 0;
		if (this._strings.length !== 0) this._strings.length = 0;
		this._size = 0;
	}

	/** number of nodes currently stored. */
	get size(): number {
		return this._size;
	}

	/**
	 * push a node into the buffer as the last child of parent.
	 * @param kind node category.
	 * @param cursor cursor position
	 * @param parent index of the parent node, or 0xffffffff for none.
	 * @param extra extra metadata stored alongside the node.
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
		let n = this._n;
		if (index >= this._capacity) n = this.grow();

		const b = index * NodeField.stride;
		n[b] = (kind & 0xff) | ((extra & 0xffff) << 8);
		n[b + NodeField.start] = cursor >>> 0;
		n[b + NodeField.end] = 0xffffffff;
		n[b + NodeField.value_start] = 0;
		n[b + NodeField.value_end] = 0;
		n[b + NodeField.parent] = parent;
		n[b + NodeField.next] = 0xffffffff;
		n[b + NodeField.prev] = 0xffffffff;
		n[b + NodeField.first_child] = 0xffffffff;
		n[b + NodeField.last_child] = 0xffffffff;
		n[b + NodeField.pending] = 0;
		n[b + NodeField.meta] = 0;
		this._size = index + 1;

		if (parent !== 0xffffffff) {
			const p = parent * NodeField.stride;
			const last = n[p + NodeField.last_child];
			if (last === 0xffffffff) {
				// first child
				n[p + NodeField.first_child] = index;
			} else {
				// append after last child, o(1)
				n[last * NodeField.stride + NodeField.next] = index;
				n[b + NodeField.prev] = last;
			}
			n[p + NodeField.last_child] = index;
		}

		if (metadata !== undefined) this.set_metadata(index, metadata);

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
		this._n[index * NodeField.stride + NodeField.pending] = 1;
		return index;
	}

	/**
	 * push a closed text node holding the source range [start, end) as the
	 * last child of parent, which must be a node.
	 */
	push_text(start: number, end: number, parent: number): number {
		const index = this._size;
		let n = this._n;
		if (index >= this._capacity) n = this.grow();

		const b = index * NodeField.stride;
		n[b] = NodeKind.text;
		n[b + NodeField.start] = start;
		n[b + NodeField.end] = end;
		n[b + NodeField.value_start] = start;
		n[b + NodeField.value_end] = end;
		n[b + NodeField.parent] = parent;
		n[b + NodeField.next] = 0xffffffff;
		n[b + NodeField.prev] = 0xffffffff;
		n[b + NodeField.first_child] = 0xffffffff;
		n[b + NodeField.last_child] = 0xffffffff;
		n[b + NodeField.pending] = 0;
		n[b + NodeField.meta] = 0;
		this._size = index + 1;

		const p = parent * NodeField.stride;
		const last = n[p + NodeField.last_child];
		if (last === 0xffffffff) {
			n[p + NodeField.first_child] = index;
		} else {
			n[last * NodeField.stride + NodeField.next] = index;
			n[b + NodeField.prev] = last;
		}
		n[p + NodeField.last_child] = index;
		return index;
	}

	/**
	 * allocate a node slot without linking it into any parent's child list.
	 * the caller is responsible for setting the parent and linking into the
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
		return this.push(kind, cursor, 0xffffffff, extra, metadata);
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
		const first_child = this.first_child_at(parent_idx);
		const last_child = this.last_child_at(parent_idx);

		// detach children from parent
		this.set_first_child(parent_idx, 0xffffffff);
		this.set_last_child(parent_idx, 0xffffffff);

		// push wrapper as sole child of parent (auto-links via push)
		const wrapper_idx = this.push(new_kind, 0, parent_idx, extra, metadata);

		// reattach old children to wrapper
		if (first_child !== 0xffffffff) {
			this.set_first_child(wrapper_idx, first_child);
			this.set_last_child(wrapper_idx, last_child);

			// update parent pointers on all moved children
			let child = first_child;
			while (child !== 0xffffffff && this.parent_at(child) === parent_idx) {
				this.set_parent(child, wrapper_idx);
				child = this.next_at(child);
			}
		}

		return wrapper_idx;
	}

	commit_node(index: number): void {
		this._n[index * NodeField.stride + NodeField.pending] = 0;
	}

	get_pending(): number[] {
		const result: number[] = [];
		const n = this._n;
		for (let i = 0; i < this._size; i++) {
			if (n[i * NodeField.stride + NodeField.pending] !== 0) {
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
		const parent = this.parent_at(index);
		const kind = this.kind_at(index);
		const parent_kind =
			parent !== 0xffffffff ? this.kind_at(parent) : undefined;

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
			const start = this.start_at(index);
			let end: number;

			if (delimiter_text !== undefined) {
				// wire path: delimiter_text is the literal open-tag source
				end = start + delimiter_text.length;
			} else {
				// source path: prefer the node's recorded end; fall back to the
				// nearest meaningful child position so we never collapse to start.
				end = this.end_at(index);
				if (end === 0xffffffff) {
					let child = this.first_child_at(index);
					while (child !== 0xffffffff && this.parent_at(child) === index) {
						if (this.kind_at(child) === NodeKind.line_break) {
							const lb_start = this.start_at(child);
							if (lb_start > 0 && (end === 0xffffffff || lb_start > end)) {
								end = lb_start;
							}
						} else {
							const child_end = this.end_at(child);
							if (
								child_end !== 0xffffffff &&
								(end === 0xffffffff || child_end > end)
							) {
								end = child_end;
							}
						}
						child = this.next_at(child);
					}
				}
				if (end === 0xffffffff || end <= start) {
					this.unwrap_node(index);
					return;
				}
			}

			// reparent children to the grandparent so trailing parsed content
			// (e.g. block elements that followed the unclosed open tag) is kept.
			const child_chain = this.first_child_at(index);
			this.set_first_child(index, 0xffffffff);
			this.set_last_child(index, 0xffffffff);

			// convert this node into a paragraph holding the literal open-tag text.
			this.set_kind(index, NodeKind.paragraph);
			this.delete_metadata(index);
			this.set_end(index, end);

			const text_idx = this.push(NodeKind.text, start, index);
			this.set_value(text_idx, start, end);
			this.set_end(text_idx, end);
			if (delimiter_text !== undefined) {
				this._strings[text_idx] = delimiter_text;
			}

			// splice the original children in after the rewritten node so they
			// appear as siblings under the parent.
			if (child_chain !== 0xffffffff) {
				const original_next = this.next_at(index);
				let last_child = child_chain;
				let scan = child_chain;
				while (scan !== 0xffffffff && this.parent_at(scan) === index) {
					this.set_parent(scan, parent);
					last_child = scan;
					scan = this.next_at(scan);
				}
				this.set_next(last_child, original_next);
				if (original_next !== 0xffffffff) {
					this.set_prev(original_next, last_child);
				} else if (
					parent !== 0xffffffff &&
					this.last_child_at(parent) === index
				) {
					this.set_last_child(parent, last_child);
				}
				this.set_next(index, child_chain);
				this.set_prev(child_chain, index);
			}
			return;
		}

		// inline repair
		const first_child = this.first_child_at(index);

		// convert the wrapper to a plain text node whose value is the
		// literal delimiter (e.g. "~" for subscript, "<div>" for an
		// inline html open tag). any children stay in the document,
		// they are reparented to the grandparent so the streamed
		// content is preserved after revocation.
		this.set_kind(index, NodeKind.text);

		if (delimiter_text !== undefined) {
			this._strings[index] = delimiter_text;
			const start = this.start_at(index);
			const end = start + delimiter_text.length;
			this.set_value(index, start, end);
			this.set_end(index, end);

			if (first_child === 0xffffffff) {
				this.set_first_child(index, 0xffffffff);
				this.set_last_child(index, 0xffffffff);
				return;
			}

			// reparent children and splice them in after this text node.
			let child = first_child;
			let last_child = first_child;
			while (child !== 0xffffffff && this.parent_at(child) === index) {
				this.set_parent(child, parent);
				last_child = child;
				child = this.next_at(child);
			}
			const node_next = this.next_at(index);
			this.set_next(index, first_child);
			this.set_prev(first_child, index);
			if (node_next !== 0xffffffff && this.parent_at(node_next) === parent) {
				this.set_next(last_child, node_next);
				this.set_prev(node_next, last_child);
			} else {
				this.set_next(last_child, 0xffffffff);
			}
			if (this.last_child_at(parent) === index) {
				this.set_last_child(parent, last_child);
			}
			this.set_first_child(index, 0xffffffff);
			this.set_last_child(index, 0xffffffff);
			return;
		}

		// source-based fallback, derive the delimiter byte range from
		// the node's own start offset.
		if (first_child === 0xffffffff) {
			this.set_first_child(index, 0xffffffff);
			this.set_last_child(index, 0xffffffff);
			const start = this.start_at(index);
			this.set_value_start(index, start);
			if (this.end_at(index) === 0xffffffff) {
				this.set_value_end(index, start + 1);
				this.set_end(index, start + 1);
			} else {
				this.set_value_end(index, this.end_at(index));
			}
			return;
		}

		// walk sibling chain and reparent only direct children
		let child = first_child;
		let last_child = first_child;

		while (child !== 0xffffffff && this.parent_at(child) === index) {
			this.set_parent(child, parent);
			last_child = child;
			child = this.next_at(child);
		}

		// if exactly one child and it's text, merge the delimiter into it
		if (
			last_child === first_child &&
			this.kind_at(first_child) === NodeKind.text
		) {
			this.set_value(index, this.start_at(index), this.end_at(first_child));
			this.set_end(index, this.end_at(first_child));

			// skip the child in the sibling chain
			const after = this.next_at(first_child);
			this.set_next(index, after);
			if (after !== 0xffffffff) {
				this.set_prev(after, index);
			}

			this.set_first_child(index, 0xffffffff);
			this.set_last_child(index, 0xffffffff);
			return;
		}

		// insert converted node as sibling before first_child, reparent rest
		const first_child_prev = this.prev_at(first_child);

		this.set_next(index, first_child);
		this.set_prev(first_child, index);

		if (first_child_prev !== 0xffffffff) {
			this.set_next(first_child_prev, index);
			this.set_prev(index, first_child_prev);
		}

		if (this.last_child_at(parent) === index) {
			this.set_last_child(parent, last_child);
		}

		// clear children references
		this.set_first_child(index, 0xffffffff);
		this.set_last_child(index, 0xffffffff);

		const value_start = this.start_at(index);
		const value_end = this.value_start_at(first_child);
		this.set_value(index, value_start, value_end);
		this.set_end(index, value_end);
	}

	repair(): void {
		const n = this._n;
		for (let i = 0; i < this._size; i++) {
			if (n[i * NodeField.stride + NodeField.pending] !== 0) {
				this.handle_repair(i);
			}
		}
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
		const parent = this.parent_at(index);
		const first_child = this.first_child_at(index);

		if (first_child === 0xffffffff) {
			// no children, remove from sibling chain
			const prev_sib = this.prev_at(index);
			const next_sib = this.next_at(index);
			if (prev_sib !== 0xffffffff) {
				this.set_next(prev_sib, next_sib);
			} else if (parent !== 0xffffffff) {
				this.set_first_child(parent, next_sib);
			}
			if (next_sib !== 0xffffffff) {
				this.set_prev(next_sib, prev_sib);
			}
			// update parent's last child if we removed the tail
			if (parent !== 0xffffffff && this.last_child_at(parent) === index) {
				this.set_last_child(parent, prev_sib); // 0xffffffff if was only child
			}
			return;
		}

		// reparent all children and find last child
		let child = first_child;
		let last_child = first_child;
		while (child !== 0xffffffff && this.parent_at(child) === index) {
			this.set_parent(child, parent);
			last_child = child;
			child = this.next_at(child);
		}

		// splice children into parent's child list where this node was
		const prev_sib = this.prev_at(index);

		// the actual next sibling of the unwrapped node (not of last_child)
		const node_next = this.next_at(index);

		if (prev_sib !== 0xffffffff) {
			this.set_next(prev_sib, first_child);
			this.set_prev(first_child, prev_sib);
		} else if (parent !== 0xffffffff) {
			this.set_first_child(parent, first_child);
			this.set_prev(first_child, 0xffffffff);
		}

		// link last child to the unwrapped node's next sibling
		if (node_next !== 0xffffffff && node_next !== first_child) {
			this.set_next(last_child, node_next);
			this.set_prev(node_next, last_child);
		} else {
			this.set_next(last_child, 0xffffffff);
		}

		// update parent's last child if we replaced the tail
		if (parent !== 0xffffffff && this.last_child_at(parent) === index) {
			this.set_last_child(parent, last_child);
		}

		// clear the unwrapped node's links
		this.set_first_child(index, 0xffffffff);
		this.set_last_child(index, 0xffffffff);
	}

	set_parent_kind(index: number, kind: NodeKind): void {
		const parent_index = this.parent_at(index);
		if (parent_index !== 0xffffffff) {
			this.set_kind(parent_index, kind);
		}
	}

	/** return indices of all nodes matching the given kind (lazy scan). */
	get_kinds(kind: NodeKind): number[] {
		const result: number[] = [];
		const n = this._n;
		for (let i = 0; i < this._size; i++) {
			if ((n[i * NodeField.stride] & 0xff) === kind) result.push(i);
		}
		return result;
	}

	/**
	 * get the node kind recorded at the supplied index.
	 * @param index node index.
	 */
	kind_at(index: number): NodeKind {
		return (this._n[index * NodeField.stride] & 0xff) as NodeKind;
	}

	/**
	 * set the kind of the node at the given index
	 * @param index index of the node whose kind to update
	 * @param kind new kind
	 */
	set_kind(index: number, kind: NodeKind): void {
		const n = this._n;
		const b = index * NodeField.stride;
		n[b] = (n[b] & 0xffff00) | (kind & 0xff);
	}

	/** kind-specific extra value of the node at the given index. */
	extra_at(index: number): number {
		return this._n[index * NodeField.stride] >>> 8;
	}

	/**
	 * set the extra of the node at the given index
	 * @param index index of the node whose extra to update
	 * @param extra new extra
	 */
	set_extra(index: number, extra: number): void {
		const n = this._n;
		const b = index * NodeField.stride;
		n[b] = (n[b] & 0xff) | ((extra & 0xffff) << 8);
	}

	/** source offset where the node at the given index starts. */
	start_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.start];
	}

	/** source offset where the node at the given index ends, 0xffffffff while open. */
	end_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.end];
	}

	/**
	 * set the end position of the node at the given index
	 * @param index index of the node whose end position to update
	 * @param end new end position
	 */
	set_end(index: number, end: number): void {
		this._n[index * NodeField.stride + NodeField.end] = end >>> 0;
	}

	gently_set_end(index: number, end: number): void {
		const i = index * NodeField.stride + NodeField.end;
		if (this._n[i] !== 0xffffffff) return;
		this._n[i] = end >>> 0;
	}

	/** start of the value range of the node at the given index. */
	value_start_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.value_start];
	}

	/** end of the value range of the node at the given index. */
	value_end_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.value_end];
	}

	set_value(index: number, value_start: number, value_end: number): void {
		const n = this._n;
		const b = index * NodeField.stride;
		n[b + NodeField.value_start] = value_start;
		n[b + NodeField.value_end] = value_end;
	}

	set_value_start(index: number, value_start: number): void {
		this._n[index * NodeField.stride + NodeField.value_start] = value_start;
	}

	set_value_end(index: number, value_end: number): void {
		this._n[index * NodeField.stride + NodeField.value_end] = value_end;
	}

	gently_set_value_end(index: number, end: number): void {
		const i = index * NodeField.stride + NodeField.value_end;
		if (this._n[i] !== 0xffffffff) return;
		this._n[i] = end >>> 0;
	}

	/** parent index of the node at the given index, 0xffffffff for none. */
	parent_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.parent];
	}

	set_parent(index: number, parent: number): void {
		this._n[index * NodeField.stride + NodeField.parent] = parent;
	}

	/** next sibling link of the node at the given index, 0xffffffff for none. */
	next_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.next];
	}

	set_next(index: number, next: number): void {
		this._n[index * NodeField.stride + NodeField.next] = next;
	}

	/** previous sibling link of the node at the given index, 0xffffffff for none. */
	prev_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.prev];
	}

	set_prev(index: number, prev: number): void {
		this._n[index * NodeField.stride + NodeField.prev] = prev;
	}

	/** first child of the node at the given index, 0xffffffff for none. */
	first_child_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.first_child];
	}

	set_first_child(index: number, child: number): void {
		this._n[index * NodeField.stride + NodeField.first_child] = child;
	}

	/** last child of the node at the given index, 0xffffffff for none. */
	last_child_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.last_child];
	}

	set_last_child(index: number, child: number): void {
		this._n[index * NodeField.stride + NodeField.last_child] = child;
	}

	/** one while the node at the given index is pending, otherwise zero. */
	pending_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.pending];
	}

	/** pre-grow to avoid repeated resizes when the final size is estimable. */
	ensure_capacity(needed: number): void {
		let next = this._capacity;
		if (next >= needed) return;
		while (next < needed) next <<= 1;
		this.resize(next);
	}

	/** double the backing storage when capacity is exhausted. */
	private grow(): Uint32Array {
		return this.resize(this._capacity << 1);
	}

	/** move every node into fresh storage of a larger capacity. */
	private resize(next: number): Uint32Array {
		const old = this._n;
		const n = this.alloc(next);
		n.set(old);
		return n;
	}

	set_metadata(index: number, metadata: any): void {
		const n = this._n;
		const i = index * NodeField.stride + NodeField.meta;
		const slot = n[i];
		if (slot !== 0) this._meta[slot - 1] = metadata;
		else n[i] = this._meta.push(metadata);
	}

	metadata_at(index: number): any | undefined {
		const slot = this._n[index * NodeField.stride + NodeField.meta];
		// an index past the storage reads undefined, which is not zero and
		// indexes _meta at nan
		return slot === 0 ? undefined : this._meta[slot - 1];
	}

	/** drop the metadata of the node at the given index. */
	delete_metadata(index: number): void {
		this._n[index * NodeField.stride + NodeField.meta] = 0;
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
		const kind = this.kind_at(index);
		const extra_string = extra_to_string(kind);
		const extras_object = extra_string
			? { [extra_string]: this.extra_at(index) }
			: {};

		const _children = [];

		// walk sibling chain to get all direct children
		let child = this.first_child_at(index);
		while (child !== 0xffffffff && this.parent_at(child) === index) {
			_children.push(child);
			child = this.next_at(child);
		}

		const parent = this.parent_at(index);
		const next = this.next_at(index);
		const prev = this.prev_at(index);
		return {
			kind: kind_to_string(kind),
			start: this.start_at(index),
			end: this.end_at(index),
			metadata: {
				...this.metadata_at(index),
				...extras_object,
			},
			parent: parent === 0xffffffff ? null : parent,
			next: next === 0xffffffff ? null : next,
			prev: prev === 0xffffffff ? null : prev,
			value: [this.value_start_at(index), this.value_end_at(index)],
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
