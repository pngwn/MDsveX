import { defineConfig } from "vite";
import { resolve } from "path";
// import terser from '@rollup/plugin-terser';

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
			output: {
				entryFileNames: "[name].js",
				plugins: [
					// terser({
					// 	// compress: true,
					// 	mangle: true,
					// 	format: { comments: false },
					// }),
				],
			},
		},
	},
});
