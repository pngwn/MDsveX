import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: {
				main: resolve(__dirname, "tsc/main.js"),
				bin: resolve(__dirname, "tsc/bin.js"),
			},
			formats: ["es"],
		},
		outDir: "dist",
		reportCompressedSize: true,
		rollupOptions: {
			// keep the remark unified ecosystem and the js parser external
			external: [
				/^remark/,
				/^unified/,
				/^mdast/,
				/^micromark/,
				/^unist/,
				/^acorn/,
				/^@sveltejs\/acorn-typescript/,
				/^node:/,
			],
			output: {
				entryFileNames: "[name].js",
				banner: (chunk) => (chunk.name === "bin" ? "#!/usr/bin/env node" : ""),
			},
		},
	},
});
