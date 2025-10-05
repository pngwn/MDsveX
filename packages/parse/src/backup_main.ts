import {
	BACKTICK,
	CLOSE_BRACE,
	TILDE,
	LINEFEED,
	OCTOTHERP,
	OPEN_ANGLE_BRACKET,
	OPEN_BRACE,
	SPACE,
	TAB,
} from './constants';

/** Default number of token entries to preallocate. */
const DEFAULT_TOKEN_CAPACITY = 128;

/** Default number of error entries to preallocate. */
const DEFAULT_ERROR_CAPACITY = 32;

/** Default node capacity for the arena allocator. */
const DEFAULT_NODE_CAPACITY = 128;

/** Sticky regular expression that detects HTML-like tags. */
const html_tag_pattern = /<\/?[A-Za-z][^>]*>/y;

/** Token categories emitted by the markdown tokenizer. */
export const enum token_kind {
	text = 0,
	html = 1,
	heading = 2,
	mustache = 3,
	code_fence = 4,
	line_break = 5,
}

/** AST node categories that mirror token kinds. */
export const enum node_kind {
	root = 0,
	text = 1,
	html = 2,
	heading = 3,
	mustache = 4,
	code_fence = 5,
	line_break = 6,
}

/** Options for controlling the markdown parser. */
export interface parse_options {
	arena?: arena;
	token_capacity?: number;
	error_capacity?: number;
}

/** Structured output produced by the markdown parser. */
export interface parse_result {
	arena: arena;
	root: number;
	tokens: token_buffer;
	errors: error_collector;
}

/** Aggregate state that flows through the tokenizer. */
interface parse_context {
	source: string;
	length: number;
	arena: arena;
	tokens: token_buffer;
	errors: error_collector;
	root: number;
}

/** Simple arena that stores AST node metadata in typed arrays. */
export class arena {
	private capacity: number;
	private type_ids: Uint8Array;
	private starts: Uint32Array;
	private ends: Uint32Array;
	private parents: Int32Array;
	private payloads: Uint32Array;
	private _size: number;

	/**
	 * Create a new arena with typed-array storage sized to the next power of two.
	 * @param initial_capacity Requested starting capacity for nodes.
	 */
	constructor(initial_capacity = DEFAULT_NODE_CAPACITY) {
		const capacity = next_power_of_two(initial_capacity);
		this.capacity = capacity;
		this.type_ids = new Uint8Array(capacity);
		this.starts = new Uint32Array(capacity);
		this.ends = new Uint32Array(capacity);
		this.parents = new Int32Array(capacity);
		this.payloads = new Uint32Array(capacity);
		this._size = 0;
	}

	/** Reset the arena so it can be reused without reallocating buffers. */
	reset(): void {
		this._size = 0;
	}

	/** Number of nodes that have been allocated. */
	get size(): number {
		return this._size;
	}

	/**
	 * Allocate a new node and store it in the arena.
	 * @param kind Kind of node to record.
	 * @param start Inclusive start offset in the source.
	 * @param end Exclusive end offset in the source.
	 * @param parent Index of the parent node, or -1 for root.
	 * @param payload Optional payload associated with the node.
	 */
	allocate(
		kind: node_kind,
		start: number,
		end: number,
		parent: number,
		payload = 0
	): number {
		const index = this._size;
		if (index >= this.capacity) {
			this.grow();
		}

		this.type_ids[index] = kind;
		this.starts[index] = start >>> 0;
		this.ends[index] = end >>> 0;
		this.parents[index] = parent;
		this.payloads[index] = payload >>> 0;

		this._size = index + 1;
		return index;
	}

	/**
	 * Retrieve the kind for the node at the given index.
	 * @param index Node index.
	 */
	get_kind(index: number): node_kind {
		return this.type_ids[index] as node_kind;
	}

	/**
	 * Retrieve the recorded start offset for the node.
	 * @param index Node index.
	 */
	get_start(index: number): number {
		return this.starts[index];
	}

	/**
	 * Retrieve the recorded end offset for the node.
	 * @param index Node index.
	 */
	get_end(index: number): number {
		return this.ends[index];
	}

	/**
	 * Retrieve the parent index for the node.
	 * @param index Node index.
	 */
	get_parent(index: number): number {
		return this.parents[index];
	}

	/**
	 * Retrieve the payload value stored for the node.
	 * @param index Node index.
	 */
	get_payload(index: number): number {
		return this.payloads[index];
	}

	/** Double the backing storage when capacity is exhausted. */
	private grow(): void {
		const next = this.capacity << 1;
		const next_type_ids = new Uint8Array(next);
		const next_starts = new Uint32Array(next);
		const next_ends = new Uint32Array(next);
		const next_parents = new Int32Array(next);
		const next_payloads = new Uint32Array(next);

		next_type_ids.set(this.type_ids);
		next_starts.set(this.starts);
		next_ends.set(this.ends);
		next_parents.set(this.parents);
		next_payloads.set(this.payloads);

		this.capacity = next;
		this.type_ids = next_type_ids;
		this.starts = next_starts;
		this.ends = next_ends;
		this.parents = next_parents;
		this.payloads = next_payloads;
	}
}

/** Growable buffer that records token spans and metadata. */
export class token_buffer {
	private capacity: number;
	private kinds: Uint8Array;
	private starts: Uint32Array;
	private ends: Uint32Array;
	private extras: Uint16Array;
	private value_starts: Uint32Array;
	private value_ends: Uint32Array;
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
		this._size = 0;
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
	 * @param start Inclusive start offset in the source.
	 * @param end Exclusive end offset in the source.
	 * @param extra Extra metadata stored alongside the token.
	 * @param value_start Start offset that excludes delimiters.
	 * @param value_end End offset that excludes delimiters.
	 */
	push(
		kind: token_kind,
		start: number,
		end: number,
		extra = 0,
		value_start = start,
		value_end = end
	): void {
		const index = this._size;
		if (index >= this.capacity) {
			this.grow();
		}

		this.kinds[index] = kind;
		this.starts[index] = start >>> 0;
		this.ends[index] = end >>> 0;
		this.extras[index] = extra & 0xffff;
		this.value_starts[index] = value_start >>> 0;
		this.value_ends[index] = value_end >>> 0;
		this._size = index + 1;
	}

	/**
	 * Get the token kind recorded at the supplied index.
	 * @param index Token index.
	 */
	kind_at(index: number): token_kind {
		return this.kinds[index] as token_kind;
	}

	/**
	 * Get the start offset recorded for the token.
	 * @param index Token index.
	 */
	start_at(index: number): number {
		return this.starts[index];
	}

	/**
	 * Get the end offset recorded for the token.
	 * @param index Token index.
	 */
	end_at(index: number): number {
		return this.ends[index];
	}

	/**
	 * Access the extra metadata value for the token.
	 * @param index Token index.
	 */
	extra_at(index: number): number {
		return this.extras[index];
	}

	/** Slice view of the stored token kinds. */
	kinds_slice(): Uint8Array {
		return this.kinds.subarray(0, this._size);
	}

	/** Slice view of the stored token start offsets. */
	starts_slice(): Uint32Array {
		return this.starts.subarray(0, this._size);
	}

	/** Slice view of the stored token end offsets. */
	ends_slice(): Uint32Array {
		return this.ends.subarray(0, this._size);
	}

	/** Slice view of the stored extra values. */
	extras_slice(): Uint16Array {
		return this.extras.subarray(0, this._size);
	}

	/**
	 * Get the value start offset for a token, excluding delimiters.
	 * @param index Token index.
	 */
	value_start_at(index: number): number {
		return this.value_starts[index];
	}

	/**
	 * Get the value end offset for a token, excluding delimiters.
	 * @param index Token index.
	 */
	value_end_at(index: number): number {
		return this.value_ends[index];
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

		next_kinds.set(this.kinds);
		next_starts.set(this.starts);
		next_ends.set(this.ends);
		next_extras.set(this.extras);
		next_value_starts.set(this.value_starts);
		next_value_ends.set(this.value_ends);

		this.capacity = next;
		this.kinds = next_kinds;
		this.starts = next_starts;
		this.ends = next_ends;
		this.extras = next_extras;
		this.value_starts = next_value_starts;
		this.value_ends = next_value_ends;
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

/**
 * Parse markdown that may include Svelte syntax into tokens and nodes.
 * @param input Source markdown string.
 * @param options Parser configuration and reusable storage.
 * @returns Arena-backed parse result and collected tokens.
 */
export function parse_markdown_svelte(
	input: string,
	options: parse_options = {}
): parse_result {
	const arena_instance = options.arena ?? new arena();
	if (options.arena) {
		arena_instance.reset();
	}

	const token_capacity =
		options.token_capacity ??
		Math.max(DEFAULT_TOKEN_CAPACITY, input.length >>> 2);
	const error_capacity = options.error_capacity ?? DEFAULT_ERROR_CAPACITY;

	const tokens = new token_buffer(token_capacity);
	const errors = new error_collector(error_capacity);
	const root = arena_instance.allocate(node_kind.root, 0, input.length, -1);

	const context: parse_context = {
		source: input,
		length: input.length,
		arena: arena_instance,
		tokens,
		errors,
		root,
	};

	tokenize(context);

	return { arena: arena_instance, root, tokens, errors };
}

/**
 * Tokenize the source string and populate token, arena, and error buffers.
 * @param context Shared parsing state.
 */
function tokenize(context: parse_context): void {
	const { source, length, errors } = context;
	let position = 0;
	let line_start = 0;

	while (position < length) {
		const code = source.charCodeAt(position);

		switch (code) {
			case SPACE:
			case TAB: {
				position = chomp_whitespace(source, length, position + 1);
				continue;
			}
			case LINEFEED: {
				emit_token(context, token_kind.line_break, position, position + 1);
				position += 1;
				line_start = position;
				continue;
			}
			case OCTOTHERP: {
				position = consume_heading(context, position, line_start);
				line_start = position;
				continue;
			}
			case OPEN_ANGLE_BRACKET: {
				position = consume_html(context, position);
				continue;
			}
			case OPEN_BRACE: {
				if (
					position + 1 < length &&
					source.charCodeAt(position + 1) === OPEN_BRACE
				) {
					const span_end = find_closing_mustache(source, length, position + 2);
					if (span_end === -1) {
						errors.push(position);
						emit_token(context, token_kind.mustache, position, length);
						return;
					}
					emit_token(context, token_kind.mustache, position, span_end + 2);
					position = span_end + 2;
					continue;
				}
				break;
			}
			case BACKTICK:
		case TILDE: {
				position = consume_code_fence(context, position);
				continue;
			}
			default: {
				position = chomp_text(context, position);
				continue;
			}
		}

		position += 1;
	}
}

/**
 * Emit a token and allocate a matching node in the arena.
 * @param context Shared parsing state.
 * @param kind Token category to record.
 * @param start Inclusive start offset in the source string.
 * @param end Exclusive end offset in the source string.
 * @param payload Additional token metadata.
 * @param value_start Start offset excluding delimiters.
 * @param value_end End offset excluding delimiters.
 */
function emit_token(
	context: parse_context,
	kind: token_kind,
	start: number,
	end: number,
	payload = 0,
	value_start = start,
	value_end = end
): void {
	context.tokens.push(kind, start, end, payload, value_start, value_end);
	const node_kind_value = map_token_kind(kind);
	context.arena.allocate(node_kind_value, start, end, context.root, payload);
}

/**
 * Consume a run of tab or space characters.
 * @param source Source string being parsed.
 * @param length Total length of the source.
 * @param position Offset where whitespace consumption should begin.
 * @returns Offset immediately after the whitespace run.
 */
function chomp_whitespace(
	source: string,
	length: number,
	position: number
): number {
	while (position < length) {
		const code = source.charCodeAt(position);
		if (!(code === SPACE || code === TAB)) {
			break;
		}
		position += 1;
	}
	return position;
}

/**
 * Consume plain text until a control character or delimiter is hit.
 * @param context Shared parsing state.
 * @param position Offset where text consumption begins.
 * @returns Offset after the consumed text.
 */
function chomp_text(context: parse_context, position: number): number {
	const { source, length } = context;
	const start = position;
	while (position < length) {
		const code = source.charCodeAt(position);
		if (
			code === LINEFEED ||
			code === OPEN_ANGLE_BRACKET ||
			code === OPEN_BRACE ||
			code === BACKTICK ||
			code === OCTOTHERP
		) {
			break;
		}
		position += 1;
	}

	if (position > start) {
		emit_token(context, token_kind.text, start, position);
	}
	return position;
}

/**
 * Parse a markdown heading, falling back to text if the syntax is invalid.
 * @param context Shared parsing state.
 * @param position Offset where the potential heading starts.
 * @param line_start Offset where the current line begins.
 * @returns Offset immediately after the processed line.
 */
function consume_heading(
	context: parse_context,
	position: number,
	line_start: number
): number {
	const { source, length } = context;
	const start = position;

	if (!line_prefix_allows_heading(source, line_start, start)) {
		return emit_plain_text_line(context, start);
	}

	let index = position;
	let hashes = 0;
	while (index < length && source.charCodeAt(index) === OCTOTHERP) {
		hashes += 1;
		index += 1;
	}

	if (hashes === 0) {
		return emit_plain_text_line(context, start);
	}

	if (hashes > 6) {
		return emit_plain_text_line(context, start);
	}

	if (index < length) {
		const next = source.charCodeAt(index);
		if (!(next === SPACE || next === TAB || next === LINEFEED)) {
			return emit_plain_text_line(context, start);
		}
	}

	let content_start = index;
	while (content_start < length) {
		const char_code = source.charCodeAt(content_start);
		if (char_code === SPACE || char_code === TAB) {
			content_start += 1;
			continue;
		}
		break;
	}

	let line_end = content_start;
	while (line_end < length && source.charCodeAt(line_end) !== LINEFEED) {
		line_end += 1;
	}

	let value_end = line_end;
	while (value_end > content_start) {
		const trailing = source.charCodeAt(value_end - 1);
		if (trailing === SPACE || trailing === TAB) {
			value_end -= 1;
			continue;
		}
		break;
	}

	if (line_end < length && source.charCodeAt(line_end) === LINEFEED) {
		line_end += 1;
	}

	const token_end = line_end;
	emit_token(
		context,
		token_kind.heading,
		start,
		token_end,
		hashes,
		content_start,
		value_end
	);
	return token_end;
}

/**
 * Determine whether the characters preceding a hash run allow a heading.
 * @param source Source string being parsed.
 * @param line_start Offset where the current line starts.
 * @param position Offset of the first octothorpe.
 * @returns `true` when the prefix permits a heading, otherwise `false`.
 */
function line_prefix_allows_heading(
	source: string,
	line_start: number,
	position: number
): boolean {
	for (let index = line_start; index < position; index += 1) {
		const code = source.charCodeAt(index);
		if (code === SPACE) {
			continue;
		}
		if (code === TAB) {
			return false;
		}
		return false;
	}
	return true;
}

/**
 * Emit an entire line as a text token.
 * @param context Shared parsing state.
 * @param start Offset where the line begins.
 * @returns Offset immediately after the line.
 */
function emit_plain_text_line(context: parse_context, start: number): number {
	const { source, length } = context;
	let end = start;
	while (end < length && source.charCodeAt(end) !== LINEFEED) {
		end += 1;
	}
	emit_token(context, token_kind.text, start, end);
	return end;
}


/**
 * Attempt to consume an HTML tag token; otherwise fall back to text.
 * @param context Shared parsing state.
 * @param position Offset where the HTML sequence begins.
 * @returns Offset immediately after the emitted token.
 */
function consume_html(context: parse_context, position: number): number {
	const { source, length } = context;
	html_tag_pattern.lastIndex = position;
	const match = html_tag_pattern.exec(source);
	if (match) {
		const end = html_tag_pattern.lastIndex;
		emit_token(context, token_kind.html, position, end);
		return end;
	}
	const end = position + 1 <= length ? position + 1 : length;
	emit_token(context, token_kind.text, position, end);
	return end;
}

/**
 * Parse a fenced code block and emit either a fence token or fallback text.
 * @param context Shared parsing state.
 * @param position Offset where the fence begins.
 * @returns Offset immediately after the closing fence or end of input.
 */
function consume_code_fence(context: parse_context, position: number): number {
	const { source, length, errors } = context;
	const start = position;
	const fence_char = source.charCodeAt(position);
	let run = 0;
	while (position < length && source.charCodeAt(position) === fence_char) {
		run += 1;
		position += 1;
	}

	if (run < 3) {
		emit_token(context, token_kind.text, start, position);
		return position;
	}

	const info_start = position;
	let info_end = position;
	let info_contains_illegal_backtick = false;
	while (info_end < length && source.charCodeAt(info_end) !== LINEFEED) {
		if (fence_char === BACKTICK && source.charCodeAt(info_end) === BACKTICK) {
			info_contains_illegal_backtick = true;
		}
		info_end += 1;
	}

	if (info_contains_illegal_backtick) {
		emit_token(context, token_kind.text, start, info_end);
		return info_end;
	}

	const content_start = info_end < length ? info_end + 1 : info_end;
	let position_after_open = content_start;

	while (position_after_open < length) {
		const code = source.charCodeAt(position_after_open);
		if (code === fence_char) {
			let closing = position_after_open;
			let matching = 0;
			while (
				closing < length &&
				source.charCodeAt(closing) === fence_char &&
				matching < run
			) {
				matching += 1;
				closing += 1;
			}
			if (matching === run) {
				emit_token(
					context,
					token_kind.code_fence,
					start,
					closing,
					0,
					content_start,
					position_after_open
				);
				return closing;
			}
			position_after_open = closing;
			continue;
		}
		position_after_open += 1;
	}

	errors.push(start);
	emit_token(context, token_kind.code_fence, start, length, 0, content_start, length);
	return length;
}

/**
 * Locate the position of the closing `}}`, accounting for nesting levels.
 * @param source Source string being parsed.
 * @param length Total length of the source string.
 * @param position Offset immediately after the opening braces.
 * @returns Offset of the closing braces or -1 when unterminated.
 */
function find_closing_mustache(
	source: string,
	length: number,
	position: number
): number {
	let depth = 1;
	while (position < length) {
		const code = source.charCodeAt(position);
		if (
			code === OPEN_BRACE &&
			position + 1 < length &&
			source.charCodeAt(position + 1) === OPEN_BRACE
		) {
			depth += 1;
			position += 2;
			continue;
		}
		if (
			code === CLOSE_BRACE &&
			position + 1 < length &&
			source.charCodeAt(position + 1) === CLOSE_BRACE
		) {
			depth -= 1;
			if (depth === 0) {
				return position;
			}
			position += 2;
			continue;
		}
		position += 1;
	}
	return -1;
}

/**
 * Convert a token kind into the matching node kind.
 * @param kind Token kind to convert.
 * @returns Corresponding node kind.
 */
function map_token_kind(kind: token_kind): node_kind {
	switch (kind) {
		case token_kind.text:
			return node_kind.text;
		case token_kind.html:
			return node_kind.html;
		case token_kind.heading:
			return node_kind.heading;
		case token_kind.mustache:
			return node_kind.mustache;
		case token_kind.code_fence:
			return node_kind.code_fence;
		default:
			return node_kind.line_break;
	}
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
