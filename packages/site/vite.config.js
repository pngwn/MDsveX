import { extname } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { anchors } from "@mdsvex/plugin-anchors";
import { compile } from "mdsvex";
import { create_highlight, load_default_languages } from "mdsvex/highlight";

// svx is markdown with svelte in it, sig fences hold typescript signatures,
// the docs show code directives as written, so none apply
const highlight = create_highlight({
	languages: {
		...(await load_default_languages()),
		svx: "markdown",
		mdsvex: "markdown",
		mdx: "markdown",
		sig: "typescript",
	},
	annotations: false,
});

// the empty anchors scroll tracking reads, one array so every compile shares it
const plugins = [anchors({ position: "prepend" })];

function mdsvex_transform() {
	return {
		name: "mdsvex-svtext",
		transform(code, id) {
			if (extname(id) !== ".svtext") return;

			const { code: html } = compile(code, {
				heading_ids: true,
				plugins,
				highlight,
				filename: id,
			});
			return `export default ${JSON.stringify(html)};`;
		},
	};
}

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [mdsvex_transform(), sveltekit()],
	server: {
		fs: {
			// the repl workers are loaded by url, outside the import graph
			allow: ["../repl"],
		},
	},
	optimizeDeps: {
		// prebundling moves the rollup wasm away from the file that fetches it
		exclude: ["@rollup/browser"],
	},
	worker: {
		format: "es",
	},
};

export default config;
