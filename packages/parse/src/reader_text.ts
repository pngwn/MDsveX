// the text of a node as the page shows it, the smart punctuation rules are
// those of the html renderer, node for node

import { buf_code } from './buf_utils.js';
import type { TextSource } from './node_view.js';
import { NodeKind } from './utils.js';
import type { NodeBuffer } from './utils.js';

const NONE = 0xffffffff;

/** the opening and closing double quote, then the opening and closing single quote */
export type SmartQuotes = readonly [string, string, string, string];

/** each kind is on unless it is false */
export interface SmartPunctuationOptions {
	/** straight quotes to curly ones, four strings replace the english ones */
	quotes?: boolean | SmartQuotes;
	/** two hyphens to an en dash and three to an em dash */
	dashes?: boolean;
	/** three dots to an ellipsis */
	ellipses?: boolean;
}

/** true is every kind with english quotes, false is none */
export type SmartPunctuation = boolean | SmartPunctuationOptions;

/** how a neighbour of a quote reads */
const enum Side {
	/** renders nothing, the neighbour is further on */
	NOTHING = -1,
	/** whitespace, a break, or the edge of the block */
	SPACE = 0,
	/** an opening bracket or a dash, a quote after one opens */
	OPENER = 1,
	/** a letter or a digit, or an inline node that is not text */
	WORD = 2,
	OTHER = 3,
}

/** what a quote becomes */
const enum Quote {
	STRAIGHT = 0,
	OPEN = 1,
	CLOSE = 2,
	/** a closing quote with a word on both sides */
	APOSTROPHE = 3,
}

/** typed html that starts and ends a block, so no text reads on across its tags */
const BLOCK_TAGS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'br',
	'caption',
	'dd',
	'details',
	'dialog',
	'div',
	'dl',
	'dt',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hr',
	'li',
	'main',
	'nav',
	'ol',
	'p',
	'pre',
	'section',
	'summary',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'ul',
]);

/** typed html whose text is code, or is read as written */
const PLAIN_TAGS = new Set([
	'code',
	'kbd',
	'pre',
	'samp',
	'var',
	'tt',
	'textarea',
	'script',
	'style',
]);

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

// what one call reads, set by reader_text and dropped when it returns
let buf: NodeBuffer;
let from: TextSource;
let src = '';
let quotes = false;
let dashes = false;
let dots = false;
let open2 = '“';
let close2 = '”';
let open1 = '‘';
let close1 = '’';

function read_option(opt: SmartPunctuation | undefined): void {
	open2 = '“';
	close2 = '”';
	open1 = '‘';
	close1 = '’';
	if (opt === undefined || typeof opt === 'boolean') {
		quotes = dashes = dots = opt === true;
		return;
	}
	const given = opt.quotes;
	quotes = given !== false;
	dashes = opt.dashes !== false;
	dots = opt.ellipses !== false;
	if (Array.isArray(given) && given.length === 4) {
		open2 = String(given[0]);
		close2 = String(given[1]);
		open1 = String(given[2]);
		close1 = String(given[3]);
	}
}

/** what ctx.text gives, smart is the option of the render, undefined for off */
export function reader_text(
	buffer: NodeBuffer,
	source: TextSource,
	node: number,
	smart: SmartPunctuation | undefined
): string {
	buf = buffer;
	from = source;
	src = source.text === undefined ? '' : source.text();
	read_option(smart);
	try {
		const kind = buffer.kind_at(node) as number;
		if (kind === NodeKind.text) return text_at(node);
		if (kind === NodeKind.code_span) return buf_code(buffer, node, source);
		return children(node);
	} finally {
		buf = undefined!;
		from = undefined!;
		src = '';
	}
}

function children(node: number): string {
	let out = '';
	let child = buf.first_child_at(node);
	while (child !== NONE && buf.parent_at(child) === node) {
		switch (buf.kind_at(child) as number) {
			case NodeKind.text:
				out += text_at(child);
				break;
			// code shows a reference as written
			case NodeKind.code_span:
				out += buf_code(buf, child, from);
				break;
			case NodeKind.soft_break:
			case NodeKind.hard_break:
				out += ' ';
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
					out += children(child);
				break;
			}
			// emphasis, links and the alt of an image are their children
			default:
				out += children(child);
		}
		child = buf.next_at(child);
	}
	return out;
}

/** the char at pos follows an odd run of backslashes, an escape opens its text node at the escaped char */
function escaped_at(pos: number): boolean {
	let p = pos;
	while (p > 0 && src.charCodeAt(p - 1) === 92) p--;
	return ((pos - p) & 1) === 1;
}

/** the source from a to b as text, start is where the slice of the renderer starts */
function literal(
	a: number,
	b: number,
	start: number,
	escaped: boolean
): string {
	if (a >= b) return '';
	// an escaped reference is its characters
	if (escaped && a === start && src.charCodeAt(a) === 38)
		return '&' + decoded(src.slice(a + 1, b));
	return decoded(src.slice(a, b));
}

/** the value of a text node that has one in the source, NONE for any other node */
function value_start(node: number): number {
	if ((buf.kind_at(node) as number) !== NodeKind.text) return NONE;
	if (buf._strings[node] !== undefined) return NONE;
	const vs = buf.value_start_at(node);
	const ve = buf.value_end_at(node);
	return vs === NONE || ve === NONE || ve < vs ? NONE : vs;
}

function text_at(node: number): string {
	const stored = buf._strings[node];
	// text a plugin wrote is all characters, a reference too
	if (stored !== undefined)
		return buf.synthetic_at(node) ? stored : decoded(stored);
	const vs = buf.value_start_at(node);
	let ve = buf.value_end_at(node);
	if (vs === NONE || ve === NONE) return '';
	if (ve > src.length) ve = src.length;
	if (ve <= vs) return '';
	if (!(quotes || dashes || dots) || is_plain(node))
		return literal(vs, ve, vs, escaped_at(vs));

	// text siblings that follow each other in the source, and the line ends
	// between them, are one slice to the renderer
	let first = node;
	let rs = vs;
	for (;;) {
		let prev = buf.prev_at(first);
		if (prev === NONE) break;
		let end = rs;
		if ((buf.kind_at(prev) as number) === NodeKind.soft_break) {
			const s = buf.start_at(prev);
			if (s !== rs - 1 || buf.end_at(prev) !== rs || src.charCodeAt(s) !== 10)
				break;
			prev = buf.prev_at(prev);
			if (prev === NONE) break;
			end = s;
		}
		const start = value_start(prev);
		if (start === NONE || buf.value_end_at(prev) !== end) break;
		first = prev;
		rs = start;
	}
	let last = node;
	let re = ve;
	const parent = buf.parent_at(node);
	for (;;) {
		let next = buf.next_at(last);
		if (next === NONE || buf.parent_at(next) !== parent) break;
		let start = re;
		if ((buf.kind_at(next) as number) === NodeKind.soft_break) {
			if (
				buf.start_at(next) !== re ||
				buf.end_at(next) !== re + 1 ||
				src.charCodeAt(re) !== 10
			)
				break;
			next = buf.next_at(next);
			if (next === NONE || buf.parent_at(next) !== parent) break;
			start = re + 1;
		}
		if (value_start(next) !== start) break;
		const end = buf.value_end_at(next);
		if (end > src.length) break;
		last = next;
		re = end;
	}

	const escaped = escaped_at(rs);
	let out = '';
	let pos = vs;
	let m = rs;
	while (m < ve) {
		const ch = src.charCodeAt(m);
		if (ch === 34 || ch === 39) {
			if (m >= vs && quotes && !(escaped && m === rs)) {
				const side = quote_side(first, last, rs, re, m);
				if (side !== Quote.STRAIGHT) {
					out += literal(pos, m, rs, escaped);
					if (side === Quote.OPEN) out += ch === 34 ? open2 : open1;
					else if (ch === 34) out += close2;
					else out += side === Quote.APOSTROPHE ? '’' : close1;
					pos = m + 1;
				}
			}
			m++;
		} else if (ch === 45 ? dashes : ch === 46 && dots) {
			// a run of hyphens or dots, only one of an exact length is replaced
			let end = m + 1;
			while (end < re && src.charCodeAt(end) === ch) end++;
			const run = end - m;
			const dash = ch === 45;
			if (
				(run === 3 || (run === 2 && dash)) &&
				!(escaped && m === rs) &&
				// the run goes on in the next text node, behind a backslash
				!(
					end === re &&
					src.charCodeAt(re) === 92 &&
					src.charCodeAt(re + 1) === ch
				) &&
				!(run === 2 && is_flag(first, rs, re, m))
			) {
				// a run that starts in the text node before is in its text
				if (m >= vs) {
					out += literal(pos, m, rs, escaped);
					out += dash ? (run === 2 ? '–' : '—') : '…';
				}
				if (end > pos) pos = end;
			}
			m = end;
		} else m++;
	}
	return out + literal(pos, ve, rs, escaped);
}

/** two hyphens after a space and before a letter are a command line flag */
function is_flag(first: number, rs: number, re: number, m: number): boolean {
	if (m + 2 >= re) return false;
	const after = src.charCodeAt(m + 2) | 32;
	if (after < 97 || after > 122) return false;
	const before = m > rs ? side_of(src.charCodeAt(m - 1)) : left(first);
	return before === Side.SPACE;
}

/**
 * which way the quote at m faces, in an unbroken run of quotes each takes
 * the side of the first, the slice from rs to re is the nodes first to last
 */
function quote_side(
	first: number,
	last: number,
	rs: number,
	re: number,
	m: number
): number {
	let q = m;
	while (q > rs) {
		const ch = src.charCodeAt(q - 1);
		if (ch !== 34 && ch !== 39) break;
		q--;
	}
	let before: number;
	if (q > rs) before = side_of(src.charCodeAt(q - 1));
	else if (q < m && escaped_at(rs)) {
		// the run starts at a quote a backslash escaped, which stays as written
		before = Side.OTHER;
		q = m;
	} else before = left(first);
	const after = m + 1 < re ? side_of(src.charCodeAt(m + 1)) : right(last);
	if (q < m)
		return (before === Side.SPACE || before === Side.OPENER) &&
			after !== Side.SPACE
			? Quote.OPEN
			: Quote.CLOSE;
	if (before === Side.SPACE)
		return after === Side.SPACE ? Quote.STRAIGHT : Quote.OPEN;
	if (before === Side.OPENER && after !== Side.SPACE) return Quote.OPEN;
	return before === Side.WORD && after === Side.WORD
		? Quote.APOSTROPHE
		: Quote.CLOSE;
}

/** how a character reads beside a quote, only the apostrophe asks for a word */
function side_of(ch: number): number {
	if (ch <= 32 || ch === 0xa0) return Side.SPACE;
	if (ch < 128) {
		if (ch === 40 || ch === 91 || ch === 123 || ch === 45) return Side.OPENER;
		if (ch >= 48 && ch <= 57) return Side.WORD;
		const lower = ch | 32;
		return lower >= 97 && lower <= 122 ? Side.WORD : Side.OTHER;
	}
	if (ch === 0x2013 || ch === 0x2014) return Side.OPENER;
	if (ch < 0xc0) return Side.OTHER;
	if (ch >= 0x2000 && ch <= 0x206f)
		return ch <= 0x200a ||
			ch === 0x2028 ||
			ch === 0x2029 ||
			ch === 0x202f ||
			ch === 0x205f
			? Side.SPACE
			: Side.OTHER;
	if (ch === 0x1680 || ch === 0x3000) return Side.SPACE;
	if (ch > 0x3000 && ch <= 0x303f) return Side.OTHER;
	// a letter of any script, no table says which of the rest are not
	return Side.WORD;
}

/** an inline node whose children read on from what is beside it */
function is_inline(node: number): boolean {
	const kind = buf.kind_at(node) as number;
	if (kind === NodeKind.html) {
		const tag = buf.metadata_at(node)?.tag;
		return typeof tag !== 'string' || !BLOCK_TAGS.has(tag);
	}
	return (
		kind === NodeKind.emphasis ||
		kind === NodeKind.strong_emphasis ||
		kind === NodeKind.strikethrough ||
		kind === NodeKind.superscript ||
		kind === NodeKind.subscript ||
		kind === NodeKind.link ||
		kind === NodeKind.directive_inline
	);
}

/** how the text before a node ends, in the sibling before it or before its inline parent */
function left(node: number): number {
	for (;;) {
		let prev = buf.prev_at(node);
		while (prev !== NONE) {
			const side = edge(prev, true);
			if (side !== Side.NOTHING) return side;
			prev = buf.prev_at(prev);
		}
		const parent = buf.parent_at(node);
		if (parent === NONE || !is_inline(parent)) return Side.SPACE;
		node = parent;
	}
}

/** how the text after a node starts, in the sibling after it or after its inline parent */
function right(node: number): number {
	for (;;) {
		const parent = buf.parent_at(node);
		let next = buf.next_at(node);
		while (next !== NONE && buf.parent_at(next) === parent) {
			const side = edge(next, false);
			if (side !== Side.NOTHING) return side;
			next = buf.next_at(next);
		}
		if (parent === NONE || !is_inline(parent)) return Side.SPACE;
		node = parent;
	}
}

/** how a node reads from outside, at its end when last is set, at its start otherwise */
function edge(node: number, last: boolean): number {
	const kind = buf.kind_at(node) as number;
	if (kind === NodeKind.text) {
		const s = buf._strings[node];
		if (s !== undefined) {
			if (s.length === 0) return Side.NOTHING;
			return side_of(s.charCodeAt(last ? s.length - 1 : 0));
		}
		const vs = buf.value_start_at(node);
		let ve = buf.value_end_at(node);
		if (ve !== NONE && ve > src.length) ve = src.length;
		if (vs === NONE || ve === NONE || ve <= vs) return Side.NOTHING;
		if (!last) return side_of(src.charCodeAt(vs));
		const ch = src.charCodeAt(ve - 1);
		// a quote that opened is an opener for the quote after it
		if (
			(ch === 34 || ch === 39) &&
			quotes &&
			!(ve - 1 === vs && escaped_at(vs)) &&
			!is_plain(node)
		)
			return quote_side(node, node, vs, ve, ve - 1) === Quote.OPEN
				? Side.OPENER
				: Side.OTHER;
		return side_of(ch);
	}
	if (
		kind === NodeKind.soft_break ||
		kind === NodeKind.hard_break ||
		kind === NodeKind.line_break
	)
		return Side.SPACE;
	if (kind === NodeKind.html_comment) return Side.NOTHING;
	if (
		kind === NodeKind.code_span ||
		kind === NodeKind.mustache ||
		kind === NodeKind.image ||
		kind === NodeKind.svelte_tag
	)
		return Side.WORD;
	if (!is_inline(node)) return Side.SPACE;
	let child = buf.first_child_at(node);
	if (child === NONE) return Side.WORD;
	if (last)
		for (;;) {
			const next = buf.next_at(child);
			if (next === NONE || buf.parent_at(next) !== node) break;
			child = next;
		}
	const side = edge(child, last);
	// an empty text or a comment at the edge, what is past it is not asked
	return side === Side.NOTHING ? Side.WORD : side;
}

/**
 * true when the text of a node is not prose, the url of an autolink, the alt
 * of an image or the text of typed html that holds code, at any depth
 */
function is_plain(node: number): boolean {
	let p = buf.parent_at(node);
	if (
		p !== NONE &&
		(buf.kind_at(p) as number) === NodeKind.link &&
		src.charCodeAt(buf.start_at(p)) === 60
	)
		return true;
	while (p !== NONE) {
		const kind = buf.kind_at(p) as number;
		if (kind === NodeKind.image) return true;
		if (kind === NodeKind.html) {
			const tag = buf.metadata_at(p)?.tag;
			if (typeof tag === 'string' && PLAIN_TAGS.has(tag)) return true;
		}
		p = buf.parent_at(p);
	}
	return false;
}
