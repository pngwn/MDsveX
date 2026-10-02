/**
 * the mdsvex config of a document without running vite, from the nearest
 * manifest the plugin wrote or else the nearest mdsvex.config.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as TS from 'typescript';

import { MANIFEST_PATH, MANIFEST_VERSION, module_script } from 'mdsvex';
import type {
	CompileOptions,
	ComponentMode,
	ManifestModule,
	ManifestTemplate,
	MdsvexManifest,
	TemplateEntry,
} from 'mdsvex';
import type { PfmToSvelteOptions } from '@mdsvex/source-map/pfm-to-svelte';

export const CONFIG_FILE = 'mdsvex.config.json';
const COMPONENTS_ID = 'mdsvex:components';
const DIRECTIVES_ID = 'mdsvex:directives';
const TEMPLATE_ID = 'mdsvex:template/';
const TEMPLATE_DIRECTIVES_ID = 'mdsvex:template-directives/';
const DIRECTIVES_EXPORT = 'directives';

/** the shape of mdsvex.config.json, the vite plugin options that are data */
export interface JsonConfig {
	extensions?: string[];
	templates?: Record<
		string,
		string | { component: string; components?: string }
	>;
	components?: string | string[];
	component_mode?: ComponentMode;
}

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
	const files = new Map<string, (name: string) => string>();
	for (const [name, t] of Object.entries(manifest.templates)) {
		const extra = t.extra;
		const names =
			extra === null ? t.components : union(t.components, extra.names);
		const entry: TemplateEntry = { specifier: t.id, components: names };
		if (t.directives.length !== 0) entry.directives = sources(t.directives);
		templates[name] = entry;
		// the extra module wins a name both export, as the merging module of the plugin does
		files.set(t.id, (n) =>
			n !== 'default' && extra !== null && extra.names.includes(n)
				? extra.file
				: t.file
		);
		for (const d of t.directives) files.set(d.id, () => d.file);
	}
	for (const m of [...manifest.components, ...manifest.directives])
		files.set(m.id, () => m.file);

	const compile: CompileOptions = {
		component_mode: manifest.component_mode,
		components: sources(manifest.components),
		directives: sources(manifest.directives),
	};
	if (Object.keys(templates).length !== 0) compile.templates = templates;
	if (manifest.select_template) {
		// what the selector picked when the plugin last compiled the file
		const picked = manifest.documents[posix(doc)];
		compile.select_template = () => (picked === null ? false : picked);
	}

	return {
		compile,
		resolve(id, name) {
			const file = files.get(id)?.(name);
			return file === undefined ? undefined : specifier_from(doc, file);
		},
		// a parse plugin may handle a directive no component renders
		report_directives: !manifest.directive_plugins,
		lenient_frontmatter: manifest.frontmatter_parse,
	};
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
	const extensions = (config.extensions ?? ['.svx']).map((e) =>
		e.startsWith('.') ? e : '.' + e
	);
	const manifest: MdsvexManifest = {
		version: MANIFEST_VERSION,
		root: posix(dir),
		extensions,
		component_mode: config.component_mode ?? 'markdown',
		frontmatter_parse: false,
		directive_plugins: false,
		select_template: false,
		templates: {},
		components: [],
		directives: [],
		documents: {},
	};
	const from = path.join(dir, 'vite.config');
	const scan = (file: string) => scan_exports(file, ts);

	const written =
		config.components === undefined
			? []
			: Array.isArray(config.components)
				? config.components
				: [config.components];
	const many = written.length !== 1;
	written.forEach((spec, i) => {
		const file = resolve_specifier(spec, from);
		if (file === null) return;
		const own = scan(file);
		const suffix = many ? '/' + i : '';
		manifest.components.push({
			id: COMPONENTS_ID + suffix,
			file,
			names: own.names,
		});
		const d = directives_of(own, file, DIRECTIVES_ID + suffix, scan);
		if (d !== null) manifest.directives.push(d);
	});

	for (const [name, entry] of Object.entries(config.templates ?? {})) {
		const pair = typeof entry === 'object';
		const file = resolve_specifier(pair ? entry.component : entry, from);
		if (file === null) continue;
		const own = scan(file);
		const template: ManifestTemplate = {
			id: TEMPLATE_ID + name,
			file,
			components: own.names.filter((n) => n !== 'default'),
			extra: null,
			directives: [],
		};
		const base = TEMPLATE_DIRECTIVES_ID + name;
		const mine = directives_of(own, file, base, scan);
		if (mine !== null) template.directives.push(mine);
		const extra_spec = pair ? entry.components : undefined;
		const extra_file =
			extra_spec === undefined ? null : resolve_specifier(extra_spec, from);
		if (extra_file !== null) {
			const more = scan(extra_file);
			template.extra = {
				id: TEMPLATE_ID + name,
				file: extra_file,
				names: more.names.filter((n) => n !== 'default'),
			};
			const theirs = directives_of(
				more,
				extra_file,
				base + '/components',
				scan
			);
			if (theirs !== null) template.directives.push(theirs);
		}
		manifest.templates[name] = template;
	}
	return manifest;
}

interface Scanned {
	names: string[];
	/** the specifier of export * as directives from, null for none */
	directives: string | null;
}

function directives_of(
	own: Scanned,
	owner: string,
	id: string,
	scan: (file: string) => Scanned
): ManifestModule | null {
	if (own.directives === null) return null;
	const file = resolve_specifier(own.directives, owner);
	if (file === null) return null;
	return { id, file, names: scan(file).names };
}

/**
 * the names a module exports without running it, of a svelte file its module
 * script, read from the typescript syntax tree so it needs no vite
 */
export function scan_exports(file: string, ts: typeof TS | undefined): Scanned {
	const none: Scanned = { names: [], directives: null };
	if (ts === undefined) return none;
	let code: string | null;
	try {
		code = fs.readFileSync(file, 'utf8');
	} catch {
		return none;
	}
	if (file.endsWith('.svelte')) code = module_script(code);
	if (code === null) return none;
	const sf = ts.createSourceFile(file + '.ts', code, ts.ScriptTarget.Latest);
	const names: string[] = [];
	let directives: string | null = null;
	const text = (n: TS.ModuleExportName) =>
		ts.isIdentifier(n) ? n.text : n.text;
	const exported = (s: TS.Statement) =>
		ts.canHaveModifiers(s) &&
		(ts.getModifiers(s) ?? []).some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword
		);
	const is_default = (s: TS.Statement) =>
		ts.canHaveModifiers(s) &&
		(ts.getModifiers(s) ?? []).some(
			(m) => m.kind === ts.SyntaxKind.DefaultKeyword
		);
	for (const s of sf.statements) {
		if (ts.isExportDeclaration(s)) {
			if (s.isTypeOnly) continue;
			const clause = s.exportClause;
			if (clause === undefined) continue;
			if (ts.isNamespaceExport(clause)) {
				const name = text(clause.name);
				names.push(name);
				if (
					name === DIRECTIVES_EXPORT &&
					s.moduleSpecifier !== undefined &&
					ts.isStringLiteral(s.moduleSpecifier)
				)
					directives = s.moduleSpecifier.text;
			} else {
				for (const e of clause.elements)
					if (!e.isTypeOnly) names.push(text(e.name));
			}
		} else if (ts.isExportAssignment(s)) {
			names.push('default');
		} else if (exported(s)) {
			if (is_default(s)) names.push('default');
			else if (ts.isVariableStatement(s)) {
				for (const d of s.declarationList.declarations)
					if (ts.isIdentifier(d.name)) names.push(d.name.text);
			} else if (
				(ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) &&
				s.name !== undefined
			)
				names.push(s.name.text);
		}
	}
	// a directives export the plugin rejects is not a namespace, it is no element either
	return {
		names: names.filter((n) => n !== DIRECTIVES_EXPORT),
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
