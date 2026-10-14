// documents import these virtual ids, so output holds no paths and the graph edge is the real file
export const COMPONENTS_ID = 'mdsvex:components';
export const DIRECTIVES_ID = 'mdsvex:directives';
/** the namespace export of a replacement module that holds its directives */
export const DIRECTIVES_EXPORT = 'directives';
export const TEMPLATE_ID = 'mdsvex:template/';
export const TEMPLATE_DIRECTIVES_ID = 'mdsvex:template-directives/';
/** the directives module of a plugin, its index in the plugins option follows */
export const PLUGIN_ID = 'mdsvex:plugin/';
/** the element replacements of a plugin, its index follows */
export const PLUGIN_COMPONENTS_ID = 'mdsvex:plugin-components/';
/** a document imported with ?metadata, the path of the document and .js follow */
export const METADATA_ID = 'mdsvex:metadata:';
/** a document imported with ?data, the path of the document and .js follow */
export const DATA_ID = 'mdsvex:data:';
