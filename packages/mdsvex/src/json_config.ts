/**
 * mdsvex.config.json, the vite plugin options that are data, read into the
 * manifest the plugin writes, for a host that can not run vite
 */

import type { ComponentMode } from './compile';
import {
	MANIFEST_VERSION,
	type ManifestMath,
	type ManifestModule,
	type ManifestTemplate,
	type MdsvexManifest,
} from './manifest_core';
import type { SmartPunctuation } from './smart_punctuation';
import {
	COMPONENTS_ID,
	DIRECTIVES_EXPORT,
	DIRECTIVES_ID,
	PLUGIN_ID,
	TEMPLATE_DIRECTIVES_ID,
	TEMPLATE_ID,
} from './virtual_ids';

export const CONFIG_FILE = 'mdsvex.config.json';

/** the shape of mdsvex.config.json */
export interface JsonConfig {
	extensions?: string[];
	templates?: Record<
		string,
		string | { component: string; components?: string }
	>;
	components?: string | string[];
	component_mode?: ComponentMode;
	/** false renders code plain, a host may take highlighter options here */
	highlight?: boolean | Record<string, unknown>;
	unwrap_images?: boolean;
	/** on unless it is false, as the plugin has it */
	import_images?: boolean;
	/**
	 * the directives of each entry of the plugins option, json can not hold
	 * its handlers, so only the names and the module that exports them
	 */
	plugins?: { name?: string; module: string; directives: string[] }[];
	/** json holds no slug function, so only the default slug */
	heading_ids?: boolean;
	smart_punctuation?: SmartPunctuation;
	/** false leaves a math fence a code block, else the renderer and its options */
	math?:
		| false
		| { renderer?: 'temml' | 'katex'; options?: Record<string, unknown> };
}

/** the exports of a module as a host scanned them */
export interface ConfigExports {
	names: string[];
	/** the specifier of its export * as directives, null for none */
	directives: string | null;
}

/** what a host does with the files a config names */
export interface ConfigHost {
	/** the file spec names when importer imports it, null when there is none */
	resolve(spec: string, importer: string): string | null;
	scan(file: string): ConfigExports;
}

export interface JsonConfigOptions {
	/** the documents without an extensions key, the plugin default by default */
	extensions?: string[];
}

export interface ReadConfig {
	manifest: MdsvexManifest;
	/** each thing wrong with the config, in the order of its keys, the manifest leaves it out */
	errors: string[];
}

const DEFAULT_EXTENSIONS = ['.svx'];

const is_record = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** the smart_punctuation of a config, undefined when it is off, an error string when it is not the option */
function smart_of(smart: unknown): SmartPunctuation | undefined | string {
	if (smart === true) return true;
	if (smart === undefined || smart === false) return undefined;
	if (!is_record(smart))
		return 'smart_punctuation must be true, false or an object';
	const { quotes, dashes, ellipses } = smart;
	for (const [key, value] of [
		['dashes', dashes],
		['ellipses', ellipses],
	] as const)
		if (value !== undefined && typeof value !== 'boolean')
			return `smart_punctuation.${key} must be true or false`;
	if (
		quotes !== undefined &&
		typeof quotes !== 'boolean' &&
		!(
			Array.isArray(quotes) &&
			quotes.length === 4 &&
			quotes.every((q) => typeof q === 'string')
		)
	)
		return 'smart_punctuation.quotes must be true, false or four strings';
	if (quotes === false && dashes === false && ellipses === false)
		return undefined;
	return smart as SmartPunctuation;
}

/** the math of a config as a manifest holds it, undefined for the default, an error string when it is not the option */
function math_of(math: unknown): ManifestMath | false | undefined | string {
	if (math === undefined) return undefined;
	if (math === false) return false;
	if (!is_record(math)) return 'math must be an object or false';
	const { renderer, options } = math;
	if (renderer !== undefined && renderer !== 'temml' && renderer !== 'katex')
		return `math.renderer must be 'temml' or 'katex', it is ${JSON.stringify(renderer)}`;
	if (options !== undefined && !is_record(options))
		return 'math.options must be an object';
	if (options === undefined || Object.keys(options).length === 0)
		return renderer === 'katex' ? { renderer } : undefined;
	return { renderer: renderer ?? 'temml', options };
}

/**
 * the manifest of a mdsvex.config.json at file, as the plugin would write it
 * for the same options, host resolves and scans the modules it names
 */
export function read_json_config(
	config: unknown,
	file: string,
	root: string,
	host: ConfigHost,
	options: JsonConfigOptions = {}
): ReadConfig {
	const errors: string[] = [];
	const fail = (message: string) => errors.push(`${CONFIG_FILE}: ${message}`);
	const json: JsonConfig = is_record(config) ? config : {};

	let extensions = options.extensions ?? DEFAULT_EXTENSIONS;
	if (json.extensions !== undefined) {
		if (
			Array.isArray(json.extensions) &&
			json.extensions.every((e) => typeof e === 'string')
		)
			extensions = json.extensions.map((e) =>
				e.startsWith('.') ? e : '.' + e
			);
		else fail('extensions must be a list of file extensions');
	}

	const manifest: MdsvexManifest = {
		version: MANIFEST_VERSION,
		root,
		extensions,
		component_mode: json.component_mode || 'markdown',
		frontmatter_parse: false,
		directive_plugins: false,
		select_template: false,
		templates: {},
		components: [],
		directives: [],
		documents: {},
		highlight: json.highlight === false ? false : 'twinkleplop',
	};

	for (const key of ['unwrap_images', 'heading_ids'] as const) {
		const value = json[key];
		if (value === true) manifest[key] = true;
		else if (value !== undefined && value !== false)
			fail(`${key} must be true or false`);
	}
	if (json.import_images !== false) manifest.import_images = true;

	const smart = smart_of(json.smart_punctuation);
	if (typeof smart === 'string') fail(smart);
	else if (smart !== undefined) manifest.smart_punctuation = smart;

	const math = math_of(json.math);
	if (typeof math === 'string') fail(math);
	else if (math !== undefined) manifest.math = math;

	/** the file of spec, an error and null when nothing is there */
	const resolve = (spec: string, importer: string, key: string) => {
		const found = host.resolve(spec, importer);
		if (found === null)
			fail(`${key} points at '${spec}', which does not exist`);
		return found;
	};

	/** the element names of a module, and its directives module with id */
	const module_of = (module: string, id: string) => {
		const scanned = host.scan(module);
		const names = scanned.names.filter((n) => n !== DIRECTIVES_EXPORT);
		let directives: ManifestModule | null = null;
		if (scanned.directives === null) {
			if (scanned.names.includes(DIRECTIVES_EXPORT))
				errors.push(
					`${module} exports ${DIRECTIVES_EXPORT}, which must be a namespace re-export: export * as ${DIRECTIVES_EXPORT} from './directives.js'`
				);
		} else {
			const from = resolve(
				scanned.directives,
				module,
				`the directives of ${module}`
			);
			if (from !== null)
				directives = {
					id,
					file: from,
					names: host.scan(from).names.filter((n) => n !== DIRECTIVES_EXPORT),
				};
		}
		return { names, directives };
	};

	const templates = is_record(json.templates) ? json.templates : {};
	for (const [name, entry] of Object.entries(templates)) {
		const pair = is_record(entry);
		const spec = pair ? entry.component : entry;
		if (typeof spec !== 'string') {
			fail(`templates.${name} must name a component`);
			continue;
		}
		const found = resolve(spec, file, `templates.${name}`);
		if (found === null) continue;
		const base = TEMPLATE_DIRECTIVES_ID + name;
		const own = module_of(found, base);
		const template: ManifestTemplate = {
			id: TEMPLATE_ID + name,
			file: found,
			components: own.names.filter((n) => n !== 'default'),
			extra: null,
			directives: own.directives === null ? [] : [own.directives],
		};
		const extra_spec = pair ? entry.components : undefined;
		if (typeof extra_spec === 'string') {
			const extra = resolve(extra_spec, file, `templates.${name}.components`);
			if (extra !== null) {
				const more = module_of(extra, base + '/components');
				template.extra = {
					id: TEMPLATE_ID + name,
					file: extra,
					names: more.names.filter((n) => n !== 'default'),
				};
				if (more.directives !== null) template.directives.push(more.directives);
			}
		}
		manifest.templates[name] = template;
	}

	const written =
		json.components === undefined
			? []
			: Array.isArray(json.components)
				? json.components
				: [json.components];
	const many = written.length !== 1;
	written.forEach((spec, i) => {
		const key = many ? `components[${i}]` : 'components';
		if (typeof spec !== 'string') return fail(`${key} must name a module`);
		const found = resolve(spec, file, key);
		if (found === null) return;
		const suffix = many ? '/' + i : '';
		const own = module_of(found, DIRECTIVES_ID + suffix);
		manifest.components.push({
			id: COMPONENTS_ID + suffix,
			file: found,
			names: own.names,
		});
		if (own.directives !== null) manifest.directives.push(own.directives);
	});

	if (json.plugins !== undefined) {
		if (!Array.isArray(json.plugins)) fail('plugins must be a list');
		else {
			if (json.plugins.length !== 0) manifest.plugin_data = true;
			json.plugins.forEach((plugin, i) => {
				const key = `plugins[${i}]`;
				if (
					typeof plugin?.module !== 'string' ||
					!Array.isArray(plugin.directives) ||
					plugin.directives.some((n) => typeof n !== 'string')
				)
					return fail(`${key} needs a module and a list of directive names`);
				if (plugin.directives.length === 0) return;
				const found = resolve(plugin.module, file, `${key}.module`);
				if (found === null) return;
				// the plugin names its directives, the exports of the module are not scanned for them
				(manifest.plugins ??= []).push({
					name: plugin.name ?? plugin.module,
					directives: {
						id: PLUGIN_ID + i,
						file: found,
						names: plugin.directives,
					},
					components: null,
				});
			});
		}
	}

	return { manifest, errors };
}
