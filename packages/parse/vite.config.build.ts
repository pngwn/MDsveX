import { defineConfig } from 'vite';
import { resolve } from 'path';
import terser from '@rollup/plugin-terser';

export default defineConfig({
	build: {
		lib: {
			entry: {
				main: resolve(__dirname, 'src/main.ts'),
				opcodes: resolve(__dirname, 'src/opcodes.ts'),
				'tree-builder': resolve(__dirname, 'src/tree_builder.ts'),
				'document-builder': resolve(__dirname, 'src/document_builder.ts'),
				cursor: resolve(__dirname, 'src/cursor.ts'),
				utils: resolve(__dirname, 'src/utils.ts'),
			},
			formats: ['es'],
		},
		outDir: 'dist',
		reportCompressedSize: true,
		rollupOptions: {
			output: {
				entryFileNames: '[name].js',
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
