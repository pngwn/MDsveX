import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import json from 'rollup-plugin-json';
import builtins from 'rollup-plugin-node-builtins';

import pkg from './package.json';

const opts = {
	plugins: [resolve({ preferBuiltins: true }), commonjs(), json()],
};

console.log(pkg.browser, pkg.main, pkg.module);

export default [
	{
		...opts,
		input: 'src/index.js',
		output: [
			{ file: pkg.module, format: 'es', sourcemap: false },
			{ file: pkg.main, format: 'cjs', sourcemap: false },
		],
	},
	{
		plugins: [...opts.plugins, builtins()],
		input: 'src/index.js',
		output: [{ file: pkg.browser, format: 'es', sourcemap: false }],
	},
];
