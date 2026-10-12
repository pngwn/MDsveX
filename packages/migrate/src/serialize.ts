import type {
	Blockquote,
	Code,
	Definition,
	FootnoteDefinition,
	FootnoteReference,
	Heading,
	Image,
	ImageReference,
	InlineCode,
	Link,
	LinkReference,
	List,
	ListItem,
	Nodes,
	Paragraph,
	PhrasingContent,
	Root,
	RootContent,
	Table,
	TableCell,
	TableRow,
} from "mdast";

import { escape_inline, escape_line_starts } from "./escape.js";

/** the smartypants option of mdsvex 0.x, which was on unless it was false */
export type LegacySmartypants =
	| boolean
	| {
			quotes?: boolean;
			ellipses?: boolean;
			backticks?: boolean | "all";
			dashes?: boolean | "oldschool" | "inverted";
	  };

export interface SerializeOptions {
	/**
	 * Bullet marker for unordered lists. PFM permits `-`, `+` or `*`; we default
	 * to `-` as the least ambiguous (`*` collides with strong emphasis).
	 */
	bullet?: "-" | "+" | "*";
	/**
	 * the smartypants option the documents were written for, true for a 0.x
	 * config that never set it, dashes and backtick quotes are rewritten so
	 * the smart_punctuation option of next renders what 0.x did, unset leaves
	 * them as written
	 */
	smartypants?: LegacySmartypants;
}

interface Context {
	bullet: string;
	/** inverted swaps two and three hyphens, em makes two into three and keeps three literal */
	dashes: "em" | "inverted" | false;
	backticks: boolean | "all";
	/** false when nothing curls a straight quote, a backtick quote is then written curly */
	quotes: boolean;
}

/** Serialise a parsed mdast tree to a PFM document string. */
export function serialize(tree: Root, options: SerializeOptions = {}): string {
	const smart = options.smartypants;
	const on = smart !== undefined && smart !== false;
	const set = typeof smart === "object" && smart !== null ? smart : {};
	const dashes = set.dashes ?? true;
	const ctx: Context = {
		bullet: options.bullet ?? "-",
		// oldschool is what next does
		dashes: !on || dashes === false || dashes === "oldschool" ? false : dashes === "inverted" ? "inverted" : "em",
		backticks: on ? (set.backticks ?? true) : false,
		quotes: set.quotes !== false,
	};
	return serialize_root(tree, ctx);
}

function serialize_root(root: Root, ctx: Context): string {
	// Hoist every link/image definition to the top of the document so each one
	// precedes its first use — PFM forbids forward references.
	const definitions = collect_definitions(root);
	const blocks: string[] = [];

	for (const def of definitions) blocks.push(serialize_definition(def));

	for (const child of root.children) {
		if (child.type === "definition") continue; // already hoisted
		blocks.push(serialize_block(child, ctx));
	}

	return blocks.filter((b) => b.length > 0).join("\n\n") + "\n";
}

function collect_definitions(node: Nodes): Definition[] {
	const out: Definition[] = [];
	const walk = (n: Nodes): void => {
		if (n.type === "definition") out.push(n);
		if ("children" in n && Array.isArray(n.children)) {
			for (const c of n.children) walk(c as Nodes);
		}
	};
	walk(node);
	return out;
}

function serialize_block(node: RootContent, ctx: Context): string {
	switch (node.type) {
		case "paragraph":
			return serialize_paragraph(node, ctx);
		case "heading":
			return serialize_heading(node, ctx);
		case "code":
			return serialize_code(node);
		case "blockquote":
			return serialize_blockquote(node, ctx);
		case "list":
			return serialize_list(node, ctx);
		case "thematicBreak":
			return "---";
		case "table":
			return serialize_table(node, ctx);
		case "html":
			return node.value;
		case "definition":
			return serialize_definition(node);
		case "footnoteDefinition":
			return serialize_footnote_definition(node, ctx);
		default:
			// yaml, frontmatter and anything unrecognised pass through as their raw value
			return "value" in node && typeof node.value === "string"
				? node.value
				: serialize_inline(
						("children" in node ? (node.children as PhrasingContent[]) : []) ?? [],
						ctx,
					);
	}
}

function serialize_paragraph(node: Paragraph, ctx: Context): string {
	const text = serialize_inline(node.children, ctx);
	return escape_line_starts(text);
}

function serialize_heading(node: Heading, ctx: Context): string {
	// Setext headings are already normalised to a depth by the parser, so every
	// heading emits as ATX.
	return "#".repeat(node.depth) + " " + serialize_inline(node.children, ctx);
}

function serialize_code(node: Code): string {
	// Indented code blocks become fenced — PFM has fenced code only.
	const value = node.value ?? "";
	let fence_len = 3;
	const runs = value.match(/`+/g);
	if (runs) {
		for (const r of runs) fence_len = Math.max(fence_len, r.length + 1);
	}
	const fence = "`".repeat(fence_len);
	let meta = node.meta ?? "";
	// remark-code-import names the file with file=, mdsvex with src=, which
	// takes no code of its own, so a fence that has some is left alone
	if (value.trim() === "") meta = meta.replace(/(^|\s)file=/, "$1src=");
	const info = node.lang ? node.lang + (meta ? " " + meta : "") : "";
	return fence + info + "\n" + value + "\n" + fence;
}

function serialize_blockquote(node: Blockquote, ctx: Context): string {
	const inner = node.children.map((c) => serialize_block(c, ctx)).join("\n\n");
	// PFM has no lazy continuation: every line carries an explicit `>` prefix.
	return inner
		.split("\n")
		.map((line) => (line.length === 0 ? ">" : "> " + line))
		.join("\n");
}

function serialize_list(node: List, ctx: Context): string {
	const ordered = node.ordered === true;
	let n = typeof node.start === "number" ? node.start : 1;
	const loose = node.spread === true;

	const items = node.children.map((item) => {
		const marker = ordered ? `${n}.` : ctx.bullet;
		if (ordered) n += 1;
		return serialize_list_item(item, marker, ctx);
	});

	return items.join(loose ? "\n\n" : "\n");
}

function serialize_list_item(
	item: ListItem,
	marker: string,
	ctx: Context,
): string {
	const blocks = item.children.map((c) => serialize_block(c, ctx));
	// A tight item (e.g. a paragraph directly followed by a nested list) keeps
	// its blocks adjacent; a spread item separates them with a blank line.
	let body = blocks.join(item.spread === true ? "\n\n" : "\n");

	// pfm reads the gfm task marker as written
	if (item.checked === true) body = "[x] " + body;
	else if (item.checked === false) body = "[ ] " + body;

	const prefix = marker + " ";
	const indent = " ".repeat(prefix.length);
	const lines = body.split("\n");
	return lines
		.map((line, i) =>
			i === 0 ? prefix + line : line.length === 0 ? "" : indent + line,
		)
		.join("\n");
}

function serialize_table(node: Table, ctx: Context): string {
	const align = node.align ?? [];
	const rows = node.children.map((row) => serialize_table_row(row, ctx));
	if (rows.length === 0) return "";

	const col_count = node.children[0]?.children.length ?? 0;
	const delimiter = "| " + Array.from({ length: col_count }, (_, i) => {
		switch (align[i]) {
			case "left":
				return ":---";
			case "right":
				return "---:";
			case "center":
				return ":---:";
			default:
				return "---";
		}
	}).join(" | ") + " |";

	const [header, ...rest] = rows;
	return [header, delimiter, ...rest].join("\n");
}

function serialize_table_row(row: TableRow, ctx: Context): string {
	const cells = row.children.map((c) => serialize_table_cell(c, ctx));
	return "| " + cells.join(" | ") + " |";
}

function serialize_table_cell(cell: TableCell, ctx: Context): string {
	// Escape pipes so they don't break the cell boundary.
	const text = serialize_inline(cell.children, ctx).replace(/\|/g, "\\|");
	// a lone > merges left in pfm, escape_inline already escapes ^
	return text.trim() === ">" ? "\\>" : text;
}

function serialize_definition(node: Definition): string {
	const url = format_url(node.url);
	const title = node.title ? ` "${node.title}"` : "";
	return `[${node.identifier}]: ${url}${title}`;
}

// pfm has no footnotes yet, so both halves stay in the document as escaped text
function footnote_marker(node: FootnoteReference | FootnoteDefinition): string {
	return escape_inline(`[^${node.label ?? node.identifier}]`);
}

function serialize_footnote_definition(
	node: FootnoteDefinition,
	ctx: Context,
): string {
	const marker = footnote_marker(node) + ":";
	const blocks = node.children
		.map((c) => serialize_block(c, ctx))
		.filter((b) => b.length > 0);
	// a list or fence on the marker line would stop being a block
	if (node.children[0]?.type === "paragraph" && blocks.length > 0)
		blocks[0] = marker + " " + blocks[0];
	else blocks.unshift(marker);
	return blocks.join("\n\n");
}

function serialize_inline(nodes: PhrasingContent[], ctx: Context): string {
	return nodes.map((n) => serialize_phrasing(n, ctx)).join("");
}

function serialize_phrasing(node: PhrasingContent, ctx: Context): string {
	switch (node.type) {
		case "text":
			return legacy_dashes(escape_inline(legacy_backticks(node.value, ctx)), ctx);
		case "emphasis":
			// PFM: `_` is emphasis.
			return "_" + serialize_inline(node.children, ctx) + "_";
		case "strong":
			// PFM: `*` is strong.
			return "*" + serialize_inline(node.children, ctx) + "*";
		case "delete":
			return "~~" + serialize_inline(node.children, ctx) + "~~";
		case "inlineCode":
			return serialize_inline_code(node);
		case "break":
			// Hard break via backslash; trailing-space syntax is removed in PFM.
			return "\\\n";
		case "link":
			return serialize_link(node, ctx);
		case "image":
			return serialize_image(node);
		case "linkReference":
			return serialize_link_reference(node, ctx);
		case "imageReference":
			return serialize_image_reference(node);
		case "html":
			return node.value;
		case "footnoteReference":
			return footnote_marker(node);
		default:
			// anything unrecognised emits its raw value
			return "value" in node && typeof (node as { value?: unknown }).value === "string"
				? (node as { value: string }).value
				: "";
	}
}

function serialize_inline_code(node: InlineCode): string {
	const value = node.value ?? "";
	const runs = value.match(/`+/g);
	let len = 1;
	if (runs) for (const r of runs) len = Math.max(len, r.length + 1);
	const ticks = "`".repeat(len);
	// Pad when the content touches a backtick or begins/ends with a space.
	const pad =
		value.startsWith("`") || value.endsWith("`") || /^\s|\s$/.test(value)
			? " "
			: "";
	return ticks + pad + value + pad + ticks;
}

function serialize_link(node: Link, ctx: Context): string {
	const text = serialize_inline(node.children, ctx);
	const url = format_url(node.url);
	const title = node.title ? ` "${node.title}"` : "";
	return `[${text}](${url}${title})`;
}

function serialize_image(node: Image): string {
	const url = format_url(node.url);
	const title = node.title ? ` "${node.title}"` : "";
	return `![${node.alt ?? ""}](${url}${title})`;
}

function serialize_link_reference(node: LinkReference, ctx: Context): string {
	const text = serialize_inline(node.children, ctx);
	// PFM forbids shortcut `[ref]`; emit explicit collapsed/full form.
	if (node.referenceType === "full") return `[${text}][${node.identifier}]`;
	return `[${text}][]`;
}

function serialize_image_reference(node: ImageReference): string {
	const alt = node.alt ?? "";
	if (node.referenceType === "full") return `![${alt}][${node.identifier}]`;
	return `![${alt}][]`;
}

function format_url(url: string): string {
	// Angle-bracket wrap URLs containing characters that would break parsing.
	return /[\s()]/.test(url) ? `<${url}>` : url;
}

const BACKTICK_QUOTES = /(?<!`)``(?!`)|(?<!')''(?!')/g;

/** the backtick quotes 0.x curled, as the quotes next curls, or curly when it curls none */
function legacy_backticks(value: string, ctx: Context): string {
	if (ctx.backticks === false) return value;
	let text = value.replace(BACKTICK_QUOTES, (pair) =>
		ctx.quotes ? '"' : pair === "``" ? "\u201c" : "\u201d",
	);
	// all also took a lone backtick for an opening single quote
	if (ctx.backticks === "all")
		text = text.replace(/`/g, ctx.quotes ? "'" : "\u2018");
	return text;
}

const HYPHEN_RUN = /-{2,}/g;

/**
 * 0.x made two hyphens an em dash and left three alone, or swapped the two
 * when inverted, next makes two an en dash and three an em dash
 */
function legacy_dashes(text: string, ctx: Context): string {
	const mode = ctx.dashes;
	if (mode === false) return text;
	return text.replace(HYPHEN_RUN, (run) => {
		if (run.length === 2) return "---";
		if (run.length !== 3) return run;
		return mode === "inverted" ? "--" : "\\---";
	});
}
