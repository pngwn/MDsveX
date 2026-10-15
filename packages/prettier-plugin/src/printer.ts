import { doc } from 'prettier';
import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';

import type { SvxNode, SvxRoot } from './ast';
import { embed } from './embed';

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
};

function print_root(
	path: AstPath<SvxNode>,
	options: ParserOptions<SvxNode>,
	print: Print
): Doc {
	const text = options.originalText;
	const children = path.node.children;
	if (children.length === 0) return '';

	const parts: Doc[] = [];
	// a --- on the first line opens frontmatter, keep the line that held it off
	const first = children[0];
	if (first.start > 0 && first.type !== 'frontmatter' && text.startsWith('---', first.start)) {
		parts.push(hardline);
	}
	path.each((child, i) => {
		if (i > 0) parts.push(separator(text, children[i - 1], child.node));
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

/**
 * the source of a node with each child printed in its place, from `from`
 * when an embed printed the start of the node itself
 */
export function print_source(
	path: AstPath<SvxNode>,
	options: ParserOptions<SvxNode>,
	print: Print,
	from = path.node.start
): Doc {
	const node = path.node;
	const text = options.originalText;
	if (is_whole(node)) return replaceEndOfLine(text.slice(node.start, node.end));

	const keep = own_kept(node);
	const parts: Doc[] = [];
	let pos = from;
	path.each((child) => {
		const c = child.node;
		if (c.start < pos) return;
		parts.push(source(text, pos, c.start, keep));
		parts.push(print(child));
		pos = c.end;
	}, 'children');
	if (pos < node.end) parts.push(source(text, pos, node.end, keep));
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
		case 'raw':
			return true;
		case 'html':
			return is_raw_text(node);
	}
	return false;
}

export function is_raw_text(node: SvxNode): boolean {
	const tag = node.meta?.tag;
	return tag === 'script' || tag === 'style' || tag === 'pre' || tag === 'textarea';
}

/** the parts of a node outside its children whose spaces are content */
function own_kept(node: SvxNode): [number, number][] {
	if (node.type === 'svelte_branch') return [[node.value_start, node.value_end]];
	// the open tag, whose attribute values may hold spaces at a line end
	if (node.type === 'html') return [[node.start, node.children[0]?.start ?? node.end]];
	return [];
}

/**
 * source text as a doc, a line end takes the spaces before it off, as a
 * hardline trims what was printed, unless they are content or follow a
 * backslash, where taking them off would make a hard break
 */
function source(text: string, from: number, to: number, keep: [number, number][]): Doc {
	const parts: Doc[] = [];
	let line_start = from;
	for (let i = from; i < to; i++) {
		if (text.charCodeAt(i) !== 10) continue;
		parts.push(text.slice(line_start, i));
		let trail = i;
		while (trail > 0 && is_blank(text.charCodeAt(trail - 1))) trail--;
		const kept =
			trail < i && (text.charCodeAt(trail - 1) === 92 || in_ranges(keep, trail));
		parts.push(kept ? literalline : hardline);
		line_start = i + 1;
	}
	parts.push(text.slice(line_start, to));
	return parts;
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
