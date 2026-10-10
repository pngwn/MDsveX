/** default number of token entries to preallocate. */
const DEFAULT_TOKEN_CAPACITY = 128;

/** under 2 kb of slab, cheaper than a resize for a slightly larger document */
const MIN_NODE_CAPACITY = 32;

/**
 * a buffer past the carve cap is its own ArrayBuffer, far costlier than a
 * carve, so small documents should fit the slab
 */
const SLAB_BYTES = 1048576;

/**
 * caps the tail a full slab can waste at a quarter, high since a one shot
 * parse gives back what it does not use
 */
const SLAB_MAX_CARVE = 262144;

const EMPTY_U32 = new Uint32Array(0);

/** most documents set no metadata, the first set_metadata swaps in a real array */
const NO_META: any[] = Object.freeze([]) as unknown as any[];

/** push writes and the cursor reads fields together, so they share one stride */
export const enum NodeField {
	/** kind in the low byte, extra in the sixteen bits above it */
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
	/** one while the node may still be revoked */
	pending = 10,
	/** one plus the slot in NodeBuffer._meta, zero without metadata */
	meta = 11,
	stride = 12,
}

const NODE_BYTES = NodeField.stride * 4;

/** shared empty strings until own_strings, never written */
const NO_STRINGS: (string | undefined)[] = [];

/**
 * uninitialized where the host allows, the template and a push write every
 * word of a node before anything reads it
 */
const host_buffer: any = (globalThis as any).Buffer;
const unzeroed =
	host_buffer !== undefined &&
	typeof host_buffer.allocUnsafeSlow === 'function';
function new_storage(bytes: number): ArrayBuffer {
	return unzeroed
		? (host_buffer.allocUnsafeSlow(bytes).buffer as ArrayBuffer)
		: new ArrayBuffer(bytes);
}

/** a template copy repeats at most this many nodes, a longer source falls out of cache */
const TEMPLATE_BLOCK = 512;

/**
 * template slots from up to to, no end, value, links, pending or meta, so a
 * push writes only kind, start, parent and the links it makes
 */
function fill_template(n: Uint32Array, from: number, to: number): void {
	// a copy is a runtime call, stores beat it for the few nodes a small document has
	const short = to - from <= 64 ? to : from + 64;
	for (let b = from * NodeField.stride; b < short * NodeField.stride; ) {
		n[b + NodeField.end] = 0xffffffff;
		n[b + NodeField.value_start] = 0;
		n[b + NodeField.value_end] = 0;
		n[b + NodeField.next] = 0xffffffff;
		n[b + NodeField.prev] = 0xffffffff;
		n[b + NodeField.first_child] = 0xffffffff;
		n[b + NodeField.last_child] = 0xffffffff;
		n[b + NodeField.pending] = 0;
		n[b + NodeField.meta] = 0;
		b += NodeField.stride;
	}
	let done = short;
	while (done < to) {
		let count = done - from;
		if (count > TEMPLATE_BLOCK) count = TEMPLATE_BLOCK;
		if (count > to - done) count = to - done;
		n.copyWithin(
			done * NodeField.stride,
			from * NodeField.stride,
			(from + count) * NodeField.stride
		);
		done += count;
	}
}

const SLAB_NODES = (SLAB_BYTES / NODE_BYTES) | 0;

const FILL_CHUNK = 4096;

/**
 * a carve costs one view not a backing store but keeps its whole slab alive,
 * a slab holds the template from slab_used on, a trim returns only unwritten slots
 */
let slab = new ArrayBuffer(0);
let slab_used = SLAB_BYTES;
/** the view whose region ends at slab_used, it can grow in place or shrink */
let last_carve: Uint32Array | null = null;

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
	directive_label = 35,
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
		case NodeKind.directive_label:
			return 'directive_label';
	}
};

/** reverse mapping from string name to numeric NodeKind. built once at module load. */
const _string_to_kind = new Map<string, NodeKind>();
for (let i = 0; i <= 35; i++) {
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
 * a computed key literal takes a slow generic define, so known keys get
 * constant key literals and other keys a store into an empty literal
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
		case 'checked':
			return { checked: value };
		default: {
			// a set would change the prototype, a literal defines an own property
			if (key === '__proto__') return { [key]: value };
			const meta: Record<string, any> = {};
			meta[key] = value;
			return meta;
		}
	}
}

/** named stores stay monomorphic, a keyed store goes megamorphic across shapes */
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
		case 'checked':
			meta.checked = value;
			return;
		default:
			meta[key] = value;
	}
}

export class NodeBuffer {
	// v8 sizes in-object slots from constructor stores, so every field is
	// initialized here, not only in alloc, or the tail fields spill out of line
	/** @internal */
	_capacity = 0;
	/** @internal do not mutate externally */
	_n: Uint32Array = EMPTY_U32;
	/** @internal */
	_meta: any[] = NO_META;
	/** @internal pre-materialized text strings (used by wiretreebuilder). index -> string. */
	_strings: (string | undefined)[] = NO_STRINGS;

	/** @internal read by TreeBuilder to check ids against indices */
	_size = 0;
	/** slots from _size up to here hold the template */
	private _filled = 0;

	constructor(initial_capacity = DEFAULT_TOKEN_CAPACITY) {
		// the comparison also sends a nan capacity to the floor
		let n = this.alloc(
			next_power_of_two(
				initial_capacity > MIN_NODE_CAPACITY
					? initial_capacity
					: MIN_NODE_CAPACITY
			)
		);
		// the root push by hand, an inlined push_node would count against the
		// inlining budget of every new TreeBuilder caller
		if (this._filled === 0) n = this.fill(0);
		n[0] = NodeKind.root;
		n[NodeField.start] = 0;
		n[NodeField.parent] = 0xffffffff;
		this._size = 1;
	}

	private alloc(capacity: number): Uint32Array {
		// a node is a whole number of words, so every carve stays word aligned
		const bytes = capacity * NODE_BYTES;
		let buffer: ArrayBuffer;
		let base = 0;
		if (bytes <= SLAB_MAX_CARVE) {
			if (slab_used + bytes > SLAB_BYTES) {
				slab = new_storage(SLAB_BYTES);
				slab_used = 0;
				fill_template(new Uint32Array(slab), 0, SLAB_NODES);
			}
			buffer = slab;
			base = slab_used;
			slab_used = base + bytes;
		} else {
			buffer = new_storage(bytes);
		}
		const n = new Uint32Array(buffer, base, capacity * NodeField.stride);
		if (buffer === slab) {
			last_carve = n;
			this._filled = capacity;
		} else this._filled = 0;
		this._capacity = capacity;
		this._n = n;
		return n;
	}

	/** @internal */
	own_strings(): (string | undefined)[] {
		const strings = this._strings;
		return strings === NO_STRINGS ? (this._strings = []) : strings;
	}

	/** gives the unused tail of the last slab carve back, a later push resizes */
	trim(): void {
		if (this._n !== last_carve) return;
		slab_used -= (this._capacity - this._size) * NODE_BYTES;
		this._capacity = this._size;
		this._filled = this._size;
	}

	/** clear nodes without reallocating storage */
	reset(): void {
		// push writes every word of a node, so stale words need no clearing
		// a length store is a runtime call even when already empty
		if (this._meta.length !== 0) this._meta.length = 0;
		if (this._strings.length !== 0) this._strings.length = 0;
		// make the pushed slots template again, copying the template above them
		// when there is enough, one copy costs about what stores for eight nodes do
		const size = this._size;
		if (size !== 0) {
			if (size > 8 && size << 1 <= this._filled) {
				const n = this._n;
				for (let done = 0; done < size; ) {
					let count = size - done;
					if (count > TEMPLATE_BLOCK) count = TEMPLATE_BLOCK;
					n.copyWithin(
						done * NodeField.stride,
						size * NodeField.stride,
						(size + count) * NodeField.stride
					);
					done += count;
				}
			} else fill_template(this._n, 0, size);
			this._size = 0;
		}
	}

	get size(): number {
		return this._size;
	}

	/**
	 * push a node as the last child of parent
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
		const index = this.push_node(kind, cursor, parent, extra, false);
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
		const index = this.push_node(kind, cursor, parent, extra, true);
		if (metadata !== undefined) this.set_metadata(index, metadata);
		return index;
	}

	/** one body for every open so the builder inlines a single copy */
	push_node(
		kind: NodeKind,
		cursor: number,
		parent: number,
		extra: number,
		pending: boolean
	): number {
		const index = this._size;
		let n = this._n;
		if (index >= this._filled) n = this.fill(index);

		// the template holds every other word
		const b = index * NodeField.stride;
		n[b] = (kind & 0xff) | ((extra & 0xffff) << 8);
		n[b + NodeField.start] = cursor;
		n[b + NodeField.parent] = parent;
		if (pending) n[b + NodeField.pending] = 1;
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
		return index;
	}

	/** parent must be a node, not 0xffffffff */
	push_text(start: number, end: number, parent: number): number {
		const index = this._size;
		let n = this._n;
		if (index >= this._filled) n = this.fill(index);

		const b = index * NodeField.stride;
		n[b] = NodeKind.text;
		n[b + NodeField.start] = start;
		n[b + NodeField.end] = end;
		n[b + NodeField.value_start] = start;
		n[b + NodeField.value_end] = end;
		n[b + NodeField.parent] = parent;
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

	/** a closed node with no extra and a value range, as open, value and close would leave it */
	push_leaf(
		kind: NodeKind,
		start: number,
		value_start: number,
		value_end: number,
		end: number,
		parent: number
	): number {
		const index = this._size;
		let n = this._n;
		if (index >= this._filled) n = this.fill(index);

		const b = index * NodeField.stride;
		n[b] = kind;
		n[b + NodeField.start] = start;
		n[b + NodeField.end] = end;
		n[b + NodeField.value_start] = value_start;
		n[b + NodeField.value_end] = value_end;
		n[b + NodeField.parent] = parent;
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

	private fill(index: number): Uint32Array {
		let n = this._n;
		if (index >= this._capacity) n = this.grow();
		let filled = this._filled;
		if (index >= filled) {
			let to = filled + (filled > FILL_CHUNK ? filled : FILL_CHUNK);
			if (to > this._capacity) to = this._capacity;
			fill_template(n, filled, to);
			this._filled = filled = to;
		}
		return n;
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
	 * @param text_start source offset of delimiter_text, at the node start the
	 *   repaired range slices the same text so it is not stored
	 */
	handle_repair(
		index: number,
		delimiter_text?: string,
		text_start?: number
	): void {
		const parent = this.parent_at(index);
		const kind = this.kind_at(index);
		const parent_kind =
			parent !== 0xffffffff ? this.kind_at(parent) : undefined;

		// a revoked paragraph is a wrapper a tight list item or a paragraph of only tags does not need
		// a revoked table cell was a merge marker, the cell it joined spans its column
		if (kind === NodeKind.paragraph || kind === NodeKind.table_cell) {
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
			if (delimiter_text !== undefined && text_start !== start) {
				this.own_strings()[text_idx] = delimiter_text;
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
			const start = this.start_at(index);
			if (text_start !== start) this.own_strings()[index] = delimiter_text;
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
			if (this.end_at(index) === 0xffffffff) {
				// an opener that records where its content starts ends there
				const content_start = this.value_start_at(index);
				const end = content_start > start ? content_start : start + 1;
				this.set_value(index, start, end);
				this.set_end(index, end);
			} else {
				this.set_value_start(index, start);
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

		// merge a lone text child into the delimiter, a cell text ends at the pipe past its value
		if (
			last_child === first_child &&
			this.kind_at(first_child) === NodeKind.text
		) {
			this.set_value(
				index,
				this.start_at(index),
				this.value_end_at(first_child)
			);
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

		// use start, a soft_break child has no value range
		const value_start = this.start_at(index);
		const value_end = this.start_at(first_child);
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
		const i = --this._size;
		// the popped slot is the template again, as a push expects
		fill_template(this._n, i, i + 1);
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

	start_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.start];
	}

	/** 0xffffffff while open */
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

	value_start_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.value_start];
	}

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

	parent_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.parent];
	}

	set_parent(index: number, parent: number): void {
		this._n[index * NodeField.stride + NodeField.parent] = parent;
	}

	next_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.next];
	}

	set_next(index: number, next: number): void {
		this._n[index * NodeField.stride + NodeField.next] = next;
	}

	prev_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.prev];
	}

	set_prev(index: number, prev: number): void {
		this._n[index * NodeField.stride + NodeField.prev] = prev;
	}

	first_child_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.first_child];
	}

	set_first_child(index: number, child: number): void {
		this._n[index * NodeField.stride + NodeField.first_child] = child;
	}

	last_child_at(index: number): number {
		return this._n[index * NodeField.stride + NodeField.last_child];
	}

	set_last_child(index: number, child: number): void {
		this._n[index * NodeField.stride + NodeField.last_child] = child;
	}

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

	private resize(next: number): Uint32Array {
		const old = this._n;
		const words = this._capacity * NodeField.stride;
		if (old === last_carve) {
			// nothing was carved since, so extend the region in place
			const base = slab_used - words * 4;
			const bytes = next * NODE_BYTES;
			if (bytes <= SLAB_MAX_CARVE && base + bytes <= SLAB_BYTES) {
				const n = new Uint32Array(slab, base, next * NodeField.stride);
				slab_used = base + bytes;
				last_carve = n;
				this._capacity = next;
				this._filled = next;
				this._n = n;
				return n;
			}
		}
		const n = this.alloc(next);
		// slots from _size on are template in both, a carve has it already
		const size = this._size;
		n.set(
			old.length === size * NodeField.stride
				? old
				: old.subarray(0, size * NodeField.stride)
		);
		if (this._filled < size) this._filled = size;
		return n;
	}

	set_metadata(index: number, metadata: any): void {
		const n = this._n;
		const i = index * NodeField.stride + NodeField.meta;
		const slot = n[i];
		if (slot !== 0) this._meta[slot - 1] = metadata;
		else {
			const meta = this._meta;
			// a literal holds one slot, a push onto an empty array reserves seventeen
			if (meta === NO_META) {
				this._meta = [metadata];
				n[i] = 1;
			} else n[i] = meta.push(metadata);
		}
	}

	metadata_at(index: number): any | undefined {
		const slot = this._n[index * NodeField.stride + NodeField.meta];
		// an index past the storage reads undefined, which indexes _meta at nan
		return slot === 0 ? undefined : this._meta[slot - 1];
	}

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
