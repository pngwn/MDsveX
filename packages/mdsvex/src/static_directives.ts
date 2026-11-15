/**
 * which directives a directives module registers as static, a component whose
 * file is named <name>.static.<ext> renders at build time, see
 * design/static-directives.md
 */
import type { Rollup } from 'vite';
import { clean_id } from './ids.js';
import { check_static } from './static_check.js';
import type { ScannedExports } from './read_exports.js';

// the last two dots of the base name, Callout.static.svelte and Note.static.svx
const STATIC_FILE = /\.static\.[^./\\]+$/;

/** true for a component file named <name>.static.<ext> */
export function is_static_file(file: string): boolean {
	return STATIC_FILE.test(file);
}

/**
 * a key of everything in a directives module that decides a mode, a rescan
 * that gives another key resolves the module again
 */
export function mode_key(scanned: ScannedExports): string {
	let key = '';
	for (const r of scanned.reexports)
		key += r.name + '\0' + r.imported + '\0' + r.specifier + '\n';
	key += '\n' + scanned.imports.join('\n') + '\n\n' + scanned.stars.join('\n');
	return key;
}

/** the static directives of a directives module, by name the component file */
export interface StaticNames {
	/** in source order */
	names: string[];
	files: Record<string, string>;
}

const NO_STATIC: StaticNames = Object.freeze({
	names: [],
	files: {},
}) as StaticNames;

/**
 * the directive names of file served statically, in source order, a static
 * component reached any other way than export { default as name } from
 * throws, as only that form can be left out of what the client loads
 */
export async function static_names(
	ctx: Rollup.PluginContext,
	file: string,
	scanned: ScannedExports
): Promise<StaticNames> {
	const { reexports, imports, stars } = scanned;
	if (reexports.length === 0 && imports.length === 0 && stars.length === 0)
		return NO_STATIC;
	const files = new Map<string, Promise<string | null>>();
	const file_of = (spec: string): Promise<string | null> => {
		let found = files.get(spec);
		if (found === undefined) {
			found = ctx
				.resolve(spec, file, { skipSelf: true })
				.then((r) => (r === null || r.external ? null : clean_id(r.id)));
			files.set(spec, found);
		}
		return found;
	};
	const [named, imported, starred] = await Promise.all([
		Promise.all(reexports.map((r) => file_of(r.specifier))),
		Promise.all(imports.map(file_of)),
		Promise.all(stars.map(file_of)),
	]);
	for (let i = 0; i < imports.length; i++) {
		const at = imported[i];
		if (at !== null && is_static_file(at))
			throw form_error(file, imports[i], 'imports');
	}
	for (let i = 0; i < stars.length; i++) {
		const at = starred[i];
		if (at !== null && is_static_file(at))
			throw form_error(file, stars[i], 're-exports with export * from');
	}
	const out: string[] = [];
	const by_name: Record<string, string> = {};
	for (let i = 0; i < reexports.length; i++) {
		const at = named[i];
		if (at === null || !is_static_file(at)) continue;
		const r = reexports[i];
		if (r.imported !== 'default') {
			throw new Error(
				`[mdsvex] ${file} re-exports ${JSON.stringify(r.imported)} of the static ` +
					`component ${JSON.stringify(r.specifier)}, a static directive is the ` +
					`default export of its file: export { default as ${r.name} } from ` +
					`${JSON.stringify(r.specifier)}`
			);
		}
		out.push(r.name);
		by_name[r.name] = at;
	}
	if (out.length === 0) return NO_STATIC;
	// at registration, so a startup or a rescan of the module reports it
	const checked = await Promise.all(
		[...new Set(Object.values(by_name))].map((f) => check_static(f))
	);
	const problem = checked.find((e) => e !== null);
	if (problem != null) throw problem;
	return { names: out, files: by_name };
}

function form_error(file: string, spec: string, how: string): Error {
	return new Error(
		`[mdsvex] ${file} ${how} the static component ${JSON.stringify(spec)}. ` +
			`register a static directive as export { default as name } from ` +
			`${JSON.stringify(spec)}, the only form mdsvex can keep out of what the browser loads`
	);
}
