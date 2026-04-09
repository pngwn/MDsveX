import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			formats: ["cjs"],
			fileName: "index",
		},
		outDir: "lib",
		target: "node20",
		ssr: true,
		minify: false,
		rollupOptions: {
			external: ["typescript"],
			output: {
				entryFileNames: "index.cjs",
			},
		},
	},
	ssr: {
		noExternal: true,
	},
});
