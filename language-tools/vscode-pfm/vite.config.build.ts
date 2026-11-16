import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/extension.ts"),
			formats: ["cjs"],
			fileName: "extension",
		},
		outDir: "dist",
		target: "node20",
		ssr: true,
		minify: false,
		rollupOptions: {
			external: ["vscode"],
			output: {
				entryFileNames: "extension.cjs",
				chunkFileNames: (chunk) =>
					chunk.facadeModuleId?.includes("/migrate/") ? "migrate.cjs" : "[name].cjs",
			},
		},
	},
	ssr: {
		noExternal: true,
	},
});
