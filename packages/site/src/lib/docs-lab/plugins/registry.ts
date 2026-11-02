// the first-party plugins, found by their folders under plugins/: a new one
// with a package.json is in the finder on the next build, with no list here.
//
// The site doesn't depend on the plugin packages, so this reads their source
// by path, and Vite compiles it with the site. A real docs section would add
// them as workspace dependencies and import them by name; the module a
// compile names, `@mdsvex/plugin-tabs/directives`, is mapped to the file its
// package's exports point at either way

const ROOT = '../../../../../../plugins/';

/** the fields of a plugin's package.json the finder reads */
export interface Manifest {
	name: string;
	version: string;
	description?: string;
	keywords?: string[];
	exports?: Record<string, string | Record<string, string>>;
	peerDependencies?: Record<string, string>;
	peerDependenciesMeta?: Record<string, { optional?: boolean }>;
	/** the field PLUGINS.md proposes, read when a package has it */
	mdsvex?: Record<string, unknown>;
}

const manifests = import.meta.glob<Manifest>('../../../../../../plugins/*/package.json', { eager: true, import: 'default' });

/** by folder name, `tabs` */
export const packages: Map<string, Manifest> = new Map(
	Object.entries(manifests)
		.map(([path, manifest]) => [path.slice(ROOT.length).split('/')[0], manifest] as const)
		.filter(([, m]) => m.name?.startsWith('@mdsvex/plugin-'))
		.sort(([a], [b]) => a.localeCompare(b)),
);

const by_name = new Map([...packages].map(([dir, m]) => [m.name, dir]));

/** the folder of a package, from its name */
export const folder_of = (name: string) => by_name.get(name);

/**
 * the source file a specifier names, `@mdsvex/plugin-tabs/directives` to
 * `plugins/tabs/src/directives.ts`: its exports entry, with `dist` read as
 * `src` and `.js` as `.ts`, the build every plugin package shares
 */
export function source_of(specifier: string): string | null {
	const m = /^(@mdsvex\/plugin-[\w-]+)(\/.*)?$/.exec(specifier);
	if (!m) return null;
	const dir = by_name.get(m[1]);
	if (!dir) return null;
	const entry = packages.get(dir)!.exports?.[`.${m[2] ?? ''}`];
	const target = typeof entry === 'string' ? entry : (entry?.svelte ?? entry?.default);
	if (!target) return null;
	return `${ROOT}${dir}/${target.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts')}`;
}

/** the entry of a plugin, where its factory is */
export const entry_of = (dir: string) => `${ROOT}${dir}/src/index.ts`;
