import { script_json } from './frontmatter.js';

/**
 * the export of a compiled document that holds what its plugins wrote with
 * ctx.set and ctx.add, and the prop a template takes it as
 */
export const PLUGIN_DATA_EXPORT = 'plugin_data';

/**
 * what plugins wrote with ctx.set and ctx.add, each under the name of its
 * plugin, a plugin types its own key by declaration merging
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

/**
 * what getContext(Symbol.for('mdsvex.plugin_data')) gives a component in a
 * compiled document with plugin data or in a stream, current is the data and
 * changes while streaming, import it as a type, a value import of
 * mdsvex/compile puts the compiler in the bundle
 *
 * @example
 * // in the script of a component, current.toc has the type the plugin gave its key
 * const plugin_data = getContext<PluginDataContext | undefined>(
 *   Symbol.for('mdsvex.plugin_data')
 * );
 * plugin_data?.current?.toc?.headings;
 */
export interface PluginDataContext {
	readonly current: Readonly<PluginData> | undefined;
}

/** a plugin wrote a value json can not hold, thrown at the write */
export { PluginDataError } from '@mdsvex/parse';

/** the module code that exports what plugins left, checked as json when written */
export function plugin_data_export(data: PluginData): string {
	return 'export const ' + PLUGIN_DATA_EXPORT + ' = ' + script_json(data) + ';';
}
