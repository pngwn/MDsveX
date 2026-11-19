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
			external: [/^@mdsvex\//, /^mdsvex(\/|$)/, /^svelte(\/|$)/],
			output: {
				entryFileNames: '[name].js',
			},
		},
	},
});
