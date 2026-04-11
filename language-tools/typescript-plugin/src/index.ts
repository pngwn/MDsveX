/**
 * PFM TypeScript Plugin.
 *
 * Teaches tsserver how to resolve .pfm imports by running them through
 * the PFM LanguagePlugin. This enables type-checking of .pfm imports
 * in .ts and .svelte files.
 *
 * Usage in tsconfig.json:
 *   { "compilerOptions": { "plugins": [{ "name": "@pfm/typescript-plugin" }] } }
 */

import { createLanguageServicePlugin } from "@volar/typescript/lib/quickstart/createLanguageServicePlugin.js";
import { create_pfm_language_plugin, create_svelte_language_plugin } from "@pfm/language-core";

// TS plugins must export a factory function via module.exports
// (CJS convention that tsserver expects)
module.exports = createLanguageServicePlugin((_ts, info) => {
	console.log("[PFM TS Plugin] Loaded! Project:", info.project.getProjectName());
	return {
		languagePlugins: [create_pfm_language_plugin(), create_svelte_language_plugin()],
	};
});
