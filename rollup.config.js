import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
import builtins from 'rollup-plugin-node-builtins';
import globals from 'rollup-plugin-node-globals';
import sucrase from '@rollup/plugin-sucrase';

import pkg from './package.json';

export default [
	{
		plugins: [
			resolve({ preferBuiltins: true }),
			commonjs({ namedExports: { 'svelte/compiler': ['parse'] } }),
			json(),
			sucrase({ transforms: ['typescript'] }),
		],
		input: 'src/index.ts',
		external: ['svelte/compiler'],
		output: [
			{ file: pkg.module, format: 'es', sourcemap: false },
			{ file: pkg.main, format: 'cjs', sourcemap: false },
		],
	},
	{
		plugins: [
			resolve({ browser: true }),
			commonjs({ namedExports: { 'svelte/compiler': ['parse'] } }),
			json(),
			sucrase({ transforms: ['typescript'] }),
			globals(),
			builtins(),
		],
		input: 'src/index.ts',
		output: [
			{
				file: 'dist/mdsvex.js',
				name: 'mdsvex',
				format: 'umd',
				sourcemap: false,
			},
		],
	},
];
