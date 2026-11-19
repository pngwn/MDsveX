// fences marked run, each is a module the document imports, compile imports
// this, so it stays free of node and vite

/** the flag in fence meta that marks a block as one that runs */
export const RUN_FLAG = 'run';

/** the value of the flag that imports the block when it is asked for */
const LAZY = 'client';

/**
 * the languages a block can run in and the extension its module gets, which
 * is what makes a bundler compile it, a block in any other language is a
 * compile error
 */
const EXTENSIONS: Record<string, string> = {
	js: 'js',
	javascript: 'js',
	ts: 'ts',
	typescript: 'ts',
	jsx: 'jsx',
	tsx: 'tsx',
	svelte: 'svelte',
};

const has_own = Object.prototype.hasOwnProperty;

/** the extension of the module of a run block in lang, undefined when it can not run */
export function run_extension(lang: string): string | undefined {
	return has_own.call(EXTENSIONS, lang) ? EXTENSIONS[lang] : undefined;
}

/** the code of a fence marked run, a caller without a bundler plugin serves it as a module */
export interface Snippet {
	/** of the extension and the code, so the same block has the same hash wherever it is */
	hash: string;
	/** the language as the fence names it */
	lang: string;
	/** the extension of the module, without a dot, js, ts, jsx, tsx or svelte */
	extension: string;
	/** the code as the block shows it */
	code: string;
	/** the line of the document the code starts on, from 1 */
	line: number;
}

/**
 * how a fence marked run is imported, true as a sibling of filename,
 * ./name.snippet-hash.extension, a function gives the specifier of each
 * block, false runs no block, the flag is then only taken out of the meta
 */
export type SnippetsOption = boolean | ((snippet: Snippet) => string);

/**
 * run_eval, a block that runs and has live code, run_lang, a language no
 * block runs in, run_value, a run= that is not client, run_pre, no component
 * replaces pre, so nothing can run the block, run_module, nothing says how
 * the block is imported
 */
export type RunErrorCode =
	| 'run_eval'
	| 'run_lang'
	| 'run_value'
	| 'run_pre'
	| 'run_module';

/** a fence marked run that can not run */
export class RunError extends Error {
	code: RunErrorCode;
	/** 1 based line of the fence in the document */
	line: number;
	/** 1 based column */
	column: number;

	constructor(
		code: RunErrorCode,
		message: string,
		line: number,
		column: number
	) {
		super(message);
		this.name = 'RunError';
		this.code = code;
		this.line = line;
		this.column = column;
	}
}

/** 0 for a part that is not the flag, 1 for run and 2 for run=client, -1 for any other value */
export function run_flag(part: string): number {
	if (!part.startsWith(RUN_FLAG)) return 0;
	if (part.length === RUN_FLAG.length) return 1;
	if (part.charCodeAt(RUN_FLAG.length) !== 61) return 0;
	let value = part.slice(RUN_FLAG.length + 1);
	const open = value.charCodeAt(0);
	if (
		value.length > 1 &&
		(open === 34 || open === 39) &&
		value.charCodeAt(value.length - 1) === open
	)
		value = value.slice(1, -1);
	return value === LAZY ? 2 : -1;
}

/** ten hex digits of text, two rounds of fnv-1a that start apart */
export function snippet_hash(text: string): string {
	let a = 0x811c9dc5;
	let b = 0x01000193;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		a = Math.imul(a ^ ch, 0x01000193);
		b = Math.imul(b ^ ch, 0x85ebca6b);
		b ^= b >>> 13;
	}
	return (
		(a >>> 0).toString(16).padStart(8, '0') +
		((b >>> 0) & 0xff).toString(16).padStart(2, '0')
	);
}

/** the snippet of a block, the hash covers the extension, so js and javascript share a module */
export function snippet_of(
	lang: string,
	extension: string,
	code: string,
	line: number
): Snippet {
	return {
		hash: snippet_hash(extension + '\n' + code),
		lang,
		extension,
		code,
		line,
	};
}

/** what follows the name of a document in the id of a snippet of it */
export function snippet_suffix(snippet: Snippet): string {
	return '.snippet-' + snippet.hash + '.' + snippet.extension;
}

/**
 * the specifier a document imports a snippet by, a fake sibling of the
 * document that ends in the real extension, so a relative import in the
 * block resolves as it would in the document
 */
export function sibling_specifier(filename: string, snippet: Snippet): string {
	const name = filename.slice(
		Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1
	);
	return './' + name + snippet_suffix(snippet);
}

/** the name a document imports a module under */
export function module_name(hash: string): string {
	return '__snippet_' + hash;
}
