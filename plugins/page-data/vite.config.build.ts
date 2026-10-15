import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	build: {
		lib: {
			entry: {
				index: resolve(__dirname, 'tsc/index.js'),
			},
			formats: ['es'],
		},
		outDir: 'dist',
		reportCompressedSize: true,
		rollupOptions: {
			// a plugin runs against the mdsvex and svelte of the app, never a copy
			// node is imported on first use, by last_modified alone
			external: [/^@mdsvex\//, /^mdsvex(\/|$)/, /^svelte(\/|$)/, /^node:/],
			output: {
				entryFileNames: '[name].js',
			},
		},
	},
});
