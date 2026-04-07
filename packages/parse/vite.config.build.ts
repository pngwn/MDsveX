import { defineConfig } from "vite";
import { resolve } from "path";
// import terser from "@rollup/plugin-terser";

export default defineConfig({
	build: {
		lib: {
			entry: {
				main: resolve(__dirname, "tsc/main.js"),
				opcodes: resolve(__dirname, "tsc/opcodes.js"),
				"tree-builder": resolve(__dirname, "tsc/tree_builder.js"),
				cursor: resolve(__dirname, "tsc/cursor.js"),
				"wire-tree-builder": resolve(__dirname, "tsc/wire_tree_builder.js"),
				utils: resolve(__dirname, "tsc/utils.js"),
				"buf-utils": resolve(__dirname, "tsc/buf_utils.js"),
			},
			formats: ["es"],
		},
		outDir: "dist",
		reportCompressedSize: true,
		rollupOptions: {
			output: {
				entryFileNames: "[name].js",
				// plugins: [terser()],
			},
		},
	},
});
