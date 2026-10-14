import type { Bundle, NodeView, PluginContext } from 'mdsvex';

import { count_words } from './words.js';

export { count_words } from './words.js';

const PACKAGE = '@mdsvex/plugin-page-data';
/** the key of plugin_data */
const NAME = 'page';
/** a comment with this text ends the excerpt */
const MORE = 'more';

export interface ReadingTimeOptions {
	/** 200 by default */
	words_per_minute?: number;
}

export interface ExcerptOptions {
	/** the most characters an excerpt has, its ellipsis included, a longer one is cut at a word */
	max_length?: number;
	/** what ends an excerpt that was cut, the ellipsis character by default */
	ellipsis?: string;
}

export interface EditUrlOptions {
	/** what the path of the document is added to, `https://github.com/you/site/edit/main/` */
	base: string;
	/** the directory the path is relative to, the working directory by default */
	root?: string;
}

export interface PageDataOptions {
	/** `words` and `minutes`, false leaves them out */
	reading_time?: boolean | ReadingTimeOptions;
	/** `excerpt`, false leaves it out */
	excerpt?: boolean | ExcerptOptions;
	/** `title`, false leaves it out */
	title?: boolean;
	/**
	 * `edit_url`, off by default, a string is the base, a function is given
	 * the path of the document and returns the url or nothing
	 */
	edit_url?:
		| string
		| EditUrlOptions
		| ((filename: string) => string | undefined);
}

/** what the plugin leaves in `plugin_data.page`, each key only when its part is on and found something */
export interface PageData {
	/** the text of the first `#` heading, only when the frontmatter has no title */
	title?: string;
	/** the first paragraph, or what is written before a `<!-- more -->` comment, as plain text */
	excerpt?: string;
	/** the words of the prose, code blocks left out */
	words?: number;
	/** `words` over the words per minute, rounded up to a whole minute */
	minutes?: number;
	/** where the source of the document can be edited */
	edit_url?: string;
}

declare module 'mdsvex' {
	interface PluginData {
		page?: PageData;
	}
}

/** an option of the wrong shape */
export class PageDataError extends Error {
	code: 'option';

	constructor(message: string) {
		super(`[${PACKAGE}] ${message}`);
		this.name = 'PageDataError';
		this.code = 'option';
	}
}

function is_object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** undefined for a part that is off, its options otherwise */
function part<T>(name: string, value: unknown): T | undefined {
	if (value === false) return undefined;
	if (value === undefined || value === true) return {} as T;
	if (is_object(value)) return value as T;
	throw new PageDataError(
		`${name} must be true, false or an object of options, got ${JSON.stringify(value)}`
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

function decoded(text: string): string {
	return text.indexOf('&') === -1 ? text : text.replace(REFERENCE, reference);
}

const is_element = /^[a-z][^.:]*$/;

/** the text heading_ids makes an id from, an image is its alt, what svelte or a component renders is nothing */
function heading_text(node: NodeView): string {
	let out = '';
	for (let child = node.first_child; child !== null; child = child.next) {
		switch (child.type) {
			case 'text':
				out += decoded(child.text_content);
				break;
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
					out += heading_text(child);
				break;
			}
			default:
				out += heading_text(child);
		}
	}
	return out;
}

const SPACES = /\s+/g;

interface Reading {
	/** the inline text read since the last block boundary */
	run: string;
	count: boolean;
	words: number;
	/** no excerpt holds the text of a heading, of a table or of a footnote */
	heading: boolean;
	table: number;
	/** the run is the text of a paragraph that is in no container */
	paragraph: boolean;
	/** how many block quotes, lists, tables, footnotes, containers and svelte blocks are open */
	nested: number;
	/** every block of prose until a more comment, undefined when no excerpt is wanted */
	before: string[] | undefined;
	more: boolean;
	first: string | undefined;
	/** undefined until a top level `#` heading with text, null when no title is wanted */
	title: string | null | undefined;
}

/** the end of a block, words never run from one block into the next */
function flush(state: Reading): void {
	const run = state.run;
	if (run === '') return;
	state.run = '';
	const text = run.replace(SPACES, ' ').trim();
	if (text === '') return;
	if (state.count) state.words += count_words(text);
	if (state.before === undefined || state.heading || state.table > 0) return;
	if (!state.more) state.before.push(text);
	if (state.first === undefined && state.paragraph) state.first = text;
}

function read(parent: NodeView, state: Reading): void {
	for (let child = parent.first_child; child !== null; child = child.next) {
		const type = child.type;
		switch (type) {
			case 'text':
				state.run += decoded(child.text_content);
				break;
			// read as part of its sentence
			case 'code_span':
				state.run += child.text_content;
				break;
			case 'soft_break':
			case 'hard_break':
				state.run += ' ';
				break;
			case 'line_break':
				flush(state);
				break;
			case 'html_comment':
				if (!state.more && child.text_content.trim() === MORE) {
					flush(state);
					state.more = true;
				}
				break;
			// nothing a reader reads as prose, the alt of an image is shown in its place
			case 'code_fence':
			case 'image':
			case 'mustache':
			case 'svelte_tag':
			case 'frontmatter':
			case 'import_statement':
			case 'thematic_break':
				break;
			case 'html': {
				const tag = child.attrs.tag;
				// an element can be inline or a block, the blocks inside it end the run
				if (tag !== 'script' && tag !== 'style') read(child, state);
				break;
			}
			case 'heading':
				flush(state);
				if (
					state.title === undefined &&
					state.nested === 0 &&
					child.depth === 1
				) {
					const title = heading_text(child).trim();
					if (title !== '') state.title = title;
				}
				state.heading = true;
				read(child, state);
				flush(state);
				state.heading = false;
				break;
			case 'paragraph':
				flush(state);
				state.paragraph = state.nested === 0;
				read(child, state);
				flush(state);
				state.paragraph = false;
				break;
			case 'list_item':
			case 'table_cell':
			case 'directive_leaf':
			case 'directive_label':
			case 'svelte_branch':
				flush(state);
				read(child, state);
				flush(state);
				break;
			case 'block_quote':
			case 'list':
			case 'table':
			case 'footnote_definition':
			case 'directive_container':
			case 'svelte_block': {
				// a footnote is drawn at the end of the page wherever it is written
				const out = type === 'table' || type === 'footnote_definition';
				flush(state);
				state.nested++;
				if (out) state.table++;
				read(child, state);
				flush(state);
				if (out) state.table--;
				state.nested--;
				break;
			}
			// emphasis, links, inline directives and whatever a plugin made
			default:
				read(child, state);
		}
	}
}

const ELLIPSIS = String.fromCharCode(0x2026);
const SPACE = /\s/;
// han, kana and hangul are written without spaces, any two of them can part
const NO_SPACES = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;

/** at most max characters with the ellipsis, cut where a word ends */
function truncate(text: string, max: number, ellipsis: string): string {
	const chars = Array.from(text);
	if (chars.length <= max) return text;
	const room = Math.max(0, max - Array.from(ellipsis).length);
	let end = room;
	const breaks =
		end === 0 ||
		SPACE.test(chars[end]) ||
		NO_SPACES.test(chars[end]) ||
		NO_SPACES.test(chars[end - 1]);
	if (!breaks) {
		let back = end;
		while (back > 0 && !SPACE.test(chars[back - 1])) back--;
		// one word longer than the room is cut inside
		if (back > 0) end = back;
	}
	while (end > 0 && SPACE.test(chars[end - 1])) end--;
	return chars.slice(0, end).join('') + ellipsis;
}

type EditUrl = (
	filename: string | undefined,
	ctx: PluginContext
) => string | undefined;

function slashes(path: string): string {
	return path.replace(/\\/g, '/');
}

function edit_url_of(option: PageDataOptions['edit_url']): EditUrl | undefined {
	if (option === undefined) return undefined;
	if (typeof option === 'function') {
		return (filename, ctx) => {
			if (filename === undefined) return no_filename(ctx);
			const url = option(filename);
			if (url === undefined || typeof url === 'string') return url;
			throw new PageDataError(
				`edit_url must return a string or undefined, it returned ${JSON.stringify(url)}`
			);
		};
	}
	const options = typeof option === 'string' ? { base: option } : option;
	if (
		!is_object(options) ||
		typeof options.base !== 'string' ||
		options.base === '' ||
		(options.root !== undefined && typeof options.root !== 'string')
	) {
		throw new PageDataError(
			`edit_url must be a base url, an object with a base and a root, or a function, got ${JSON.stringify(option)}`
		);
	}
	const base = options.base.replace(/\/+$/, '') + '/';
	const given = options.root;
	return (filename, ctx) => {
		if (filename === undefined) return no_filename(ctx);
		// read for each document, a server can change directory after the plugin is made
		const root =
			given ?? (typeof process === 'undefined' ? undefined : process.cwd());
		const file = slashes(filename);
		let path = file;
		if (root !== undefined) {
			const prefix = slashes(root).replace(/\/+$/, '') + '/';
			if (!file.startsWith(prefix)) {
				ctx.warn(
					'outside_root',
					`${filename} is not inside ${root}, so it has no edit url, set the root of edit_url`
				);
				return undefined;
			}
			path = file.slice(prefix.length);
		}
		return base + encodeURI(path.replace(/^\/+/, ''));
	};
}

function no_filename(ctx: PluginContext): undefined {
	ctx.warn(
		'no_filename',
		'the compile was given no filename, so the document has no edit url'
	);
	return undefined;
}

/**
 * facts about a document for its template and for listings, left in
 * `plugin_data.page`, an inferred title, an excerpt, a word count with a
 * reading time and an edit url
 *
 * @example
 * import { page_data } from '@mdsvex/plugin-page-data';
 *
 * mdsvex({ plugins: [page_data({ edit_url: 'https://github.com/you/site/edit/main/' })] });
 */
export function page_data(options: PageDataOptions = {}): Bundle {
	const reading = part<ReadingTimeOptions>(
		'reading_time',
		options.reading_time
	);
	const per_minute = reading?.words_per_minute ?? 200;
	if (
		typeof per_minute !== 'number' ||
		!Number.isFinite(per_minute) ||
		per_minute <= 0
	) {
		throw new PageDataError(
			`reading_time.words_per_minute must be a number above 0, got ${JSON.stringify(per_minute)}`
		);
	}
	const excerpt = part<ExcerptOptions>('excerpt', options.excerpt);
	const max_length = excerpt?.max_length;
	if (
		max_length !== undefined &&
		(typeof max_length !== 'number' ||
			!Number.isInteger(max_length) ||
			max_length < 1)
	) {
		throw new PageDataError(
			`excerpt.max_length must be a whole number above 0, got ${JSON.stringify(max_length)}`
		);
	}
	const ellipsis = excerpt?.ellipsis ?? ELLIPSIS;
	if (typeof ellipsis !== 'string') {
		throw new PageDataError(
			`excerpt.ellipsis must be a string, got ${JSON.stringify(ellipsis)}`
		);
	}
	if (options.title !== undefined && typeof options.title !== 'boolean') {
		throw new PageDataError(
			`title must be true or false, got ${JSON.stringify(options.title)}`
		);
	}
	const with_title = options.title !== false;
	const edit_url = edit_url_of(options.edit_url);

	/** the whole document in one go, a sequential pass has no hook for a document */
	function document(from: NodeView, ctx: PluginContext): void {
		if (ctx.done === true) return;
		ctx.done = true;
		let root = from;
		for (let up = root.parent; up !== null; up = up.parent) root = up;
		const state: Reading = {
			run: '',
			count: reading !== undefined,
			words: 0,
			heading: false,
			table: 0,
			paragraph: false,
			nested: 0,
			before: excerpt === undefined ? undefined : [],
			more: false,
			first: undefined,
			title: with_title ? undefined : null,
		};
		read(root, state);
		flush(state);

		if (typeof state.title === 'string') {
			const written = ctx.frontmatter?.title;
			if (written === undefined || written === null || written === '')
				ctx.set('title', state.title);
		}
		if (state.before !== undefined) {
			const text = state.more ? state.before.join(' ') : state.first;
			if (text !== undefined && text !== '') {
				ctx.set(
					'excerpt',
					max_length === undefined ? text : truncate(text, max_length, ellipsis)
				);
			}
		}
		if (state.count) {
			ctx.set('words', state.words);
			// as reading-time shows it, two decimals of a minute and then up
			ctx.set(
				'minutes',
				Math.ceil(Number((state.words / per_minute).toFixed(2)))
			);
		}
		if (edit_url !== undefined) {
			const url = edit_url(ctx.filename, ctx);
			if (url !== undefined) ctx.set('edit_url', url);
		}
	}
	const first = { parse: document };

	return {
		name: NAME,
		parse: {
			// the tree is settled, a count kept while nodes are revoked is not exact
			sequential: true,
			// whichever comes first in a document, every later call returns at once
			frontmatter: first,
			paragraph: first,
			heading: first,
			list: first,
			block_quote: first,
			table: first,
			code_fence: first,
			html: first,
			html_comment: first,
			thematic_break: first,
			directive_leaf: first,
			directive_container: first,
			svelte_block: first,
		},
	};
}
