import ts from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

import pkg from './package.json' assert { type: 'json' };

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
