import { doc } from 'prettier';
import type { AstPath, Doc, ParserOptions, Printer } from 'prettier';

import type { SvxNode } from './ast';

const { hardline } = doc.builders;
const { replaceEndOfLine } = doc.utils;

type Print = (path: AstPath<SvxNode>) => Doc;

export const printer: Printer<SvxNode> = {
	print(path, options, print) {
		const node = path.node;
		if (node.type === 'root') return print_root(path, options, print);
		return verbatim(node, options.originalText);
	},
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

/** the source of a node with the spaces that end its lines taken off */
function verbatim(node: SvxNode, text: string): Doc {
	const keep = kept_ranges(node);
	let out = '';
	let line_start = node.start;
	for (let i = node.start; i <= node.end; i++) {
		if (i < node.end && text.charCodeAt(i) !== 10) continue;
		let trail = i;
		while (trail > line_start && is_blank(text.charCodeAt(trail - 1))) trail--;
		const line =
			trail === i || is_kept(keep, trail) || ends_in_backslash(text, line_start, trail)
				? text.slice(line_start, i)
				: text.slice(line_start, trail);
		out += i < node.end ? line + '\n' : line;
		line_start = i + 1;
	}
	return replaceEndOfLine(out);
}

/** the spans whose spaces are content, code, expressions and raw html */
function kept_ranges(node: SvxNode, out: [number, number][] = []): [number, number][] {
	switch (node.type) {
		case 'code_fence':
		case 'code_span':
		case 'mustache':
		case 'svelte_tag':
		case 'html_comment':
		case 'frontmatter':
		case 'import_statement':
		case 'raw':
			out.push([node.start, node.end]);
			return out;
		case 'svelte_branch':
			out.push([node.value_start, node.value_end]);
			break;
		case 'html': {
			const tag = node.meta?.tag;
			if (tag === 'script' || tag === 'style' || tag === 'pre' || tag === 'textarea') {
				out.push([node.start, node.end]);
				return out;
			}
			// the open tag, whose attribute values may hold spaces at a line end
			out.push([node.start, node.children[0]?.start ?? node.end]);
			break;
		}
	}
	for (const child of node.children) kept_ranges(child, out);
	return out;
}

function is_kept(ranges: [number, number][], pos: number): boolean {
	for (const [start, end] of ranges) if (pos >= start && pos < end) return true;
	return false;
}

/** a backslash before the end of a line would become a hard break */
function ends_in_backslash(text: string, start: number, end: number): boolean {
	return end > start && text.charCodeAt(end - 1) === 92;
}

function is_blank(c: number): boolean {
	return c === 32 || c === 9;
}
