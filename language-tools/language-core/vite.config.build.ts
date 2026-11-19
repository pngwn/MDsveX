import { defineConfig } from "vite";
import { isAbsolute, resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			formats: ["es"],
			fileName: "index",
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
