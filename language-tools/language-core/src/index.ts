export { create_pfm_language_plugin, is_document } from "./language_plugin.js";
export { create_svelte_language_plugin } from "./svelte_plugin.js";
export {
	CONFIG_FILE,
	create_config_loader,
	document_options,
	from_json,
	resolve_specifier,
	scan_exports,
} from "./config.js";

export type {
	PfmLanguagePluginOptions,
	PfmVirtualCode,
	TemplateChoice,
} from "./language_plugin.js";
export { template_value_at } from "@mdsvex/source-map/pfm-to-svelte";
export {
	completion_context,
	probe_for,
	props_of,
	template_named,
} from "./completions.js";
export type { CompletionContext, Prop } from "./completions.js";
export type {
	ConfigLoader,
	ConfigLoaderOptions,
	DocumentOptions,
	JsonConfig,
	LoadedConfig,
} from "./config.js";
