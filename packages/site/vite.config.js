import { extname } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { compile } from "mdsvex";
import { create_highlight, load_default_languages } from "mdsvex/highlight";
import GithubSlugger from "github-slugger";

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

/** ids and anchors the docs nav links to and scroll tracking reads */
function heading_anchors() {
	const slugger = new GithubSlugger();
	return {
		heading: {
			parse(node) {
				const anchor = node.prepend("link", {
					"aria-hidden": "true",
					tabindex: "-1",
				});
				return () => {
					// text_content is raw source, the slugger drops its markdown punctuation
					const id = slugger.slug(node.text_content);
					node.attrs.id = id;
					anchor.attrs.href = `#${id}`;
				};
			},
		},
	};
}

function mdsvex_transform() {
	return {
		name: "mdsvex-svtext",
		transform(code, id) {
			if (extname(id) !== ".svtext") return;

			const { code: html } = compile(code, {
				parse_plugins: [heading_anchors()],
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
