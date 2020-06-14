import 'prismjs';
import "prism-svelte";
import "./prism/svx.js";



import resolve from "rollup-plugin-node-resolve";
import replace from "rollup-plugin-replace";
import commonjs from "rollup-plugin-commonjs";
import svelte from "rollup-plugin-svelte";
import babel from "rollup-plugin-babel";
import { terser } from "rollup-plugin-terser";
import config from "sapper/config/rollup.js";
import pkg from "./package.json";

import slug from "rehype-slug";
import link from "rehype-autolink-headings";

import { highlight, highlighter } from "./prism/prism.js";

import { extname } from "path";

const mode = process.env.NODE_ENV;
const dev = mode === "development";
const legacy = !!process.env.SAPPER_LEGACY_BUILD;

import { mdsvex } from "mdsvex";

function mdsvex_transform() {
	return {
		async transform(code, id) {
			if (extname(id) !== ".svtext") return;

			const c = (
				await mdsvex({
					highlight: {
						alias: {
							ts: "typescript",
							mdx: "markdown",
							svelte: "svelte",
							svx: "svx",
							mdsvex: "svx",
							sig: "ts",
						}
					},
					extension: '.svtext',
					rehypePlugins: [slug, link]
				}).markup({ content: code, filename: id })
			).code;
			return `export default \`${c.replace(/`/g, "\\`").trim()}\`;`;
		}
	};
}

export default {
	client: {
		input: config.client.input(),
		output: config.client.output(),
		globals: {
			global: "window"
		},
		plugins: [
			replace({
				"process.browser": true,
				"process.env.NODE_ENV": JSON.stringify(mode)
			}),
			mdsvex_transform(),
			svelte({
				extensions: [".svelte", ".svx"],
				dev,
				hydratable: true,
				emitCss: true,
				preprocess: mdsvex({ extension: '.svx' })
			}),
			resolve({ preferBuiltins: false, browser: true }),
			commonjs(),

			legacy &&
				babel({
					extensions: [".js", ".mjs", ".html", ".svelte"],
					runtimeHelpers: true,
					exclude: ["node_modules/@babel/**"],
					presets: [
						[
							"@babel/preset-env",
							{
								targets: "> 0.25%, not dead"
							}
						]
					],
					plugins: [
						"@babel/plugin-syntax-dynamic-import",
						[
							"@babel/plugin-transform-runtime",
							{
								useESModules: true
							}
						]
					]
				}),

			!dev &&
				terser({
					module: true
				})
		]
	},

	server: {
		input: config.server.input(),
		output: config.server.output(),
		plugins: [
			replace({
				"process.browser": false,
				"process.env.NODE_ENV": JSON.stringify(mode)
			}),
			mdsvex_transform(),
			svelte({
				extensions: [".svelte", ".svx"],
				generate: "ssr",
				dev,
				preprocess: mdsvex({ extension: '.svx' })
			}),
			resolve({ browser: true }),
			commonjs()
		],
		external: Object.keys(pkg.dependencies).concat(
			require("module").builtinModules ||
				Object.keys(process.binding("natives"))
		)
	},

	serviceworker: {
		input: config.serviceworker.input(),
		output: config.serviceworker.output(),
		plugins: [
			resolve(),
			replace({
				"process.browser": true,
				"process.env.NODE_ENV": JSON.stringify(mode)
			}),
			commonjs(),
			!dev && terser()
		]
	}
};
