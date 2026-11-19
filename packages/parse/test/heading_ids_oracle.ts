// heading ids from one walk of the finished tree, which knows every id of
// the document, what the ids made at each close are checked against

import { footnote_ids, footnote_index } from '../src/buf_utils';
import type { HeadingSlug } from '../src/heading_ids';
import type { NodeBuffer } from '../src/utils';

const NONE = 0xffffffff;

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
	FOOTNOTE_REFERENCE = 36,
}

const REFERENCE =
	/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

const is_element = /^[a-z][^.:]*$/;
const is_heading_tag = /^h[1-6]$/;

function text_of(
	buf: NodeBuffer,
	source: string,
	node: number,
	named: (name: string) => boolean
): string {
	const reference = (
		match: string,
		decimal: string | undefined,
		hex: string | undefined,
		name: string | undefined
	): string => {
		if (name !== undefined) return named(name) ? '' : match;
		const code =
			decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex!, 16);
		if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
			return '';
		return String.fromCodePoint(code);
	};
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
				if (typeof tag === 'string' && is_element.test(tag))
					out += text_of(buf, source, child, named);
				break;
			}
			default:
				out += text_of(buf, source, child, named);
		}
		child = buf.next_at(child);
	}
	return out;
}

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

/** heading ids for a tree built from the source, footnote ids taken first */
export function assign_heading_ids(
	buf: NodeBuffer,
	source: string,
	slug: HeadingSlug,
	named: (name: string) => boolean
): void {
	const seen = new Map<string, number>();
	const headings: number[] = [];
	let footnotes = false;
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
			} else if (kind >= K.FOOTNOTE_REFERENCE) footnotes = true;
			down = buf.first_child_at(node);
		}
		if (down !== NONE) {
			node = down;
			continue;
		}
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

	if (footnotes) {
		const index = footnote_index(buf, true);
		if (index !== null) for (const id of footnote_ids(index)) seen.set(id, 0);
	}

	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		const base = slug(text_of(buf, source, heading, named).trim(), {
			depth: buf.extra_at(heading),
		});
		if (base === '') continue;
		const id = unique(seen, base);
		const meta = buf.metadata_at(heading);
		if (meta === undefined) buf.set_metadata(heading, { id });
		else meta.id = id;
	}
}
