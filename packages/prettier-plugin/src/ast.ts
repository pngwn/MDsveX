import { parse_markdown_svelte } from '@mdsvex/parse';
import { kind_to_string } from '@mdsvex/parse/utils';

const NONE = 0xffffffff;

export interface SvxNode {
	/** a parser kind name, or `raw` for source no node covers */
	type: string;
	start: number;
	end: number;
	value_start: number;
	value_end: number;
	meta: Record<string, unknown> | undefined;
	children: SvxNode[];
}

export interface SvxRoot extends SvxNode {
	type: 'root';
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
			children,
		};
	}

	const root = build(0) as SvxRoot;
	root.start = 0;
	root.end = text.length;
	root.children = blocks(text, root.children);
	return root;
}

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
		children: [],
	});
}

function is_space(c: number): boolean {
	return c === 32 || c === 9 || c === 10;
}

function is_blank(c: number): boolean {
	return c === 32 || c === 9;
}
