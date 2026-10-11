// a pass over the finished tree, so a parse without the option never pays for ids

import type { NodeBuffer } from '@mdsvex/parse/utils';
import { is_entity_name } from '@mdsvex/render/html-cursor';

/** what a slug function is told about a heading apart from its text */
export interface HeadingInfo {
	/** 1 to 6 */
	depth: number;
}

/** the id of a heading from its text, made unique afterwards, an empty string means no id */
export type HeadingSlug = (text: string, heading: HeadingInfo) => string;

export interface HeadingIdsOptions {
	/** in place of heading_slug */
	slug?: HeadingSlug;
}

export interface HeadingOptions {
	/**
	 * gives every markdown heading an id made from its text, true slugs as
	 * github does, a heading that has an id keeps it, off by default
	 *
	 * @example
	 * heading_ids: { slug: (text, { depth }) => `h${depth}-${heading_slug(text)}` }
	 */
	heading_ids?: boolean | HeadingIdsOptions;
}

// must equal NONE in @mdsvex/parse
const NONE = 0xffffffff;

// must follow NodeKind in @mdsvex/parse
const enum K {
	TEXT = 1,
	HTML = 2,
	HEADING = 3,
	MUSTACHE = 4,
	CODE_SPAN = 8,
	HTML_COMMENT = 26,
	SVELTE_TAG = 27,
	SVELTE_BLOCK = 28,
	DIRECTIVE_INLINE = 30,
	DIRECTIVE_LEAF = 31,
	DIRECTIVE_CONTAINER = 32,
}

// keeps what github-slugger keeps, its table is from unicode 13 so a newer letter stays
const DROPPED = /[^\p{L}\p{M}\p{Nd}\p{Nl}\p{Pc}\p{Alphabetic}\p{Cs} -]/gu;
const SPACE = / /g;

/** the default slug, as github-slugger makes it, lowercase, punctuation dropped, each space a hyphen */
export function heading_slug(text: string): string {
	return text.toLowerCase().replace(DROPPED, '').replace(SPACE, '-');
}

/** the slug function of a heading_ids option, undefined when it is off */
export function slug_of(option: unknown): HeadingSlug | undefined {
	if (option === undefined || option === false) return undefined;
	if (option === true) return heading_slug;
	if (typeof option === 'object' && option !== null) {
		const slug = (option as HeadingIdsOptions).slug;
		if (slug === undefined) return heading_slug;
		if (typeof slug === 'function') return slug;
	}
	throw new Error(
		'[mdsvex] heading_ids must be true, false or an object with a slug function'
	);
}

const REFERENCE =
	/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

/** a numeric reference is its character, a named one is dropped, no table of their values is bundled */
function reference(
	match: string,
	decimal: string | undefined,
	hex: string | undefined,
	name: string | undefined
): string {
	if (name !== undefined) return is_entity_name(name) ? '' : match;
	const code =
		decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex!, 16);
	// what html replaces with u+fffd, which no slug keeps
	if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
		return '';
	return String.fromCodePoint(code);
}

const is_element = /^[a-z][^.:]*$/;

/** the text a reader sees, an image is its alt, what svelte renders is nothing */
function text_of(buf: NodeBuffer, source: string, node: number): string {
	let out = '';
	let child = buf.first_child_at(node);
	while (child !== NONE && buf.parent_at(child) === node) {
		switch (buf.kind_at(child) as number) {
			case K.TEXT: {
				const text = source.slice(
					buf.value_start_at(child),
					buf.value_end_at(child)
				);
				out +=
					text.indexOf('&') === -1 ? text : text.replace(REFERENCE, reference);
				break;
			}
			// code shows a reference as written
			case K.CODE_SPAN:
				out += source.slice(buf.value_start_at(child), buf.value_end_at(child));
				break;
			case K.MUSTACHE:
			case K.SVELTE_TAG:
			case K.SVELTE_BLOCK:
			case K.HTML_COMMENT:
			case K.DIRECTIVE_INLINE:
			case K.DIRECTIVE_LEAF:
			case K.DIRECTIVE_CONTAINER:
				break;
			case K.HTML: {
				const tag = buf.metadata_at(child)?.tag;
				// a component decides what it does with its children
				if (typeof tag === 'string' && is_element.test(tag))
					out += text_of(buf, source, child);
				break;
			}
			// emphasis, links and the alt of an image are their children
			default:
				out += text_of(buf, source, child);
		}
		child = buf.next_at(child);
	}
	return out;
}

const is_heading_tag = /^h[1-6]$/;

/** slug made unique as github-slugger does, the first is bare, then -1, -2 */
function unique(seen: Map<string, number>, slug: string): string {
	let id = slug;
	let count = seen.get(slug);
	if (count !== undefined) {
		do id = slug + '-' + ++count;
		while (seen.has(id));
		seen.set(slug, count);
	}
	seen.set(id, 0);
	return id;
}

/** sets an id on every markdown heading without one, ids already there are taken first so none collides */
export function assign_heading_ids(
	buf: NodeBuffer,
	source: string,
	slug: HeadingSlug
): void {
	const seen = new Map<string, number>();
	const headings: number[] = [];
	let node = buf.first_child_at(0);
	while (node !== NONE) {
		const kind = buf.kind_at(node) as number;
		let down = NONE;
		if (kind === K.HEADING) {
			const id = buf.metadata_at(node)?.id;
			if (id == null || id === false) headings.push(node);
			else if (typeof id === 'string') seen.set(id, 0);
		} else {
			if (kind === K.HTML) {
				const meta = buf.metadata_at(node);
				const id = meta?.attributes?.id;
				if (typeof id === 'string' && is_heading_tag.test(meta.tag))
					seen.set(id, 0);
			}
			down = buf.first_child_at(node);
		}
		if (down !== NONE) {
			node = down;
			continue;
		}
		// the next node in document order, a heading holds no other heading
		for (;;) {
			const next = buf.next_at(node);
			const parent = buf.parent_at(node);
			if (next !== NONE && buf.parent_at(next) === parent) {
				node = next;
				break;
			}
			if (parent === 0 || parent === NONE) {
				node = NONE;
				break;
			}
			node = parent;
		}
	}

	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		const base = slug(text_of(buf, source, heading).trim(), {
			depth: buf.extra_at(heading),
		});
		if (typeof base !== 'string')
			throw new Error(
				`[mdsvex] heading_ids.slug must return a string, it returned ${JSON.stringify(base)}`
			);
		// an empty id is not valid html, so the heading goes without
		if (base === '') continue;
		const id = unique(seen, base);
		const meta = buf.metadata_at(heading);
		if (meta === undefined) buf.set_metadata(heading, { id });
		else meta.id = id;
	}
}
