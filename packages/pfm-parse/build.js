import { build } from 'esbuild';

build({
	entryPoints: ['src/main.ts'],
	bundle: true,
	minify: true,
	target: 'es2020',
	format: 'esm',
	outdir: 'dist',
	treeShaking: true,
	define: {
		MARKDOWN: 'true',
		SVELTE: 'false',
	},
});
