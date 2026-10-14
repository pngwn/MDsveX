import type { Bundle, NodeView, PluginContext } from 'mdsvex/compile';

import type { TocHeading } from './tree.js';

export { toc_tree } from './tree.js';
export type { TocHeading, TocNode, TocPoint } from './tree.js';

const PACKAGE = '@mdsvex/plugin-toc';
/** the key of plugin_data, the name of the directive and of its component */
const NAME = 'toc';
/** a heading that holds this comment is left out */
const MARKER = 'no-toc';

export interface TocOptions {
	/** the least deep heading in the table, 2 by default, which leaves the title of the page out */
	min_depth?: number;
	/** the deepest heading in the table, 3 by default */
	max_depth?: number;
}

/** what the plugin leaves in `plugin_data.toc`, a document with no entry has no such key */
export interface TocData {
	/** in the order they are written, `toc_tree` nests them */
	headings: TocHeading[];
}

declare module 'mdsvex/compile' {
	interface PluginData {
		toc?: TocData;
	}
}

export type TocErrorCode = 'option' | 'heading_ids';

/** an option that is no heading depth, or a document whose headings have no ids */
export class TocError extends Error {
	code: TocErrorCode;
	/** the document, undefined for an option and when the compile was given no filename */
	filename: string | undefined;

	constructor(code: TocErrorCode, message: string, filename?: string) {
		super(`[${PACKAGE}] ${message}`);
		this.name = 'TocError';
		this.code = code;
		this.filename = filename;
	}
}

function depth_option(name: string, value: unknown, fallback: number): number {
	if (value === undefined) return fallback;
	if (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 1 &&
		value <= 6
	)
		return value;
	throw new TocError(
		'option',
		`${name} must be a heading depth from 1 to 6, got ${JSON.stringify(value)}`
	);
}

const REFERENCE =
	/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos|nbsp));/g;
const NAMED: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: String.fromCharCode(0xa0),
};

/** a numeric reference and the few named ones html needs are their character, any other stays as written */
function reference(
	_match: string,
	decimal: string | undefined,
	hex: string | undefined,
	name: string | undefined
): string {
	if (name !== undefined) return NAMED[name];
	const code =
		decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex!, 16);
	if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
		return String.fromCharCode(0xfffd);
	return String.fromCodePoint(code);
}

const is_element = /^[a-z][^.:]*$/;

/** the text heading_ids makes the id from, an image is its alt, what svelte or a component renders is nothing */
function text_of(node: NodeView): string {
	let out = '';
	for (let child = node.first_child; child !== null; child = child.next) {
		switch (child.type) {
			case 'text': {
				const text = child.text_content;
				out +=
					text.indexOf('&') === -1 ? text : text.replace(REFERENCE, reference);
				break;
			}
			// code shows a reference as written
			case 'code_span':
				out += child.text_content;
				break;
			case 'mustache':
			case 'svelte_tag':
			case 'svelte_block':
			case 'html_comment':
			case 'directive_inline':
			case 'directive_leaf':
			case 'directive_container':
				break;
			case 'html': {
				const tag = child.attrs.tag;
				if (typeof tag === 'string' && is_element.test(tag))
					out += text_of(child);
				break;
			}
			default:
				out += text_of(child);
		}
	}
	return out;
}

/** anywhere inside, an anchor that wraps the content of the heading holds the comment too */
function is_marked(node: NodeView): boolean {
	for (let child = node.first_child; child !== null; child = child.next) {
		if (child.type === 'html_comment') {
			if (child.text_content.trim() === MARKER) return true;
		} else if (is_marked(child)) return true;
	}
	return false;
}

/** headings sit at block level, a node that holds only inline content or none is not entered */
function find(parent: NodeView, headings: NodeView[]): void {
	for (let child = parent.first_child; child !== null; child = child.next) {
		switch (child.type) {
			case 'heading':
				headings.push(child);
				break;
			case 'text':
			case 'line_break':
			case 'paragraph':
			case 'code_fence':
			case 'table':
			case 'thematic_break':
			case 'html_comment':
			case 'directive_leaf':
			case 'frontmatter':
			case 'import_statement':
				break;
			// a block quote, a list, an element, a container and the wrappers plugins make
			default:
				find(child, headings);
		}
	}
}

const DEPTH = /^[1-6]$/;

/** a depth written as an arg of the directive, the fallback and a warning for anything else */
function depth_arg(
	list: NodeView,
	ctx: PluginContext,
	name: string,
	fallback: number
): number {
	const value = list.attrs.args?.[name];
	if (value === undefined) return fallback;
	if (DEPTH.test(value)) return Number(value);
	ctx.warn(
		'bad_depth',
		`${name} of ::${NAME} must be a heading depth from 1 to 6, got ${JSON.stringify(value)}`,
		list
	);
	return fallback;
}

const HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * every entry of the table, read once for a document, a sequential pass has
 * no hook for its end and a `::toc` lists the headings written after it
 */
function headings_of(
	from: NodeView,
	ctx: PluginContext,
	min: number,
	max: number
): TocHeading[] {
	if (ctx.headings !== undefined) return ctx.headings;
	let root = from;
	for (let up = root.parent; up !== null; up = up.parent) root = up;
	const found: NodeView[] = [];
	find(root, found);

	const headings: TocHeading[] = (ctx.headings = []);
	const without_id: NodeView[] = [];
	let any_id = false;
	let sluggable = false;
	let before = 0;
	for (const node of found) {
		const id = node.attrs.id;
		const has_id = typeof id === 'string' && id !== '';
		if (has_id) any_id = true;
		if (is_marked(node)) continue;
		const depth = node.depth!;
		const last = before;
		before = depth;
		if (depth < min || depth > max) continue;
		if (last !== 0 && depth > last + 1) {
			ctx.warn(
				'skipped_level',
				`a level ${depth} heading follows a level ${last} heading, a level is skipped`,
				node
			);
		}
		const text = text_of(node).trim();
		if (!has_id) {
			without_id.push(node);
			if (HAS_WORD.test(text)) sluggable = true;
			continue;
		}
		const heading: TocHeading = { depth, id, text };
		const position = node.position;
		if (position !== undefined && position.end !== undefined) {
			heading.position = {
				start: { ...position.start },
				end: { ...position.end },
			};
		}
		headings.push(heading);
	}

	// the options of the compile are not passed to a plugin, so this is read off the tree
	if (sluggable && !any_id) {
		throw new TocError(
			'heading_ids',
			`no heading of ${ctx.filename ?? 'the document'} has an id, turn on the heading_ids option of mdsvex, this plugin makes no ids of its own`,
			ctx.filename
		);
	}
	for (const node of without_id) {
		ctx.warn(
			'heading_without_id',
			'a heading with no id is left out of the table of contents',
			node
		);
	}
	if (headings.length > 0) ctx.data.headings = headings;
	return headings;
}

/** gives a `::toc` its headings, the args of a directive are strings so its component reads json */
function fill(
	list: NodeView,
	headings: TocHeading[],
	ctx: PluginContext
): void {
	const min = depth_arg(list, ctx, 'min_depth', 1);
	const max = depth_arg(list, ctx, 'max_depth', 6);
	const listed = [];
	for (const { depth, id, text } of headings) {
		if (depth >= min && depth <= max) listed.push({ depth, id, text });
	}
	if (listed.length === 0) {
		ctx.warn(
			'no_headings',
			`::${NAME} has no headings to list and renders nothing`,
			list
		);
	}
	list.attrs.args = { ...list.attrs.args, headings: JSON.stringify(listed) };
}

/**
 * a table of contents as data, the headings of a document in
 * `plugin_data.toc.headings`, and a `::toc` directive that lists them in place
 *
 * the ids come from the `heading_ids` option of mdsvex, which has to be on
 *
 * @example
 * import { toc } from '@mdsvex/plugin-toc';
 *
 * mdsvex({ heading_ids: true, plugins: [toc()] });
 */
export function toc(options: TocOptions = {}): Bundle {
	const min = depth_option('min_depth', options.min_depth, 2);
	const max = depth_option('max_depth', options.max_depth, 3);
	if (min > max) {
		throw new TocError(
			'option',
			`min_depth ${min} is deeper than max_depth ${max}`
		);
	}

	return {
		name: NAME,
		module: `${PACKAGE}/directives`,
		directives: {
			[NAME]: {
				parse(node, ctx) {
					if (node.type !== 'directive_leaf') {
						ctx.warn(
							'not_a_leaf',
							`${NAME} lists nothing as a container or inline, write ::${NAME} on a line of its own`,
							node
						);
						return;
					}
					// a sequential handler is never called for a directive a component takes, it is for this node
					node.append('html_comment');
				},
			},
		},
		parse: {
			// heading_ids sets the ids after the parse, a fused handler would read none
			sequential: true,
			heading: {
				parse(node, ctx) {
					headings_of(node, ctx, min, max);
				},
			},
			html_comment: {
				parse(node, ctx) {
					const list = node.parent;
					if (
						list === null ||
						list.type !== 'directive_leaf' ||
						list.attrs.name !== NAME
					)
						return;
					node.remove();
					fill(list, headings_of(list, ctx, min, max), ctx);
				},
			},
		},
	};
}
