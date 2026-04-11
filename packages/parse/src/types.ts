import type { NodeBuffer, ErrorCollector } from "./utils";
import type { ParsePlugin } from "./plugin_types";

/** options for controlling the markdown parser. */
export interface ParseOptions {
	token_capacity?: number;
	error_capacity?: number;

	/** column width of a tab character (default: 2). */
	tab_size?: number;

	/** parse plugins that hook into tree construction. */
	plugins?: ParsePlugin[];
}

/** structured output produced by the markdown parser. */
export interface ParseResult {
	root: number;
	tokens: NodeBuffer;
	errors: ErrorCollector;
}

/** aggregate state that flows through the tokenizer. */
export interface ParseContext {
	source: string;
	length: number;
	tokens: NodeBuffer;
	errors: ErrorCollector;
	root: number;
}
