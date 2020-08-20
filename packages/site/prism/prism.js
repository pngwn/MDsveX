import Prism from "prismjs";
import "prism-svelte";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-jsx";
import "./svx.js";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-toml";

const langs = {
	html: "markup",
	js: "javascript",
	ts: "typescript",
	bash: "bash",
	mdx: "markdown",
	svelte: "svelte",
	svx: "svx",
	mdsvex: "svx",
	yaml: "yaml",
	scss: "scss",
	sig: "ts",
	toml: "toml"
};

export function highlight(code, lang) {
	const _lang = langs[lang] || "";

	const highlighted = _lang
		? Prism.highlight(code, Prism.languages[_lang], _lang)
		: code;

	return highlighted;
}

var visit = require("unist-util-visit");

export function highlighter(options) {
	return function(ast) {
		visit(ast, "code", function(node) {
			const html = node.value;
			node.type = "html";
			node.value = `<pre class="language-${
				node.lang
			}"><code class="language-${node.lang || ""}">${
				node.lang
					? options
							.highlight(html, node.lang)
							.replace(/[{}]/g, c => ({ "{": "&#123;", "}": "&#125;" }[c]))
					: node.value
			}</code></pre>`;
		});
	};
}
