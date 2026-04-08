import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			formats: ["cjs"],
			fileName: "server",
		},
		outDir: "dist",
		target: "node20",
		ssr: true,
		minify: false,
		rollupOptions: {
			external: ["typescript"],
			output: {
				entryFileNames: "server.cjs",
			},
		},
	},
	ssr: {
		// Bundle all dependencies into the server binary
		noExternal: true,
	},
});
