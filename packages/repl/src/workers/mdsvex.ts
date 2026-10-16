import {
	CompilerSession,
	compile_inputs,
	type CompileOptions,
	type Snippet,
	type ComponentMode,
	type SmartPunctuation,
} from 'mdsvex/compile';
import {
	create_highlight,
	default_aliases,
	default_annotations,
	language_loaders,
	shiki_notation,
	type AnnotationPlugin,
	type HighlightConfig,
	type LanguageModule,
	type RenderOptions,
} from 'mdsvex/highlight';
import { load_math, source_math, type MathRenderer } from 'mdsvex/math';
import {
	CONFIG_FILE,
	COMPONENTS_ID,
	DIRECTIVES_EXPORT,
	TEMPLATE_ID,
	read_exports,
	read_json_config,
	type ConfigHost,
	type JsonConfig,
	type ManifestModule,
	type MdsvexManifest,
	type ScannedExports,
} from 'mdsvex/host';
import { mappings_to_v3, type SourceMapV3 } from '@mdsvex/render/sourcemap';
import { strip_types } from './typescript_strip_types';

export { CONFIG_FILE };

const DEFAULT_EXTENSIONS = ['.svx', '.md'];

export type { ComponentMode };

/** an annotation plugin by name, the built-in verbs and shiki_notation */
export type AnnotationName =
	| 'hl'
	| 'em'
	| 'focus'
	| 'dim'
	| 'add'
	| 'del'
	| 'mod'
	| 'err'
	| 'warn'
	| 'info'
	| 'shiki_notation';

/**
 * the vite plugin highlight options json can hold, every bundled language is
 * available and languages only adds aliases
 */
export interface ReplHighlight {
	languages?: Record<string, string>;
	default_language?: string;
	on_unknown_language?: 'plain' | 'throw';
	line_numbers?: boolean | { start?: number };
	annotations?: AnnotationName[] | false;
	render?: RenderOptions;
}

/** the shape of mdsvex.config.json, its highlight takes the options json can hold */
export type ReplConfig = Omit<JsonConfig, 'highlight'> & {
	highlight?: ReplHighlight | false;
};

/** the vite plugin math options json can hold, only temml is bundled, katex math shows its latex */
export interface ReplMath {
	renderer?: 'temml' | 'katex';
	options?: Record<string, unknown>;
}

interface TemplateTarget {
	/** the virtual id documents import it by */
	id: string;
	/** the workspace file, or null when the specifier points outside it */
	file: string | null;
	specifier: string;
	components: string[];
	/** the modules its directives namespace exports name */
	directives: TemplateTarget[];
}

export interface ResolvedConfig {
	extensions: string[];
	templates: Map<string, TemplateTarget>;
	components: TemplateTarget | null;
	/** directives modules by the virtual id documents import them from */
	directives: Map<string, TemplateTarget>;
	component_mode: ComponentMode;
	highlight: ReplHighlight | false;
	unwrap_images: boolean;
	heading_ids: boolean;
	smart_punctuation: SmartPunctuation;
	math: ReplMath | false;
}

/** template options follow the design doc ahead of core, which ignores them for now */
export interface MdsvexCompileOptions extends CompileOptions {
	templates?: Record<
		string,
		{
			specifier: string;
			components?: string[];
			directives?: { specifier: string; names: string[] }[];
		}
	>;
	default_template?: string;
}

export interface Prepared {
	config: ResolvedConfig;
	options: MdsvexCompileOptions;
	error: Error | null;
	/** the workspace, a fence with src= shows one of its files */
	files: FileMap;
}

export type FileMap = Map<string, string>;

export function is_markdown(name: string, config: ResolvedConfig) {
	for (const ext of config.extensions) {
		if (name.endsWith(ext)) return true;
	}
	return false;
}

/** workspace paths have no leading ./ or / so specifiers can be compared to them */
function normalise(specifier: string) {
	return specifier.replace(/^\.?\//, '');
}

function empty_config(): ResolvedConfig {
	return {
		extensions: DEFAULT_EXTENSIONS,
		templates: new Map(),
		components: null,
		directives: new Map(),
		component_mode: 'markdown',
		highlight: {},
		unwrap_images: false,
		heading_ids: false,
		smart_punctuation: false,
		math: {},
	};
}

/** the workspace as the shared config reader sees it, a specifier outside it is left to the bundler */
function workspace_host(files: FileMap): ConfigHost {
	return {
		resolve(spec, importer) {
			const file =
				importer === CONFIG_FILE || !spec.startsWith('.')
					? normalise(spec)
					: relative_to(importer, spec);
			if (files.has(file)) return file;
			if (spec.startsWith('.') || spec.startsWith('/')) return null;
			// a package specifier, the bundler resolves it and it gets no replacements
			return spec;
		},
		scan(file) {
			if (!files.has(file)) return { names: [], directives: null };
			return {
				names: scan_exports(file, files),
				directives:
					exports_of(file, files)?.namespaces.find(
						(n) => n.name === DIRECTIVES_EXPORT
					)?.specifier ?? null,
			};
		},
	};
}

/** a module of the manifest as the bundler finds it */
function target(m: ManifestModule, files: FileMap): TemplateTarget {
	return {
		id: m.id,
		file: files.has(m.file) ? m.file : null,
		specifier: m.file,
		components: m.names,
		directives: [],
	};
}

/** the config the manifest describes, for the bundler and the compile options */
function from_manifest(
	config: ResolvedConfig,
	manifest: MdsvexManifest,
	files: FileMap
) {
	config.extensions = manifest.extensions;
	config.component_mode = manifest.component_mode;
	config.unwrap_images = manifest.unwrap_images === true;
	config.heading_ids = manifest.heading_ids === true;
	config.smart_punctuation = manifest.smart_punctuation ?? false;
	const math = manifest.math;
	config.math =
		math === false
			? false
			: math === undefined
				? {}
				: {
						renderer: math.renderer as ReplMath['renderer'],
						...(math.options ? { options: math.options } : {}),
					};
	for (const [name, t] of Object.entries(manifest.templates)) {
		const template = target(
			{ id: t.id, file: t.file, names: t.components },
			files
		);
		if (t.extra !== null)
			for (const n of t.extra.names)
				if (!template.components.includes(n)) template.components.push(n);
		template.directives = t.directives.map((d) => target(d, files));
		config.templates.set(name, template);
	}
	const [components] = manifest.components;
	if (components !== undefined) {
		config.components = target(components, files);
		config.components.directives = manifest.directives.map((d) =>
			target(d, files)
		);
	}
}

/** does the vite plugin job, reads the config, scans templates for replacement names, builds the compile options */
export function prepare(files: FileMap): Prepared {
	const config = empty_config();
	const raw = files.get(CONFIG_FILE);
	if (raw === undefined) return { config, options: {}, error: null, files };

	let parsed: ReplConfig;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		return {
			config,
			options: {},
			error: new Error(`${CONFIG_FILE}: ${(e as Error).message}`),
			files,
		};
	}

	let manifest: MdsvexManifest;
	try {
		if (Array.isArray(parsed?.components))
			throw new Error(`${CONFIG_FILE}: components must name one module`);
		const read = read_json_config(
			parsed,
			CONFIG_FILE,
			'',
			workspace_host(files),
			{
				extensions: DEFAULT_EXTENSIONS,
			}
		);
		manifest = read.manifest;
		from_manifest(config, manifest, files);
		if (read.errors.length !== 0) throw new Error(read.errors[0]);
		if (parsed?.highlight !== undefined)
			config.highlight = check_highlight(parsed.highlight);
	} catch (e) {
		return { config, options: {}, error: e as Error, files };
	}

	const options: MdsvexCompileOptions = {
		component_mode: config.component_mode,
	};
	if (config.unwrap_images) options.unwrap_images = true;
	if (config.heading_ids) options.heading_ids = true;
	if (config.smart_punctuation !== false)
		options.smart_punctuation = config.smart_punctuation;

	if (config.templates.size > 0) {
		options.templates = {};
		for (const [name, target] of config.templates) {
			options.templates[name] = {
				specifier: TEMPLATE_ID + name,
				components: target.components,
			};
			if (target.directives.length === 0) continue;
			options.templates[name].directives = target.directives.map((d) => {
				config.directives.set(d.id, d);
				return { specifier: d.id, names: d.components };
			});
		}
		if (config.templates.has('default')) options.default_template = 'default';
	}

	if (config.components) {
		options.components = [
			{ specifier: COMPONENTS_ID, names: config.components.components },
		];
		const [directives] = config.components.directives;
		if (directives) {
			config.directives.set(directives.id, directives);
			options.directives = [
				{ specifier: directives.id, names: directives.components },
			];
		}
	}

	const plugins = manifest.plugins ?? [];
	if (plugins.length !== 0) {
		// below the directives of the components module, which come later and win a name
		options.directives = [
			...plugins.map(({ directives }) => {
				const t = target(directives!, files);
				config.directives.set(t.id, t);
				return { specifier: t.id, names: t.components };
			}),
			...(options.directives ?? []),
		];
	}

	return { config, options, error: null, files };
}

const PLUGIN_OPTIONS = ['twoslash', 'parse_meta'];

function check_highlight(highlight: unknown): ReplHighlight | false {
	if (highlight === false) return false;
	if (typeof highlight !== 'object' || highlight === null)
		throw new Error(`${CONFIG_FILE}: highlight must be an object or false`);
	for (const key of PLUGIN_OPTIONS) {
		if (key in highlight)
			throw new Error(
				`${CONFIG_FILE}: highlight.${key} is not available in the playground`
			);
	}
	const { languages, annotations } = highlight as ReplHighlight;
	for (const [name, target] of Object.entries(languages ?? {})) {
		if (typeof target !== 'string')
			throw new Error(
				`${CONFIG_FILE}: highlight.languages.${name} must name another language, the playground has every bundled language`
			);
	}
	if (annotations !== undefined && annotations !== false) {
		if (!Array.isArray(annotations))
			throw new Error(
				`${CONFIG_FILE}: highlight.annotations must be a list of annotation names or false`
			);
		for (const name of annotations) annotation_plugin(name);
	}
	return highlight as ReplHighlight;
}

/** the built-in annotations by their verb */
const ANNOTATIONS = new Map<string, AnnotationPlugin>(
	default_annotations.map((plugin) => [plugin.verbs[0], plugin])
);

function annotation_plugin(name: string): AnnotationPlugin {
	if (name === 'shiki_notation') return shiki_notation();
	const plugin = ANNOTATIONS.get(name);
	if (plugin === undefined)
		throw new Error(
			`${CONFIG_FILE}: highlight.annotations has no annotation named ${name}, use ${[...ANNOTATIONS.keys(), 'shiki_notation'].join(', ')}`
		);
	return plugin;
}

const FENCE_LANG = /(?:```+|~~~+)[ \t]*([^\s`{]+)/g;
const INLINE_LANG = /`#!([^\s`]+)/g;

/** the bundled language a name reaches through aliases, null for none */
function bundled(name: string, aliases: Record<string, string>): string | null {
	const seen = new Set<string>();
	let at: string | undefined = name;
	while (at !== undefined && !seen.has(at)) {
		seen.add(at);
		if (at in language_loaders) return at;
		const lower = at.toLowerCase();
		if (lower in language_loaders) return lower;
		at =
			aliases[at] ??
			aliases[lower] ??
			default_aliases[at] ??
			default_aliases[lower];
	}
	return null;
}

/** the bundled languages a document names in fences and #! code spans */
export function languages_used(
	source: string,
	highlight: ReplHighlight
): Set<string> {
	const aliases = highlight.languages ?? {};
	const names = new Set<string>();
	for (const match of source.matchAll(FENCE_LANG)) names.add(match[1]);
	for (const match of source.matchAll(INLINE_LANG)) names.add(match[1]);
	// aliases the config names must reach a loaded language to be valid
	for (const target of Object.values(aliases)) names.add(target);
	if (highlight.default_language) names.add(highlight.default_language);

	const used = new Set<string>();
	for (const name of names) {
		const language = bundled(name, aliases);
		if (language !== null) used.add(language);
	}
	// markdown highlights its front matter as yaml
	if (used.has('markdown')) used.add('yaml');
	return used;
}

const loaded = new Map<string, Promise<LanguageModule>>();
let current: { key: string; config: HighlightConfig } | null = null;

/**
 * the highlight option for a document, loading only the languages it uses,
 * the vite plugin loads every language once instead
 */
export async function highlight_for(
	source: string,
	config: ResolvedConfig
): Promise<HighlightConfig | false> {
	const options = config.highlight;
	if (options === false) return false;

	const names = [...languages_used(source, options)];
	const modules = await Promise.all(
		names.map((name) => {
			let module = loaded.get(name);
			if (module === undefined) {
				module = language_loaders[name]();
				loaded.set(name, module);
				// a failed fetch is tried again by the next compile
				module.catch(() => loaded.delete(name));
			}
			return module;
		})
	);

	// every loaded language, so the config is rebuilt only when one is added
	const languages: Record<string, LanguageModule | string> = {};
	for (let i = 0; i < names.length; i++) languages[names[i]] = modules[i];
	for (const [name, module] of loaded) {
		if (!(name in languages)) {
			const settled = await module.catch(() => null);
			if (settled !== null) languages[name] = settled;
		}
	}
	const key =
		JSON.stringify(options) + '\0' + Object.keys(languages).sort().join();
	if (current?.key === key) return current.config;

	Object.assign(languages, options.languages);
	const highlight = create_highlight({
		...options,
		languages,
		annotations:
			options.annotations === undefined || options.annotations === false
				? options.annotations
				: options.annotations.map(annotation_plugin),
	});
	current = { key, config: highlight };
	return highlight;
}

const MATH_FENCE = /(?:```+|~~~+)[ \t]*math(?=\s|$)/;
let math_current: { key: string; render: Promise<MathRenderer> } | null = null;

/**
 * the math option for a document, temml is fetched with the first one that
 * has a math fence, katex is not bundled, so its math shows as written
 */
export async function math_for(
	source: string,
	config: ResolvedConfig
): Promise<MathRenderer | false> {
	const options = config.math;
	if (options === false || !MATH_FENCE.test(source)) return false;
	if (options.renderer === 'katex') return source_math;
	const key = JSON.stringify(options.options ?? null);
	if (math_current?.key !== key) {
		const render = load_math({ options: options.options });
		math_current = { key, render };
		// a failed fetch is tried again by the next compile
		render.catch(() => {
			if (math_current?.render === render) math_current = null;
		});
	}
	return math_current.render;
}

/** maps a virtual id from compiled output to a workspace file or a bare specifier */
export function resolve_virtual(id: string, config: ResolvedConfig) {
	let target: TemplateTarget | null | undefined;
	if (id.startsWith(TEMPLATE_ID)) {
		target = config.templates.get(id.slice(TEMPLATE_ID.length));
	} else if (id === COMPONENTS_ID) {
		target = config.components;
	} else {
		target = config.directives.get(id);
	}
	if (!target) throw new Error(`'${id}' is not configured in ${CONFIG_FILE}`);
	return target;
}

/** the exports of a workspace module, null when it is not in the workspace */
function exports_of(name: string, files: FileMap): ScannedExports | null {
	const source = files.get(name);
	if (source === undefined) return null;
	const kind = name.endsWith('.svelte') ? 'svelte' : 'js';
	try {
		return read_exports(
			source,
			kind,
			name.endsWith('.js') ? undefined : strip_types
		);
	} catch (e) {
		throw new Error(
			`could not scan the exports of ${name}: ${(e as Error).message}`
		);
	}
}

/** the workspace path of from, which is relative to the module name */
function relative_to(name: string, from: string) {
	return new URL(from, `file:///${name}`).pathname.slice(1);
}

/** export names of a module, following star exports through the workspace, without evaluating it */
export function scan_exports(
	name: string,
	files: FileMap,
	seen = new Set<string>()
): string[] {
	if (seen.has(name)) return [];
	seen.add(name);

	const scanned = exports_of(name, files);
	if (scanned === null) return [];

	const names: string[] = [];
	const add = (n: string) => {
		if (n !== 'default' && !names.includes(n)) names.push(n);
	};
	for (const n of scanned.names) add(n);
	for (const from of scanned.stars)
		if (from.startsWith('.'))
			for (const n of scan_exports(relative_to(name, from), files, seen))
				add(n);
	return names;
}

export interface MarkdownResult {
	code: string;
	map: SourceMapV3;
	/** the modules of the fences that run, by the specifier the document imports each by */
	snippets?: Map<string, string>;
}

/** the specifier of the module of a fence that runs, a fake sibling of the document */
const SNIPPET = /^\.\/[^/]+\.snippet-[0-9a-f]{10}\.(?:js|ts|jsx|tsx|svelte)$/;

/** true for the specifier a document imports the module of a fence that runs by */
export function is_snippet(importee: string): boolean {
	return SNIPPET.test(importee);
}

/**
 * files is the workspace a fence with src= reads a relative path from, a
 * fence that runs is imported as a sibling of the document, which the
 * bundler serves from the snippets of the result
 */
export function compile_markdown(
	source: string,
	filename: string,
	options: MdsvexCompileOptions,
	files?: FileMap
): MarkdownResult {
	const name = filename.slice(filename.lastIndexOf('/') + 1);
	const specifier = (snippet: Snippet) =>
		`./${name}.snippet-${snippet.hash}.${snippet.extension}`;
	const session = new CompilerSession();
	const inputs = compile_inputs({ ...options, snippets: specifier });
	const parsed = session.parse(source, inputs);
	// the files its fences show, a relative path is read from the workspace
	let sources: Record<string, string> | undefined;
	for (const need of parsed.needs ?? []) {
		if (need.type !== 'source' || !need.spec.startsWith('.')) continue;
		const text = files?.get(relative_to(filename, need.spec));
		if (text !== undefined) (sources ??= {})[need.spec] = text;
	}
	inputs.sources = sources;
	// a file it has no text for throws the SourceError compile throws
	const result = session.render(parsed, inputs, true);
	const map = mappings_to_v3(
		result.mappings ?? [],
		source,
		result.code,
		filename
	);
	map.file = filename;
	map.sources = [filename];
	if (result.snippets === undefined) return { code: result.code, map };
	const snippets = new Map<string, string>();
	// on the lines it has in the document, so an error names a line of it
	for (const snippet of result.snippets)
		snippets.set(
			specifier(snippet),
			'\n'.repeat(snippet.line - 1) + snippet.code
		);
	return { code: result.code, map, snippets };
}
