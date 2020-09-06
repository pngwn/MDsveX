import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
// import sucrase from '@rollup/plugin-sucrase';
import ts from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

import pkg from './package.json';

export default [
	{
		plugins: [ts()],
		input: 'src/main.ts',
		output: [{ file: 'dist/main.js', format: 'cjs', sourcemap: false }],
	},
	// {
	// 	plugins: [dts()],
	// 	input: 'src/main.ts',

	// 	output: [{ file: 'dist/main.d.ts', format: 'cjs' }],
	// },
];
