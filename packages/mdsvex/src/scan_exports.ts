/**
 * the names a module exports without evaluating it, a svelte file only through
 * its module script, vite and the lexer load on first use so a compile never does
 */

export type ScanKind = 'js' | 'svelte';

export interface ScannedExports {
	/** export names in source order */
	names: string[];
	/** specifiers of star re-exports, whose names a static scan cannot see */
	stars: string[];
}

/** the names code exports, for a svelte file those of its module script */
export async function scan_exports(
	code: string,
	kind: ScanKind
): Promise<string[]> {
	return (await scan_exports_detail(code, kind)).names;
}

export async function scan_exports_detail(
	code: string,
	kind: ScanKind
): Promise<ScannedExports> {
	const js = kind === 'svelte' ? module_script(code) : code;
	if (js === null || js.trim() === '') return { names: [], stars: [] };

	const stripped = await strip_types(js);
	const lexer = await import('es-module-lexer');
	await lexer.init;
	const [imports, exports] = lexer.parse(stripped);

	const names: string[] = [];
	for (let i = 0; i < exports.length; i++) names.push(exports[i].n);
	const stars: string[] = [];
	for (let i = 0; i < imports.length; i++) {
		const imp = imports[i];
		// a re-export statement starts with export, a namespace re-export is a name instead
		if (
			imp.n !== undefined &&
			stripped.startsWith('export', imp.ss) &&
			/^export\s*\*\s*from/.test(stripped.slice(imp.ss, imp.se))
		)
			stars.push(imp.n);
	}
	return { names, stars };
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

/** typescript to javascript for the lexer, plain js passes through */
async function strip_types(code: string): Promise<string> {
	const vite: any = await import('vite');
	// vite 8 transforms with oxc and keeps esbuild optional
	if (typeof vite.transformWithOxc === 'function') {
		const result = await vite.transformWithOxc(code, 'mdsvex-scan.ts', {
			lang: 'ts',
			sourcemap: false,
		});
		return result.code;
	}
	// a string tsconfig skips the lookup, no option it reads changes exports
	const result = await vite.transformWithEsbuild(code, 'mdsvex-scan.ts', {
		loader: 'ts',
		sourcemap: false,
		tsconfigRaw: '{}',
	});
	return result.code;
}
