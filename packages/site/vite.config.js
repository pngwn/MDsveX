import { extname } from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import { compile } from "mdsvex";
import { refractor } from "refractor";
import { toHtml } from "hast-util-to-html";
import GithubSlugger from "github-slugger";

// prism-svelte extends the global Prism, and refractor is a Prism instance
globalThis.Prism = refractor;
await import("prism-svelte");
delete globalThis.Prism;

// prism markdown extends markup, so it covers the tags in svx too
refractor.alias({
	typescript: ["sig"],
	markdown: ["mdx", "svx", "mdsvex"],
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

const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"' };

function highlight(html) {
	return html.replace(
		/<pre><code class="language-([^"]+)">([^]*?)<\/code><\/pre>/g,
		(block, lang, escaped) => {
			if (!refractor.registered(lang)) return block;
			const code = escaped.replace(/&(?:amp|lt|gt|quot);/g, (e) => entities[e]);
			const tokens = toHtml(refractor.highlight(code, lang));
			// the docs style pre.language-*
			return `<pre class="language-${lang}"><code class="language-${lang}">${tokens}</code></pre>`;
		},
	);
}

function mdsvex_transform() {
	return {
		name: "mdsvex-svtext",
		transform(code, id) {
			if (extname(id) !== ".svtext") return;

			const { code: html } = compile(code, {
				parsePlugins: [heading_anchors()],
			});
			return `export default ${JSON.stringify(highlight(html))};`;
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
		// prebundling moves the rollup wasm away from the file that fetches it,
		// and vite is only imported lazily by the mdsvex plugin, never in a browser
		exclude: ["@rollup/browser", "vite"],
	},
	worker: {
		format: "es",
	},
};

export default config;
