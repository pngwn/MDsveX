// the modules of the fences that run, kept by the vite plugin so load can
// serve the code of a block under the id its document imports it by

import type { Snippet } from './run_blocks';
import { slashed } from './source_files';

/** every id of a snippet holds this, so an id without it is tested no further */
export const SNIPPET_MARK = '.snippet-';

// the document, the hash and the extension, of a path without a query
const SNIPPET_PATH = /^(.+)\.snippet-([0-9a-f]{10})\.(js|ts|jsx|tsx|svelte)$/;

/** the parts of the id of a snippet */
export interface SnippetId {
	/** the path of the document, with forward slashes */
	doc: string;
	hash: string;
	extension: string;
}

/** the parts of a path that names a snippet, null for any other, path has no query */
export function snippet_id(path: string): SnippetId | null {
	const m = SNIPPET_PATH.exec(path);
	return m === null ? null : { doc: m[1], hash: m[2], extension: m[3] };
}

/** a snippet with the text of the document it was read from, which its source map points into */
export interface SnippetModule {
	snippet: Snippet;
	raw: string;
}

/** the snippets of each document, by document path without a query */
export function snippet_modules() {
	const docs = new Map<string, Map<string, SnippetModule>>();

	function fill(
		into: Map<string, SnippetModule>,
		raw: string,
		snippets: readonly Snippet[]
	): void {
		for (const snippet of snippets)
			if (!into.has(snippet.hash)) into.set(snippet.hash, { snippet, raw });
	}

	return {
		/** true when no document runs a block, so a compile need not drop its own */
		get empty(): boolean {
			return docs.size === 0;
		},
		/** what a compile of the document gave, in place of what an earlier one did */
		set(doc: string, raw: string, snippets: readonly Snippet[]): void {
			const made = new Map<string, SnippetModule>();
			fill(made, raw, snippets);
			docs.set(slashed(doc), made);
		},
		/** what the document on disk has, beside what a compile gave */
		add(doc: string, raw: string, snippets: readonly Snippet[]): void {
			const key = slashed(doc);
			let made = docs.get(key);
			if (made === undefined) docs.set(key, (made = new Map()));
			fill(made, raw, snippets);
		},
		/** for a document that compiled without a block that runs */
		drop(doc: string): void {
			docs.delete(slashed(doc));
		},
		get(doc: string, hash: string): SnippetModule | undefined {
			return docs.get(slashed(doc))?.get(hash);
		},
	};
}

export type SnippetModules = ReturnType<typeof snippet_modules>;

/** dir and a relative path as one path, dir has forward slashes and no slash at its end */
export function joined(dir: string, relative: string): string {
	const parts = dir.split('/');
	for (const part of relative.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') {
			if (parts.length > 1) parts.pop();
		} else parts.push(part);
	}
	return parts.join('/');
}

/** the directory of a path with forward slashes */
export function dir_of(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash === -1 ? '' : path.slice(0, slash);
}

const VLQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value: number): string {
	let n = value < 0 ? (-value << 1) | 1 : value << 1;
	let out = '';
	do {
		let digit = n & 31;
		n >>>= 5;
		if (n > 0) digit |= 32;
		out += VLQ[digit];
	} while (n > 0);
	return out;
}

/** true for a character a name is made of */
function word(ch: number): boolean {
	return (
		(ch >= 48 && ch <= 57) ||
		(ch >= 65 && ch <= 90) ||
		(ch >= 97 && ch <= 122) ||
		ch === 95 ||
		ch === 36 ||
		ch > 127
	);
}

/**
 * the module text of a snippet, its code on the lines it has in its
 * document, so its map sends every line to itself and can be applied twice,
 * as it is for a svelte block, vite-plugin-svelte hands the map of load to
 * the compiler and vite then applies it again, an error a compiler reports
 * by line reads as a line of the document too
 */
export function snippet_code(snippet: Snippet): string {
	return '\n'.repeat(snippet.line - 1) + snippet.code;
}

/**
 * a source map from snippet_code into the document, every line maps to
 * its own, the columns moved by what a block quote or a list item puts
 * before the line, one segment where each word or mark starts, a svelte
 * block keeps its columns, see snippet_code, so inside a quote or a list
 * they are short by the marker
 */
export function snippet_map(
	file: string,
	raw: string,
	snippet: Snippet
): {
	version: 3;
	sources: string[];
	sourcesContent: string[];
	names: string[];
	mappings: string;
} {
	const code = snippet.code.split('\n');
	// a line number holds in raw, \r\n counts as the one newline it becomes
	const lines = raw.split(/\r\n?|\n/);
	const shifts = snippet.extension !== 'svelte';
	let mappings = ';'.repeat(snippet.line - 1);
	let last_line = 0;
	let last_column = 0;
	for (let i = 0; i < code.length; i++) {
		if (i !== 0) mappings += ';';
		const text = code[i];
		const at = snippet.line - 1 + i;
		const line = at < lines.length ? lines[at] : undefined;
		// a document that changed since no longer has the line, it maps nowhere
		if (line === undefined || !line.endsWith(text)) continue;
		const shift = shifts ? line.length - text.length : 0;
		let column = 0;
		let first = true;
		for (let c = 0; c < text.length; c++) {
			const ch = text.charCodeAt(c);
			if (ch === 32 || ch === 9) continue;
			if (c !== 0 && word(ch) && word(text.charCodeAt(c - 1))) continue;
			mappings +=
				(first ? '' : ',') +
				vlq(c - column) +
				'A' +
				vlq(at - last_line) +
				vlq(c + shift - last_column);
			first = false;
			column = c;
			last_line = at;
			last_column = c + shift;
		}
	}
	return {
		version: 3,
		sources: [file.slice(file.lastIndexOf('/') + 1)],
		sourcesContent: [raw],
		names: [],
		mappings,
	};
}

/** the module of a snippet its document no longer has, it says so where it runs */
export function missing_module(extension: string, message: string): string {
	const warn = 'console.warn(' + JSON.stringify(message) + ');';
	return extension === 'svelte'
		? '<script module>\n\t' + warn + '\n</script>\n'
		: warn + '\nexport {};\n';
}
