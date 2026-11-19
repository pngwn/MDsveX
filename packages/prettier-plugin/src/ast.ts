import { parse_markdown_svelte } from '@mdsvex/parse';
import { kind_to_string, plain_meta } from '@mdsvex/parse/utils';

const NONE = 0xffffffff;

export interface SvxNode {
	/** a parser kind name, or raw for source no node covers */
	type: string;
	start: number;
	end: number;
	value_start: number;
	value_end: number;
	meta: Record<string, unknown> | undefined;
	/** what a node holds without the prefixes of its lines, the code of a fence in a list item */
	content: string | undefined;
	children: SvxNode[];
}

export interface SvxRoot extends SvxNode {
	type: 'root';
	/** a script of the document is typescript, so are its expressions */
	ts: boolean;
	/** the source, for the printer hooks that are given no options */
	text: string;
	/** the frontmatter is yaml prettier may format, not text a project parses itself */
	yaml: boolean;
}

/** the parser tree as objects, offsets index the text prettier passes in with its line ends folded */
export function parse(text: string): SvxRoot {
	// no plugins, a plugin node has no span
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
		const meta = plain_meta(nodes.metadata_at(i));
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
	for (const child of root.children) clamp(text, child, child.end);
	root.ts = root.children.some(
		(child) =>
			child.type === 'html' && child.meta?.tag === 'script' && is_ts(child.meta)
	);
	root.yaml = true;
	return root;
}

/** no node ends in a line end or past its parent */
function clamp(text: string, node: SvxNode, limit: number) {
	node.start = Math.min(node.start, limit);
	let end = Math.min(node.end, limit);
	while (end > node.start && text.charCodeAt(end - 1) === 10) end--;
	node.end = end;
	for (const child of node.children) clamp(text, child, end);
}

/** the root blocks without the line breaks between them, source between blocks that is more than whitespace becomes a raw node */
function blocks(text: string, children: SvxNode[]): SvxNode[] {
	const out: SvxNode[] = [];
	let pos = 0;
	for (const child of children) {
		if (child.type === 'line_break' || child.end === NONE) continue;
		push_raw(text, pos, child.start, out);
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

type Section = 'options' | 'scripts' | 'markup' | 'styles';

/** the top level blocks in svelteSortOrder, frontmatter and imports stay first as pfm reads them only there */
export function sort_root(root: SvxRoot, order: string | undefined): void {
	if (order === 'none') return;
	const sections = (order ?? 'options-scripts-markup-styles').split(
		'-'
	) as Section[];
	const text = root.text;
	// a prettier-ignore comment keeps what follows it, moving blocks would move it off
	if (
		root.children.some(
			(child) =>
				child.type === 'html_comment' &&
				text
					.slice(child.value_start, child.value_end)
					.trim()
					.startsWith('prettier-ignore')
		)
	) {
		return;
	}
	const first: SvxNode[] = [];
	const grouped: Record<Section, SvxNode[]> = {
		options: [],
		scripts: [],
		markup: [],
		styles: [],
	};
	for (const child of root.children) {
		if (child.type === 'frontmatter' || child.type === 'import_statement') {
			first.push(child);
			continue;
		}
		grouped[section_of(child)].push(child);
	}
	root.children = [
		...first,
		...sections.flatMap((section) => grouped[section] ?? []),
	];
}

function section_of(node: SvxNode): Section {
	if (node.type !== 'html') return 'markup';
	const tag = node.meta?.tag;
	if (tag === 'svelte:options') return 'options';
	if (tag === 'script') return 'scripts';
	if (tag === 'style') return 'styles';
	return 'markup';
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
