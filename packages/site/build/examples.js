// the docs' examples at build time: every svx and md fence must compile, and a
// fence can ask to be drawn as its score or shown with what it compiles to.
//
//   ```svx score     the parser's score of the example, the source a click away
//   ```svx result    you write beside you get, the html rendered from the example
//   ```svx result score   both, opening on the score
//
// The flags are fence meta, as `title=` and `eval` are, and the fence becomes an
// `example` directive the way @mdsvex/plugin-diagram makes a mermaid fence one,
// so a page needs no script block. src/lib/docs/Example.svelte renders it
import { compile, fence_meta, FrontmatterError } from "mdsvex/compile";
import { compile as compile_svelte } from "svelte/compiler";
import * as server from "svelte/internal/server";
import { render } from "svelte/server";

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

// frontmatter for a parser of its own, such as toml, is tolerated
function compile_svx(source, options) {
	try {
		return compile(source, options).code;
	} catch (error) {
		if (!(error instanceof FrontmatterError)) throw error;
		return compile(source, { ...options, frontmatter: { parse: () => ({}) } }).code;
	}
}

// the example through mdsvex, then what it gives through svelte, which is
// where an unclosed {#if} or a stray brace fails
function compile_example(source) {
	compile_svelte(compile_svx(source, example_options), { generate: false, filename: "Example.svelte" });
}

/** every svx and md fence in the docs compiles, or the build fails */
export function examples({ strict }) {
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

/**
 * the html an example renders to, with mdsvex's defaults and nothing of the
 * site: compiled, server rendered, its hydration marks taken out. A close
 * callback can't wait, and svelte's server render doesn't need to once the
 * component is a function, so the module is run in place: its one import is
 * svelte's server runtime. An example that imports anything else, or uses a
 * template, has no html of its own here
 */
export function rendered(source) {
	const code = compile_svx(source, { filename: "/example.svx", strict_directives: false, snippets: false });
	const { js } = compile_svelte(code, { generate: "server", filename: "Example.svelte" });
	const body = js.code
		.replace(/^import \* as \$ from 'svelte\/internal\/server';$/m, "")
		.replace(/^import 'svelte\/internal\/flags\/\w+';$/gm, "")
		.replace(/^export default function/m, "return function")
		// frontmatter's metadata, from the module script
		.replace(/^export (const|let|function) /gm, "$1 ");
	if (/^import\s/m.test(body)) throw new Error("it imports a module, which an example shown with its result can't");
	const component = new Function("$", body)(server);
	const html = render(component).body;
	return pretty(html.replace(/<!--(?:\[!?\d*|\]|)-->/g, ""));
}

const BLOCK = new Set(
	(
		"address article aside blockquote caption dd details div dl dt fieldset figcaption figure footer form " +
		"h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section summary table tbody td tfoot th thead tr ul"
	).split(" "),
);
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));

/** html as the docs wrote it by hand: a block per line, indented by tabs, inline runs kept on their line */
export function pretty(html) {
	// a tree of tags and text, pre kept as written
	const root = { tag: null, children: [] };
	const stack = [root];
	const token = /<pre\b[\s\S]*?<\/pre>|<!--[\s\S]*?-->|<\/?([a-zA-Z][\w-]*)[^>]*>|[^<]+/g;
	for (const [text, name] of html.matchAll(token)) {
		const top = stack[stack.length - 1];
		if (text.startsWith("<pre")) top.children.push({ tag: "pre", raw: text, children: [] });
		else if (!name) top.children.push(text);
		else if (text[1] === "/") {
			const at = stack.findLastIndex((n) => n.tag === name.toLowerCase());
			if (at > 0) stack.length = at;
		} else {
			// as the docs write them: a bare boolean attribute, a space before a void's slash
			const open = text.replace(/ ([\w-]+)=""/g, " $1").replace(/\s*\/>$/, " />");
			const node = { tag: name.toLowerCase(), open, children: [] };
			top.children.push(node);
			if (!VOID.has(node.tag) && !open.endsWith("/>")) stack.push(node);
		}
	}

	const is_block = (n) => typeof n !== "string" && BLOCK.has(n.tag);
	const has_block = (n) => n.children.some(is_block);
	const inline = (n) =>
		typeof n === "string"
			? n.replace(/\s+/g, " ")
			: n.raw ?? `${n.open}${n.children.map(inline).join("")}${VOID.has(n.tag) ? "" : `</${n.tag}>`}`;

	const lines = [];
	const print = (nodes, depth) => {
		const pad = "\t".repeat(depth);
		let run = "";
		const flush = () => {
			if (run.trim()) lines.push(pad + run.trim());
			run = "";
		};
		for (const n of nodes) {
			if (!is_block(n) || n.raw || !has_block(n)) {
				if (is_block(n)) {
					flush();
					lines.push(pad + inline(n).trim());
				} else run += inline(n);
				continue;
			}
			flush();
			lines.push(pad + n.open);
			print(n.children, depth + 1);
			lines.push(`${pad}</${n.tag}>`);
		}
		flush();
	};
	print(root.children, 0);
	return lines.join("\n");
}

/** the `score` and `result` flags of a fence's meta, null for a fence with neither */
function flags(info) {
	const { lang, props } = fence_meta(info);
	if (lang !== "svx" && lang !== "md") return null;
	const on = new Set(props.filter(([, value]) => value === true).map(([key]) => key));
	if (!on.has("score") && !on.has("result")) return null;
	return { lang, score: on.has("score"), result: on.has("result") };
}

/**
 * the docs' own plugin: a flagged fence becomes an `example` directive over
 * the fence, with the source as an arg for the score and, for `result`, the
 * rendered html, highlighted as a fence of its own would be.
 *
 * The html goes as an arg rather than as a fence appended to the directive:
 * the highlighter reads a fence's text from the source by its offsets, and a
 * fence a plugin adds has none, so every added fence shows the first's text
 */
export function example({ highlight }) {
	const fenced = (html) =>
		compile(`\`\`\`html\n${html}\n\`\`\`\n`, { filename: "/result.svx", highlight }).code.trim();

	return {
		name: "docs-example",
		module: "$lib/docs/directives.js",
		directives: { example: {} },
		parse: {
			code_fence: {
				parse(node, ctx) {
					const asked = flags(node.info);
					if (!asked) return;
					const wrapper = node.wrap_from("directive_container", { name: "example", args: {} });
					wrapper.close();
					// the code has arrived once the fence closes
					return () => {
						const source = node.text_content;
						const args = { source };
						if (asked.score) args.score = "open";
						if (asked.result) {
							try {
								args.result = fenced(rendered(source));
							} catch (error) {
								throw new Error(
									`the example at line ${node.position.start.line} of ${ctx.filename} has no result: ${error.message}`,
								);
							}
						}
						wrapper.attrs.args = args;
					};
				},
			},
		},
	};
}
