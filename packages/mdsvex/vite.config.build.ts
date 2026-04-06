import { defineConfig } from "vite";
import { resolve } from "path";
// import terser from '@rollup/plugin-terser';

export default defineConfig({
	build: {
		lib: {
			entry: {
				main: resolve(__dirname, "src/main.ts"),
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
