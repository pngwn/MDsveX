// add mdsvex/globals to compilerOptions.types for the imports only the vite plugin resolves

declare module '*?metadata' {
	/** the frontmatter of the document, undefined when it has none */
	export const metadata: Record<string, unknown> | undefined;
	export default metadata;
}

declare module '*?data' {
	/** the frontmatter of the document, undefined when it has none */
	export const metadata: Record<string, unknown> | undefined;
	/** what plugins left for the document, by plugin name, undefined when they left nothing */
	export const plugin_data: import('mdsvex').PluginData | undefined;
	const exports: {
		metadata: typeof metadata;
		plugin_data: typeof plugin_data;
	};
	export default exports;
}
