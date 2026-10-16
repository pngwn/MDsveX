import { defineConfig } from "vite";
import { resolve } from "path";

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
			// dependencies stay imports, the command bundles them instead
			external: (id) =>
				!id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0"),
			output: {
				entryFileNames: "[name].js",
			},
		},
	},
});
