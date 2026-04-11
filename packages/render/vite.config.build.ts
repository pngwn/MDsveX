import { defineConfig } from "vite";
import { resolve } from "path";
// import terser from "@rollup/plugin-terser";

export default defineConfig({
	build: {
		lib: {
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				html_cursor: resolve(__dirname, "src/html_cursor.ts"),
				component: resolve(__dirname, "src/component.ts"),
				mappings: resolve(__dirname, "src/mappings.ts"),
				sourcemap: resolve(__dirname, "src/sourcemap.ts"),
			},
			formats: ["es"],
		},
		outDir: "dist",
		reportCompressedSize: true,
		rollupOptions: {
			external: [/^@mdsvex\/parse/],
			output: {
				entryFileNames: "[name].js",
				plugins: [
					// terser({
					// 	mangle: true,
					// 	compress: true,
					// 	format: { comments: false },
					// }),
				],
			},
		},
	},
});
