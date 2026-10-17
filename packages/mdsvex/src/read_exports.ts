/**
 * the names a module exports without evaluating it, a svelte file only through
 * its module script, the caller strips types so no bundler is needed
 */
import { parse } from 'es-module-lexer/js';
import type { ExportSpecifier, ImportSpecifier } from 'es-module-lexer/js';
import { exported_declarations } from './export_declarations.js';

export type ScanKind = 'js' | 'svelte';

/** typescript to javascript that keeps every export statement */
export type StripTypes = (code: string) => string;

export interface ScannedExports {
	/** export names in source order */
	names: string[];
	/** specifiers of star re-exports, whose names a static scan cannot see */
	stars: string[];
	/** namespace re-exports, export * as name from specifier */
	namespaces: { name: string; specifier: string }[];
}

// the name of export * as name from, an es2022 string name keeps its quotes
const NAMESPACE = /^export\s*\*\s*as\s+([\w$]+|"[^"]*"|'[^']*')\s*from/;

/**
 * the exports of code, typescript needs strip_types, without it the code is
 * read as javascript
 *
 * @example
 * read_exports(source, 'svelte', (code) => ts.transpileModule(code, options).outputText);
 */
export function read_exports(
	code: string,
	kind: ScanKind,
	strip_types?: StripTypes
): ScannedExports {
	const js = kind === 'svelte' ? module_script(code) : code;
	if (js === null || js.trim() === '')
		return { names: [], stars: [], namespaces: [] };
	return lex(strip_types === undefined ? js : strip_types(js));
}

function lex(js: string): ScannedExports {
	const [imports, exports] = parse(js);
	const names = DECLARED.test(js)
		? (declared_names(js, imports, exports) ?? exports.map((e) => e.n))
		: exports.map((e) => e.n);
	const stars: string[] = [];
	const namespaces: { name: string; specifier: string }[] = [];
	for (let i = 0; i < imports.length; i++) {
		const imp = imports[i];
		// a re-export statement starts with export, a namespace re-export is a name instead
		if (imp.n === undefined || !js.startsWith('export', imp.ss)) continue;
		const statement = js.slice(imp.ss, imp.se);
		if (/^export\s*\*\s*from/.test(statement)) stars.push(imp.n);
		else {
			const m = NAMESPACE.exec(statement);
			if (m !== null) {
				const name = /^["']/.test(m[1]) ? m[1].slice(1, -1) : m[1];
				namespaces.push({ name, specifier: imp.n });
			}
		}
	}
	return { names, stars, namespaces };
}

const DECLARED = /\bexport\s+(?:const|let|var)\b/;
const DECLARED_AT = /\bexport\s+(?:const|let|var)\b/g;
const QUOTE = /["']/;

/**
 * the export names with each export const, let or var read by the tokenizer,
 * null when it can not read the module or disagrees with the lexer about
 * where a word is
 */
function declared_names(
	js: string,
	imports: readonly ImportSpecifier[],
	exports: readonly ExportSpecifier[]
): string[] | null {
	const scanned = exported_declarations(js);
	if (scanned === null) return null;
	const { declarations, words } = scanned;
	for (const imp of imports)
		if (imp.t === 1 && imp.ss >= 0 && !words.has(imp.ss)) return null;
	const placed: { at: number; name: string }[] = [];
	let at = -1;
	for (const e of exports) {
		if (e.s >= 0) at = e.s;
		const quoted = QUOTE.test(js[e.s] ?? '') || QUOTE.test(js[e.s - 1] ?? '');
		if (e.s >= 0 && !quoted && !words.has(e.s)) return null;
		const owner = declarations.find((d) => d.start <= at && at < d.end);
		if (owner === undefined) {
			placed.push({ at, name: e.n });
			continue;
		}
		// a declaration that ran past the end of its statement swallowed this one
		DECLARED_AT.lastIndex = owner.start + 1;
		const next = DECLARED_AT.exec(js);
		if (next !== null && next.index < at) return null;
	}
	for (const d of declarations)
		for (const name of d.names) placed.push({ at: d.start, name });
	return placed.sort((a, b) => a.at - b.at).map((p) => p.name);
}

// a quoted attribute value may hold a closing angle bracket
const SCRIPT_OPEN =
	/<script((?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*>/gi;
const SCRIPT_CLOSE = /<\/script\s*>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const MODULE_ATTR =
	/(?:^|\s)module(?:\s|=|$)|(?:^|\s)context\s*=\s*["']?module\b/;

/** the module script body of a svelte file, null when it has none */
export function module_script(svelte: string): string | null {
	// a commented out script is not one, blank comments rather than parse markup
	const src = svelte.includes('<!--')
		? svelte.replace(COMMENT, (m) => ' '.repeat(m.length))
		: svelte;
	SCRIPT_OPEN.lastIndex = 0;
	let open: RegExpExecArray | null;
	while ((open = SCRIPT_OPEN.exec(src)) !== null) {
		const start = SCRIPT_OPEN.lastIndex;
		SCRIPT_CLOSE.lastIndex = start;
		const close = SCRIPT_CLOSE.exec(src);
		if (close === null) return null;
		if (MODULE_ATTR.test(open[1])) return src.slice(start, close.index);
		SCRIPT_OPEN.lastIndex = SCRIPT_CLOSE.lastIndex;
	}
	return null;
}
