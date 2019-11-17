import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
import builtins from 'rollup-plugin-node-builtins';
import globals from 'rollup-plugin-node-globals';

import pkg from './package.json';

console.log(pkg.browser, pkg.main, pkg.module);

export default [
	{
		plugins: [resolve({ preferBuiltins: true }), commonjs(), json()],
		input: 'src/index.js',
		external: ['svelte/compiler'],
		output: [
			{ file: pkg.module, format: 'es', sourcemap: false },
			{ file: pkg.main, format: 'cjs', sourcemap: false },
		],
	},
	{
		plugins: [
			resolve(),
			commonjs({ 'svelte/compiler': ['parse'] }),
			json(),
			globals(),
			builtins(),
		],
		external: ['svelte/compiler'],
		input: 'src/index.js',
		output: [{ file: pkg.browser, format: 'es', sourcemap: false }],
	},
];
