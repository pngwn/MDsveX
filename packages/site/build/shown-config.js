// the config a docs example compiles with, read from the page itself: a `js
// config` fence is run as written, its `mdsvex({ … })` call gives the options,
// and an svx fence flagged `config` compiles with the last one above it. What
// the reader sees as config is what compiles, so nothing here is a default.
//
// It runs at build time, synchronously, inside the docs plugin's fence handler.
// So the modules a config may import are loaded once, here: the site's
// first-party plugins and mdsvex's own entries. An import, an option or a
// value this can't honour fails the build with what it was, never a quiet
// default.
//
// The code run is the site's own docs, from this repository, at build time,
// the same trust as vite.config.js; nothing from outside reaches it
import { readFileSync } from "node:fs";
import { create_highlight, load_default_languages } from "mdsvex/highlight";
import { read_exports } from "mdsvex/host";
import { load_math } from "mdsvex/math";

const site = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const plugin_names = Object.keys({ ...site.dependencies, ...site.devDependencies }).filter((name) =>
	name.startsWith("@mdsvex/plugin-"),
);

/** what a config can import: mdsvex's entries and every first-party plugin the site has */
const MODULES = {
	"mdsvex/highlight": await import("mdsvex/highlight"),
	"mdsvex/math": await import("mdsvex/math"),
	"mdsvex/compile": await import("mdsvex/compile"),
	...Object.fromEntries(await Promise.all(plugin_names.map(async (name) => [name, await import(name)]))),
};
const LANGUAGES = await load_default_languages();
const TEMML = await load_math();

/** an import statement as a binding of what `__import` gives */
function binding(clause, spec) {
	const at = `__import(${JSON.stringify(spec)})`;
	const parts = [];
	let rest = clause.trim();
	const named = rest.match(/\{([\s\S]*)\}/);
	if (named) {
		parts.push(`var { ${named[1].replace(/\s+as\s+/g, ": ")} } = ${at};`);
		rest = rest.replace(named[0], "");
	}
	const star = rest.match(/\*\s+as\s+([\w$]+)/);
	if (star) {
		parts.push(`var ${star[1]} = ${at};`);
		rest = rest.replace(star[0], "");
	}
	const name = rest.replace(/,/g, "").trim();
	if (name) parts.push(`var ${name} = ${at}.default;`);
	return parts.join(" ");
}

/**
 * run a config as written: its imports bound from MODULES, `mdsvex(…)`
 * capturing its options, and what a vite.config.js wraps it in standing by
 */
function run(code, where) {
	let captured = null;
	const stubs = {
		mdsvex: { mdsvex: (options = {}) => ((captured = options), { name: "mdsvex" }) },
		"@sveltejs/kit/vite": { sveltekit: () => ({ name: "sveltekit" }) },
		vite: { defineConfig: (config) => config },
	};
	// an import of one of the stubs shadows the parameter of the same name, so it binds with var
	const body = code
		.replace(/^import\s+([\s\S]+?)\s+from\s+(['"])(.+?)\2;?/gm, (_, clause, __, spec) => binding(clause, spec))
		.replace(/^export\s+default\s+/gm, "void ")
		.replace(/^export\s+/gm, "");
	const imported = (spec) => {
		const module = stubs[spec] ?? MODULES[spec];
		if (!module) throw new Error(`${where} imports ${spec}, which the docs don't load for a config (build/shown-config.js)`);
		return module;
	};
	try {
		// the docs write `mdsvex({ … })` with no import line, as a reader assumes one
		new Function("__import", "mdsvex", "sveltekit", "defineConfig", body)(
			imported,
			stubs.mdsvex.mdsvex,
			stubs["@sveltejs/kit/vite"].sveltekit,
			stubs.vite.defineConfig,
		);
	} catch (error) {
		throw new Error(`${where} doesn't run: ${error.message}`);
	}
	if (captured === null) throw new Error(`${where} calls no mdsvex(…), so it gives no options`);
	return captured;
}

/** a module's path on the page from a specifier: `#lib/` and `$lib/` are src/lib, a relative one from the module that has it */
function path_of(spec, from = "") {
	let path = spec.replace(/^[#$]lib\//, "src/lib/");
	if (path.startsWith("./") || path.startsWith("../")) {
		const parts = from.split("/").slice(0, -1);
		for (const part of path.split("/")) {
			if (part === "..") parts.pop();
			else if (part !== ".") parts.push(part);
		}
		path = parts.join("/");
	}
	return path.replace(/^\//, "");
}

/** a specifier relative to another, as the module that has it would import it */
function spec_from(spec, from) {
	if (!spec.startsWith("./") && !spec.startsWith("../")) return spec;
	return from.slice(0, from.lastIndexOf("/") + 1) + spec.replace(/^\.\//, "");
}

/** the export names of a module the page shows, or an error that it doesn't */
function exports_of(path, files, where, what) {
	const found = [path, `${path}.js`, `${path}.ts`, `${path}.svelte`].find((p) => p in files);
	if (!found)
		throw new Error(`${where} names ${what} ${path}, which no fence above shows (a fence whose first line is its path, \`// ${path}\`)`);
	return { path: found, ...read_exports(files[found], found.endsWith(".svelte") ? "svelte" : "js") };
}

/** the components and directives modules a config names, as compile takes them */
function components_of(written, files, where) {
	const components = [];
	const directives = [];
	for (const spec of [written].flat()) {
		if (typeof spec !== "string") throw new Error(`${where} gives components a ${typeof spec}, the docs read only specifiers`);
		const read = exports_of(path_of(spec), files, where, "the components module");
		components.push({ specifier: spec, names: read.names.filter((n) => n !== "directives") });
		const ns = read.namespaces.find((n) => n.name === "directives");
		if (!ns) continue;
		const own = exports_of(path_of(ns.specifier, read.path), files, where, "the directives module");
		directives.push({ specifier: spec_from(ns.specifier, spec), names: own.names });
	}
	return { components, directives };
}

/** options with the same shape in the Vite plugin and in compile */
const SAME = new Set([
	"heading_ids",
	"smart_punctuation",
	"unwrap_images",
	"wrap_static",
	"footnotes",
	"component_mode",
	"frontmatter",
	"rewrite",
	"import_images",
	"plugins",
	"parse_plugins",
]);

/**
 * the compile options a shown config stands for: the Vite plugin's options
 * mapped as it maps them, the modules it names read from the files the page
 * shows, directives strict as the plugin compiles them
 * @param {string} code the config fence as written
 * @param {Record<string, string>} files the fences above that name their file
 * @param {string} where for errors, the fence and its page
 */
export function config_of(code, files, where) {
	const written = run(code, where);
	const options = { strict_directives: true };
	for (const [key, value] of Object.entries(written)) {
		if (value === undefined) continue;
		if (SAME.has(key)) options[key] = value;
		else if (key === "extensions") continue;
		else if (key === "highlight") {
			if (value === false || typeof value === "function") options.highlight = value;
			else if (value.twoslash) throw new Error(`${where} turns on twoslash, which the docs don't load`);
			else options.highlight = create_highlight({ ...value, languages: { ...LANGUAGES, ...value.languages } });
		} else if (key === "math") {
			if (value === false || typeof value === "function") options.math = value;
			else if ((value.renderer ?? "temml") === "temml" && value.options === undefined) options.math = TEMML;
			else throw new Error(`${where} sets math to ${JSON.stringify(value)}, the docs load temml with its defaults only`);
		} else if (key === "components") Object.assign(options, components_of(value, files, where));
		else throw new Error(`${where} sets ${key}, which the docs don't compile an example with yet (build/shown-config.js)`);
	}
	return options;
}

/** the syntax choices of a config the score draws with, as an arg */
export function syntax_of(options) {
	return options.unwrap_images ? JSON.stringify({ unwrap_images: true }) : undefined;
}
