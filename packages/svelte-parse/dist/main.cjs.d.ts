import { Node, Point, Root } from 'svast';

interface Result {
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
    position: Point & {
        index?: number;
    };
}
interface ParseNodeOptions {
    /**
     * The input value to be parsed
     */
    value: string;
    /**
     * The current position in the document
     */
    currentPosition?: Point & {
        index?: number;
    };
    /**
     * The parser to use when parsing children, this defaults to `parseNode`
     */
    childParser: (options: ParseNodeOptions) => [Node[], Point & {
        index?: number;
    }, number];
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
interface ParseOptions {
    /**
     * The input value to be parsed
     */
    value: string;
    /**
     * Generate positional data
     */
    generatePositions: boolean;
}

declare function parseNode(opts: ParseNodeOptions): Result | undefined;
declare function parse(opts: ParseOptions): Root;

export { parse, parseNode };
