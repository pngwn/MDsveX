import { doc } from 'prettier';
import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';

import type { SvxNode, SvxRoot } from './ast';
import { embed } from './embed';
import { insert_pragma } from './pragma';
import { parse_open_tag, plain_open_tag } from './tag';

const { align, hardline, indent, literalline } = doc.builders;
const { replaceEndOfLine } = doc.utils;

export type Print = (path: AstPath<SvxNode>) => Doc;
type Options = ParserOptions<SvxNode>;

export const printer: Printer<SvxNode> = {
	print(path, options, print) {
		switch (path.node.type) {
			case 'root':
				return print_root(path, options, print);
			case 'html':
				return print_html(path, options, print, undefined);
			case 'svelte_block':
				return print_svelte_block(path, options, print);
			case 'svelte_branch':
				return print_branch(path, options, print, undefined);
			case 'list':
				return print_list(path, options, print);
			case 'list_item':
				return print_item(path, options, print);
			case 'block_quote':
				return print_quote(path, options, print);
			case 'directive_container':
				return print_directive(path, options, print);
			case 'code_fence':
				return print_fence(path, options);
			case 'footnote_definition':
				return print_footnote(path, options, print);
		}
		return print_leaf(path, options, print);
	},
	embed: embed as Printer<SvxNode>['embed'],
	getVisitorKeys() {
		return ['children'];
	},
	/** the node after a prettier-ignore comment, at any depth */
	hasPrettierIgnore(path) {
		const siblings = path.siblings as SvxNode[] | null;
		const index = path.index;
		if (siblings === null || index === null) return false;
		const text = root_of(path).text;
		for (let i = index - 1; i >= 0; i--) {
			const sibling = siblings[i];
			if (is_between(sibling, text)) continue;
			return comment(sibling, text) === 'prettier-ignore';
		}
		return false;
	},
	insertPragma: insert_pragma,
};

/** what may sit between a prettier-ignore comment and what it ignores */
function is_between(node: SvxNode, text: string): boolean {
	if (node.type === 'line_break' || node.type === 'soft_break') return true;
	return node.type === 'text' && text.slice(node.start, node.end).trim() === '';
}

function comment(node: SvxNode, text: string): string | undefined {
	if (node.type !== 'html_comment') return undefined;
	return text.slice(node.value_start, node.value_end).trim();
}

/** a comment block, or a paragraph that opens or closes with one, a comment above text shares its paragraph */
function edge_comment(
	node: SvxNode,
	text: string,
	at: 0 | -1
): string | undefined {
	if (node.type !== 'paragraph') return comment(node, text);
	const child = node.children[at === 0 ? 0 : node.children.length - 1];
	return child && comment(child, text);
}

function print_root(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	if (node.children.length === 0) return '';
	const text = options.originalText;
	const parts: Doc[] = [];
	// a thematic break on the first line would open frontmatter
	const first = node.children[0];
	if (
		first.start > 0 &&
		first.type !== 'frontmatter' &&
		text.startsWith('---', skip_prefix(text, first.start, node.end, 0))
	) {
		parts.push(hardline);
	}
	parts.push(print_children(path, options, print, 0, node.end, true), hardline);
	return parts;
}

/** the kinds that hold a flow of blocks */
const FLOW = new Set([
	'root',
	'html',
	'svelte_block',
	'svelte_branch',
	'list',
	'list_item',
	'block_quote',
	'directive_container',
	'footnote_definition',
]);

/** the kinds that are blocks wherever they sit */
const BLOCKS = new Set([
	'paragraph',
	'heading',
	'code_fence',
	'block_quote',
	'list',
	'table',
	'thematic_break',
	'directive_leaf',
	'directive_container',
	'footnote_definition',
	'definition',
	'frontmatter',
	'import_statement',
	'raw',
]);

/** the kinds that are blocks when they start a line */
const LINE_BLOCKS = new Set(['html', 'svelte_block', 'html_comment']);

/** every ancestor of the node holds blocks, so it is not inside prose */
export function in_flow(path: AstPath<SvxNode>): boolean {
	for (let i = path.stack.length - 2; i >= 0; i--) {
		const value = path.stack[i] as SvxNode | SvxNode[];
		if (Array.isArray(value) || typeof value !== 'object' || value === null) {
			continue;
		}
		if (!('type' in value)) continue;
		if (!FLOW.has(value.type)) return false;
	}
	return true;
}

/** how many block quotes hold the node */
export function quote_depth(path: AstPath<SvxNode>): number {
	let depth = 0;
	for (const value of path.stack) {
		if (
			typeof value === 'object' &&
			value !== null &&
			!Array.isArray(value) &&
			(value as SvxNode).type === 'block_quote'
		) {
			depth++;
		}
	}
	return path.node.type === 'block_quote' ? depth - 1 : depth;
}

/**
 * the children of a node between from and to as blocks, each block on its
 * own lines, prose between blocks printed as one run, blank lines fold to one
 */
function print_children(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	from: number,
	to: number,
	root = false
): Doc {
	const node = path.node;
	const text = options.originalText;
	const children = node.children;
	const units: { first: number; last: number; block: boolean }[] = [];
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child.type === 'line_break' || child.start < from || child.end > to) {
			continue;
		}
		const block =
			BLOCKS.has(child.type) ||
			(LINE_BLOCKS.has(child.type) && starts_line(text, child.start, from));
		const prev = units[units.length - 1];
		if (
			!block &&
			prev !== undefined &&
			!prev.block &&
			newlines(text, children[prev.last].end, child.start) < 2
		) {
			prev.last = i;
		} else {
			units.push({ first: i, last: i, block });
		}
	}

	const parts: Doc[] = [];
	for (let u = 0; u < units.length; u++) {
		const unit = units[u];
		const first = children[unit.first];
		if (u > 0) {
			parts.push(separator(text, children[units[u - 1].last].end, first.start));
		}
		// a prettier-ignore-start keeps what follows as written up to its end
		if (
			root &&
			unit.block &&
			edge_comment(first, text, 0) === 'prettier-ignore-start'
		) {
			const end = units.findIndex(
				(other, j) =>
					j >= u &&
					edge_comment(children[other.last], text, -1) === 'prettier-ignore-end'
			);
			if (end !== -1) {
				parts.push(
					replaceEndOfLine(
						text.slice(first.start, children[units[end].last].end)
					)
				);
				u = end;
				continue;
			}
		}
		if (unit.block) {
			parts.push(path.call(print, 'children', unit.first));
		} else {
			parts.push(print_run(path, options, print, unit.first, unit.last));
		}
	}
	return parts;
}

function starts_line(text: string, pos: number, floor: number): boolean {
	for (let i = pos - 1; i >= floor; i--) {
		const c = text.charCodeAt(i);
		if (c === 10) return true;
		if (c !== 32 && c !== 9 && c !== 62) return false;
	}
	return true;
}

/** what goes between two blocks, blank lines fold to one */
function separator(text: string, from: number, to: number): Doc {
	const lines = newlines(text, from, to);
	if (lines === 0) return text.slice(from, to).replace(/[ \t]+/g, ' ');
	return lines === 1 ? hardline : [hardline, hardline];
}

function newlines(text: string, from: number, to: number): number {
	let lines = 0;
	for (let i = from; i < to; i++) if (text.charCodeAt(i) === 10) lines++;
	return lines;
}

function line_ends(count: number): Doc {
	return count >= 2 ? [hardline, hardline] : hardline;
}

/** the first and last children that are more than a line break */
function edges(
	node: SvxNode,
	from: number,
	to: number
): [SvxNode, SvxNode] | undefined {
	let first: SvxNode | undefined;
	let last: SvxNode | undefined;
	for (const child of node.children) {
		if (child.type === 'line_break' || child.start < from || child.end > to) {
			continue;
		}
		first ??= child;
		last = child;
	}
	return first && last ? [first, last] : undefined;
}

/**
 * an element, its children indented on their own lines when they start on a
 * line of their own, in prose it stays inline
 */
export function print_html(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	open: Doc | undefined
): Doc {
	const node = path.node;
	const text = options.originalText;
	if (is_raw_text(node)) return print_whole(node, text);
	const open_tag = open ?? written_open_tag(node, text);
	if (node.value_start >= node.end) return open_tag;
	if (!in_flow(path)) {
		return [open_tag, print_leaf(path, options, print, node.value_start)];
	}
	const close = text.slice(node.value_end, node.end).trim();
	const inside = edges(node, node.value_start, node.value_end);
	if (inside === undefined) return [open_tag, close];
	const [first, last] = inside;
	const lead = newlines(text, node.value_start, first.start);
	if (lead === 0) {
		return [open_tag, print_leaf(path, options, print, node.value_start)];
	}
	return [
		open_tag,
		indent([
			line_ends(lead),
			print_children(path, options, print, node.value_start, node.value_end),
		]),
		line_ends(newlines(text, last.end, node.value_end)),
		close,
	];
}

function written_open_tag(node: SvxNode, text: string): Doc {
	const source = text.slice(node.start, node.value_start);
	const tag = parse_open_tag(source);
	return tag === undefined
		? replaceEndOfLine(source, literalline)
		: plain_open_tag(tag);
}

function print_svelte_block(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	if (!in_flow(path)) return print_leaf(path, options, print);
	const text = options.originalText;
	const branches = node.children.filter(
		(child) => child.type === 'svelte_branch'
	);
	if (branches.length === 0) return print_leaf(path, options, print);
	const last = branches[branches.length - 1];
	return [path.map(print, 'children'), text.slice(last.end, node.end).trim()];
}

/** where the head of a branch ends, after its closing brace */
export function head_end(node: SvxNode, text: string): number {
	const from = node.value_end > node.value_start ? node.value_end : node.start;
	return text.indexOf('}', from) + 1;
}

/**
 * a branch of a block, its head then its children indented, the line ends
 * after them lead to the next branch or the close of the block
 */
export function print_branch(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	head: Doc | undefined
): Doc {
	const node = path.node;
	const text = options.originalText;
	const end = head_end(node, text);
	if (end === 0) return print_leaf(path, options, print);
	const head_doc = head ?? text.slice(node.start, end);
	const block_in_flow = in_flow(path);
	const inside = edges(node, end, node.end);
	if (inside === undefined) {
		const next = path.next as SvxNode | null;
		const limit =
			next?.type === 'svelte_branch' ? next.start : text.indexOf('{', node.end);
		const lines = newlines(text, end, limit === -1 ? node.end : limit);
		return lines === 0 || !block_in_flow
			? [head_doc, text.slice(end, node.end)]
			: [head_doc, line_ends(lines)];
	}
	const [first, last] = inside;
	const lead = newlines(text, end, first.start);
	if (lead === 0 || !block_in_flow) {
		return [head_doc, print_leaf(path, options, print, end)];
	}
	// the trailing line ends were trimmed off the branch, they run to the next branch or the close
	const next = path.next as SvxNode | null;
	const limit =
		next?.type === 'svelte_branch' ? next.start : text.indexOf('{', node.end);
	return [
		head_doc,
		indent([
			line_ends(lead),
			print_children(path, options, print, end, node.end),
		]),
		line_ends(newlines(text, last.end, limit === -1 ? node.end : limit)),
	];
}

function print_list(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const tight = path.node.meta?.tight !== false;
	const items: Doc[] = [];
	path.each((item, i) => {
		if (item.node.type !== 'list_item') return;
		if (items.length > 0) items.push(tight ? hardline : [hardline, hardline]);
		items.push(print(item));
	}, 'children');
	return items;
}

/** a marker, one space, and the content aligned one past the marker */
function print_item(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	const text = options.originalText;
	const start = skip_prefix(text, node.start, node.end, quote_depth(path));
	const marker = /^([-*+]|\d{1,9}[.)])/.exec(text.slice(start, node.end));
	if (marker === null) return print_leaf(path, options, print);
	const checked = node.meta?.checked;
	const marker_end = start + marker[0].length;
	const first = edges(node, marker_end, node.end)?.[0];
	// what sits between the marker and the content, the escape of `\[x]`
	const between = first ? text.slice(marker_end, first.start).trim() : '';
	const task = checked === true ? '[x] ' : checked === false ? '[ ] ' : between;
	const width = marker[0].length + 1;
	return [
		marker[0],
		' ',
		align(width, [
			task,
			print_children(path, options, print, marker_end, node.end),
		]),
	];
}

/** a footnote definition, the blocks after its first line indented by four */
function print_footnote(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	const text = options.originalText;
	const start = skip_prefix(text, node.start, node.end, quote_depth(path));
	const label = /^\[\^[^\]]*\]:/.exec(text.slice(start, node.end));
	if (label === null) return print_leaf(path, options, print);
	const from = start + label[0].length;
	return [
		label[0],
		' ',
		align(4, print_children(path, options, print, from, node.end)),
	];
}

function print_quote(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	return [
		'> ',
		align('> ', print_children(path, options, print, node.start, node.end)),
	];
}

/** a container directive, its opening and closing lines around its blocks at the same indent */
function print_directive(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	const text = options.originalText;
	const depth = quote_depth(path);
	const start = skip_prefix(text, node.start, node.end, depth);
	const header_end = text.indexOf('\n', start);
	if (header_end === -1 || header_end >= node.end) {
		return print_leaf(path, options, print);
	}
	const header = text.slice(start, header_end).trimEnd();
	const close_start = skip_prefix(
		text,
		text.lastIndexOf('\n', node.end - 1) + 1,
		node.end,
		depth
	);
	const closed =
		close_start > header_end &&
		/^:{3,}\s*$/.test(text.slice(close_start, node.end));
	const body_end = closed ? close_start : node.end;
	const inside = edges(node, header_end, body_end);
	const parts: Doc[] = [header];
	if (inside !== undefined) {
		const [first, last] = inside;
		parts.push(
			line_ends(newlines(text, header_end, first.start)),
			print_children(path, options, print, header_end, body_end)
		);
		if (closed) parts.push(line_ends(newlines(text, last.end, close_start)));
	} else if (closed) {
		parts.push(hardline);
	}
	if (closed) parts.push(text.slice(close_start, node.end).trim());
	return parts;
}

/**
 * a fence, re-indented when the parser gives its code without the indent of
 * its lines, as written inside an element or a block until it does
 */
function print_fence(path: AstPath<SvxNode>, options: Options): Doc {
	const node = path.node;
	const text = options.originalText;
	const depth = quote_depth(path);
	const start = skip_prefix(text, node.start, node.end, depth);
	const open_end = text.indexOf('\n', start);
	if (open_end === -1 || open_end >= node.end)
		return text.slice(start, node.end).trim();
	const open = text.slice(start, open_end).trimEnd();
	const tail = text.slice(node.value_end, node.end);
	const closed = /`{3,}\s*$/.test(tail) && tail.includes('\n');
	const close_start = node.value_end + tail.lastIndexOf('\n') + 1;
	const close = closed
		? text
				.slice(skip_prefix(text, close_start, node.end, depth), node.end)
				.trim()
		: '';

	let code = node.content;
	if (code === undefined) {
		if (in_container(path)) {
			// the parser keeps the indent of the container in the code
			return [
				open,
				literalline,
				replaceEndOfLine(text.slice(open_end + 1, node.end), literalline),
			];
		}
		code = text.slice(node.value_start, node.value_end);
	}
	// an unclosed fence runs to the end of the document, whose line end is printed after it
	if (!closed && code.endsWith('\n')) code = code.slice(0, -1);
	const parts: Doc[] = [open];
	if (node.value_end > node.value_start || node.content !== undefined) {
		for (const line of code.split('\n')) parts.push(hardline, line);
	}
	if (closed) parts.push(hardline, close);
	return parts;
}

/** an ancestor indents its children in a way the parser does not take off code */
function in_container(path: AstPath<SvxNode>): boolean {
	for (const value of path.stack) {
		if (typeof value !== 'object' || value === null || Array.isArray(value))
			continue;
		const type = (value as SvxNode).type;
		if (
			type === 'html' ||
			type === 'svelte_branch' ||
			type === 'directive_container' ||
			type === 'footnote_definition'
		) {
			return true;
		}
	}
	return false;
}

/** a run of prose between blocks, from the first child to the last */
function print_run(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	first: number,
	last: number
): Doc {
	const node = path.node;
	const text = options.originalText;
	const depth = quote_depth(path) + (node.type === 'block_quote' ? 1 : 0);
	const parts: Doc[] = [];
	let pos = node.children[first].start;
	for (let i = first; i <= last; i++) {
		const child = node.children[i];
		if (child.start > pos)
			parts.push(source(text, pos, child.start, [], depth));
		parts.push(path.call(print, 'children', i));
		pos = Math.max(pos, child.end);
	}
	return parts;
}

/**
 * the source of a node with its children printed in place, starting at
 * from, the indent and quote markers that start its lines are left for the
 * blocks around it to print
 */
export function print_leaf(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	from = path.node.start
): Doc {
	const node = path.node;
	const text = options.originalText;
	if (is_whole(node)) return print_whole(node, text);
	const depth = quote_depth(path);
	const keep = own_kept(node);
	const protect = !TABLE.has(node.type);
	const parts: Doc[] = [];
	let pos = from;
	// a block that starts a line leaves its indent to the blocks around it
	if (node.type !== 'html' && starts_line(text, from, 0)) {
		pos = Math.max(pos, skip_prefix(text, from, node.end, depth));
	}
	// the first line of the block is where it starts, only the lines after it are prose
	const begin = pos;
	path.each((child) => {
		const c = child.node;
		if (c.start < pos) return;
		parts.push(
			source(text, pos, c.start, keep, depth, protect, protect && pos !== begin)
		);
		parts.push(print(child));
		pos = c.end;
	}, 'children');
	if (pos < node.end) {
		parts.push(
			source(
				text,
				pos,
				node.end,
				keep,
				depth,
				protect,
				protect && pos !== begin
			)
		);
	}
	return parts;
}

/** the lines of a table are its rows, a row is not a block that interrupts it */
const TABLE = new Set(['table', 'table_header', 'table_row', 'table_cell']);

/** nodes whose whole source is content */
function is_whole(node: SvxNode): boolean {
	switch (node.type) {
		case 'code_span':
		case 'mustache':
		case 'svelte_tag':
		case 'html_comment':
		case 'frontmatter':
		case 'import_statement':
		case 'definition':
		case 'raw':
			return true;
		case 'html':
			return is_raw_text(node);
	}
	return false;
}

/** the source of a node exactly, its line ends are content */
function print_whole(node: SvxNode, text: string): Doc {
	return replaceEndOfLine(text.slice(node.start, node.end), literalline);
}

export function is_raw_text(node: SvxNode): boolean {
	const tag = node.meta?.tag;
	return (
		tag === 'script' || tag === 'style' || tag === 'pre' || tag === 'textarea'
	);
}

/** the parts of a node outside its children whose spaces are content */
function own_kept(node: SvxNode): [number, number][] {
	if (node.type === 'svelte_branch') {
		return [[node.value_start, node.value_end]];
	}
	// the open tag, whose attribute values may hold spaces at a line end
	if (node.type === 'html') return [[node.start, node.value_start]];
	return [];
}

/**
 * source text as a doc, a line end trims the spaces before it unless they
 * are content or follow a backslash, and the indent and quote markers after
 * it are left out
 */
function source(
	text: string,
	from: number,
	to: number,
	keep: [number, number][],
	depth: number,
	protect = true,
	protect_start = protect
): Doc {
	const parts: Doc[] = [];
	let line_start = from;
	if (from > 0 && text.charCodeAt(from - 1) === 10 && !in_ranges(keep, from)) {
		line_start = skip_prefix(text, from, to, depth);
		if (protect_start && starts_block(text, line_start)) parts.push(PROTECT);
	}
	for (let i = line_start; i < to; i++) {
		if (text.charCodeAt(i) !== 10) continue;
		parts.push(text.slice(line_start, i));
		let trail = i;
		while (trail > 0 && is_blank(text.charCodeAt(trail - 1))) trail--;
		const kept =
			in_ranges(keep, i) ||
			(trail < i &&
				(text.charCodeAt(trail - 1) === 92 || in_ranges(keep, trail)));
		if (kept) {
			parts.push(literalline);
			line_start = i + 1;
		} else {
			parts.push(hardline);
			line_start = skip_prefix(text, i + 1, to, depth);
			if (protect && starts_block(text, line_start)) parts.push(PROTECT);
			i = line_start - 1;
		}
	}
	parts.push(text.slice(line_start, to));
	return parts;
}

/** a line of prose that would start a block at the left edge is indented past where a block can start */
const PROTECT = '    ';

const BLOCK_START =
	/^(?:([-*_])(?:[ \t]*\1){2,}[ \t]*$|#{1,6}(?:[ \t]|$)|>|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|`{3,}|:{2,}|\||=+[ \t]*$|\[\^)/;

/** the line from pos, which may run past the source being printed, would start a block */
function starts_block(text: string, pos: number): boolean {
	let end = text.indexOf('\n', pos);
	if (end === -1) end = text.length;
	return BLOCK_START.test(text.slice(pos, end));
}

/** past the indent and the quote markers that start a line */
export function skip_prefix(
	text: string,
	pos: number,
	to: number,
	depth: number
): number {
	while (pos < to && is_blank(text.charCodeAt(pos))) pos++;
	for (let m = 0; m < depth && pos < to && text.charCodeAt(pos) === 62; m++) {
		pos++;
		while (pos < to && is_blank(text.charCodeAt(pos))) pos++;
	}
	return pos;
}

function in_ranges(ranges: [number, number][], pos: number): boolean {
	for (const [start, end] of ranges) if (pos >= start && pos < end) return true;
	return false;
}

function is_blank(c: number): boolean {
	return c === 32 || c === 9;
}

export function root_of(path: AstPath<SvxNode>): SvxRoot {
	return path.stack[0] as SvxRoot;
}
