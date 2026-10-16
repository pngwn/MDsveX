/**
 * what a host that is not vite needs beside compile to do the job of the vite
 * plugin, free of vite and of node like the compile entry
 */
export { module_script, read_exports } from './read_exports';
export type { ScanKind, ScannedExports, StripTypes } from './read_exports';
export {
	COMPONENTS_ID,
	DATA_ID,
	DIRECTIVES_EXPORT,
	DIRECTIVES_ID,
	METADATA_ID,
	PLUGIN_COMPONENTS_ID,
	PLUGIN_ID,
	TEMPLATE_DIRECTIVES_ID,
	TEMPLATE_ID,
} from './virtual_ids';
export { data_module, metadata_module, read_metadata } from './query_modules';
export { CONFIG_FILE, read_json_config } from './json_config';
export type {
	ConfigExports,
	ConfigHost,
	JsonConfig,
	JsonConfigOptions,
	ReadConfig,
} from './json_config';
export {
	MANIFEST_PATH,
	MANIFEST_VERSION,
	manifest_json,
	manifest_resolver,
	queue_manifest,
} from './manifest_core';
export type {
	ManifestMath,
	ManifestModule,
	ManifestOutput,
	ManifestPlugin,
	ManifestTemplate,
	MdsvexManifest,
} from './manifest_core';
