import type { node_buffer, error_collector } from './utils';

/** Options for controlling the markdown parser. */
export interface parse_options {
	token_capacity?: number;
	error_capacity?: number;
}

/** Structured output produced by the markdown parser. */
export interface parse_result {
	root: number;
	tokens: node_buffer;
	errors: error_collector;
}

/** Aggregate state that flows through the tokenizer. */
export interface parse_context {
	source: string;
	length: number;
	tokens: node_buffer;
	errors: error_collector;
	root: number;
}
