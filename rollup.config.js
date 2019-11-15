import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
import builtins from 'rollup-plugin-node-builtins';

import pkg from './package.json';

const plugins = [commonjs(), json()];

console.log(pkg.browser, pkg.main, pkg.module);

export default [
	{
		plugins: [resolve({ preferBuiltins: true }), ...plugins],
		input: 'src/index.js',
		output: [
			{ file: pkg.module, format: 'es', sourcemap: false },
			{ file: pkg.main, format: 'cjs', sourcemap: false },
		],
	},
	{
		plugins: [
			...plugins,
			resolve({ preferBuiltins: false, browser: true }),
			builtins(),
		],
		input: 'src/index.js',
		output: [{ file: pkg.browser, format: 'es', sourcemap: false }],
	},
];
