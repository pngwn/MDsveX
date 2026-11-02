// the build's render of an example (build/examples.js, `rendered` and
// `pretty`), for the workbook to run in the browser: the dev server won't
// serve build/, so the lab keeps this copy. Adopted, the two would move into
// lib/docs and the build would import them from there
import { compile, FrontmatterError } from 'mdsvex/compile';
import { compile as compile_svelte } from 'svelte/compiler';
import * as server from 'svelte/internal/server';
import { render } from 'svelte/server';

// frontmatter for a parser of its own, such as toml, is tolerated
function compile_svx(source, options) {
	try {
		return compile(source, options).code;
	} catch (error) {
		if (!(error instanceof FrontmatterError)) throw error;
		return compile(source, { ...options, frontmatter: { parse: () => ({}) } }).code;
	}
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
