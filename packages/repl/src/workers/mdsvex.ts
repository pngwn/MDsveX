import * as acorn from 'acorn';
import {
	compile,
	type CompileOptions,
	type ComponentMode,
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
import { mappings_to_v3, type SourceMapV3 } from '@mdsvex/render/sourcemap';
import { strip_types } from './typescript_strip_types';

export const CONFIG_FILE = 'mdsvex.config.json';
export const TEMPLATE_PREFIX = 'mdsvex:template/';
export const COMPONENTS_ID = 'mdsvex:components';
export const DIRECTIVES_ID = 'mdsvex:directives';
export const TEMPLATE_DIRECTIVES_PREFIX = 'mdsvex:template-directives/';

/** the namespace export of a replacement module that holds its directives */
const DIRECTIVES_EXPORT = 'directives';

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

/** the shape of mdsvex.config.json, mirroring the vite plugin options */
export interface ReplConfig {
	extensions?: string[];
	templates?: Record<
		string,
		string | { component: string; components?: string }
	>;
	components?: string;
	component_mode?: ComponentMode;
	highlight?: ReplHighlight | false;
	unwrap_images?: boolean;
}

interface TemplateTarget {
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
	};
}

/** does the vite plugin job, reads the config, scans templates for replacement names, builds the compile options */
export function prepare(files: FileMap): Prepared {
	const config = empty_config();
	const raw = files.get(CONFIG_FILE);
	if (raw === undefined) return { config, options: {}, error: null };

	let parsed: ReplConfig;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		return {
			config,
			options: {},
			error: new Error(`${CONFIG_FILE}: ${(e as Error).message}`),
		};
	}

	try {
		if (parsed.extensions) {
			config.extensions = parsed.extensions.map((ext) =>
				ext.startsWith('.') ? ext : '.' + ext
			);
		}

		if (parsed.component_mode) config.component_mode = parsed.component_mode;
		if (parsed.unwrap_images !== undefined) {
			if (typeof parsed.unwrap_images !== 'boolean')
				throw new Error(`${CONFIG_FILE}: unwrap_images must be true or false`);
			config.unwrap_images = parsed.unwrap_images;
		}
		if (parsed.highlight !== undefined)
			config.highlight = check_highlight(parsed.highlight);

		for (const [name, entry] of Object.entries(parsed.templates ?? {})) {
			const { component, components } =
				typeof entry === 'string'
					? { component: entry, components: undefined }
					: entry;
			const target = target_of(component, files, `templates.${name}`);
			if (components) {
				const extra = target_of(
					components,
					files,
					`templates.${name}.components`
				);
				for (const n of extra.components) {
					if (!target.components.includes(n)) target.components.push(n);
				}
				target.directives.push(...extra.directives);
			}
			config.templates.set(name, target);
		}

		if (parsed.components) {
			config.components = target_of(parsed.components, files, 'components');
		}
	} catch (e) {
		return { config, options: {}, error: e as Error };
	}

	const options: MdsvexCompileOptions = {
		component_mode: config.component_mode,
	};
	if (config.unwrap_images) options.unwrap_images = true;

	if (config.templates.size > 0) {
		options.templates = {};
		for (const [name, target] of config.templates) {
			options.templates[name] = {
				specifier: TEMPLATE_PREFIX + name,
				components: target.components,
			};
			if (target.directives.length === 0) continue;
			options.templates[name].directives = target.directives.map((d, i) => {
				const id = `${TEMPLATE_DIRECTIVES_PREFIX}${name}/${i}`;
				config.directives.set(id, d);
				return { specifier: id, names: d.components };
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
			config.directives.set(DIRECTIVES_ID, directives);
			options.directives = [
				{ specifier: DIRECTIVES_ID, names: directives.components },
			];
		}
	}

	return { config, options, error: null };
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

function target_of(
	specifier: string,
	files: FileMap,
	key: string
): TemplateTarget {
	const file = normalise(specifier);
	if (!files.has(file)) {
		if (specifier.startsWith('.') || specifier.startsWith('/')) {
			throw new Error(
				`${CONFIG_FILE}: ${key} points at '${specifier}', which does not exist`
			);
		}
		// a package specifier, the bundler resolves it and it gets no replacements
		return { file: null, specifier, components: [], directives: [] };
	}
	const components = scan_exports(file, files);
	const at = components.indexOf(DIRECTIVES_EXPORT);
	if (at < 0) return { file, specifier, components, directives: [] };
	components.splice(at, 1);
	const from = directives_source(file, files);
	if (from === null) {
		throw new Error(
			`${file} exports ${DIRECTIVES_EXPORT}, which must be a namespace re-export: export * as ${DIRECTIVES_EXPORT} from './directives.js'`
		);
	}
	const directives = target_of(from, files, `the directives of ${file}`);
	return { file, specifier, components, directives: [directives] };
}

/** maps a virtual id from compiled output to a workspace file or a bare specifier */
export function resolve_virtual(id: string, config: ResolvedConfig) {
	let target: TemplateTarget | null | undefined;
	if (id.startsWith(TEMPLATE_PREFIX)) {
		target = config.templates.get(id.slice(TEMPLATE_PREFIX.length));
	} else if (id === COMPONENTS_ID) {
		target = config.components;
	} else {
		target = config.directives.get(id);
	}
	if (!target) throw new Error(`'${id}' is not configured in ${CONFIG_FILE}`);
	return target;
}

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;

function module_script(source: string) {
	for (const match of source.matchAll(SCRIPT)) {
		const attrs = match[1];
		if (
			/\bmodule\b/.test(attrs) ||
			/context\s*=\s*["']module["']/.test(attrs)
		) {
			return { code: match[2], ts: /lang\s*=\s*["']ts["']/.test(attrs) };
		}
	}
	return null;
}

/** a module program, for a svelte file that of its module script, null without one */
function program_of(name: string, files: FileMap): acorn.Program | null {
	const source = files.get(name);
	if (source === undefined) return null;

	let code = source;
	if (name.endsWith('.svelte')) {
		const script = module_script(source);
		if (!script) return null;
		code = script.ts ? strip_types(script.code) : script.code;
	} else if (name.endsWith('.ts')) {
		code = strip_types(source);
	}

	try {
		return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
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

/** the module export * as directives from names, as a workspace path, null for none */
function directives_source(name: string, files: FileMap): string | null {
	const program = program_of(name, files);
	if (program === null) return null;
	for (const node of program.body) {
		if (node.type !== 'ExportAllDeclaration' || !node.exported) continue;
		const exported =
			node.exported.type === 'Identifier'
				? node.exported.name
				: String(node.exported.value);
		if (exported !== DIRECTIVES_EXPORT) continue;
		const from = String(node.source.value);
		return from.startsWith('.') ? relative_to(name, from) : from;
	}
	return null;
}

/** export names of a module, following star exports through the workspace, without evaluating it */
export function scan_exports(
	name: string,
	files: FileMap,
	seen = new Set<string>()
): string[] {
	if (seen.has(name)) return [];
	seen.add(name);

	const program = program_of(name, files);
	if (program === null) return [];

	const names: string[] = [];
	const add = (n: string) => {
		if (n !== 'default' && !names.includes(n)) names.push(n);
	};

	for (const node of program.body) {
		if (node.type === 'ExportNamedDeclaration') {
			const decl = node.declaration;
			if (decl?.type === 'VariableDeclaration') {
				for (const d of decl.declarations) {
					if (d.id.type === 'Identifier') add(d.id.name);
				}
			} else if (decl && 'id' in decl && decl.id) {
				add(decl.id.name);
			}
			for (const spec of node.specifiers) {
				add(
					spec.exported.type === 'Identifier'
						? spec.exported.name
						: String(spec.exported.value)
				);
			}
		} else if (node.type === 'ExportAllDeclaration') {
			if (node.exported) {
				add(
					node.exported.type === 'Identifier'
						? node.exported.name
						: String(node.exported.value)
				);
			} else {
				const from = String(node.source.value);
				if (from.startsWith('.')) {
					for (const n of scan_exports(relative_to(name, from), files, seen))
						add(n);
				}
			}
		}
	}

	return names;
}

export interface MarkdownResult {
	code: string;
	map: SourceMapV3;
}

export function compile_markdown(
	source: string,
	filename: string,
	options: MdsvexCompileOptions
): MarkdownResult {
	const result = compile(source, { ...options, sourcemap: true });
	const map = mappings_to_v3(
		result.mappings ?? [],
		source,
		result.code,
		filename
	);
	map.file = filename;
	map.sources = [filename];
	return { code: result.code, map };
}
