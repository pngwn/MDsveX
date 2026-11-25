/**
 * the mdsvex packages this playground was built with and the highlighter and
 * math library they were installed with, the preview bundles them in place of the ones on npm
 * so it shows what the compiler here writes
 */

import type { FileDescription } from 'tarparser';
import type { Package } from './npm';

type Files = Record<string, () => Promise<string>>;

/** the files of a package by their path in it, as its tarball lays them out */
function under(root: string, files: Files): Files {
	const out: Files = {};
	for (const path in files) out[path.slice(root.length)] = files[path];
	return out;
}

const SOURCES: Record<string, Files> = {
	'@mdsvex/parse': under(
		'../../../parse/',
		import.meta.glob<string>(
			['../../../parse/package.json', '../../../parse/dist/**/*.js'],
			{ query: '?raw', import: 'default' }
		)
	),
	'@mdsvex/render': under(
		'../../../render/',
		import.meta.glob<string>(
			[
				'../../../render/package.json',
				'../../../render/dist/**/*.js',
				'../../../render/src/**/*.{svelte,ts}',
			],
			{ query: '?raw', import: 'default' }
		)
	),
	mdsvex: under(
		'../../../mdsvex/',
		import.meta.glob<string>(
			['../../../mdsvex/package.json', '../../../mdsvex/dist/**/*.js'],
			{ query: '?raw', import: 'default' }
		)
	),
};

// the highlighter mdsvex was installed with, a version picked in the browser
// could differ from the one the compiler here runs
const TWINKLEPLOP = '../../../mdsvex/node_modules/';
const twinkleplop = import.meta.glob<string>(
	[
		'../../../mdsvex/node_modules/@twinkleplop/*/package.json',
		'../../../mdsvex/node_modules/@twinkleplop/*/dist/**/*.js',
		'!../../../mdsvex/node_modules/@twinkleplop/twoslash*/**',
	],
	{ query: '?raw', import: 'default' }
);
for (const path in twinkleplop) {
	const [scope, name, ...rest] = path.slice(TWINKLEPLOP.length).split('/');
	(SOURCES[scope + '/' + name] ??= {})[rest.join('/')] = twinkleplop[path];
}

// the math library mdsvex was installed with, load_math imports it by name
SOURCES.temml = under(
	'../../../mdsvex/node_modules/temml/',
	import.meta.glob<string>(
		[
			'../../../mdsvex/node_modules/temml/package.json',
			'../../../mdsvex/node_modules/temml/dist/temml.mjs',
		],
		{ query: '?raw', import: 'default' }
	)
);

const loaded = new Map<string, Promise<Package>>();

export function is_local(name: string): boolean {
	return name in SOURCES;
}

export function local_package(name: string): Promise<Package> {
	let pkg = loaded.get(name);
	if (pkg === undefined) {
		const files = SOURCES[name];
		const names = Object.keys(files);
		pkg = Promise.all(names.map((file) => files[file]())).then((texts) => {
			const contents: Record<string, FileDescription> = {};
			names.forEach((file_name, i) => {
				contents[file_name] = {
					name: file_name,
					type: 'file',
					text: texts[i],
				} as FileDescription;
			});
			return { meta: JSON.parse(contents['package.json'].text), contents };
		});
		loaded.set(name, pkg);
		// a failed fetch is tried again by the next bundle
		pkg.catch(() => loaded.delete(name));
	}
	return pkg;
}
