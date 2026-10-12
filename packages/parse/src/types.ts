import type { NodeBuffer, ErrorCollector } from './utils';
import type { DirectiveTable, ParsePlugin } from './plugin_types';

/** syntax choices the parser reads, every one off by default */
export interface SyntaxOptions {
	/**
	 * a paragraph of only images and whitespace gets no paragraph node, the
	 * images are children of what held it, an image counts as a tag does in a
	 * paragraph of tags and may sit in a link that holds nothing else
	 *
	 * @example
	 * ![a chart](/chart.png)
	 */
	unwrap_images?: boolean;
}

/** options for controlling the markdown parser. */
export interface ParseOptions extends SyntaxOptions {
	token_capacity?: number;
	error_capacity?: number;

	/** column width of a tab character (default: 2). */
	tab_size?: number;

	/** parse plugins that hook into tree construction. */
	plugins?: ParsePlugin[];

	/**
	 * handlers bound to directive names, a later table replaces the entry an
	 * earlier one has for a name, read once per array, a table can come with
	 * the name of its plugin, as { name, directives }
	 */
	directive_handlers?: DirectiveTable[];

	/** the path of the document, plugin handlers read it as ctx.filename */
	filename?: string;

	/**
	 * parses the frontmatter for plugin handlers, called once with the text
	 * between the fences when a handler first reads ctx.frontmatter
	 */
	frontmatter?: (text: string) => Record<string, unknown> | undefined;
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
