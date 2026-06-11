import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";

import { serialize, type SerializeOptions } from "./serialize.js";

export interface MigrateOptions extends SerializeOptions {}

const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * Migrate a CommonMark/GFM markdown string to Penguin-Flavoured Markdown (PFM).
 *
 * The source is parsed with the remark (unified) ecosystem into an mdast tree,
 * then re-serialised under PFM's rules: ATX-only headings, fenced-only code,
 * `_`/`*` emphasis/strong, backslash hard breaks, fully-prefixed blockquotes,
 * explicit reference links with hoisted definitions, and GFM tables/strike.
 */
export function migrate(markdown: string, options: MigrateOptions = {}): string {
	const tree = processor.parse(markdown) as Root;
	return serialize(tree, options);
}

export { serialize, type SerializeOptions } from "./serialize.js";
