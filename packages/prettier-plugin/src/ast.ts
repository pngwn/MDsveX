import { parse_markdown_svelte } from '@mdsvex/parse';
import { kind_to_string } from '@mdsvex/parse/utils';

import { indent_edits } from './indent';

const NONE = 0xffffffff;

export interface SvxNode {
	/** a parser kind name, or `raw` for source no node covers */
	type: string;
	start: number;
	end: number;
	value_start: number;
	value_end: number;
	meta: Record<string, unknown> | undefined;
	/** what the node holds when the source does not show it as one slice, the code of a fence in a list item without the indent of its lines */
	content: string | undefined;
	children: SvxNode[];
}

export interface SvxRoot extends SvxNode {
	type: 'root';
	/** a script of the document is typescript, so are its expressions */
	ts: boolean;
	/** the source, for the printer hooks that are given no options */
	text: string;
	/** changes to the indent of lines, sorted by offset */
	edits: Edit[];
}

export interface Edit {
	/** the offset in the source */
	at: number;
	/** how many chars from there are left out */
	remove: number;
	/** what is put there */
	insert: string;
}

/**
 * the parser tree as objects, offsets index the text prettier passes in,
 * prettier has already folded every line ending to \n
 */
export function parse(text: string): SvxRoot {
	// no plugins: a plugin node has no span, and only the syntax matters here
	const { nodes } = parse_markdown_svelte(text);

	function build(i: number): SvxNode {
		const children: SvxNode[] = [];
		for (
			let c = nodes.first_child_at(i);
			c !== NONE && nodes.parent_at(c) === i;
			c = nodes.next_at(c)
		) {
			children.push(build(c));
		}
		const meta = nodes.metadata_at(i);
		return {
			type: kind_to_string(nodes.kind_at(i)),
			start: nodes.start_at(i),
			end: nodes.end_at(i),
			value_start: nodes.value_start_at(i),
			value_end: nodes.value_end_at(i),
			meta: meta && Object.keys(meta).length > 0 ? { ...meta } : undefined,
			content: nodes._strings[i],
			children,
		};
	}

	const root = build(0) as SvxRoot;
	root.start = 0;
	root.end = text.length;
	root.text = text;
	root.children = blocks(text, root.children);
	for (const child of root.children) clamp(text, child, child.end, child.start);
	root.ts = root.children.some(
		(child) =>
			child.type === 'html' && child.meta?.tag === 'script' && is_ts(child.meta)
	);
	root.edits = indent_edits(root);
	return root;
}

/**
 * no node ends in a line end and none reaches past its parent, some spans
 * take in the line end after them and an unclosed child can run on, and a
 * block that starts a line takes in its indent, so a change to the indent
 * of a line falls in one node
 */
function clamp(text: string, node: SvxNode, limit: number, floor = 0) {
	node.start = Math.min(node.start, limit);
	let end = Math.min(node.end, limit);
	while (end > node.start && text.charCodeAt(end - 1) === 10) end--;
	node.end = end;
	if (BLOCKS.has(node.type)) {
		let start = node.start;
		while (start > floor && is_blank(text.charCodeAt(start - 1))) start--;
		const before = text.charCodeAt(start - 1);
		if (start === 0 || before === 10 || before === 62) node.start = start;
	}
	let prev_end = node.start;
	for (const child of node.children) {
		clamp(text, child, end, prev_end);
		prev_end = child.end;
	}
}

const BLOCKS = new Set([
	'paragraph',
	'heading',
	'code_fence',
	'block_quote',
	'list',
	'list_item',
	'table',
	'thematic_break',
	'html',
	'svelte_block',
	'directive_leaf',
	'directive_container',
	'footnote_definition',
	'definition',
]);

/**
 * the blocks of the root without the line breaks between them, each ending
 * at its last character that is not a newline, and the source between two
 * blocks that is more than whitespace kept as a raw node
 */
function blocks(text: string, children: SvxNode[]): SvxNode[] {
	const out: SvxNode[] = [];
	let pos = 0;
	for (const child of children) {
		if (child.type === 'line_break' || child.end === NONE) continue;
		push_raw(text, pos, child.start, out);
		// the indent of the first line goes with the block, it is relative to the lines after it
		let start = child.start;
		while (start > pos && is_blank(text.charCodeAt(start - 1))) start--;
		if (start === 0 || text.charCodeAt(start - 1) === 10) child.start = start;
		let end = child.end;
		while (end > child.start && text.charCodeAt(end - 1) === 10) end--;
		child.end = end;
		out.push(child);
		pos = end;
	}
	push_raw(text, pos, text.length, out);
	return out;
}

function push_raw(text: string, from: number, to: number, out: SvxNode[]) {
	let start = from;
	while (start < to && is_space(text.charCodeAt(start))) start++;
	if (start === to) return;
	let end = to;
	while (end > start && is_space(text.charCodeAt(end - 1))) end--;
	// keep the indent of the first line
	while (start > from && text.charCodeAt(start - 1) !== 10) start--;
	out.push({
		type: 'raw',
		start,
		end,
		value_start: start,
		value_end: end,
		meta: undefined,
		content: undefined,
		children: [],
	});
}

export function attribute(meta: SvxNode['meta'], name: string): unknown {
	const attributes = meta?.attributes as Record<string, unknown> | undefined;
	return attributes?.[name];
}

export function is_ts(meta: SvxNode['meta']): boolean {
	const lang = attribute(meta, 'lang') ?? attribute(meta, 'type');
	return lang === 'ts' || lang === 'typescript' || lang === 'text/typescript';
}

function is_space(c: number): boolean {
	return c === 32 || c === 9 || c === 10;
}

function is_blank(c: number): boolean {
	return c === 32 || c === 9;
}
