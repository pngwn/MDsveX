import { script_json } from './frontmatter';

/**
 * the export of a compiled document that holds what its plugins left in
 * ctx.data, and the prop a template takes it as
 */
export const PLUGIN_DATA_EXPORT = 'plugin_data';

/**
 * what plugins left in ctx.data, each under the name of its plugin, a plugin
 * types its own key by declaration merging
 *
 * @example
 * declare module 'mdsvex' {
 *   interface PluginData {
 *     toc: { headings: { depth: number; text: string; id?: string }[] };
 *   }
 * }
 */
export interface PluginData {
	[plugin: string]: unknown;
}

/** a plugin left a value in ctx.data that json can not hold */
export class PluginDataError extends Error {
	plugin: string;
	/** where the value is in the data of the plugin, headings[2].id */
	path: string;

	constructor(plugin: string, path: string, found: string) {
		super(
			`[mdsvex] plugin ${JSON.stringify(plugin)} left ${found} at ${path || 'the top'} of its ctx.data, ` +
				'which is exported as json: plain objects, arrays, strings, finite numbers, booleans and null'
		);
		this.name = 'PluginDataError';
		this.plugin = plugin;
		this.path = path;
	}
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
const get_proto = Object.getPrototypeOf;
const object_proto = Object.prototype;

/** what a value that is not json is called in the error */
function found_of(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'object') {
		const name = get_proto(value)?.constructor?.name;
		return typeof name === 'string' && name !== ''
			? `a ${name}`
			: 'an object with a prototype';
	}
	return `a ${typeof value}`;
}

function check(
	plugin: string,
	value: unknown,
	path: string,
	open: unknown[]
): void {
	if (value === null) return;
	const type = typeof value;
	if (type === 'string' || type === 'boolean') return;
	if (type === 'number') {
		if (Number.isFinite(value)) return;
		throw new PluginDataError(plugin, path, found_of(value));
	}
	if (type !== 'object')
		throw new PluginDataError(plugin, path, found_of(value));
	if (open.includes(value))
		throw new PluginDataError(
			plugin,
			path,
			'a reference to an object it is in'
		);
	if (Array.isArray(value)) {
		open.push(value);
		// by index, a hole reads as undefined
		for (let i = 0; i < value.length; i++)
			check(plugin, value[i], `${path}[${i}]`, open);
		open.pop();
		return;
	}
	const proto = get_proto(value);
	if (proto !== null && proto !== object_proto)
		throw new PluginDataError(plugin, path, found_of(value));
	if (Object.getOwnPropertySymbols(value).length !== 0)
		throw new PluginDataError(plugin, path, 'a symbol key');
	open.push(value);
	const object = value as Record<string, unknown>;
	for (const key of Object.keys(object)) {
		const member = object[key];
		// json leaves the key out, which reads the same
		if (member === undefined) continue;
		check(
			plugin,
			member,
			IDENT.test(key)
				? path === ''
					? key
					: path + '.' + key
				: `${path}[${JSON.stringify(key)}]`,
			open
		);
	}
	open.pop();
}

/**
 * the module code that exports what plugins left, throws a PluginDataError
 * for the first value json would drop or change
 */
export function plugin_data_export(data: PluginData): string {
	for (const plugin of Object.keys(data)) check(plugin, data[plugin], '', []);
	return 'export const ' + PLUGIN_DATA_EXPORT + ' = ' + script_json(data) + ';';
}
