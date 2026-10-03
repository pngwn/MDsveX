// fence meta, attributes and escaping shared by the highlighters, compile
// imports this, so it stays free of twinkleplop

const SPACE = 32;
const TAB = 9;
const LF = 10;
const CR = 13;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;
const SLASH = 47;
const BACKSLASH = 92;
const BRACE_OPEN = 123;
const BRACE_CLOSE = 125;
const BRACKET_OPEN = 91;
const BRACKET_CLOSE = 93;
const HASH = 35;

const BRACE_TEST = /[{}]/;
const BRACE_MATCH = /[{}]/g;

function brace_replace(ch: string): string {
	return ch === '{' ? '&#123;' : '&#125;';
}

/** every brace as a character reference, svelte reads markup braces as expressions */
export function escape_braces(html: string): string {
	if (!BRACE_TEST.test(html)) return html;
	return html.replace(BRACE_MATCH, brace_replace);
}

const TEXT_TEST = /[&<>"{}]/;
const TEXT_MATCH = /[&<>"{}]/g;
const TEXT_TABLE: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	'{': '&#123;',
	'}': '&#125;',
};

function text_replace(ch: string): string {
	return TEXT_TABLE[ch];
}

/** text or an attribute value as svelte safe markup */
export function escape_text(text: string): string {
	if (!TEXT_TEST.test(text)) return text;
	return text.replace(TEXT_MATCH, text_replace);
}

/** attribute text for an open tag, false leaves an attribute out */
export function attribute_text(
	attributes: Record<string, string | number | boolean>
): string {
	let out = '';
	for (const name of Object.keys(attributes)) {
		const value = attributes[name];
		if (value === false) continue;
		if (value === true) out += ' ' + name;
		else out += ' ' + name + '="' + escape_text(String(value)) + '"';
	}
	return out;
}

function is_space(ch: number): boolean {
	return ch === SPACE || ch === TAB || ch === LF || ch === CR;
}

/** a single tag element with its attribute text and content, null when html is anything else */
export function split_element(
	html: string,
	tag: 'pre' | 'code'
): { attributes: string; body: string } | null {
	let start = 0;
	let end = html.length;
	while (start < end && is_space(html.charCodeAt(start))) start++;
	while (end > start && is_space(html.charCodeAt(end - 1))) end--;
	const open = '<' + tag;
	const close = '</' + tag + '>';
	if (end - start < open.length + 1 + close.length) return null;
	if (html.slice(start, start + open.length).toLowerCase() !== open)
		return null;
	if (html.slice(end - close.length, end).toLowerCase() !== close) return null;
	let i = start + open.length;
	const after = html.charCodeAt(i);
	if (after !== 62 && !is_space(after)) return null;
	// a quoted value may hold >
	let quote = 0;
	for (; i < end; i++) {
		const ch = html.charCodeAt(i);
		if (quote !== 0) {
			if (ch === quote) quote = 0;
		} else if (ch === DOUBLE_QUOTE || ch === SINGLE_QUOTE) quote = ch;
		else if (ch === 62) break;
	}
	if (i >= end - close.length) return null;
	const body = html.slice(i + 1, end - close.length);
	// a second element closes inside the first
	if (body.toLowerCase().indexOf('</' + tag) !== -1) return null;
	return { attributes: html.slice(start + open.length, i), body };
}

/**
 * the parts of a meta string, whitespace separates them except inside {},
 * [], quotes or a /word/ pattern, as @twinkleplop/markdown-core splits them
 */
export function meta_parts(meta: string): string[] {
	const parts: string[] = [];
	let i = 0;
	while (i < meta.length) {
		const c = meta.charCodeAt(i);
		if (c === SPACE || c === TAB) {
			i++;
			continue;
		}
		const start = i;
		let quote = 0;
		let depth = 0;
		let in_word = false;
		while (i < meta.length) {
			const ch = meta.charCodeAt(i);
			if (quote !== 0) {
				if (ch === quote) quote = 0;
				i++;
			} else if (in_word) {
				if (ch === BACKSLASH) i += 2;
				else {
					if (ch === SLASH) in_word = false;
					i++;
				}
			} else if (ch === DOUBLE_QUOTE || ch === SINGLE_QUOTE) {
				quote = ch;
				i++;
			} else if (ch === BRACE_OPEN || ch === BRACKET_OPEN) {
				depth++;
				i++;
			} else if (ch === BRACE_CLOSE || ch === BRACKET_CLOSE) {
				if (depth > 0) depth--;
				i++;
			} else if (ch === SLASH && i === start) {
				in_word = true;
				i++;
			} else if (depth === 0 && (ch === SPACE || ch === TAB)) {
				break;
			} else {
				i++;
			}
		}
		parts.push(meta.slice(start, i));
	}
	return parts;
}

/** what a fence meta says to a pre replacement */
export interface MetaInfo {
	title?: string;
	caption?: string;
	/** the parts no convention claims, key=value pairs and bare flags */
	props: [string, string | true][];
}

const PROP_KEY = /^[A-Za-z_][\w-]*$/;

/**
 * the title, caption and props of a meta string, a part one of the
 * conventions markdown-core reads claims is never a prop
 */
export function read_meta(meta: string): MetaInfo {
	const out: MetaInfo = { props: [] };
	if (meta === '') return out;
	for (const part of meta_parts(meta)) {
		if (claimed(part)) continue;
		const first = part.charCodeAt(0);
		if (first === BRACKET_OPEN) {
			const title = bracket_title(part);
			if (title !== null && out.title === undefined) out.title = title;
			continue;
		}
		const eq = part.indexOf('=');
		const key = eq === -1 ? part : part.slice(0, eq);
		if (!PROP_KEY.test(key)) continue;
		if (eq === -1) {
			out.props.push([key, true]);
			continue;
		}
		const raw = part.slice(eq + 1);
		const quoted = unquote(raw);
		if ((key === 'title' || key === 'caption') && quoted !== null) {
			if (out[key] === undefined) out[key] = quoted;
			continue;
		}
		if (quoted !== null) out.props.push([key, quoted]);
		// an expression value is not a prop yet
		else if (raw.length !== 0 && raw.charCodeAt(0) !== BRACE_OPEN)
			out.props.push([key, raw]);
	}
	return out;
}

/** the conventions that set render options, title and caption are read apart */
function claimed(part: string): boolean {
	const first = part.charCodeAt(0);
	if (first === BRACE_OPEN) return line_group(part);
	if (first === SLASH) return word_group(part);
	if (part === 'twoslash') return true;
	if (part === ':no-line-numbers' || part === ':line-numbers') return true;
	if (part.startsWith(':line-numbers=')) return digits(part.slice(14));
	if (part === 'showLineNumbers') return true;
	if (part.startsWith('showLineNumbers{') && part.endsWith('}'))
		return digits(part.slice(16, part.length - 1));
	return false;
}

function line_group(part: string): boolean {
	const close = part.indexOf('}');
	if (close === -1) return false;
	const body = part.slice(1, close);
	if (body.trim().length === 0) return false;
	for (const piece of body.split(',')) {
		if (!range(piece.trim())) return false;
	}
	return id_suffix(part.slice(close + 1), true);
}

function word_group(part: string): boolean {
	let i = 1;
	let text = 0;
	for (; i < part.length; i++) {
		const c = part.charCodeAt(i);
		if (c === BACKSLASH && i + 1 < part.length) {
			i++;
			text++;
		} else if (c === SLASH) break;
		else text++;
	}
	if (i >= part.length || text === 0) return false;
	const rest = part.slice(i + 1);
	if (rest.length === 0) return true;
	if (rest.charCodeAt(0) === HASH) return id_suffix(rest, false);
	return range(rest);
}

function id_suffix(rest: string, empty: boolean): boolean {
	if (rest.length === 0) return empty;
	return rest.charCodeAt(0) === HASH && rest.length > 1;
}

function range(text: string): boolean {
	const dash = text.indexOf('-');
	if (dash === -1) return digits(text);
	return digits(text.slice(0, dash)) && digits(text.slice(dash + 1));
}

function digits(text: string): boolean {
	if (text.length === 0) return false;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 48 || c > 57) return false;
	}
	return true;
}

function bracket_title(part: string): string | null {
	if (part.charCodeAt(part.length - 1) !== BRACKET_CLOSE) return null;
	const title = part.slice(1, part.length - 1);
	return title.length === 0 ? null : title;
}

function unquote(text: string): string | null {
	if (text.length < 2) return null;
	const open = text.charCodeAt(0);
	if (open !== DOUBLE_QUOTE && open !== SINGLE_QUOTE) return null;
	if (text.charCodeAt(text.length - 1) !== open) return null;
	return text.slice(1, text.length - 1);
}

/** the props a pre replacement always takes, a meta prop never replaces one */
const BUILT_IN_PROPS = [
	'lang',
	'meta',
	'code',
	'title',
	'caption',
	'class',
	'children',
];

/** the props text of a pre replacement and the messages of the meta props it drops */
export function pre_props(info: MetaInfo): {
	props: string;
	dropped: string[] | null;
} {
	let props = '';
	if (info.title !== undefined)
		props += ' title={' + JSON.stringify(info.title) + '}';
	if (info.caption !== undefined)
		props += ' caption={' + JSON.stringify(info.caption) + '}';
	const list = info.props;
	if (list.length === 0) return { props, dropped: null };
	let dropped: string[] | null = null;
	const taken = new Set(BUILT_IN_PROPS);
	for (const [key, value] of list) {
		if (taken.has(key)) {
			(dropped ??= []).push(
				`the meta prop ${key} is dropped, the pre component already takes ${key}`
			);
			continue;
		}
		taken.add(key);
		props +=
			' ' +
			key +
			'={' +
			(value === true ? 'true' : JSON.stringify(value)) +
			'}';
	}
	return { props, dropped };
}
