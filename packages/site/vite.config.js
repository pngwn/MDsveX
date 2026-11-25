import { sveltekit } from "@sveltejs/kit/vite";
import { anchors } from "@mdsvex/plugin-anchors";
import { link_check } from "@mdsvex/plugin-link-check";
import { toc } from "@mdsvex/plugin-toc";
import { tabs } from "@mdsvex/plugin-tabs";
import { mdsvex } from "mdsvex";
import { create_highlight, load_default_languages } from "mdsvex/highlight";
import { example, examples } from "./build/examples.js";

// svx is markdown with svelte in it, sig fences hold typescript signatures,
// the docs show code directives as written, so none apply
const highlight = {
	languages: {
		svx: "markdown",
		mdsvex: "markdown",
		mdx: "markdown",
		sig: "typescript",
	},
	annotations: false,
};

// the same highlighting for an example's result, which the docs plugin renders itself
const result_highlight = create_highlight({
	...highlight,
	languages: { ...(await load_default_languages()), ...highlight.languages },
});

/** @type {import('vite').UserConfigFn} */
export default ({ command }) => {
	const build = command === "build";

	return {
		plugins: [
			mdsvex({
				heading_ids: true,
				highlight,
				plugins: [
					anchors({ attrs: { class: "permalink" } }),
					toc({ max_depth: 2 }),
					link_check({ routes: "src/routes", strict: build }),
					// install commands by package manager
					tabs(),
					// a fence flagged score or result, drawn as its score or beside its html
					example({ highlight: result_highlight }),
				],
				parse_plugins: [examples({ strict: build })],
			}),
			sveltekit(),
		],
		server: {
			fs: {
				// the repl workers are loaded by url, outside the import graph, the
				// stream lab reads the parser's fixtures one at a time, and the
				// playground preview bundles the builds of the packages here
				allow: ["../repl", "../parse", "../render", "../mdsvex"],
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
};
