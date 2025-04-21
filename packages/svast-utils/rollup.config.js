import ts from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'));

export default [
	{
		plugins: [ts()],
		input: 'src/main.ts',
		output: [
			{ file: pkg.module, format: 'es', sourcemap: false },
			{ file: pkg.main, format: 'cjs', sourcemap: false },
			,
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
