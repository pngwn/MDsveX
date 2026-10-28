/**
 * the mdsvex config of a document without running vite, from the nearest
 * manifest the plugin wrote or else the nearest mdsvex.config.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as TS from 'typescript';

import temml from 'temml';
import type {
	CompileOptions,
	HighlightConfig,
	MathRenderer,
	SmartPunctuation,
	TemplateEntry,
} from 'mdsvex/compile';
import {
	CONFIG_FILE,
	DIRECTIVES_EXPORT,
	MANIFEST_PATH,
	MANIFEST_VERSION,
	manifest_resolver,
	read_exports,
	read_json_config,
} from 'mdsvex/host';
import type {
	ConfigExports,
	JsonConfig,
	ScannedExports,
	ManifestModule,
	MdsvexManifest,
} from 'mdsvex/host';
import { create_highlight } from 'mdsvex/highlight';
import { default_languages } from 'mdsvex/highlight/languages';
import { source_math, temml_math } from 'mdsvex/math';
import type { PfmToSvelteOptions } from '@mdsvex/source-map/pfm-to-svelte';

export { CONFIG_FILE };
export type { JsonConfig };

export interface LoadedConfig {
	/** the file read, the manifest or the json config */
	file: string;
	/** changes whenever the file does, for caches */
	stamp: string;
	manifest: MdsvexManifest;
}

/** the options a document converts with, and a stamp to cache them by */
export interface DocumentOptions {
	stamp: string;
	options: PfmToSvelteOptions;
}

export interface ConfigLoader {
	/** the nearest config of a file, null without one */
	load(file: string): LoadedConfig | null;
	options_for(file: string): DocumentOptions;
}

const posix = (p: string) => p.replace(/\\/g, '/');

export interface ConfigLoaderOptions {
	/** reads the exports of templates a mdsvex.config.json names, without it they replace nothing */
	typescript?: typeof TS;
	/** called with each config file read, so a server can watch it */
	on_read?: (file: string) => void;
}

export function create_config_loader(
	loader_options: ConfigLoaderOptions = {}
): ConfigLoader {
	const ts = loader_options.typescript;
	const parsed = new Map<string, LoadedConfig & { mtime: number }>();

	function read(file: string, json: boolean): LoadedConfig | null {
		let stat: fs.Stats;
		try {
			stat = fs.statSync(file);
		} catch {
			return null;
		}
		const hit = parsed.get(file);
		if (hit !== undefined && hit.mtime === stat.mtimeMs) return hit;
		let manifest: MdsvexManifest | null = null;
		try {
			const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
			manifest = json
				? from_json(raw, path.dirname(file), ts)
				: raw.version === MANIFEST_VERSION
					? raw
					: null;
		} catch {
			manifest = null;
		}
		loader_options.on_read?.(file);
		if (manifest === null) return null;
		const loaded = {
			file,
			stamp: `${file}@${stat.mtimeMs}`,
			manifest,
			mtime: stat.mtimeMs,
		};
		parsed.set(file, loaded);
		return loaded;
	}

	function load(file: string): LoadedConfig | null {
		let dir = path.dirname(file);
		for (;;) {
			const found =
				read(path.join(dir, MANIFEST_PATH), false) ??
				read(path.join(dir, CONFIG_FILE), true);
			if (found !== null) return found;
			const up = path.dirname(dir);
			if (up === dir) return null;
			dir = up;
		}
	}

	return {
		load,
		options_for(file) {
			const config = load(file);
			if (config === null) return { stamp: '', options: {} };
			return {
				stamp: config.stamp,
				options: document_options(config.manifest, file),
			};
		},
	};
}

/** a specifier typescript resolves to file from the directory of doc */
function specifier_from(doc: string, file: string): string {
	let rel = posix(path.relative(path.dirname(doc), file));
	if (!rel.startsWith('.') && !path.isAbsolute(rel)) rel = './' + rel;
	// a .ts import needs allowImportingTsExtensions, .js finds the .ts in every resolution mode
	return rel.replace(/\.([mc]?)ts$/, (_, m) => `.${m}js`);
}

function sources(modules: ManifestModule[]) {
	return modules.length === 0
		? undefined
		: modules.map((m) => ({ specifier: m.id, names: m.names }));
}

/** the conversion options of doc under manifest */
export function document_options(
	manifest: MdsvexManifest,
	doc: string
): PfmToSvelteOptions {
	const templates: Record<string, TemplateEntry> = {};
	for (const [name, t] of Object.entries(manifest.templates)) {
		const extra = t.extra;
		const names =
			extra === null ? t.components : union(t.components, extra.names);
		const entry: TemplateEntry = { specifier: t.id, components: names };
		if (t.directives.length !== 0) entry.directives = sources(t.directives);
		templates[name] = entry;
	}
	const file_of = manifest_resolver(manifest);
	// plugin modules first, so the modules of the config win a name
	const components: ManifestModule[] = [];
	const directives: ManifestModule[] = [];
	for (const p of manifest.plugins ?? []) {
		if (p.components) components.push(p.components);
		if (p.directives) directives.push(p.directives);
	}
	components.push(...manifest.components);
	directives.push(...manifest.directives);

	const compile: CompileOptions = {
		component_mode: manifest.component_mode,
		components: sources(components),
		directives: sources(directives),
		highlight: highlight_of(manifest),
	};
	if (Object.keys(templates).length !== 0) compile.templates = templates;
	if (manifest.unwrap_images === true) compile.unwrap_images = true;
	// a replaced img gets the import as its src, typed as typescript resolves it
	if (manifest.import_images === true)
		compile.import_images =
			manifest.enhanced_images === true ? { enhanced: true } : true;
	// the id is a prop of a replaced heading, the default slug stands in for a function
	if (manifest.heading_ids === true) compile.heading_ids = true;
	// the text an editor maps is the text the build renders
	const smart = smart_from_json(manifest.smart_punctuation);
	if (smart !== undefined) compile.smart_punctuation = smart;
	const math = math_of(manifest);
	if (math !== undefined) compile.math = math;
	if (manifest.select_template) {
		// what the selector picked when the plugin last compiled the file
		const picked = manifest.documents[posix(doc)];
		compile.select_template = () => (picked === null ? false : picked);
	}

	return {
		compile,
		resolve(id, name) {
			const file = file_of(id, name);
			return file === undefined ? undefined : specifier_from(doc, file);
		},
		// a parse plugin may handle a directive no component renders
		report_directives: !manifest.directive_plugins,
		lenient_frontmatter: manifest.frontmatter_parse,
		declare_plugin_data: manifest.plugin_data === true,
		report_missing_pre: true,
	};
}

let twinkleplop: HighlightConfig | null = null;

/**
 * the highlighter documents compile with, twinkleplop as the plugin has it by
 * default so live expressions in code are references, compile is synchronous
 * so every language is loaded up front
 */
function highlight_of(manifest: MdsvexManifest): CompileOptions['highlight'] {
	// a custom highlighter has no live expressions
	if ((manifest.highlight ?? 'twinkleplop') !== 'twinkleplop') return undefined;
	return (twinkleplop ??= create_highlight({ languages: default_languages }));
}

let temml_default: MathRenderer | null = null;

/**
 * the renderer math fences compile with, temml as the build has it so
 * invalid latex is a diagnostic, katex is not bundled and json can not
 * hold a function, there the latex shows as written and is never checked
 */
function math_of(manifest: MdsvexManifest): MathRenderer | undefined {
	const math = manifest.math;
	if (math === false) return undefined;
	if (math === undefined) return (temml_default ??= temml_math(temml));
	const options = math.options;
	if (math.renderer !== 'temml' || options === null) return source_math;
	return options === undefined
		? (temml_default ??= temml_math(temml))
		: temml_math(temml, options);
}

/** the smart_punctuation of a json config or a manifest, undefined when it is off or not the option */
function smart_from_json(smart: unknown): SmartPunctuation | undefined {
	if (smart === true) return true;
	if (typeof smart !== 'object' || smart === null || Array.isArray(smart))
		return undefined;
	const { quotes, dashes, ellipses } = smart as Record<string, unknown>;
	const flag = (v: unknown) => v === undefined || typeof v === 'boolean';
	const four =
		Array.isArray(quotes) &&
		quotes.length === 4 &&
		quotes.every((q) => typeof q === 'string');
	if (!flag(dashes) || !flag(ellipses) || !(flag(quotes) || four))
		return undefined;
	if (quotes === false && dashes === false && ellipses === false)
		return undefined;
	return smart as SmartPunctuation;
}

function union(a: readonly string[], b: readonly string[]): string[] {
	const out = a.slice();
	for (const n of b) if (!out.includes(n)) out.push(n);
	return out;
}

/** a manifest from mdsvex.config.json in dir, entries that do not resolve are left out */
export function from_json(
	config: JsonConfig,
	dir: string,
	ts: typeof TS | undefined
): MdsvexManifest {
	// the editor shows what it can of a config, so what is wrong with it is left out quietly
	return read_json_config(config, path.join(dir, CONFIG_FILE), posix(dir), {
		resolve: resolve_specifier,
		scan: (file) => scan_exports(file, ts),
	}).manifest;
}

/**
 * the names a module exports without running it, of a svelte file its module
 * script, types stripped by typescript so it needs no vite
 */
export function scan_exports(
	file: string,
	ts: typeof TS | undefined
): ConfigExports {
	const none: ConfigExports = { names: [], directives: null };
	if (ts === undefined) return none;
	let code: string;
	try {
		code = fs.readFileSync(file, 'utf8');
	} catch {
		return none;
	}
	const strip = (js: string) =>
		ts.transpileModule(js, {
			fileName: file + '.ts',
			compilerOptions: {
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext,
			},
		}).outputText;
	let scanned: ScannedExports;
	try {
		scanned = read_exports(
			code,
			file.endsWith('.svelte') ? 'svelte' : 'js',
			strip
		);
	} catch {
		return none;
	}
	const directives =
		scanned.namespaces.find((n) => n.name === DIRECTIVES_EXPORT)?.specifier ??
		null;
	// a directives export the plugin rejects is not a namespace, it is no element either
	return {
		names: scanned.names.filter((n) => n !== DIRECTIVES_EXPORT),
		directives,
	};
}

const CONDITIONS = ['svelte', 'import', 'module', 'default'];

/** a conditional exports or imports target as a path, null when none applies */
function target_of(target: unknown): string | null {
	if (typeof target === 'string') return target;
	if (Array.isArray(target)) {
		for (const t of target) {
			const found = target_of(t);
			if (found !== null) return found;
		}
		return null;
	}
	if (target !== null && typeof target === 'object') {
		const record = target as Record<string, unknown>;
		for (const c of CONDITIONS)
			if (c in record) {
				const found = target_of(record[c]);
				if (found !== null) return found;
			}
	}
	return null;
}

/** a key of an exports or imports map that matches subpath, with its star */
function match_map(
	map: Record<string, unknown>,
	subpath: string
): string | null {
	if (subpath in map) return target_of(map[subpath]);
	for (const key of Object.keys(map)) {
		const star = key.indexOf('*');
		if (star < 0) continue;
		const head = key.slice(0, star);
		const tail = key.slice(star + 1);
		if (
			subpath.startsWith(head) &&
			subpath.endsWith(tail) &&
			subpath.length >= key.length - 1
		) {
			const target = target_of(map[key]);
			if (target === null) return null;
			return target.replace(
				'*',
				subpath.slice(head.length, subpath.length - tail.length)
			);
		}
	}
	return null;
}

function read_json(file: string): Record<string, unknown> | null {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
}

function nearest_package(
	dir: string
): { dir: string; json: Record<string, unknown> } | null {
	for (;;) {
		const json = read_json(path.join(dir, 'package.json'));
		if (json !== null) return { dir, json };
		const up = path.dirname(dir);
		if (up === dir) return null;
		dir = up;
	}
}

function existing(file: string): string | null {
	try {
		return fs.statSync(file).isFile() ? posix(file) : null;
	} catch {
		return null;
	}
}

/**
 * resolves spec as an import from importer would, for relative paths, file
 * urls, package.json subpath imports and package exports, never vite aliases
 */
export function resolve_specifier(
	spec: string,
	importer: string
): string | null {
	const dir = path.dirname(importer);
	if (spec.startsWith('file:')) return existing(fileURLToPath(spec));
	if (spec.startsWith('.') || path.isAbsolute(spec))
		return existing(path.resolve(dir, spec));
	if (spec.startsWith('#')) {
		const pkg = nearest_package(dir);
		const imports = pkg?.json.imports;
		if (pkg === null || typeof imports !== 'object' || imports === null)
			return null;
		const target = match_map(imports as Record<string, unknown>, spec);
		if (target === null) return null;
		return target.startsWith('.')
			? existing(path.resolve(pkg.dir, target))
			: resolve_specifier(target, path.join(pkg.dir, 'package.json'));
	}
	const parts = spec.split('/');
	const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
	const subpath = '.' + spec.slice(name.length);
	for (let at = dir; ; ) {
		const root = path.join(at, 'node_modules', name);
		const json = read_json(path.join(root, 'package.json'));
		if (json !== null) {
			const exports = json.exports;
			if (exports !== undefined && exports !== null) {
				const target =
					typeof exports === 'object' &&
					!Array.isArray(exports) &&
					Object.keys(exports).some((k) => k.startsWith('.'))
						? match_map(exports as Record<string, unknown>, subpath)
						: subpath === '.'
							? target_of(exports)
							: null;
				return target === null ? null : existing(path.resolve(root, target));
			}
			return existing(
				path.resolve(root, subpath === '.' ? 'index.js' : subpath)
			);
		}
		const up = path.dirname(at);
		if (up === at) return null;
		at = up;
	}
}
