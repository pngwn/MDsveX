import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: {
				main: resolve(__dirname, "tsc/main.js"),
			},
			formats: ["es"],
		},
		outDir: "dist",
		reportCompressedSize: true,
		rollupOptions: {
			// keep the remark/unified ecosystem external
			external: [/^remark/, /^unified/, /^mdast/, /^micromark/, /^unist/],
			output: {
				entryFileNames: "[name].js",
			},
		},
	},
});
