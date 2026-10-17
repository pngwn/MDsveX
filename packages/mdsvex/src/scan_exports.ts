/**
 * the export scan of the vite plugin, types stripped by vite, which loads on
 * first use so a compile never does
 */
import { module_script, read_exports } from './read_exports.js';
import type { ScanKind, ScannedExports } from './read_exports.js';

export { module_script };
export type { ScanKind, ScannedExports };

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
	if (js === null || js.trim() === '')
		return { names: [], stars: [], namespaces: [] };
	return read_exports(await strip_types(js), 'js');
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
