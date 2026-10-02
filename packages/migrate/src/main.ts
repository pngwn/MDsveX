import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";

import { serialize, type SerializeOptions } from "./serialize.js";
import { migrate_frontmatter, split_frontmatter } from "./frontmatter.js";

export interface MigrateOptions extends SerializeOptions {}

const processor = unified().use(remarkParse).use(remarkGfm);

/**
 * Migrate a CommonMark/GFM markdown string to Penguin-Flavoured Markdown (PFM).
 *
 * The source is parsed with the remark (unified) ecosystem into an mdast tree,
 * then re-serialised under PFM's rules: ATX-only headings, fenced-only code,
 * `_`/`*` emphasis/strong, backslash hard breaks, fully-prefixed blockquotes,
 * explicit reference links with hoisted definitions, and GFM tables/strike.
 *
 * frontmatter is kept, with its layout key renamed to template
 */
export function migrate(markdown: string, options: MigrateOptions = {}): string {
	const { frontmatter, body } = split_frontmatter(markdown);
	const tree = processor.parse(body) as Root;
	const out = serialize(tree, options);
	if (frontmatter === "") return out;

	let head = migrate_frontmatter(frontmatter).code;
	if (!head.endsWith("\n")) head += "\n";
	return out === "\n" ? head : head + "\n" + out;
}

export { serialize, type SerializeOptions } from "./serialize.js";
export { migrate_frontmatter } from "./frontmatter.js";
export { migrate_config } from "./config.js";
export { check_template } from "./template.js";
export type { MigrateResult, MigrationNote, NoteKind } from "./notes.js";
