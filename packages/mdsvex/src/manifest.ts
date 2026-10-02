/**
 * what the vite plugin resolved and scanned, written for editors, which can
 * not run vite to learn the templates and replacements a document compiles with
 */

import type { ComponentMode } from './main';

/** where the plugin writes the manifest, relative to the vite root */
export const MANIFEST_PATH = 'node_modules/.mdsvex/manifest.json';

export const MANIFEST_VERSION = 1;

/** a module documents import through a virtual id */
export interface ManifestModule {
	/** the virtual id documents import, such as mdsvex:components */
	id: string;
	/** the resolved file, absolute */
	file: string;
	/** its export names, the replacements it declares */
	names: string[];
}

export interface ManifestTemplate {
	/** mdsvex:template/<name> */
	id: string;
	/** the template component, absolute */
	file: string;
	/** the element names the module script of the template exports */
	components: string[];
	/** a module of replacements merged over those of the template, its names win */
	extra: ManifestModule | null;
	/** the directives of the template and then of extra */
	directives: ManifestModule[];
}

export interface MdsvexManifest {
	version: typeof MANIFEST_VERSION;
	/** the vite root, absolute */
	root: string;
	extensions: string[];
	component_mode: ComponentMode;
	/** a frontmatter.parse replaces the built in yaml parser */
	frontmatter_parse: boolean;
	/** parse plugins may rewrite nodes and handle directives no component takes */
	parse_plugins: boolean;
	/** select_template picks templates, documents holds what it picked */
	select_template: boolean;
	templates: Record<string, ManifestTemplate>;
	/** the root components modules, lowest precedence first */
	components: ManifestModule[];
	/** the root directives modules, lowest precedence first */
	directives: ManifestModule[];
	/**
	 * the template each document compiled with, null for none, keyed by
	 * absolute file, only kept when select_template can pick one
	 */
	documents: Record<string, string | null>;
}

/**
 * writes the manifest a little after the last change, and only when it
 * differs from what it last wrote, a failure warns once and never throws
 */
export function manifest_writer(
	build: () => MdsvexManifest,
	warn: (message: string) => void
) {
	let root = '';
	let last = '';
	let timer: ReturnType<typeof setTimeout> | null = null;
	let writing: Promise<void> = Promise.resolve();
	let warned = false;

	async function write(): Promise<void> {
		timer = null;
		if (root === '') return;
		const manifest = build();
		const json = JSON.stringify(manifest, null, '\t') + '\n';
		if (json === last) return;
		last = json;
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const file = path.join(root, MANIFEST_PATH);
		try {
			await fs.mkdir(path.dirname(file), { recursive: true });
			// a rename never leaves an editor reading half a file
			const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`;
			await fs.writeFile(tmp, json);
			await fs.rename(tmp, file);
		} catch (e) {
			last = '';
			if (warned) return;
			warned = true;
			warn(
				`could not write ${file} for editor tooling: ${(e as Error).message}`
			);
		}
	}

	function flush(): Promise<void> {
		if (timer !== null) clearTimeout(timer);
		writing = writing.then(write);
		return writing;
	}

	return {
		set_root(dir: string): void {
			root = dir;
		},
		/** write soon, many changes in a row write once */
		schedule(): void {
			if (timer !== null || root === '') return;
			timer = setTimeout(flush, 50);
			// a pending write never keeps a build process alive
			(timer as { unref?: () => void }).unref?.();
		},
		/** write now, after any write in flight */
		flush,
	};
}
