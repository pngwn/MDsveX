import type { node_buffer, error_collector } from "./utils";
import type { ParsePlugin } from "./plugin_types";

/** options for controlling the markdown parser. */
export interface parse_options {
	token_capacity?: number;
	error_capacity?: number;

	/** column width of a tab character (default: 2). */
	tab_size?: number;

	/** parse plugins that hook into tree construction. */
	plugins?: ParsePlugin[];
}

/** structured output produced by the markdown parser. */
export interface parse_result {
	root: number;
	tokens: node_buffer;
	errors: error_collector;
}

/** aggregate state that flows through the tokenizer. */
export interface parse_context {
	source: string;
	length: number;
	tokens: node_buffer;
	errors: error_collector;
	root: number;
}
