import * as acorn from 'acorn';
import { compile, type CompileOptions } from 'mdsvex';
import { mappings_to_v3, type SourceMapV3 } from '@mdsvex/render/sourcemap';
import { strip_types } from './typescript_strip_types';

export const CONFIG_FILE = 'mdsvex.config.json';
export const TEMPLATE_PREFIX = 'mdsvex:template/';
export const COMPONENTS_ID = 'mdsvex:components';

const DEFAULT_EXTENSIONS = ['.svx', '.md'];

export type ComponentMode = 'markdown' | 'all';

/** the shape of mdsvex.config.json, mirroring the vite plugin options */
export interface ReplConfig {
	extensions?: string[];
	templates?: Record<
		string,
		string | { component: string; components?: string }
	>;
	components?: string;
	component_mode?: ComponentMode;
}

interface TemplateTarget {
	/** the workspace file, or null when the specifier points outside it */
	file: string | null;
	specifier: string;
	components: string[];
}

export interface ResolvedConfig {
	extensions: string[];
	templates: Map<string, TemplateTarget>;
	components: TemplateTarget | null;
	component_mode: ComponentMode;
}

/** template and component options follow the design doc ahead of core, which ignores them for now */
export interface MdsvexCompileOptions extends CompileOptions {
	templates?: Record<string, { specifier: string; components?: string[] }>;
	default_template?: string;
	components?: { specifier: string; names: string[] }[];
	component_mode?: ComponentMode;
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
		component_mode: 'markdown',
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

	if (config.templates.size > 0) {
		options.templates = {};
		for (const [name, target] of config.templates) {
			options.templates[name] = {
				specifier: TEMPLATE_PREFIX + name,
				components: target.components,
			};
		}
		if (config.templates.has('default')) options.default_template = 'default';
	}

	if (config.components) {
		options.components = [
			{ specifier: COMPONENTS_ID, names: config.components.components },
		];
	}

	return { config, options, error: null };
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
		return { file: null, specifier, components: [] };
	}
	return { file, specifier, components: scan_exports(file, files) };
}

/** maps a virtual id from compiled output to a workspace file or a bare specifier */
export function resolve_virtual(id: string, config: ResolvedConfig) {
	let target: TemplateTarget | null | undefined;
	if (id.startsWith(TEMPLATE_PREFIX)) {
		target = config.templates.get(id.slice(TEMPLATE_PREFIX.length));
	} else if (id === COMPONENTS_ID) {
		target = config.components;
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

/** export names of a module, following star exports through the workspace, without evaluating it */
export function scan_exports(
	name: string,
	files: FileMap,
	seen = new Set<string>()
): string[] {
	if (seen.has(name)) return [];
	seen.add(name);

	const source = files.get(name);
	if (source === undefined) return [];

	let code = source;
	if (name.endsWith('.svelte')) {
		const script = module_script(source);
		if (!script) return [];
		code = script.ts ? strip_types(script.code) : script.code;
	} else if (name.endsWith('.ts')) {
		code = strip_types(source);
	}

	let program: acorn.Program;
	try {
		program = acorn.parse(code, {
			ecmaVersion: 'latest',
			sourceType: 'module',
		});
	} catch (e) {
		throw new Error(
			`could not scan the exports of ${name}: ${(e as Error).message}`
		);
	}

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
					const target = new URL(from, `file:///${name}`).pathname.slice(1);
					for (const n of scan_exports(target, files, seen)) add(n);
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
