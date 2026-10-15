/**
 * the names a module exports without evaluating it, a svelte file only through
 * its module script, the caller strips types so no bundler is needed
 */
import { parse } from 'es-module-lexer/js';

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
	const names: string[] = [];
	for (let i = 0; i < exports.length; i++) names.push(exports[i].n);
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
