import { doc } from 'prettier';
import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';

import type { Edit, SvxNode, SvxRoot } from './ast';
import { embed } from './embed';
import { insert_pragma } from './pragma';

const { hardline, literalline } = doc.builders;
const { replaceEndOfLine } = doc.utils;

export type Print = (path: AstPath<SvxNode>) => Doc;

export const printer: Printer<SvxNode> = {
	print(path, options, print) {
		const node = path.node;
		if (node.type === 'root') return print_root(path, options, print);
		return print_source(path, options, print);
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
		const text = (path.stack[0] as SvxRoot).text;
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
	options: ParserOptions<SvxNode>,
	print: Print
): Doc {
	const text = options.originalText;
	const children = path.node.children;
	if (children.length === 0) return '';

	const parts: Doc[] = [];
	// a thematic break on the first line would open frontmatter
	const first = children[0];
	if (
		first.start > 0 &&
		first.type !== 'frontmatter' &&
		text.startsWith('---', first.start)
	) {
		parts.push(hardline);
	}
	let ignored_to = -1;
	path.each((child, i) => {
		if (i <= ignored_to) return;
		if (i > 0) parts.push(separator(text, children[i - 1], child.node));
		if (edge_comment(child.node, text, 0) === 'prettier-ignore-start') {
			const end = children.findIndex(
				(node, j) =>
					j >= i && edge_comment(node, text, -1) === 'prettier-ignore-end'
			);
			if (end !== -1) {
				parts.push(
					replaceEndOfLine(text.slice(child.node.start, children[end].end))
				);
				ignored_to = end;
				return;
			}
		}
		parts.push(print(child));
	}, 'children');
	parts.push(hardline);
	return parts;
}

/** what goes between two blocks, blank lines fold to one */
function separator(text: string, prev: SvxNode, next: SvxNode): Doc {
	const gap = text.slice(prev.end, next.start);
	let lines = 0;
	for (let i = 0; i < gap.length; i++) if (gap.charCodeAt(i) === 10) lines++;
	if (lines === 0) return gap;
	return lines === 1 ? hardline : [hardline, hardline];
}

/** the source of a node with its children printed in place, starting at from */
export function print_source(
	path: AstPath<SvxNode>,
	options: ParserOptions<SvxNode>,
	print: Print,
	from = path.node.start
): Doc {
	const node = path.node;
	const text = options.originalText;
	const edits = root_of(path).edits;
	if (is_whole(node)) {
		return source(text, node.start, node.end, [], edits, true);
	}

	const keep = own_kept(node);
	const parts: Doc[] = [];
	let pos = from;
	path.each((child) => {
		const c = child.node;
		if (c.start < pos) return;
		parts.push(source(text, pos, c.start, keep, edits));
		parts.push(print(child));
		pos = c.end;
	}, 'children');
	if (pos < node.end) parts.push(source(text, pos, node.end, keep, edits));
	return parts;
}

/** nodes whose whole source is content */
function is_whole(node: SvxNode): boolean {
	switch (node.type) {
		case 'code_fence':
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

export function is_raw_text(node: SvxNode): boolean {
	const tag = node.meta?.tag;
	return (
		tag === 'script' || tag === 'style' || tag === 'pre' || tag === 'textarea'
	);
}

/** the parts of a node outside its children whose spaces are content */
function own_kept(node: SvxNode): [number, number][] {
	if (node.type === 'svelte_branch')
		return [[node.value_start, node.value_end]];
	// the open tag, whose attribute values may hold spaces at a line end
	if (node.type === 'html') return [[node.start, node.value_start]];
	return [];
}

/** source text as a doc, a line end trims the spaces before it unless they are content or follow a backslash */
function source(
	text: string,
	from: number,
	to: number,
	keep: [number, number][],
	edits: Edit[],
	whole = false
): Doc {
	const parts: Doc[] = [];
	let line = '';
	let piece = from;
	let e = first_edit(edits, from);
	for (let i = from; i < to; ) {
		const edit = edits[e];
		if (edit !== undefined && edit.at === i) {
			line += text.slice(piece, i) + edit.insert;
			i += Math.min(edit.remove, to - i);
			piece = i;
			e++;
			continue;
		}
		if (text.charCodeAt(i) !== 10) {
			i++;
			continue;
		}
		parts.push(line + text.slice(piece, i));
		line = '';
		let trail = i;
		while (trail > 0 && is_blank(text.charCodeAt(trail - 1))) trail--;
		const kept =
			whole ||
			(trail < i &&
				(text.charCodeAt(trail - 1) === 92 || in_ranges(keep, trail)));
		parts.push(kept ? literalline : hardline);
		i++;
		piece = i;
	}
	parts.push(line + text.slice(piece, to));
	return parts;
}

/** the index of the first edit at or after offset */
function first_edit(edits: Edit[], offset: number): number {
	let lo = 0;
	let hi = edits.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (edits[mid].at < offset) lo = mid + 1;
		else hi = mid;
	}
	return lo;
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
