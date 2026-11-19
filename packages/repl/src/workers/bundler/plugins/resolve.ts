import { VIRTUAL } from '../../constants';
import type { File } from '../../../workspace.svelte';

/** resolves an import against the workspace, trying the usual suffixes */
export function resolve(
	virtual: Map<string, File>,
	importee: string,
	importer: string
): string {
	const url = new URL(importee, importer);

	for (const suffix of ['', '.js', '.json', '.ts', '/index.js', '/index.ts']) {
		const with_suffix = `${url.href.slice(VIRTUAL.length + 1)}${suffix}`;
		const file = virtual.get(with_suffix);

		if (file) {
			return url.href + suffix;
		}
	}

	if (url.href.endsWith('.ts') || url.href.endsWith('.js')) {
		// typescript has people import .ts files with a .js suffix
		const other_suffix = url.href.endsWith('.ts') ? '.js' : '.ts';
		const with_other_suffix = `${url.href.slice(VIRTUAL.length + 1, -3)}${other_suffix}`;
		const file = virtual.get(with_other_suffix);

		if (file) {
			return url.href.slice(0, -3) + other_suffix;
		}
	}

	throw new Error(
		`'${importee}' (imported by ${importer.replace(VIRTUAL + '/', '')}) does not exist`
	);
}
