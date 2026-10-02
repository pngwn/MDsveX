/**
 * PFM TypeScript Plugin.
 *
 * Teaches tsserver how to resolve .pfm imports by running them through
 * the PFM LanguagePlugin. This enables type-checking of .pfm imports
 * in .ts and .svelte files.
 *
 * Usage in tsconfig.json:
 *   { "compilerOptions": { "plugins": [{ "name": "@mdsvex/typescript-plugin" }] } }
 */

import { createLanguageServicePlugin } from "@volar/typescript/lib/quickstart/createLanguageServicePlugin.js";
import { create_pfm_language_plugin, create_svelte_language_plugin } from "@mdsvex/language-core";

// TS plugins must export a factory function via module.exports
// (CJS convention that tsserver expects)
module.exports = createLanguageServicePlugin((ts, info) => {
	console.log("[PFM TS Plugin] Loaded! Project:", info.project.getProjectName());
	return {
		languagePlugins: [
			// typescript reads the exports of templates a mdsvex.config.json names
			create_pfm_language_plugin({ typescript: ts as any }),
			// two plugins claiming .svelte break its imports from .ts files
			...(svelte_plugin_loaded(info) ? [] : [create_svelte_language_plugin()]),
		],
	};
});

const SVELTE_PLUGIN = "typescript-svelte-plugin";

/** the svelte extension or the tsconfig loads the svelte typescript plugin */
function svelte_plugin_loaded(info: {
	project: {
		projectService: { globalPlugins?: readonly string[] };
		getCompilerOptions(): { plugins?: unknown };
	};
}): boolean {
	if (info.project.projectService.globalPlugins?.includes(SVELTE_PLUGIN)) return true;
	const plugins = info.project.getCompilerOptions().plugins;
	return (
		Array.isArray(plugins) &&
		plugins.some((p) => (p as { name?: unknown })?.name === SVELTE_PLUGIN)
	);
}
