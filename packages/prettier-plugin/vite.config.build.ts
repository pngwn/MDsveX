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
			// prettier is the one the user runs, the parser is a dependency, and
			// node builtins are only loaded in node, to find the mdsvex manifest
			external: [/^prettier(\/|$)/, /^@mdsvex\//, /^node:/],
			output: {
				entryFileNames: '[name].js',
			},
		},
	},
});
