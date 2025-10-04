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
	paragraph = 7,
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

const enum parser_state {
	block = 0,
	inline_heading = 1,
	inline_paragraph = 2,
}

interface block_frame {
	state: parser_state.block;
	node: number;
}

interface inline_frame {
	state: parser_state.inline_heading | parser_state.inline_paragraph;
	node: number;
	end: number;
	resume: number;
	line_start_after: number;
	cursor: number;
}

type stack_frame = block_frame | inline_frame;

interface inline_transition {
	state: parser_state.inline_heading | parser_state.inline_paragraph;
	node: number;
	inline_start: number;
	inline_end: number;
	resume: number;
	line_start_after: number;
}

interface heading_transition {
	node: number;
	content_start: number;
	content_end: number;
	resume: number;
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
	const stack: stack_frame[] = [{ state: parser_state.block, node: context.root }];
	let position = 0;
	let line_start = 0;

	while (position < length) {
		const active = stack[stack.length - 1];
		if (active.state !== parser_state.block) {
			const inline = active as inline_frame;
			if (position >= inline.end) {
				flush_inline_text(context, inline, inline.end);
				stack.pop();
				position = inline.resume;
				line_start = inline.line_start_after;
				continue;
			}
		}

		const state = stack[stack.length - 1].state;
		const code = source.charCodeAt(position);

		if (state === parser_state.block) {
			switch (code) {
				case SPACE:
				case TAB: {
					position = chomp_whitespace(source, length, position + 1);
					continue;
				}
				case LINEFEED: {
					emit_token(context, stack, token_kind.line_break, position, position + 1);
					position += 1;
					line_start = position;
					continue;
				}
				case OCTOTHERP: {
					const heading = start_heading(context, stack, position, line_start);
					if (heading) {
						push_inline_frame(stack, {
							state: parser_state.inline_heading,
							node: heading.node,
							inline_start: heading.content_start,
							inline_end: heading.content_end,
							resume: heading.resume,
							line_start_after: heading.resume,
						});
						position = heading.content_start;
						continue;
					}
					const fallback = start_plain_text_line(context, stack, position, line_start);
					push_inline_frame(stack, fallback);
					position = fallback.inline_start;
					continue;
				}
				case OPEN_ANGLE_BRACKET: {
					const html_position = consume_html(context, stack, position);
					if (html_position !== position) {
						position = html_position;
						continue;
					}
					const paragraph = start_paragraph_span(context, stack, position, line_start);
					push_inline_frame(stack, paragraph);
					position = paragraph.inline_start;
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
							emit_token(context, stack, token_kind.mustache, position, length);
							return;
						}
						emit_token(context, stack, token_kind.mustache, position, span_end + 2);
						position = span_end + 2;
						continue;
					}
					const paragraph = start_paragraph_span(context, stack, position, line_start);
					push_inline_frame(stack, paragraph);
					position = paragraph.inline_start;
					continue;
				}
				case BACKTICK:
				case TILDE: {
					const fence_position = consume_code_fence(context, stack, position, line_start);
					if (fence_position !== position) {
						position = fence_position;
						continue;
					}
					const paragraph = start_paragraph_span(context, stack, position, line_start);
					push_inline_frame(stack, paragraph);
					position = paragraph.inline_start;
					continue;
				}
				default: {
					const paragraph = start_paragraph_span(context, stack, position, line_start);
					push_inline_frame(stack, paragraph);
					position = paragraph.inline_start;
					continue;
				}
			}
		} else {
			position = process_inline(context, stack, active as inline_frame, position);
			continue;
		}

		position += 1;
	}

	while (stack.length > 1) {
		const frame = stack.pop() as inline_frame;
		flush_inline_text(context, frame, Math.min(frame.end, length));
		position = frame.resume;
		line_start = frame.line_start_after;
	}
}

function push_inline_frame(stack: stack_frame[], transition: inline_transition): void {
	stack.push({
		state: transition.state,
		node: transition.node,
		end: transition.inline_end,
		resume: transition.resume,
		line_start_after: transition.line_start_after,
		cursor: transition.inline_start,
	});
}

function flush_inline_text(context: parse_context, frame: inline_frame, upto: number): void {
	if (upto <= frame.cursor) {
		return;
	}
	context.arena.allocate(node_kind.text, frame.cursor, upto, frame.node, 0);
	frame.cursor = upto;
}

function process_inline(
	context: parse_context,
	stack: stack_frame[],
	frame: inline_frame,
	position: number
): number {
	const { source, length, errors } = context;
	const limit = Math.min(frame.end, length);
	if (position >= limit) {
		return position;
	}

	const code = source.charCodeAt(position);

	if (
		code === OPEN_BRACE &&
		position + 1 < length &&
		source.charCodeAt(position + 1) === OPEN_BRACE
	) {
		flush_inline_text(context, frame, position);
		const span_end = find_closing_mustache(source, length, position + 2);
		if (span_end === -1) {
			errors.push(position);
			emit_token(context, stack, token_kind.mustache, position, length, 0, position, length, frame.node);
			return length;
		}
		const token_end = span_end + 2;
		emit_token(context, stack, token_kind.mustache, position, token_end, 0, position, token_end, frame.node);
		frame.cursor = token_end;
		return token_end;
	}

	if (code === OPEN_ANGLE_BRACKET) {
		html_tag_pattern.lastIndex = position;
		const match = html_tag_pattern.exec(source);
		if (match) {
			const end = html_tag_pattern.lastIndex;
			if (end <= frame.end) {
				flush_inline_text(context, frame, position);
				emit_token(context, stack, token_kind.html, position, end, 0, position, end, frame.node);
				frame.cursor = end;
				return end;
			}
		}
		return position + 1;
	}

	if (code === LINEFEED) {
		flush_inline_text(context, frame, position);
		frame.end = position;
		return position;
	}

	return position + 1;
}

function start_heading(
	context: parse_context,
	stack: stack_frame[],
	position: number,
	line_start: number
): heading_transition | null {
	const { source, length } = context;
	if (!line_prefix_allows_heading(source, line_start, position)) {
		return null;
	}

	let index = position;
	let hashes = 0;
	while (index < length && source.charCodeAt(index) === OCTOTHERP) {
		hashes += 1;
		index += 1;
	}

	if (hashes === 0 || hashes > 6) {
		return null;
	}

	if (index < length) {
		const next = source.charCodeAt(index);
		if (!(next === SPACE || next === TAB || next === LINEFEED)) {
			return null;
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

	const node = emit_token(
		context,
		stack,
		token_kind.heading,
		position,
		line_end,
		hashes,
		content_start,
		value_end
	);

	return {
		node,
		content_start,
		content_end: value_end,
		resume: line_end,
	};
}

function start_plain_text_line(
	context: parse_context,
	stack: stack_frame[],
	position: number,
	line_start: number
): inline_transition {
	const { source, length } = context;
	let line_end = position;
	while (line_end < length && source.charCodeAt(line_end) !== LINEFEED) {
		line_end += 1;
	}

	const node = emit_token(context, stack, token_kind.text, position, line_end);
	return {
		state: parser_state.inline_paragraph,
		node,
		inline_start: position,
		inline_end: line_end,
		resume: line_end,
		line_start_after: line_start,
	};
}

function start_paragraph_span(
	context: parse_context,
	stack: stack_frame[],
	position: number,
	line_start: number
): inline_transition {
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

	if (position === start) {
		position = Math.min(length, start + 1);
	}

	const node = emit_token(context, stack, token_kind.text, start, position);
	return {
		state: parser_state.inline_paragraph,
		node,
		inline_start: start,
		inline_end: position,
		resume: position,
		line_start_after: line_start,
	};
}

/**
 * Emit a token and allocate a matching node in the arena.
 * @param context Shared parsing state.
 * @param stack Active frame stack used to determine the current parent node.
 * @param kind Token category to record.
 * @param start Inclusive start offset in the source string.
 * @param end Exclusive end offset in the source string.
 * @param payload Additional token metadata.
 * @param value_start Start offset excluding delimiters.
 * @param value_end End offset excluding delimiters.
 */
function emit_token(
	context: parse_context,
	stack: stack_frame[],
	kind: token_kind,
	start: number,
	end: number,
	payload = 0,
	value_start = start,
	value_end = end,
	parent_override?: number
): number {
	context.tokens.push(kind, start, end, payload, value_start, value_end);
	const parent = parent_override ?? current_block_parent(stack);
	const node_kind_value = map_token_kind(kind);
	return context.arena.allocate(node_kind_value, start, end, parent, payload);
}

function current_block_parent(stack: stack_frame[]): number {
	for (let index = stack.length - 1; index >= 0; index -= 1) {
		const frame = stack[index];
		if (frame.state === parser_state.block) {
			return frame.node;
		}
	}
	return (stack[0] as block_frame).node;
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
 * Attempt to consume an HTML tag token; otherwise signal the caller to treat it as text.
 * @param context Shared parsing state.
 * @param stack Active frame stack used for token emission.
 * @param position Offset where the HTML sequence begins.
 * @param parent_override Optional parent node for inline contexts.
 * @returns Offset where scanning should resume, or `position` when no tag was matched.
 */
function consume_html(
	context: parse_context,
	stack: stack_frame[],
	position: number,
	parent_override?: number,
	max_end?: number
): number {
	const { source } = context;
	html_tag_pattern.lastIndex = position;
	const match = html_tag_pattern.exec(source);
	if (!match) {
		return position;
	}
	const end = html_tag_pattern.lastIndex;
	if (max_end !== undefined && end > max_end) {
		return position;
	}
	emit_token(context, stack, token_kind.html, position, end, 0, position, end, parent_override);
	return end;
}

/**
 * Parse a fenced code block and emit either a fence token or fallback to text.
 * @param context Shared parsing state.
 * @param stack Active frame stack used for token emission.
 * @param position Offset where the fence begins.
 * @param line_start Offset where the current line begins.
 * @returns Offset where scanning should resume.
 */
function consume_code_fence(
	context: parse_context,
	stack: stack_frame[],
	position: number,
	line_start: number
): number {
	const { source, length, errors } = context;
	const start = position;
	const fence_char = source.charCodeAt(position);
	let run = 0;
	while (position < length && source.charCodeAt(position) === fence_char) {
		run += 1;
		position += 1;
	}

	if (run < 3) {
		const fallback = start_plain_text_line(context, stack, start, line_start);
		push_inline_frame(stack, fallback);
		return fallback.inline_start;
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
		const fallback = start_plain_text_line(context, stack, start, line_start);
		push_inline_frame(stack, fallback);
		return fallback.inline_start;
	}

	const content_start = info_end < length ? info_end + 1 : info_end;
	let position_after_open = content_start;

	while (position_after_open < length) {
		const code = source.charCodeAt(position_after_open);
		if (code === fence_char) {
			let closing = position_after_open;
			let matching = 0;
			while (closing < length && source.charCodeAt(closing) === fence_char && matching < run) {
				matching += 1;
				closing += 1;
			}
			if (matching === run) {
				emit_token(
					context,
					stack,
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
	emit_token(context, stack, token_kind.code_fence, start, length, 0, content_start, length);
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
			return node_kind.paragraph;
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
