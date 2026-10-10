// add mdsvex/globals to compilerOptions.types for the imports only the vite plugin resolves

declare module '*?metadata' {
	/** the frontmatter of the document, undefined when it has none */
	export const metadata: Record<string, unknown> | undefined;
	export default metadata;
}
