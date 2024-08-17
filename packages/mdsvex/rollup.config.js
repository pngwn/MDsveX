import node from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import sucrase from '@rollup/plugin-sucrase';
import dts from 'rollup-plugin-dts';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'));

export default [
	{
		plugins: [
			node({ preferBuiltins: true }),
			commonjs({ namedExports: { 'svelte/compiler': ['parse'] } }),
			json(),
			sucrase({ transforms: ['typescript'] }),
		],
		input: 'src/main.ts',
		external: ['svelte/compiler'],
		output: [
			{ file: pkg.module, format: 'es', sourcemap: false },
			{ file: pkg.main, format: 'cjs', sourcemap: false },
		],
	},
	{
		plugins: [dts()],
		input: 'src/main.ts',

		output: [
			{ file: 'dist/main.es.d.ts', format: 'es' },
			{ file: 'dist/main.cjs.d.ts', format: 'cjs' },
		],
	},
];
