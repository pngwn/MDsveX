import { defineConfig } from "vite";
import { isAbsolute, resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				pfm_to_svelte: resolve(__dirname, "src/pfm_to_svelte.ts"),
				v3_to_volar: resolve(__dirname, "src/v3_to_volar.ts"),
				compose_mappings: resolve(__dirname, "src/compose_mappings.ts"),
			},
			formats: ["es"],
		},
		outDir: "dist",
		target: "node20",
		minify: false,
		rollupOptions: {
			// dependencies stay imports, only this package is built
			external: (id) =>
				!id.startsWith(".") && !isAbsolute(id) && !id.startsWith("\0"),
			output: {
				entryFileNames: "[name].js",
			},
		},
	},
});
