import { Point, Node } from 'svast';

export const TAB = 9; // "\t"
export const LINEFEED = 10; // "\n"
export const SPACE = 32; // " "
export const QUOTE = 34; // "'"
export const OCTOTHERP = 35; // "#"
export const APOSTROPHE = 39; // "'"
export const DASH = 45; // "-"
export const DOT = 46; // "."
export const SLASH = 47; // "/"
export const COLON = 58; // ":"
export const OPEN_ANGLE_BRACKET = 60; // "<"
export const EQUALS = 61; // "="
export const CLOSE_ANGLE_BRACKET = 62; // ">"
export const AT = 64; // "@"
export const OPEN_BRACE = 123; // "{"
export const CLOSE_BRACE = 125; // "}"
export const UPPERCASE_A = 65; // "A"
export const UPPERCASE_Z = 90; // "Z"
export const BACKSLASH = 92; // "\"
export const BACKTICK = 96;
export const LOWERCASE_A = 97; // "A"
export const LOWERCASE_Z = 122; // "Z"
export const PIPE = 124; // "|"
export const RE_BLOCK_BRANCH = /^{\s*(?::|\/)/;
export const RE_SCRIPT_STYLE = /^<\/(?:script|style)\s*>/;
export const RE_COMMENT_START = /^<!--/;
export const RE_COMMENT_END = /^-->/;
export const RE_END_TAG_START = /^<\s*\//;
export interface Result {
	/**
	 * The chomped string, what has been parsed. This is a substring of the input value.
	 */
	chomped: string;

	/**
	 * The unchomped string, what is still left to parse. This is a substring of the input value.
	 */
	unchomped: string;

	/**
	 * The AST node. The result of the parse.
	 */
	parsed: Node;
	/**
	 * The location in the document where the parse finished. This can be passed back into the parseNode function to maintain positional information on subsequent passes.
	 */
	position: Point & { index?: number };
}

export interface ParseNodeOptions {
	/**
	 * The input value to be parsed
	 */
	value: string;
	/**
	 * The current position in the document
	 */
	currentPosition?: Point & { index?: number };
	/**
	 * The parser to use when parsing children, this defaults to `parseNode`
	 */
	childParser: (
		options: ParseNodeOptions
	) => [Node[], Point & { index?: number }, number];
	/**
	 * Are we currently in a block or are we currently inline?
	 */
	block?: boolean;
	/**
	 * I'm not really sure what this is for
	 */
	silent?: boolean;
	/**
	 * Generate positional data
	 */
	generatePositions: boolean;
}

export interface ParseOptions {
	/**
	 * The input value to be parsed
	 */
	value: string;
	/**
	 * Generate positional data
	 */
	generatePositions: boolean;
}

export enum State {
	IN_START_TAG,
	IN_TAG_NAME,
	IN_TAG_BODY,
	IN_SHORTHAND_ATTR,
	IN_ATTR_NAME,
	IN_DIRECTIVE_SPECIFIER,
	IN_ATTR_MODIFIER,
	START_ATTR_VALUE,
	IN_ATTR_VALUE,
	IN_UNQUOTED_ATTR_VALUE,
	IN_QUOTED_ATTR_VALUE,
	IN_ATTR_EXPRESSION,
	IN_CLOSING_SLASH,
	IN_CLOSE_TAG,
	IN_EXPRESSION,
	PARSE_CHILDREN,
	EXPECT_END_OR_BRANCH,
	IN_TEXT,
	IN_EXPRESSION_QUOTE,
	MAYBE_IN_EXPRESSION,
	IN_VOID_BLOCK,
	IN_BRANCHING_BLOCK,
	IN_BRANCHING_BLOCK_BRANCH,
	IN_BRANCHING_BLOCK_END,
	IN_BRANCHING_BLOCK_NAME,
	IN_BRANCHING_BLOCK_BRANCH_NAME,
	IN_SCRIPT_STYLE,
	IN_COMMENT,
}
