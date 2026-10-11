// a walk over the finished tree, only for a document the parser saw an image in

import type { NodeBuffer } from '@mdsvex/parse/utils';
import { K_IMAGE, is_entity_name } from '@mdsvex/render/html-cursor';
import type { UrlLookup, UrlSource } from '@mdsvex/render/html-cursor';

/** a relative image, the render imports it and gives the image what the import gives */
export interface ImageNeed {
	type: 'image';
	/** the url as the document has it */
	url: string;
	/** what the import statement names, the url as a file path with its query and fragment */
	specifier: string;
	/** the local name of the import */
	name: string;
}

/** @internal what a render with image imports is given */
export interface ImageImports {
	/** one per specifier, in document order */
	needs: ImageNeed[];
	/** the import statements, for renderer.imports */
	lines: string[];
	/** for renderer.urls, a link or any other image keeps its url */
	lookup: UrlLookup;
}

// must equal NONE in @mdsvex/parse
const NONE = 0xffffffff;

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
// #lib/a.png is a subpath import, #a is a fragment of the page
const SUBPATH = /^#[^/?#]+\//;

const REFERENCE =
	/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;
const NAMED: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
};

// set by reference, a named reference this module has no value for
let unknown_reference = false;

function reference(
	match: string,
	decimal: string | undefined,
	hex: string | undefined,
	name: string | undefined
): string {
	if (name !== undefined) {
		const known = NAMED[name];
		if (known !== undefined) return known;
		if (is_entity_name(name)) unknown_reference = true;
		return match;
	}
	const code =
		decimal !== undefined ? parseInt(decimal, 10) : parseInt(hex!, 16);
	if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
		return '\ufffd';
	return String.fromCodePoint(code);
}

/**
 * the import specifier of an image url, null for one that stays as written
 *
 * a path relative to the document, with or without ./ in front, and one
 * behind an alias character, $ # @ or ~, are imported, the query and the
 * fragment stay on the specifier
 */
export function image_specifier(url: string): string | null {
	if (url === '') return null;
	// a svelte expression is live, and nothing here knows what a backslash meant
	if (url.indexOf('{') !== -1 || url.indexOf('\\') !== -1) return null;
	const first = url.charCodeAt(0);
	// a root path, a protocol relative url or a query alone
	if (first === 47 || first === 63) return null;
	if (first === 35 && !SUBPATH.test(url)) return null;
	if (SCHEME.test(url)) return null;
	let s = url;
	if (s.indexOf('&') !== -1) {
		unknown_reference = false;
		s = s.replace(REFERENCE, reference);
		if (unknown_reference) return null;
	}
	// the query and fragment go to vite as written, the path names a file
	let end = s.length;
	const subpath = first === 35;
	for (let i = subpath ? 1 : 0; i < end; i++) {
		const ch = s.charCodeAt(i);
		if (ch === 63 || ch === 35) end = i;
	}
	let path = s.slice(0, end);
	if (path.indexOf('%') !== -1) {
		try {
			path = decodeURI(path);
		} catch {
			// not an encoding, the file may be named so
		}
	}
	if (path === '') return null;
	// $lib, #lib, @alias and ~ are resolved by vite, ./ and ../ are already relative
	const relative =
		first === 36 ||
		first === 35 ||
		first === 64 ||
		first === 126 ||
		(first === 46 &&
			(path.charCodeAt(1) === 47 ||
				(path.charCodeAt(1) === 46 && path.charCodeAt(2) === 47)));
	return (relative ? path : './' + path) + s.slice(end);
}

const ESCAPED = /[\\'\n\r\u2028\u2029]/g;

function escaped(ch: string): string {
	switch (ch) {
		case '\n':
			return '\\n';
		case '\r':
			return '\\r';
		case '\u2028':
			return '\\u2028';
		case '\u2029':
			return '\\u2029';
		default:
			return '\\' + ch;
	}
}

function js_string(s: string): string {
	return "'" + s.replace(ESCAPED, escaped) + "'";
}

const PREFIX = '__mdsvex_img_';

/**
 * the imports for the relative images of a document, null when it has none,
 * the local names start with a prefix the source nowhere holds, so no
 * binding of the document can meet one
 */
export function image_imports(
	buf: NodeBuffer,
	source: string
): ImageImports | null {
	let by_url: Map<string, UrlSource | null> | null = null;
	let by_specifier: Map<string, UrlSource> | null = null;
	let needs: ImageNeed[] | null = null;
	let prefix = PREFIX;
	let node = buf.first_child_at(0);
	while (node !== NONE) {
		let down = NONE;
		if ((buf.kind_at(node) as number) === K_IMAGE) {
			// its children are its alt, an image in there never renders
			const url = buf.metadata_at(node)?.src;
			if (typeof url === 'string' && url !== '') {
				if (by_url === null) by_url = new Map();
				if (!by_url.has(url)) {
					const specifier = image_specifier(url);
					let to: UrlSource | null = null;
					if (specifier !== null) {
						if (by_specifier === null) {
							by_specifier = new Map();
							needs = [];
							while (source.indexOf(prefix) !== -1) prefix += '_';
						}
						const hit = by_specifier.get(specifier);
						if (hit !== undefined) to = hit;
						else {
							const name = prefix + needs!.length;
							to = { type: 'expression', value: name };
							by_specifier.set(specifier, to);
							needs!.push({ type: 'image', url, specifier, name });
						}
					}
					by_url.set(url, to);
				}
			}
		} else down = buf.first_child_at(node);
		if (down !== NONE) {
			node = down;
			continue;
		}
		// the next node in document order
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
	if (needs === null) return null;
	const lines: string[] = [];
	for (let i = 0; i < needs.length; i++)
		lines.push(
			'import ' + needs[i].name + ' from ' + js_string(needs[i].specifier) + ';'
		);
	const urls = by_url!;
	return {
		needs,
		lines,
		lookup: (url, image) => (image ? urls.get(url) : undefined),
	};
}
