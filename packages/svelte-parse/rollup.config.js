import ts from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
	{
		plugins: [ts()],
		input: 'src/main.ts',
		output: [
			{ file: 'dist/main.cjs.js', format: 'cjs', sourcemap: false },
			{ file: 'dist/main.es.js', format: 'es', sourcemap: false },
		],
	},
	{
		plugins: [dts()],
		input: 'src/main.ts',

		output: [
			{ file: 'dist/main.cjs.d.ts', format: 'cjs' },
			{ file: 'dist/main.es.d.ts', format: 'es' },
		],
	},
];
