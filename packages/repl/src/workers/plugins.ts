/**
 * the plugins and directives a workspace holds by where its files are, which
 * the repl registers as a config would: plugins/<name>/plugin.js default
 * exports a plugin, a .svelte file beside it is a directive of that plugin
 * named after the file, and directives/<name>.svelte is a directive on its own
 */

import type { Bundle } from 'mdsvex/compile';
import { VIRTUAL } from './constants';

export const PLUGINS_DIR = 'plugins/';
export const DIRECTIVES_DIR = 'directives/';

/** the module the bundler builds to run the plugin files */
export const PLUGINS_ENTRY = '__plugins.js';
/** the module that exports each file of directives/ under its name */
export const DIRECTIVES_MODULE = '__directives.js';

const PLUGIN_FILE = /^plugins\/([^/]+)\/plugin\.(?:js|ts)$/;
const PLUGIN_COMPONENT = /^plugins\/([^/]+)\/([^/]+)\.svelte$/;
const DIRECTIVE = /^directives\/([^/]+)\.svelte$/;
/** a directive is imported under its name, so the name has to be one javascript can bind */
const NAME = /^[A-Za-z_$][\w$]*$/;

export interface NamedFile {
	name: string;
	file: string;
}

export interface FoundPlugin {
	/** the name of its folder */
	name: string;
	/** null for a folder that only holds components */
	file: string | null;
	components: NamedFile[];
}

/** the plugin folders of a workspace, in the order of their names */
export function find_plugins(files: Iterable<string>): FoundPlugin[] {
	const found = new Map<string, FoundPlugin>();
	const of = (name: string) => {
		let plugin = found.get(name);
		if (plugin === undefined)
			found.set(name, (plugin = { name, file: null, components: [] }));
		return plugin;
	};
	for (const file of files) {
		const plugin = PLUGIN_FILE.exec(file);
		if (plugin !== null) {
			of(plugin[1]).file = file;
			continue;
		}
		const component = PLUGIN_COMPONENT.exec(file);
		if (component !== null && NAME.test(component[2]))
			of(component[1]).components.push({ name: component[2], file });
	}
	const list = [...found.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
	for (const plugin of list)
		plugin.components.sort((a, b) => (a.name < b.name ? -1 : 1));
	return list;
}

/** the files of directives/, each a directive named after its file */
export function find_directives(files: Iterable<string>): NamedFile[] {
	const found: NamedFile[] = [];
	for (const file of files) {
		const match = DIRECTIVE.exec(file);
		if (match !== null && NAME.test(match[1]))
			found.push({ name: match[1], file });
	}
	return found.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** a module that exports each component under its name */
export function components_module(components: NamedFile[], star?: string) {
	let code = star === undefined ? '' : `export * from ${JSON.stringify(star)};\n`;
	for (const { name, file } of components)
		code += `export { default as ${name} } from ${JSON.stringify(`${VIRTUAL}/${file}`)};\n`;
	return code;
}

/** what each plugin file exports, by the name of its folder, in order */
export function plugins_entry(found: FoundPlugin[]): string {
	let imports = '';
	const entries: string[] = [];
	found.forEach((plugin, i) => {
		if (plugin.file === null) {
			entries.push(`[${JSON.stringify(plugin.name)}, {}]`);
			return;
		}
		imports += `import p${i} from ${JSON.stringify('./' + plugin.file)};\n`;
		entries.push(`[${JSON.stringify(plugin.name)}, p${i}]`);
	});
	return `${imports}export default [${entries.join(', ')}];\n`;
}

export interface LoadedPlugins {
	bundles: Bundle[];
	/** the modules made for the directive components, by workspace name */
	modules: Map<string, string>;
}

export const NO_PLUGINS: LoadedPlugins = { bundles: [], modules: new Map() };

const BUNDLE_KEYS = ['name', 'module', 'directives', 'parse', 'components', 'fences'];

const is_record = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * the plugin a file exports as mdsvex takes it, a function is called for its
 * plugin, and an object with none of the keys of a bundle is a parse plugin.
 * The stream preview does the same to each export, see stream_harness
 */
export function as_bundle(name: string, exported: unknown): Bundle {
	const made = typeof exported === 'function' ? exported() : exported;
	if (!is_record(made))
		throw new Error(
			`${PLUGINS_DIR}${name}/plugin.js must default export a plugin, or a function that returns one`
		);
	const bundle = BUNDLE_KEYS.some((key) => key in made) ? made : { parse: made };
	return {
		...bundle,
		name: typeof bundle.name === 'string' && bundle.name !== '' ? bundle.name : name,
	};
}

let loaded: { key: string; plugins: LoadedPlugins } | null = null;

/**
 * runs the built plugins module and gives each plugin the module of the
 * components in its folder, the same code and files give the same bundles, as
 * compile caches by them
 */
export async function load_plugins(
	code: string,
	found: FoundPlugin[]
): Promise<LoadedPlugins> {
	const key = code + '\0' + JSON.stringify(found);
	if (loaded?.key === key) return loaded.plugins;

	const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
	let exported: [string, unknown][];
	try {
		exported = (await import(/* @vite-ignore */ url)).default;
	} finally {
		URL.revokeObjectURL(url);
	}

	const bundles: Bundle[] = [];
	const modules = new Map<string, string>();
	for (const [name, value] of exported) {
		const bundle = as_bundle(name, value);
		const components = found.find((p) => p.name === name)?.components ?? [];
		if (components.length !== 0) {
			const directives: Bundle['directives'] = {};
			for (const component of components) directives[component.name] = {};
			bundle.directives = { ...directives, ...bundle.directives };
			// its own module comes along, a component of the folder wins a name
			const module = `__plugin_${name}.js`;
			modules.set(module, components_module(components, bundle.module));
			bundle.module = `${VIRTUAL}/${module}`;
		}
		// a folder with nothing in it yet is no plugin
		if (Object.keys(bundle).length > 1) bundles.push(bundle);
	}

	const plugins = { bundles, modules };
	loaded = { key, plugins };
	return plugins;
}
