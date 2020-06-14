import resolve from "rollup-plugin-node-resolve";
import json from "rollup-plugin-json";
import { terser } from "rollup-plugin-terser";

const dev = true;

// bundle workers
export default ["compiler", "bundler"].map(x => ({
	input: `src/components/Repl/workers/${x}/index.js`,
	output: {
		file: `static/workers/${x}.js`,
		format: "iife"
	},
	plugins: [resolve(), json(), terser()]
}));
