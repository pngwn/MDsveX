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

/** anywhere inside, an anchor that wraps the content of the heading holds the comment too */
function is_marked(node: NodeView): boolean {
	for (let child = node.first_child; child !== null; child = child.next) {
		if (child.type === 'html_comment') {
			if (child.text_content.trim() === MARKER) return true;
		} else if (is_marked(child)) return true;
	}
	return false;
}

const DEPTH = /^[1-6]$/;

/** a depth written as an arg of the directive, the fallback and a warning for anything else */
function depth_arg(
	list: NodeView,
	ctx: PluginContext,
	name: string,
	fallback: number,
	warn: boolean
): number {
	const value = list.attrs.args?.[name];
	if (value === undefined) return fallback;
	if (DEPTH.test(value)) return Number(value);
	if (warn)
		ctx.warn(
			'bad_depth',
			`${name} of ::${NAME} must be a heading depth from 1 to 6, got ${JSON.stringify(value)}`,
			list
		);
	return fallback;
}

const HAS_WORD = /[\p{L}\p{N}]/u;

/** what the plugin keeps in the scratch of a document between headings */
interface Seen {
	/** the depth of the last heading that could be listed, 0 before the first */
	before: number;
	/** a heading had an id */
	any_id: boolean;
	/** a heading without one had words to make one from */
	sluggable: boolean;
}

function seen_of(ctx: PluginContext): Seen {
	return (ctx.scratch.seen ??= { before: 0, any_id: false, sluggable: false });
}

/** the entry of a heading as it closes, when it is one the table lists */
function close_heading(
	node: NodeView,
	ctx: PluginContext,
	min: number,
	max: number
): void {
	// a plugin may have made it something else, a label of tabs say
	if (node.type !== 'heading' || is_marked(node)) return;
	const seen = seen_of(ctx);
	const id = node.attrs.id;
	const has_id = typeof id === 'string' && id !== '';
	if (has_id) seen.any_id = true;
	const depth = node.depth!;
	const last = seen.before;
	seen.before = depth;
	if (depth < min || depth > max) return;
	if (last !== 0 && depth > last + 1) {
		ctx.warn(
			'skipped_level',
			`a level ${depth} heading follows a level ${last} heading, a level is skipped`,
			node
		);
	}
	const text = ctx.text(node).trim();
	if (!has_id) {
		if (HAS_WORD.test(text)) seen.sluggable = true;
		ctx.warn(
			'heading_without_id',
			'a heading with no id is left out of the table of contents',
			node
		);
		return;
	}
	const heading: TocHeading = { depth, id, text };
	const position = node.position;
	if (position !== undefined && position.end !== undefined) {
		heading.position = {
			start: { ...position.start },
			end: { ...position.end },
		};
	}
	ctx.add('headings', heading);
}

/** once the document is whole, the checks that need every heading */
function finish(_root: NodeView, ctx: PluginContext): void {
	const seen = seen_of(ctx);
	// the options of the compile are not passed to a plugin, so this is read off the tree
	if (seen.sluggable && !seen.any_id) {
		throw new TocError(
			'heading_ids',
			`no heading of ${ctx.filename ?? 'the document'} has an id, turn on the heading_ids option of mdsvex, this plugin makes no ids of its own`,
			ctx.filename
		);
	}
	const lists: NodeView[] | undefined = ctx.scratch.lists;
	if (lists === undefined) return;
	const headings = (ctx.data.headings ?? []) as unknown as TocHeading[];
	for (const list of lists) {
		const min = depth_arg(list, ctx, 'min_depth', 1, false);
		const max = depth_arg(list, ctx, 'max_depth', 6, false);
		if (!headings.some(({ depth }) => depth >= min && depth <= max)) {
			ctx.warn(
				'no_headings',
				`::${NAME} has no headings to list and renders nothing`,
				list
			);
		}
	}
}

/**
 * a table of contents as data, the headings of a document in
 * `plugin_data.toc.headings`, added as each heading arrives, and a `::toc`
 * directive whose component lists them from that data
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
					// a block directive has its args by now
					depth_arg(node, ctx, 'min_depth', 1, true);
					depth_arg(node, ctx, 'max_depth', 6, true);
					// for the document hook, in the order they are written, no block directive is revoked
					(ctx.scratch.lists ??= []).push(node);
				},
			},
		},
		parse: {
			heading: {
				parse(node, ctx) {
					return () => close_heading(node, ctx, min, max);
				},
			},
			document: finish,
		},
	};
}
