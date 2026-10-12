/**
 * what the vite plugin resolved and scanned, written for editors, which can
 * not run vite to learn the templates and replacements a document compiles with
 */

import type { ComponentMode } from './compile';
import type { SmartPunctuation } from './smart_punctuation';

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

/** an entry of the plugins option that brings components */
export interface ManifestPlugin {
	name: string;
	/** the module its directive components come from, mdsvex:plugin/<index>, null without directives */
	directives: ManifestModule | null;
	/** its element replacements, mdsvex:plugin-components/<index>, null without any */
	components: ManifestModule | null;
}

export interface MdsvexManifest {
	version: typeof MANIFEST_VERSION;
	/** the vite root, absolute */
	root: string;
	extensions: string[];
	component_mode: ComponentMode;
	/** a frontmatter.parse replaces the built in yaml parser */
	frontmatter_parse: boolean;
	/** a parse plugin or the parse of a plugin handles directives, so one no component takes may still render */
	directive_plugins: boolean;
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
	/**
	 * how fences render, twinkleplop by default, custom for a highlighter
	 * function, false for plain code, a manifest without it means twinkleplop
	 */
	highlight?: 'twinkleplop' | 'custom' | false;
	/** the unwrap_images option, a manifest without it means false */
	unwrap_images?: boolean;
	/**
	 * the plugins that bring components, lowest precedence first, their
	 * directives sit below directives and their components below components,
	 * a manifest without it has none
	 */
	plugins?: ManifestPlugin[];
	/** true when heading_ids is on in any form, a manifest without it means off */
	heading_ids?: boolean;
	/** the smart_punctuation option as written, a manifest without it means off */
	smart_punctuation?: SmartPunctuation;
	/**
	 * true when a plugin could leave data, which a document then exports as
	 * plugin_data, a manifest without it means none can
	 */
	plugin_data?: boolean;
	/**
	 * how math fences render, false leaves them code blocks, custom is a
	 * renderer function, a manifest without it means temml with no options
	 */
	math?: ManifestMath | false;
}

export interface ManifestMath {
	renderer: 'temml' | 'katex' | 'custom';
	/**
	 * the options of the renderer, left out when it has none, null when json
	 * can not hold them all, so an editor can not render as the build does
	 */
	options?: Record<string, unknown> | null;
}

/**
 * writes the manifest a little after the last change, and only when it
 * differs from what it last wrote, a failure warns once and never throws,
 * build gives null until there is something true to write
 */
export function manifest_writer(
	build: () => MdsvexManifest | null,
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
		if (manifest === null) return;
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
