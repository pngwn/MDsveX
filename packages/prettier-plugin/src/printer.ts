import { doc, util } from 'prettier';
import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';

import { parse } from './ast';
import type { SvxNode, SvxRoot } from './ast';
import { embed } from './embed';
import { insert_pragma } from './pragma';
import { parse_open_tag, plain_open_tag } from './tag';

const {
	align,
	breakParent,
	fill,
	group,
	hardline,
	hardlineWithoutBreakParent,
	ifBreak,
	indent,
	join,
	line,
	literalline,
} = doc.builders;
const { printDocToString } = doc.printer;
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
			case 'block_quote':
				return print_quote(path, options, print);
			case 'directive_container':
				return print_directive(path, options, print);
			case 'code_fence':
				return print_fence(path, options);
			case 'footnote_definition':
				return print_footnote(path, options, print);
			case 'heading':
				return print_heading(path, options, print);
			case 'thematic_break':
				return print_thematic_break(path);
			case 'table':
				return print_table(path, options, print);
			case 'paragraph':
				return options.proseWrap === 'preserve' ||
					options.proseWrap === undefined
					? print_leaf(path, options, print)
					: print_prose(path, options, print);
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
	return [print_children(path, options, print, 0, node.end, true), hardline];
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
interface ItemLayout {
	/** the list is loose, its blocks have blank lines between them */
	loose: boolean;
	/** the columns a block after the first is indented past the content */
	extra: number;
}

function print_children(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	from: number,
	to: number,
	root = false,
	item?: ItemLayout
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
			parts.push(unit_separator(text, children, units[u - 1], unit, item));
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
		const printed = unit.block
			? path.call(print, 'children', unit.first)
			: print_run(path, options, print, unit.first, unit.last);
		if (u > 0 && item !== undefined && item.extra > 0) {
			parts.push(' '.repeat(item.extra), align(item.extra, printed));
		} else {
			parts.push(printed);
		}
	}
	return parts;
}

interface Unit {
	first: number;
	last: number;
	block: boolean;
}

/**
 * a blank line between blocks as in markdown, one line end between markup on
 * consecutive lines as in svelte, and between definitions and imports
 */
function unit_separator(
	text: string,
	children: SvxNode[],
	prev_unit: Unit,
	unit: Unit,
	item: ItemLayout | undefined
): Doc {
	const prev = children[prev_unit.last];
	const next = children[unit.first];
	const lines = newlines(text, prev.end, next.start);
	if (lines === 0)
		return text.slice(prev.end, next.start).replace(/[ \t]+/g, ' ');
	const blank = [hardline, hardline];
	if (item !== undefined) {
		// a nested list keeps the blank line before it or its absence
		if (next.type === 'list') return line_ends(lines);
		return item.loose ? blank : hardline;
	}
	if (
		prev.type === next.type &&
		(prev.type === 'definition' || prev.type === 'import_statement')
	) {
		return hardline;
	}
	if (comment(prev, text) === 'prettier-ignore') return hardline;
	if (
		lines === 1 &&
		is_markup(children, unit, text) &&
		(is_markup(children, prev_unit, text) ||
			prev.type === 'paragraph' ||
			!prev_unit.block)
	) {
		return hardline;
	}
	return blank;
}

/** svelte markup, an element, a block, a comment or a lone expression */
function is_markup(children: SvxNode[], unit: Unit, text: string): boolean {
	for (let i = unit.first; i <= unit.last; i++) {
		const node = children[i];
		switch (node.type) {
			case 'html':
			case 'svelte_block':
			case 'html_comment':
			case 'svelte_tag':
			case 'mustache':
			case 'line_break':
				continue;
			case 'paragraph':
				if (
					node.children.length === 1 &&
					(node.children[0].type === 'mustache' ||
						node.children[0].type === 'svelte_tag')
				) {
					continue;
				}
				return false;
			case 'text':
				if (text.slice(node.start, node.end).trim() === '') continue;
				return false;
			default:
				return false;
		}
	}
	return true;
}

function starts_line(text: string, pos: number, floor: number): boolean {
	for (let i = pos - 1; i >= floor; i--) {
		const c = text.charCodeAt(i);
		if (c === 10) return true;
		if (c !== 32 && c !== 9 && c !== 62) return false;
	}
	return true;
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
	const node = path.node;
	const text = options.originalText;
	const ordered = node.meta?.ordered === true;
	const loose = node.meta?.tight === false;
	// lists side by side alternate their markers, so they stay two lists
	const nth = nth_sibling_list(node, path.parent as SvxNode | null);
	const depth = quote_depth(path);
	const items = node.children.filter((child) => child.type === 'list_item');
	const numbers = items.map((item) => item_number(text, item, depth));
	const start = typeof node.meta?.start === 'number' ? node.meta.start : 1;
	// 1. 1. 1. stays that way, so does 0. 1. 1.
	const repeats =
		ordered &&
		numbers.length > 1 &&
		numbers[1] === 1 &&
		(numbers[0] !== 0 || (numbers.length > 2 && numbers[2] === 1));
	const parts: Doc[] = [];
	let index = 0;
	path.each((item) => {
		if (item.node.type !== 'list_item') return;
		const marker = ordered
			? `${index === 0 ? start : repeats ? 1 : Math.min(start + index, 999_999_999)}${nth % 2 === 0 ? '.' : ')'}`
			: nth % 2 === 0
				? '-'
				: '*';
		if (index > 0) parts.push(loose ? [hardline, hardline] : hardline);
		parts.push(print_item(item, options, print, marker, loose));
		index++;
	}, 'children');
	return parts;
}

/** how many lists of its kind come straight before a list in what holds it */
function nth_sibling_list(node: SvxNode, parent: SvxNode | null): number {
	if (parent === null) return 0;
	const ordered = node.meta?.ordered === true;
	let index = -1;
	for (const child of parent.children) {
		if (child.type === 'line_break') continue;
		if (child.type === 'list' && (child.meta?.ordered === true) === ordered)
			index++;
		else index = -1;
		if (child === node) return index;
	}
	return 0;
}

const MARKER = /^([-*+]|\d{1,9}[.)])/;

function item_number(text: string, item: SvxNode, depth: number): number {
	const start = skip_prefix(text, item.start, item.end, depth);
	const marker = MARKER.exec(text.slice(start, item.end));
	return marker === null ? NaN : Number.parseInt(marker[0], 10);
}

/** a marker, one space, and the content aligned one past the marker */
function print_item(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	marker: string,
	loose: boolean
): Doc {
	const node = path.node;
	const text = options.originalText;
	const start = skip_prefix(text, node.start, node.end, quote_depth(path));
	const written = MARKER.exec(text.slice(start, node.end));
	if (written === null) return print_leaf(path, options, print);
	const checked = node.meta?.checked;
	const marker_end = start + written[0].length;
	const first = edges(node, marker_end, node.end)?.[0];
	// what sits between the marker and the content, the escape of `\[x]`
	const between = first ? text.slice(marker_end, first.start).trim() : '';
	const task = checked === true ? '[x] ' : checked === false ? '[ ] ' : between;
	const width = marker.length + 1;
	// a block after the first lines up with the tab width as in markdown
	const extra = Math.max(0, Math.min(options.tabWidth - width, 3));
	return [
		marker,
		' ',
		align(width, [
			task,
			print_children(path, options, print, marker_end, node.end, false, {
				loose,
				extra,
			}),
		]),
	];
}

/** `#` as deep as the heading, one space and its text */
function print_heading(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	const text = options.originalText;
	const start = skip_prefix(text, node.start, node.end, quote_depth(path));
	const hashes = /^#{1,6}/.exec(text.slice(start, node.end));
	if (hashes === null) return print_leaf(path, options, print);
	if (node.children.length === 0) return hashes[0];
	return [
		hashes[0],
		' ',
		print_leaf(path, options, print, node.children[0].start),
	];
}

/** `---`, `***` first in a document where `---` opens frontmatter and in lists it alternates with */
function print_thematic_break(path: AstPath<SvxNode>): Doc {
	let list: SvxNode | undefined;
	let list_parent: SvxNode | null = null;
	for (let i = path.stack.length - 1; i >= 0; i--) {
		const value = path.stack[i] as SvxNode;
		if (typeof value !== 'object' || value === null || Array.isArray(value))
			continue;
		if (value.type === 'list') {
			list = value;
			for (let j = i - 1; j >= 0; j--) {
				const parent = path.stack[j] as SvxNode;
				if (
					typeof parent === 'object' &&
					parent !== null &&
					!Array.isArray(parent) &&
					'type' in parent
				) {
					list_parent = parent;
					break;
				}
			}
			break;
		}
	}
	if (list === undefined) {
		const parent = path.parent as SvxNode | null;
		return parent?.type === 'root' && parent.children[0] === path.node
			? '***'
			: '---';
	}
	return nth_sibling_list(list, list_parent) % 2 === 0 ? '***' : '---';
}

/**
 * a table with its columns padded to their widest cell and aligned as its
 * delimiter row says, compact when it is wider than the line and prose is
 * never wrapped, as written when it merges cells or a row holds text no cell does
 */
function print_table(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print
): Doc {
	const node = path.node;
	const text = options.originalText;
	const as_written = () => print_leaf(path, options, print);
	if (
		node.meta?.header_columns !== undefined ||
		node.meta?.spans !== undefined
	) {
		return as_written();
	}
	const rows = node.children.filter(
		(row) => row.type === 'table_header' || row.type === 'table_row'
	);
	if (rows[0]?.type !== 'table_header') return as_written();
	const depth = quote_depth(path);
	for (const row of rows) {
		let pos = skip_prefix(text, row.start, row.end, depth);
		for (const cell of row.children) {
			if (!/^[|\s]*$/.test(text.slice(pos, cell.start))) return as_written();
			pos = Math.max(pos, cell.end);
		}
		if (!/^[|\s]*$/.test(text.slice(pos, row.end))) return as_written();
	}

	const cells: { text: string; width: number }[][] = [];
	const widths: number[] = [];
	let broken = false;
	path.each((row) => {
		if (row.node.type !== 'table_header' && row.node.type !== 'table_row')
			return;
		const line: { text: string; width: number }[] = [];
		path.each((cell, column) => {
			const printed = printDocToString(print(cell), {
				...options,
				printWidth: Number.POSITIVE_INFINITY,
			}).formatted.trim();
			if (printed.includes('\n')) broken = true;
			const width = util.getStringWidth(printed);
			widths[column] = Math.max(widths[column] ?? 3, width);
			line.push({ text: printed, width });
		}, 'children');
		cells.push(line);
	}, 'children');
	if (broken) return as_written();

	const alignments = (node.meta?.alignments ?? []) as string[];
	const lines = (compact: boolean) => {
		const row = (line: { text: string; width: number }[]) =>
			'| ' +
			line
				.map(({ text, width }, column) => {
					if (compact) return text;
					const spaces = widths[column] - width;
					const before =
						alignments[column] === 'right'
							? spaces
							: alignments[column] === 'center'
								? Math.floor(spaces / 2)
								: 0;
					return ' '.repeat(before) + text + ' '.repeat(spaces - before);
				})
				.join(' | ') +
			' |';
		const delimiter =
			'| ' +
			cells[0]
				.map((_, column) => {
					const align = alignments[column];
					const first = align === 'left' || align === 'center' ? ':' : '-';
					const last = align === 'right' || align === 'center' ? ':' : '-';
					const middle = '-'.repeat(compact ? 1 : widths[column] - 2);
					return first + middle + last;
				})
				.join(' | ') +
			' |';
		return join(hardlineWithoutBreakParent, [
			row(cells[0]),
			delimiter,
			...cells.slice(1).map(row),
		]);
	};
	if (options.proseWrap !== 'never') return [breakParent, lines(false)];
	return [breakParent, group(ifBreak(lines(true), lines(false)))];
}

/** a word that would start a block at the start of a line */
const NO_BREAK_BEFORE =
	/^(?:[-*+]|#{1,6}|\d{1,9}[.)]|>.*|:{2,}.*|\[\^.*|`{3,}.*|=+|-+|[*_]{3,}|<.*)$/;

/** inline nodes a line may not start with, a tag at the start of a line can be a block */
const NO_BREAK_BEFORE_NODE = new Set([
	'html',
	'svelte_tag',
	'svelte_block',
	'html_comment',
]);

/**
 * a paragraph whose words fill the line, with proseWrap always, or one line,
 * with never, nodes such as links and code stay whole
 */
function print_prose(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	range?: [number, number]
): Doc {
	const node = path.node;
	const text = options.originalText;
	const [first, last] = range ?? [0, node.children.length - 1];
	if (!may_reflow(path, text, first, last)) {
		return range === undefined
			? print_leaf(path, options, print)
			: print_run_as_written(path, options, print, first, last);
	}
	const wrap = options.proseWrap === 'always';
	const parts: Doc[] = [];
	let chunk: Doc[] = [];
	// where the separator before the chunk being built sits in parts, -1 for none yet
	let separator = -1;
	const space = (forced = false) => {
		if (chunk.length === 0) {
			if (forced && separator !== -1) parts[separator] = hardline;
			return;
		}
		parts.push(chunk);
		chunk = [];
		separator = parts.length;
		parts.push(forced ? hardline : wrap ? line : ' ');
	};
	const keep_on_line = () => {
		if (chunk.length === 0 && separator !== -1 && parts[separator] === line) {
			parts[separator] = ' ';
		}
	};
	// markdown breaks only at ascii space, a no break space is part of its word
	const words = (source: string) => {
		for (const piece of source.split(/([ \t\n]+)/)) {
			if (piece === '') continue;
			if (/^[ \t\n]+$/.test(piece)) {
				space();
				continue;
			}
			if (NO_BREAK_BEFORE.test(piece)) keep_on_line();
			chunk.push(piece);
		}
	};

	const depth = quote_depth(path) + (node.type === 'block_quote' ? 1 : 0);
	// a gap after a line end starts with the indent and quote markers of the line
	const gap = (from: number, to: number) => {
		const start =
			from === 0 || text.charCodeAt(from - 1) === 10
				? skip_prefix(text, from, to, depth)
				: from;
		if (to > start) words(text.slice(start, to).replace(/\n[ \t>]*/g, ' '));
	};
	let pos =
		range === undefined
			? skip_prefix(text, node.start, node.end, depth)
			: node.children[first].start;
	path.each((child, index) => {
		if (index < first || index > last) return;
		const c = child.node;
		if (c.start > pos) gap(pos, c.start);
		pos = Math.max(pos, c.end);
		switch (c.type) {
			case 'text':
				words(text.slice(c.start, c.end));
				return;
			case 'soft_break':
				space();
				return;
			case 'hard_break':
				chunk.push('\\');
				space(true);
				return;
		}
		if (NO_BREAK_BEFORE_NODE.has(c.type)) keep_on_line();
		chunk.push(print(child));
	}, 'children');
	if (chunk.length > 0) parts.push(chunk);
	else if (parts.length > 0) parts.pop();
	// a run that follows something on its line keeps the space between them
	const lead =
		range !== undefined &&
		/^[ \t]/.test(
			text.slice(node.children[first].start, node.children[first].end)
		);
	return lead ? [' ', fill(parts)] : fill(parts);
}

/**
 * the line ends of a paragraph may become spaces without the paragraph
 * reading as something else, a line end can be what keeps text from being a
 * link, a list or the arguments of a directive, so the paragraph is parsed
 * joined and as it is and the two must match
 */
function may_reflow(
	path: AstPath<SvxNode>,
	text: string,
	first: number,
	last: number
): boolean {
	const node = path.node;
	const parent = path.parent as SvxNode | null;
	const children = node.children.slice(first, last + 1);
	if (children.length === 0) return false;
	// content on the line of its open tag is read differently from content on lines of its own
	if (
		node.type === 'paragraph' &&
		parent !== null &&
		(parent.type === 'html' || parent.type === 'svelte_branch') &&
		newlines(
			text,
			parent.type === 'html' ? parent.value_start : parent.start,
			node.start
		) === 0
	) {
		return false;
	}
	const changes = children.some(
		(child) =>
			child.type === 'soft_break' ||
			(child.type === 'text' &&
				/\n|[ \t]{2}/.test(text.slice(child.start, child.end)))
	);
	if (!changes) return true;
	const depth = quote_depth(path) + (node.type === 'block_quote' ? 1 : 0);
	const from =
		node.type === 'paragraph'
			? skip_prefix(text, node.start, node.end, depth)
			: children[0].start;
	const to =
		node.type === 'paragraph' ? node.end : children[children.length - 1].end;
	const prefix = depth > 0 ? /\n[ \t]*(?:>[ \t]?[ \t]*)*/g : /\n[ \t]*/g;
	const lines = text.slice(from, to).replace(prefix, '\n');
	// what an item holds reads as the content of an item, `[ ]` there is a task box
	const context = node.type === 'list_item' ? '- ' : '';
	const joined = lines.replace(/\n/g, ' ').replace(/[ \t]{2,}/g, ' ');
	return (
		structure(parse(context + joined)) === structure(parse(context + lines))
	);
}

/** the kinds and attributes of a tree without its text and line ends */
function structure(node: SvxNode): string {
	if (
		node.type === 'text' ||
		node.type === 'soft_break' ||
		node.type === 'line_break'
	) {
		return '';
	}
	const meta = node.meta
		? Object.entries(node.meta).filter(
				([key]) => key !== 'info_start' && key !== 'info_end'
			)
		: [];
	return `${node.type}${JSON.stringify(meta)}(${node.children.map(structure).join('')})`;
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

/** a fence and its code at the indent of what holds it */
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

	// the parser takes the indent of the fence off its code
	let code = node.content ?? text.slice(node.value_start, node.value_end);
	// an unclosed fence runs to the end of the document, whose line end is printed after it
	if (!closed && code.endsWith('\n')) code = code.slice(0, -1);
	const info = info_string(node, text);
	// a backtick in the info would run into the fence
	if (info.includes('`')) return print_whole(node, text);
	const fence = '`'.repeat(Math.max(3, longest_run(code, '`') + 1));
	const parts: Doc[] = [fence, info];
	if (node.value_end > node.value_start || node.content !== undefined) {
		for (const line of code.split('\n')) parts.push(hardline, line);
	}
	parts.push(hardline, fence);
	return parts;
}

/** the language and the meta of a fence, one space between them */
function info_string(node: SvxNode, text: string): string {
	const { info_start, info_end } = node.meta as {
		info_start?: number;
		info_end?: number;
	};
	if (typeof info_start !== 'number' || typeof info_end !== 'number') return '';
	const info = text.slice(info_start, info_end).trim();
	const space = info.search(/\s/);
	return space === -1
		? info
		: info.slice(0, space) + ' ' + info.slice(space).trim();
}

function longest_run(text: string, char: string): number {
	let longest = 0;
	let run = 0;
	for (const c of text) {
		run = c === char ? run + 1 : 0;
		if (run > longest) longest = run;
	}
	return longest;
}

/** a run of prose between blocks, from the first child to the last */
function print_run(
	path: AstPath<SvxNode>,
	options: Options,
	print: Print,
	first: number,
	last: number
): Doc {
	const text = options.originalText;
	const children = path.node.children;
	const words = children
		.slice(first, last + 1)
		.some(
			(child) =>
				child.type === 'text' &&
				text.slice(child.start, child.end).trim() !== ''
		);
	// prose in a tight list item wraps as a paragraph does, a run of markup keeps its lines
	if (
		words &&
		(options.proseWrap === 'always' || options.proseWrap === 'never')
	) {
		return print_prose(path, options, print, [first, last]);
	}
	return print_run_as_written(path, options, print, first, last);
}

function print_run_as_written(
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
	// spaces in prose fold to one as markdown renders them
	if (node.type === 'text') return fold_spaces(parts);
	return parts;
}

/** the lines of a table are its rows, a row is not a block that interrupts it */
const TABLE = new Set(['table', 'table_header', 'table_row', 'table_cell']);

function fold_spaces(parts: Doc[]): Doc[] {
	return parts.map((part) =>
		typeof part === 'string'
			? part.replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ')
			: Array.isArray(part)
				? fold_spaces(part)
				: part
	);
}

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
	/^(?:([-*_])(?:[ \t]*\1){2,}[ \t]*$|#{1,6}(?:[ \t]|$)|>|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|`{3,}|:{2,}|=+[ \t]*$|\[\^)/;

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
