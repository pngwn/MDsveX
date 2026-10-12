import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Nodes, Root } from "mdast";

import { serialize, type SerializeOptions } from "./serialize.js";
import { migrate_frontmatter, split_frontmatter } from "./frontmatter.js";

export interface MigrateOptions extends SerializeOptions {}

const processor = unified().use(remarkParse).use(remarkGfm);
const math_processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

const DOLLAR = 36;

function is_digit(code: number): boolean {
	return code >= 48 && code <= 57;
}

/**
 * the offsets of the dollars remark-math opens math at that read as a price,
 * a digit follows the dollar, and the dollar that closes the math has a space
 * before it or a digit after it, as in `$5 and $10` and `$5-$10`
 */
function prices(tree: Root, body: string): number[] {
	const out: number[] = [];
	const walk = (node: Nodes): void => {
		if (node.type === "inlineMath") {
			const start = node.position!.start.offset!;
			const end = node.position!.end.offset!;
			if (
				body.charCodeAt(start + 1) !== DOLLAR &&
				is_digit(body.charCodeAt(start + 1)) &&
				(/\s/.test(body[end - 2]) || is_digit(body.charCodeAt(end)))
			)
				out.push(start);
		}
		if ("children" in node) for (const child of node.children) walk(child);
	};
	walk(tree);
	return out;
}

/** a paragraph that is only math in double dollars is display math, as remark-math read it in 0.x */
function display_math(tree: Root, body: string): void {
	const walk = (node: Nodes): void => {
		if (!("children" in node)) return;
		const children = node.children as Nodes[];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (
				child.type === "paragraph" &&
				child.children.length === 1 &&
				child.children[0].type === "inlineMath" &&
				body.startsWith("$$", child.children[0].position!.start.offset!)
			)
				children[i] = { type: "math", value: child.children[0].value, meta: null };
			else walk(child);
		}
	};
	walk(tree);
}

/**
 * the tree remark-math reads, with the dollars of a price escaped first so
 * what is between two prices is read as markdown and not as latex
 */
function parse_math(body: string): Root {
	for (;;) {
		const tree = math_processor.parse(body) as Root;
		const at = prices(tree, body);
		if (at.length === 0) {
			display_math(tree, body);
			return tree;
		}
		for (let i = at.length - 1; i >= 0; i--)
			body = body.slice(0, at[i]) + "\\" + body.slice(at[i]);
	}
}

/**
 * Migrate a CommonMark/GFM markdown string to Penguin-Flavoured Markdown (PFM).
 *
 * The source is parsed with the remark (unified) ecosystem into an mdast tree,
 * then re-serialised under PFM's rules: ATX-only headings, fenced-only code,
 * `_`/`*` emphasis/strong, backslash hard breaks, fully-prefixed blockquotes,
 * explicit reference links with hoisted definitions, and GFM tables/strike.
 *
 * frontmatter is kept, with its layout key renamed to template
 *
 * with the math option the document is read as remark-math read it, and its
 * `$x$` and `$$x$$` are written as inline math and math fences
 */
export function migrate(markdown: string, options: MigrateOptions = {}): string {
	const { frontmatter, body } = split_frontmatter(markdown);
	const tree = options.math === true ? parse_math(body) : (processor.parse(body) as Root);
	const out = serialize(tree, options);
	if (frontmatter === "") return out;

	let head = migrate_frontmatter(frontmatter).code;
	if (!head.endsWith("\n")) head += "\n";
	return out === "\n" ? head : head + "\n" + out;
}

export {
	serialize,
	type LegacySmartypants,
	type SerializeOptions,
} from "./serialize.js";
export { migrate_frontmatter } from "./frontmatter.js";
export { migrate_config } from "./config.js";
export { check_template } from "./template.js";
export type { MigrateResult, MigrationNote, NoteKind } from "./notes.js";
