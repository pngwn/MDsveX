import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import typescript from 'rollup-plugin-typescript';
import pkg from './package.json';

const opts = {
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescript({
      typescript: require('typescript'),
      module: 'esnext',
      allowJs: true,
    }),
  ],
};

export default [
  {
    ...opts,
    input: 'src/main.ts',
    output: [
      { file: pkg.module, format: 'es', sourcemap: false },
      { file: pkg.main, format: 'cjs', sourcemap: false },
    ],
  },
];
