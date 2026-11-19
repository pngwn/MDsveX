// the ids of a document given out as it is read, the same streamed or whole,
// heading ids at each close, fixed ids as they arrive, footnote ids at the end

import { footnote_ids, footnote_index } from './buf_utils.js';
import { SourceTextSource } from './node_view.js';
import { NodeBuffer, NodeKind, kind_to_string } from './utils.js';

const NONE = 0xffffffff;

/** what a slug function is told about a heading apart from its text */
export interface HeadingInfo {
	/** 1 to 6 */
	depth: number;
}

/** the id of a heading from its text, made unique afterwards, an empty string means no id */
export type HeadingSlug = (text: string, heading: HeadingInfo) => string;

export type HeadingIdErrorCode = 'slug' | 'id_taken';

/** a slug that is no string, or an id the document fixes that a node before it was given */
export class HeadingIdError extends Error {
	code: HeadingIdErrorCode;
	/** the id given twice, undefined for a slug */
	id: string | undefined;

	constructor(code: HeadingIdErrorCode, message: string, id?: string) {
		super(message);
		this.name = 'HeadingIdError';
		this.code = code;
		this.id = id;
	}
}

// keeps what github-slugger keeps, its table is from unicode 13 so a newer letter stays
const DROPPED = /[^\p{L}\p{M}\p{Nd}\p{Nl}\p{Pc}\p{Alphabetic}\p{Cs} -]/gu;
const SPACE = / /g;

/** the default slug, as github-slugger makes it, lowercase, punctuation dropped, each space a hyphen */
export function heading_slug(text: string): string {
	return text.toLowerCase().replace(DROPPED, '').replace(SPACE, '-');
}

const REFERENCE =
	/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

const is_element = /^[a-z][^.:]*$/;
const is_heading_tag = /^h[1-6]$/;

/**
 * the ids of a document, given out in document order, and the id of each
 * markdown heading, made at its close from its text as github does
 *
 * an id the document fixes, typed on an element heading or set on a heading
 * by a plugin, is kept, and one a node before it was given is a
 * HeadingIdError, an id made, for a heading or a footnote, is never one
 * given before, a repeat gets -1, -2
 *
 * a builder given one calls close for each heading, after the close
 * callbacks of plugins, and a dispatcher makes the id earlier when a close
 * callback reads it, so a plugin that changes the text of a heading in its
 * close callback changes the id when it runs before the first that reads it
 */
export class HeadingIds {
	/** what heading ids are made with, null for a document whose headings get none */
	readonly slug: HeadingSlug | null;
	/** a named character reference html knows, dropped from the text where others stay */
	private named: (name: string) => boolean;
	/** what the value ranges of the buffer index, empty for a tree built over the wire */
	private source = '';
	/** every id given, by how many repeats of it github-slugger counted */
	private seen = new Map<string, number>();
	/** each id given, by the node it was given to, NONE for a footnote, 0 for no node */
	private given = new Map<string, number>();
	/** slots below this were looked at for ids already fixed */
	private scanned = 1;
	/** the heading closed last, a second close of it only fixes an id a plugin gave it since */
	private last = NONE;
	/** the id made for last, null for none */
	private last_made: string | null = null;
	/** the slug of last_made and its count before, to give the id back */
	private last_base = '';
	private last_count: number | undefined = undefined;
	/** a footnote node was seen, its ids are given when the document ends */
	private footnotes = false;
	/**
	 * after finish, the id of each footnote whose own id a node was given
	 * before it, by that own id, null for none
	 */
	moved: Map<string, string> | null = null;
	private reference: (
		match: string,
		decimal: string | undefined,
		hex: string | undefined,
		name: string | undefined
	) => string;

	constructor(slug: HeadingSlug | null, named: (name: string) => boolean) {
		this.slug = slug;
		this.named = named;
		// a numeric reference is its character, a named one is dropped, no table of their values is bundled
		this.reference = (match, decimal, hex, name) => {
			if (name !== undefined) return this.named(name) ? '' : match;
			const code =
				decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex!, 16);
			// what html replaces with u+fffd, which no slug keeps
			if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
				return '';
			return String.fromCodePoint(code);
		};
	}

	/**
	 * a new document, source is what its value ranges index, all of it for a
	 * document fed in pieces, a tree built over the wire has its text in the
	 * buffer and passes none
	 */
	start(source = ''): void {
		this.source = source;
		this.seen.clear();
		this.given.clear();
		this.scanned = 1;
		this.last = NONE;
		this.last_made = null;
		this.footnotes = false;
		this.moved = null;
	}

	/** the heading at index closed, every child of it is in the buffer */
	close(buf: NodeBuffer, index: number): void {
		if (index === this.last) return this.again(buf, index);
		this.last = index;
		this.last_made = null;
		this.scan(buf);
		// a plugin made it something else, or took it out
		if (buf.kind_at(index) !== NodeKind.heading) return;
		if (buf.parent_at(index) === NONE) return;
		const meta = buf.metadata_at(index);
		const id = meta?.id;
		if (typeof id === 'string') return this.fix(buf, id, index);
		const slug = this.slug;
		if (slug === null || (id != null && id !== false)) return;

		const base = slug(this.text_of(buf, index).trim(), {
			depth: buf.extra_at(index),
		});
		if (typeof base !== 'string')
			throw new HeadingIdError(
				'slug',
				`[mdsvex] heading_ids.slug must return a string, it returned ${JSON.stringify(base)}`
			);
		// an empty id is not valid html, so the heading goes without
		if (base === '') return;
		this.last_base = base;
		this.last_count = this.seen.get(base);
		const made = this.unique(base);
		this.given.set(made, index);
		this.last_made = made;
		if (meta === undefined) buf.set_metadata(index, { id: made });
		else meta.id = made;
	}

	/**
	 * the document ended, the element headings after the last heading fix
	 * their ids, then each footnote gets its own id, or the next free one
	 * when a node was given it, which moved holds
	 */
	finish(buf: NodeBuffer): void {
		this.scan(buf);
		if (!this.footnotes) return;
		const index = footnote_index(buf, true);
		if (index === null) return;
		const given = this.given;
		for (const id of footnote_ids(index)) {
			if (!given.has(id)) {
				this.seen.set(id, 0);
				given.set(id, NONE);
				continue;
			}
			const free = this.unique(id);
			given.set(free, NONE);
			(this.moved ??= new Map()).set(id, free);
		}
	}

	/**
	 * a free id from base, base itself or the next repeat of it, given to a
	 * node, 0 for none
	 */
	claim(base: string, node: number): string {
		const id = this.unique(base);
		this.given.set(id, node);
		return id;
	}

	/** an id fixed for a node, a HeadingIdError when a node before it was given it */
	fixed(buf: NodeBuffer, id: string, node: number): string {
		this.fix(buf, id, node);
		return id;
	}

	/** the node an id was given to was revoked, the id is free again */
	release(id: string): void {
		this.given.delete(id);
		this.seen.delete(id);
	}

	/** a callback read the id early and then gave the heading one of its own, which is fixed */
	private again(buf: NodeBuffer, index: number): void {
		const made = this.last_made;
		const id = buf.metadata_at(index)?.id;
		if (made === null || id === made) return;
		// as if it had never been made, nothing has been given an id since
		this.given.delete(made);
		this.last_made = null;
		const count = this.last_count;
		if (count === undefined) this.seen.delete(this.last_base);
		else {
			this.seen.set(this.last_base, count);
			this.seen.delete(made);
		}
		if (typeof id === 'string') this.fix(buf, id, index);
	}

	/** ids fixed by nodes the last scan did not reach, an element heading keeps its own */
	private scan(buf: NodeBuffer): void {
		const size = buf._size;
		for (let i = this.scanned; i < size; i++) {
			const kind = buf.kind_at(i) as number;
			if (kind === NodeKind.html) {
				const meta = buf.metadata_at(i);
				if (!meta || !is_heading_tag.test(meta.tag)) continue;
				const id = meta.attributes?.id;
				if (typeof id === 'string') this.fix(buf, id, i);
			} else if (
				kind === NodeKind.footnote_reference ||
				kind === NodeKind.footnote_definition
			)
				this.footnotes = true;
		}
		this.scanned = size;
	}

	/** an id the document fixes for a node, no node before it may have it */
	private fix(buf: NodeBuffer, id: string, node: number): void {
		const before = this.given.get(id);
		if (before !== undefined && before !== node)
			throw new HeadingIdError(
				'id_taken',
				`[mdsvex] the id "${id}" of the ${this.what(buf, node)}${this.at(buf, node)} was given to the ${this.what(buf, before)}${this.at(buf, before)} before it, give one of them another id`,
				id
			);
		this.seen.set(id, 0);
		this.given.set(id, node);
	}

	/** how an error names a node */
	private what(buf: NodeBuffer, node: number): string {
		if (node === 0) return 'plugin';
		if (node === NONE) return 'footnote';
		const kind = buf.kind_at(node);
		if (kind === NodeKind.html)
			return `element <${buf.metadata_at(node)?.tag}>`;
		return kind_to_string(kind).replace(/_/g, ' ');
	}

	/** slug made unique as github-slugger does, the first is bare, then -1, -2 */
	private unique(slug: string): string {
		const seen = this.seen;
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

	/** where a node is, nothing over the wire */
	private at(buf: NodeBuffer, node: number): string {
		if (this.source === '' || node === 0 || node === NONE) return '';
		const at = new SourceTextSource(this.source).point(buf.start_at(node));
		return ` at ${at.line}:${at.column + 1}`;
	}

	/** the text of a text node or a code span, its source range, or over the wire its string */
	private text_at(buf: NodeBuffer, node: number): string {
		const source = this.source;
		// a repair on the batch builder stores the text of its range too
		if (source === '') return buf._strings[node] ?? '';
		const start = buf.value_start_at(node);
		const end = buf.value_end_at(node);
		return start !== NONE && end !== NONE && end > start
			? source.slice(start, end)
			: '';
	}

	/** the text a reader sees, an image is its alt, what svelte renders is nothing */
	private text_of(buf: NodeBuffer, node: number): string {
		let out = '';
		let child = buf.first_child_at(node);
		while (child !== NONE && buf.parent_at(child) === node) {
			switch (buf.kind_at(child) as number) {
				case NodeKind.text: {
					// text a plugin added is not what the author wrote
					if (buf.synthetic_at(child)) break;
					const text = this.text_at(buf, child);
					out +=
						text.indexOf('&') === -1
							? text
							: text.replace(REFERENCE, this.reference);
					break;
				}
				// code shows a reference as written
				case NodeKind.code_span:
					out += this.text_at(buf, child);
					break;
				case NodeKind.mustache:
				case NodeKind.svelte_tag:
				case NodeKind.svelte_block:
				case NodeKind.html_comment:
				case NodeKind.directive_inline:
				case NodeKind.directive_leaf:
				case NodeKind.directive_container:
					break;
				case NodeKind.html: {
					const tag = buf.metadata_at(child)?.tag;
					// a component decides what it does with its children
					if (typeof tag === 'string' && is_element.test(tag))
						out += this.text_of(buf, child);
					break;
				}
				// emphasis, links and the alt of an image are their children
				default:
					out += this.text_of(buf, child);
			}
			child = buf.next_at(child);
		}
		return out;
	}
}
