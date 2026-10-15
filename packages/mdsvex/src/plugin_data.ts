import { script_json } from './frontmatter';

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

/** a plugin wrote a value json can not hold, thrown at the write */
export { PluginDataError } from '@mdsvex/parse';

/** the module code that exports what plugins left, checked as json when written */
export function plugin_data_export(data: PluginData): string {
	return 'export const ' + PLUGIN_DATA_EXPORT + ' = ' + script_json(data) + ';';
}
