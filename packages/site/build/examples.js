// the docs' examples at build time: every svx and md fence must compile, and a
// fence can ask to be drawn as its score, shown with what it compiles to, or
// read by CommonMark beside mdsvex.
//
//   ```svx score          the parser's score of the example, the source a click away
//   ```svx result         you write beside you get, what mdsvex compiles it to
//   ```svx result score   both, opening on the score
//   ```svx error          you write beside the error its compile gives
//   ```svx commonmark     the source read by CommonMark and by mdsvex, side by side
//
// `config` compiles it with the last ```js config fence above it, run as
// written (build/shown-config.js), and the modules that config names from the fences
// above that show them, a fence whose first line is its path.
// `templates` compiles with the templates guide's two templates, `file="..."`
// names the file an example stands for, `gfm` reads the CommonMark side as GFM
// does, and `cue="regex"` rules the characters a contrast turns on.
//
// The flags are fence meta, as `title=` and `eval` are, and the fence becomes a
// directive the way @mdsvex/plugin-diagram makes a mermaid fence one, so a page
// needs no script block. The plugin also owns the plates a page is cut into,
// `::::plate[Title](mark=…, tone=…)`, and the strip of their marks, `::marks`.
// src/lib/docs renders them, design/docs/PLATES.md says how to write them
import { compile, fence_meta } from "mdsvex/compile";
import { compile as compile_svelte } from "svelte/compiler";
import { commonmark } from "../src/lib/docs/commonmark.js";
import { compile_svx, pretty, rendered } from "../src/lib/docs/render.js";
import { cue_ranges, options_for, segments_of } from "../src/lib/docs/setup.js";
import { config_of, syntax_of } from "./shown-config.js";

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
				// an error example is checked by the docs plugin, which needs it to fail,
				// and a config example by the docs plugin with its config, which this can't see
				const asked = flags(node.info);
				if (asked?.error || asked?.config) return;
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

const FLAGS = ["score", "result", "error", "commonmark"];

/** a fence's first line naming its file, `// src/lib/markdown.js` or `<!-- src/lib/Post.svelte -->` */
const PATH_LINE = /^\s*(?:\/\/|\/\*|<!--)\s*([\w@#$./-]+\.(?:js|ts|svelte|svx))\s*(?:\*\/|-->)?\s*$/;

/** what a fence's meta asks of it, null for an svx or md fence that asks nothing */
function flags(info) {
	const { lang, props } = fence_meta(info);
	if (lang !== "svx" && lang !== "md") return null;
	const on = new Set(props.filter(([, value]) => value === true).map(([key]) => key));
	if (!FLAGS.some((flag) => on.has(flag))) return null;
	const value = (key) => props.find(([k, v]) => k === key && typeof v === "string")?.[1];
	return {
		score: on.has("score"),
		result: on.has("result"),
		error: on.has("error"),
		commonmark: on.has("commonmark"),
		gfm: on.has("gfm"),
		templates: on.has("templates"),
		config: on.has("config"),
		file: value("file"),
		cue: value("cue"),
	};
}

/** an anchor from a plate's title, as heading_ids makes one from a heading */
const slug = (text) =>
	text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-|-$/g, "") || "plate";

/**
 * the docs' own plugin.
 *
 * A flagged fence becomes a directive over the fence: `example` for `score`,
 * `result` and `error`, `contrast` for `commonmark`. Its args carry what the
 * build made of it: mdsvex's compile and its mappings, the error, or the two
 * readings, highlighted as a fence of their own would be. They go as args
 * rather than as fences appended to the directive: the highlighter reads a
 * fence's text from the source by its offsets, and a fence a plugin adds has
 * none, so every added fence would show the first's text.
 *
 * A plate is a container the author writes. Its first prose, up to its first
 * fence or directive, is wrapped as the plate's lede, which the plate sets in
 * its head; its title and mark are left as plugin data, `plates`, for the
 * page's strip. An entry of `::::added` is left there too
 */
export function example({ highlight }) {
	const fenced = (lang, code) =>
		compile(`\`\`\`${lang}\n${code}\n\`\`\`\n`, { filename: "/result.svx", highlight }).code.trim();
	const where = (node, ctx) => `the example at line ${node.position.start.line} of ${ctx.filename}`;

	/** the options of the `js config` fence above, with the files shown above, read once per pair of them */
	function shown_config(node, ctx) {
		const shown = ctx.scratch.config;
		if (!shown) throw new Error(`${where(node, ctx)} is flagged config, but no \`js config\` fence is above it`);
		const files = ctx.scratch.files ?? {};
		const key = `${shown.line}:${Object.keys(files).join(",")}`;
		if (ctx.scratch.config_key !== key) {
			ctx.scratch.config_options = config_of(shown.code, files, `the config at line ${shown.line} of ${ctx.filename}`);
			ctx.scratch.config_key = key;
		}
		return ctx.scratch.config_options;
	}

	/** the example's args from its source, as the fence asked */
	function example_args(source, asked, node, ctx) {
		const args = { source };
		if (asked.file) args.file = asked.file;
		if (asked.score) args.score = "open";
		const config = asked.config ? shown_config(node, ctx) : null;
		const syntax = config && syntax_of(config);
		if (syntax) args.syntax = syntax;
		// a score alone still compiles with its config, so a config that can't fails here
		if (!asked.result && !asked.error && !config) return args;
		const options = config
			? { ...options_for(asked), ...config, filename: options_for(asked).filename }
			: options_for(asked);
		let result;
		try {
			result = compile(source, { ...options, sourcemap: true });
		} catch (error) {
			if (!asked.error) throw new Error(`${where(node, ctx)} has no result: ${error.message}`);
			args.error = error.message;
			return args;
		}
		if (asked.error) throw new Error(`${where(node, ctx)} is flagged error but compiles`);
		// examples() leaves a config example to this compile, so its svelte check is here too
		if (config) {
			try {
				compile_svelte(result.code, { generate: false, filename: "Example.svelte" });
			} catch (error) {
				throw new Error(`${where(node, ctx)} compiles with its config to svelte that doesn't: ${error.message}`);
			}
		}
		if (!asked.result) return args;
		args.code = result.code;
		args.segments = JSON.stringify(segments_of(result));
		return args;
	}

	/** a contrast's args: the source read by CommonMark and by mdsvex */
	function contrast_args(source, asked, node, ctx) {
		const html = pretty(commonmark(source, asked.gfm).trim());
		let ours;
		try {
			ours = rendered(source);
		} catch (error) {
			throw new Error(`${where(node, ctx)} has no mdsvex reading: ${error.message}`);
		}
		const args = { source, commonmark: html, commonmark_code: fenced("html", html), mdsvex: ours, mdsvex_code: fenced("html", ours) };
		if (asked.gfm) args.gfm = "true";
		const cue = cue_ranges(source, asked.cue);
		// a cue that rules nothing has lost what it points at, such as trailing
		// spaces an editor trimmed
		if (asked.cue && !cue.length) throw new Error(`${where(node, ctx)} has a cue, ${asked.cue}, that matches nothing in it`);
		if (cue.length) args.cue = JSON.stringify(cue);
		return args;
	}

	/** what a plate or an `add` leaves for the strip, and the args it is drawn with */
	function record(node, ctx, kind) {
		const label = node.first_child?.type === "directive_label" ? node.first_child.text_content : "";
		const args = node.attrs.args ?? {};
		const id = args.id ? ctx.id(args.id, { fixed: true }) : ctx.id(slug(label));
		const n = (ctx.scratch[kind] = (ctx.scratch[kind] ?? 0) + 1);
		const section = ctx.scratch.section ?? "";
		node.attrs.args = { ...args, id, section, n: String(n) };
		ctx.add("plates", { id, kind, mark: args.mark ?? "", tone: args.tone ?? "other", title: label, section });
	}

	/**
	 * what a fence shows that a later example may compile with: the file it
	 * names on its first line or with `file=`, and a `js config` fence's config
	 */
	function remember(node, source, ctx) {
		const { lang, props } = fence_meta(node.info);
		const file = props.find(([key, value]) => key === "file" && typeof value === "string")?.[1] ?? source.split("\n")[0].match(PATH_LINE)?.[1];
		if (file) (ctx.scratch.files ??= {})[file.replace(/^\.?\//, "")] = source;
		const config = props.some(([key, value]) => key === "config" && value === true);
		if (config && (lang === "js" || lang === "javascript")) ctx.scratch.config = { code: source, line: node.position.start.line };
		else if (config && lang !== "svx" && lang !== "md") throw new Error(`the ${lang} fence at line ${node.position.start.line} of ${ctx.filename} is flagged config, which only a js fence can be`);
	}

	// a plate's first prose is its lede, wrapped so the plate can set it in its head
	const lede = (node, ctx) => {
		if (ctx.state.ended || ctx.state.lede) return;
		ctx.state.lede = node.wrap_from("directive_container", { name: "plate_lede" });
	};
	const end = (node, ctx) => {
		ctx.state.ended = true;
		ctx.state.lede?.close();
		ctx.state.lede = null;
	};

	return {
		name: "docs",
		module: "$lib/docs/directives.js",
		directives: {
			example: {},
			contrast: {},
			plate: {
				parse(plate, ctx) {
					return () => {
						ctx.state.lede?.close();
						record(plate, ctx, "plate");
					};
				},
				children: {
					paragraph: lede,
					list: lede,
					block_quote: lede,
					code_fence: end,
					directive_container: end,
					directive_leaf: end,
					table: end,
					html: end,
					heading: end,
					thematic_break: end,
					svelte_block: end,
				},
			},
			plate_lede: {},
			notes: {},
			edges: {},
			marks: {},
			added: {},
			add: {
				parse(add, ctx) {
					return () => record(add, ctx, "add");
				},
			},
		},
		parse: {
			heading: {
				parse(node, ctx) {
					// the section a plate is in, for its kicker and the strip
					if (node.depth !== 2) return;
					return () => {
						ctx.scratch.section = node.text_content.trim();
					};
				},
			},
			code_fence: {
				parse(node, ctx) {
					const asked = flags(node.info);
					let wrapper = null;
					if (asked) {
						wrapper = node.wrap_from("directive_container", { name: asked.commonmark ? "contrast" : "example", args: {} });
						wrapper.close();
					}
					// the code has arrived once the fence closes
					return () => {
						const source = node.text_content;
						remember(node, source, ctx);
						if (!asked) return;
						wrapper.attrs.args = asked.commonmark ? contrast_args(source, asked, node, ctx) : example_args(source, asked, node, ctx);
					};
				},
			},
		},
	};
}
