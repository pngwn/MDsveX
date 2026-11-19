import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/command.ts"),
			formats: ["cjs"],
			fileName: "server",
		},
		outDir: "dist",
		// the lib build of index.js writes to dist first
		emptyOutDir: false,
		target: "node20",
		ssr: true,
		minify: false,
		rollupOptions: {
			// the vite plugin half of mdsvex loads vite lazily, the editor never reaches it
			external: ["typescript", "vite"],
			output: {
				entryFileNames: "server.cjs",
				// the bin of the package
				banner: "#!/usr/bin/env node",
			},
		},
	},
	ssr: {
		// Bundle all dependencies into the server binary
		noExternal: true,
	},
});
