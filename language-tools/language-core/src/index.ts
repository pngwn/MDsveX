export { create_pfm_language_plugin, is_document } from "./language_plugin";
export { create_svelte_language_plugin } from "./svelte_plugin";
export {
	CONFIG_FILE,
	create_config_loader,
	document_options,
	from_json,
	resolve_specifier,
	scan_exports,
} from "./config";

export type { PfmLanguagePluginOptions, PfmVirtualCode } from "./language_plugin";
export type {
	ConfigLoader,
	ConfigLoaderOptions,
	DocumentOptions,
	JsonConfig,
	LoadedConfig,
} from "./config";
