/**
 * the mdsvex packages this playground was built with, the preview bundles
 * them in place of the ones on npm so it shows what the compiler here writes
 */

import type { FileDescription } from 'tarparser';
import type { Package } from './npm';

type Files = Record<string, () => Promise<string>>;

// each as its tarball lays it out
const SOURCES: Record<string, { root: string; files: Files }> = {
	'@mdsvex/parse': {
		root: '../../../parse/',
		files: import.meta.glob<string>(
			['../../../parse/package.json', '../../../parse/dist/**/*.js'],
			{ query: '?raw', import: 'default' }
		),
	},
	'@mdsvex/render': {
		root: '../../../render/',
		files: import.meta.glob<string>(
			[
				'../../../render/package.json',
				'../../../render/dist/**/*.js',
				'../../../render/src/**/*.{svelte,ts}',
			],
			{ query: '?raw', import: 'default' }
		),
	},
	mdsvex: {
		root: '../../../mdsvex/',
		files: import.meta.glob<string>(
			['../../../mdsvex/package.json', '../../../mdsvex/dist/**/*.js'],
			{ query: '?raw', import: 'default' }
		),
	},
};

const loaded = new Map<string, Promise<Package>>();

export function is_local(name: string): boolean {
	return name in SOURCES;
}

export function local_package(name: string): Promise<Package> {
	let pkg = loaded.get(name);
	if (pkg === undefined) {
		const { root, files } = SOURCES[name];
		const paths = Object.keys(files);
		pkg = Promise.all(paths.map((path) => files[path]())).then((texts) => {
			const contents: Record<string, FileDescription> = {};
			paths.forEach((path, i) => {
				const file_name = path.slice(root.length);
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
