import { sveltekit } from "@sveltejs/kit/vite";
import { anchors } from "@mdsvex/plugin-anchors";
import { link_check } from "@mdsvex/plugin-link-check";
import { mdsvex } from "mdsvex";
import { compile, fence_meta, FrontmatterError } from "mdsvex/compile";
import { compile as compile_svelte } from "svelte/compiler";

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

// an object with every key, for the names and files an example only mentions
const anything = (value) =>
	new Proxy(
		{},
		{
			get: (_, key) => (typeof key === "string" ? value : undefined),
			has: () => true,
			getOwnPropertyDescriptor: () => ({ value, configurable: true, enumerable: true }),
		},
	);

// an example has none of the site around it: its directives come from plugins
// and modules it doesn't have, its templates and src= files are names (a file
// of a hundred lines, for the line ranges), and a block that runs needs a server
const example_options = {
	filename: "/example.svx",
	strict_directives: false,
	snippets: false,
	sources: anything("\n".repeat(100)),
	templates: anything({ specifier: "/Template.svelte", components: [] }),
};

// the example through mdsvex, then what it gives through svelte, which is
// where an unclosed {#if} or a stray brace fails
function compile_example(source) {
	let code;
	try {
		({ code } = compile(source, example_options));
	} catch (error) {
		// frontmatter for a parser of its own, such as toml
		if (!(error instanceof FrontmatterError)) throw error;
		({ code } = compile(source, { ...example_options, frontmatter: { parse: () => ({}) } }));
	}
	compile_svelte(code, { generate: false, filename: "Example.svelte" });
}

/** every svx and md fence in the docs compiles, or the build fails */
function examples({ strict }) {
	return {
		name: "examples",
		code_fence: {
			parse(node, ctx) {
				const { lang } = fence_meta(node.info);
				if (lang !== "svx" && lang !== "md") return;
				return () => {
					try {
						compile_example(node.text_content);
					} catch (error) {
						const message = `the ${lang} example at line ${node.position.start.line} of ${ctx.filename} does not compile: ${error.message}`;
						if (strict) throw new Error(message);
						ctx.warn("broken_example", message, node);
					}
				};
			},
		},
	};
}

/** @type {import('vite').UserConfigFn} */
export default ({ command }) => {
	const build = command === "build";

	return {
		plugins: [
			mdsvex({
				heading_ids: true,
				highlight,
				// the empty anchors scroll tracking reads
				plugins: [
					anchors({ position: "prepend" }),
					link_check({ routes: "src/routes", strict: build }),
				],
				parse_plugins: [examples({ strict: build })],
			}),
			sveltekit(),
		],
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
};
