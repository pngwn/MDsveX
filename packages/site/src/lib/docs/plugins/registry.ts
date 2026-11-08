// the first-party plugins, as the site depends on them: every
// `@mdsvex/plugin-*` in the site's package.json, read from its built package in
// node_modules. A new plugin is in the finder once the site depends on it, with
// no list here.
//
// The module a compile names, `@mdsvex/plugin-tabs/directives`, is the file its
// package's exports point at, so the build and the browser load the same files
// a site that installs the plugin would
import site from '../../../../package.json';

/** the fields of a plugin's package.json the finder reads */
export interface Manifest {
	name: string;
	version: string;
	description?: string;
	keywords?: string[];
	exports?: Record<string, string | Record<string, string>>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
	/** what can't be read from its code, design/docs/PLUGINS.md */
	mdsvex?: {
		concerns?: string[];
		syntax?: (string | { mark: string; source: string })[];
		needs?: { heading_ids?: true; unwrap_images?: true };
		waits?: string;
	};
}

export const ROOT = '/node_modules/';

const manifests = import.meta.glob<Manifest>('/node_modules/@mdsvex/plugin-*/package.json', { eager: true, import: 'default' });

/** by package name, the site's own plugin dependencies, sorted */
export const packages: Map<string, Manifest> = new Map(
	Object.keys(site.dependencies)
		.filter((name) => name.startsWith('@mdsvex/plugin-'))
		.sort()
		.map((name) => {
			const manifest = manifests[`${ROOT}${name}/package.json`];
			if (!manifest) throw new Error(`the site depends on ${name}, and node_modules has no package.json for it`);
			return [name, manifest] as const;
		}),
);

/** the file of a package a specifier names, `@mdsvex/plugin-tabs/directives` to its `dist/directives.js` */
export function file_of(specifier: string): string | null {
	const m = /^(@mdsvex\/plugin-[\w-]+)(\/.*)?$/.exec(specifier);
	const manifest = m && packages.get(m[1]);
	if (!manifest) return null;
	const entry = manifest.exports?.[`.${m[2] ?? ''}`];
	const target = typeof entry === 'string' ? entry : (entry?.svelte ?? entry?.default);
	return target ? `${ROOT}${m[1]}/${target.replace(/^\.\//, '')}` : null;
}

/** the types of a package, where its factory and options are declared */
export const types_of = (name: string) => `${ROOT}${name}/dist/`;
