import { defineConfig } from "vite";
import { resolve } from "path";
// import terser from '@rollup/plugin-terser';

export default defineConfig({
	build: {
		lib: {
			entry: {
				main: resolve(__dirname, "tsc/main.js"),
				compile: resolve(__dirname, "tsc/compile.js"),
				highlight: resolve(__dirname, "tsc/highlight.js"),
				highlight_languages: resolve(__dirname, "tsc/highlight_languages.js"),
			},
			formats: ["es"],
		},
		outDir: "dist",
		reportCompressedSize: true,
		rollupOptions: {
			// the plugin loads these on first use, a compile never does, the
			// highlight entry imports twinkleplop languages by package name
			external: ["vite", "es-module-lexer", /^node:/, /^@twinkleplop\//],
			output: {
				entryFileNames: "[name].js",
				plugins: [
					// terser({
					// 	// compress: true,
					// 	mangle: true,
					// 	format: { comments: false },
					// }),
				],
			},
		},
	},
});
