import { describe, expect, test } from "vitest";

import { parse_markdown_svelte } from "@mdsvex/parse";

import {
	check_template,
	migrate,
	migrate_config,
	migrate_frontmatter,
} from "../src/main";

function config_without_notes(source: string): string {
	const { code, notes } = migrate_config(source);
	expect(notes).toEqual([]);
	return code;
}

const kinds = (notes: { kind: string }[]): string[] => notes.map((n) => n.kind);

describe("config: single layout", () => {
	test("string becomes the default template", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: './src/Layout.svelte' });",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ templates: { default: './src/Layout.svelte' } });",
		);
	});

	test("path expressions are kept as they are", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: path.join(__dirname, 'Layout.svelte') });",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ templates: { default: path.join(__dirname, 'Layout.svelte') } });",
		);
	});

	test("new URL is kept as it is", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: new URL('./Layout.svelte', import.meta.url) });",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ templates: { default: new URL('./Layout.svelte', import.meta.url) } });",
		);
	});

	test("shorthand to a string variable", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nconst layout = './Layout.svelte';\nmdsvex({ layout });",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nconst layout = './Layout.svelte';\nmdsvex({ templates: { default: layout } });",
		);
	});

	test("layout: false is removed", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: false, extensions: ['.svx'] });",
			),
		).toBe("import { mdsvex } from 'mdsvex';\nmdsvex({ extensions: ['.svx'] });");
	});

	test("layout: false as the last option is removed", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nmdsvex({ extensions: ['.svx'], layout: false });",
			),
		).toBe("import { mdsvex } from 'mdsvex';\nmdsvex({ extensions: ['.svx'] });");
	});
});

describe("config: named layouts", () => {
	test("_ becomes default", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: { _: './Default.svelte' } });",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ templates: { default: './Default.svelte' } });",
		);
	});

	test("quoted _ becomes default", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nmdsvex({ 'layout': { '_': './Default.svelte' } });",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ templates: { default: './Default.svelte' } });",
		);
	});

	test("named entries are kept, with a select_template note", () => {
		const { code, notes } = migrate_config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({\n\tlayout: {\n\t\t_: './Default.svelte',\n\t\tblog: './Blog.svelte',\n\t},\n});",
		);
		expect(code).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({\n\ttemplates: {\n\t\tdefault: './Default.svelte',\n\t\tblog: './Blog.svelte',\n\t},\n});",
		);
		expect(notes).toEqual([
			{
				kind: "select_template",
				message: expect.stringContaining(
					"select_template: (id) => (id.includes('/blog/') ? 'blog' : undefined),",
				),
				line: 3,
				column: 2,
			},
		]);
	});

	test("the select_template suggestion covers every name", () => {
		const { notes } = migrate_config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: { blog: './Blog.svelte', docs: './Docs.svelte' } });",
		);
		expect(notes[0].message).toContain(
			"select_template: (id) => (id.includes('/blog/') ? 'blog' : id.includes('/docs/') ? 'docs' : undefined),",
		);
	});

	test("layouts held in a variable", () => {
		const { code, notes } = migrate_config(
			"import { mdsvex } from 'mdsvex';\nconst layouts = { _: './Default.svelte', blog: './Blog.svelte' };\nmdsvex({ layout: layouts });",
		);
		expect(code).toBe(
			"import { mdsvex } from 'mdsvex';\nconst layouts = { default: './Default.svelte', blog: './Blog.svelte' };\nmdsvex({ templates: layouts });",
		);
		expect(kinds(notes)).toEqual(["select_template"]);
	});

	test("shorthand to a variable holding layouts", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nconst layout = { _: './Default.svelte' };\nmdsvex({ layout });",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nconst layout = { default: './Default.svelte' };\nmdsvex({ templates: layout });",
		);
	});

	test("a legacy layout named default is flagged, and _ is left alone", () => {
		const source =
			"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: { _: './A.svelte', default: './B.svelte' } });";
		const { code, notes } = migrate_config(source);
		expect(code).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ templates: { _: './A.svelte', default: './B.svelte' } });",
		);
		expect(kinds(notes)).toEqual(["manual", "select_template"]);
	});

	test("spread entries are flagged", () => {
		const { notes } = migrate_config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: { _: './A.svelte', ...more } });",
		);
		expect(kinds(notes)).toEqual(["manual"]);
		expect(notes[0]).toMatchObject({ line: 2, column: 37 });
	});
});

describe("config: finding the options", () => {
	test("legacy svelte.config.js preprocessor", () => {
		const source = `import adapter from '@sveltejs/adapter-auto';
import { mdsvex } from 'mdsvex';

export default {
	extensions: ['.svelte', '.svx'],
	preprocess: [mdsvex({ layout: './src/Layout.svelte' })],
	kit: { adapter: adapter() },
};
`;
		expect(config_without_notes(source)).toBe(
			source.replace(
				"layout: './src/Layout.svelte'",
				"templates: { default: './src/Layout.svelte' }",
			),
		);
	});

	test("vite.config.ts with TypeScript syntax", () => {
		const source = `import { defineConfig } from 'vite';
import { mdsvex, type MdsvexOptions } from 'mdsvex';

const options = { layout: { _: './src/Layout.svelte' } } satisfies MdsvexOptions;

export default defineConfig({ plugins: [mdsvex(options as any)] });
`;
		expect(config_without_notes(source)).toBe(
			source.replace("layout: { _:", "templates: { default:"),
		);
	});

	test("mdsvex.config.js with defineMDSveXConfig", () => {
		const source = `import { defineMDSveXConfig as defineConfig } from 'mdsvex';

const config = defineConfig({
	extensions: ['.svx'],
	layout: { _: './src/Layout.svelte' },
});

export default config;
`;
		expect(config_without_notes(source)).toBe(
			source.replace("layout: { _:", "templates: { default:"),
		);
	});

	test("mdsvex.config.js without an import uses the default export", () => {
		const source = "const config = { layout: './Layout.svelte' };\nexport default config;";
		expect(config_without_notes(source)).toBe(
			"const config = { templates: { default: './Layout.svelte' } };\nexport default config;",
		);
	});

	test("namespace import", () => {
		expect(
			config_without_notes("import * as md from 'mdsvex';\nmd.mdsvex({ layout: './L.svelte' });"),
		).toBe("import * as md from 'mdsvex';\nmd.mdsvex({ templates: { default: './L.svelte' } });");
	});

	test("commonjs require and module.exports", () => {
		expect(
			config_without_notes(
				"const { mdsvex } = require('mdsvex');\nmodule.exports = { preprocess: mdsvex({ layout: './L.svelte' }) };",
			),
		).toBe(
			"const { mdsvex } = require('mdsvex');\nmodule.exports = { preprocess: mdsvex({ templates: { default: './L.svelte' } }) };",
		);
	});

	test("options shared by two calls are migrated once", () => {
		expect(
			config_without_notes(
				"import { mdsvex } from 'mdsvex';\nconst o = { layout: './L.svelte' };\nmdsvex(o);\nmdsvex(o);",
			),
		).toBe(
			"import { mdsvex } from 'mdsvex';\nconst o = { templates: { default: './L.svelte' } };\nmdsvex(o);\nmdsvex(o);",
		);
	});

	test("layout keys outside the mdsvex options are left alone", () => {
		const source =
			"import { mdsvex } from 'mdsvex';\nconst page = { layout: 'grid' };\nmdsvex({});";
		expect(config_without_notes(source)).toBe(source);
	});

	test("a file without layouts is unchanged", () => {
		const source = "import { mdsvex } from 'mdsvex';\nmdsvex({ extensions: ['.svx'] });";
		expect(config_without_notes(source)).toBe(source);
	});
});

describe("config: highlight", () => {
	const head = "import { mdsvex } from 'mdsvex';\n";

	test("highlight: false is kept", () => {
		const source = head + "mdsvex({ highlight: false });";
		expect(config_without_notes(source)).toBe(source);
	});

	test("alias becomes languages", () => {
		expect(
			config_without_notes(
				head + "mdsvex({ highlight: { alias: { yavascript: 'javascript', sv: 'svelte' } } });",
			),
		).toBe(head + "mdsvex({ highlight: { languages: { yavascript: 'javascript', sv: 'svelte' } } });");
	});

	test("shorthand alias keeps its variable", () => {
		expect(
			config_without_notes(
				head + "const alias = { yavascript: 'js' };\nmdsvex({ highlight: { alias } });",
			),
		).toBe(head + "const alias = { yavascript: 'js' };\nmdsvex({ highlight: { languages: alias } });");
	});

	test("an alias to a language twinkleplop lacks is flagged", () => {
		const { code, notes } = migrate_config(
			head + "mdsvex({ highlight: { alias: { vue: 'markup', x: 'vue', y: 'JSON' } } });",
		);
		expect(code).toBe(
			head + "mdsvex({ highlight: { languages: { vue: 'markup', x: 'vue', y: 'JSON' } } });",
		);
		expect(kinds(notes)).toEqual(["highlight_language"]);
		expect(notes[0].message).toContain("`markup` is a Prism language");
	});

	test("optimise is removed", () => {
		expect(
			config_without_notes(head + "mdsvex({ highlight: { optimise: false, alias: { a: 'ts' } } });"),
		).toBe(head + "mdsvex({ highlight: { languages: { a: 'ts' } } });");
	});

	test("a highlight object that only held optimise is removed", () => {
		expect(
			config_without_notes(head + "mdsvex({ extensions: ['.svx'], highlight: { optimise: true } });"),
		).toBe(head + "mdsvex({ extensions: ['.svx'] });");
	});

	test("a highlighter gets a todo comment above it", () => {
		const source = `${head}mdsvex({
	highlight: {
		highlighter: async (code, lang) => \`{@html \\\`\${escapeSvelte(shiki(code, lang))}\\\`}\`,
		optimise: false,
	},
});`;
		const { code, notes } = migrate_config(source);
		expect(code).toBe(`${head}mdsvex({
	highlight: {
		// TODO(mdsvex-migrate): pass a synchronous highlighter as \`highlight\` itself, returning plain HTML without escapeSvelte or {@html}. See https://mdsvex.com/docs#syntax-highlighting-in-0x
		highlighter: async (code, lang) => \`{@html \\\`\${escapeSvelte(shiki(code, lang))}\\\`}\`,
	},
});`);
		expect(kinds(notes)).toEqual(["highlighter"]);
		expect(notes[0].line).toBe(4);
		expect(notes[0].message).toContain("(code, { lang, meta, inline, filename }) => html");
	});

	test("a highlighter on the options line gets a block comment", () => {
		const { code } = migrate_config(head + "mdsvex({ highlight: { highlighter } });");
		expect(code).toBe(
			head +
				"mdsvex({ highlight: { /* TODO(mdsvex-migrate): pass a synchronous highlighter as `highlight` itself, returning plain HTML without escapeSvelte or {@html}. See https://mdsvex.com/docs#syntax-highlighting-in-0x */ highlighter } });",
		);
	});

	test("highlight options in a variable are followed", () => {
		expect(
			config_without_notes(
				head + "const highlight = { alias: { a: 'ts' }, optimise: false };\nmdsvex({ highlight });",
			),
		).toBe(head + "const highlight = { languages: { a: 'ts' } };\nmdsvex({ highlight });");
	});

	test("highlight and layout migrate together", () => {
		expect(
			config_without_notes(
				head + "mdsvex({ layout: './L.svelte', highlight: { alias: { a: 'ts' } } });",
			),
		).toBe(
			head + "mdsvex({ templates: { default: './L.svelte' }, highlight: { languages: { a: 'ts' } } });",
		);
	});

	test("both alias and languages is left alone", () => {
		const source = head + "mdsvex({ highlight: { alias: { a: 'ts' }, languages: {} } });";
		const { code, notes } = migrate_config(source);
		expect(code).toBe(source);
		expect(kinds(notes)).toEqual(["manual"]);
	});

	test("a highlight value it can't read is a note", () => {
		const source = head + "mdsvex({ highlight: make_highlight() });";
		const { code, notes } = migrate_config(source);
		expect(code).toBe(source);
		expect(kinds(notes)).toEqual(["manual"]);
	});

	test("an escapeSvelte import is flagged", () => {
		const source =
			"import { mdsvex, escapeSvelte } from 'mdsvex';\nconst f = (c) => escapeSvelte(c);\nmdsvex({ extensions: ['.svx'] });";
		const { code, notes } = migrate_config(source);
		expect(code).toBe(source);
		expect(kinds(notes)).toEqual(["escape_svelte"]);
		expect(notes[0]).toMatchObject({ line: 1, column: 18 });
	});

	test("an escapeSvelte require is flagged", () => {
		const { notes } = migrate_config(
			"const { mdsvex, escapeSvelte } = require('mdsvex');\nmodule.exports = { extensions: ['.svx'] };",
		);
		expect(kinds(notes)).toEqual(["escape_svelte"]);
	});

	test("escapeSvelte through a namespace is flagged", () => {
		const { notes } = migrate_config(
			"import * as m from 'mdsvex';\nconst f = (c) => m.escapeSvelte(c);\nm.mdsvex({});",
		);
		expect(kinds(notes)).toEqual(["escape_svelte"]);
		expect(notes[0].line).toBe(2);
	});
});

describe("config: notes", () => {
	test("layoutPropForwarding is flagged", () => {
		const { code, notes } = migrate_config(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ layoutPropForwarding: 'runes' });",
		);
		expect(code).toBe(
			"import { mdsvex } from 'mdsvex';\nmdsvex({ layoutPropForwarding: 'runes' });",
		);
		expect(notes).toEqual([
			{
				kind: "layout_prop_forwarding",
				message: expect.stringContaining("Remove the option"),
				line: 2,
				column: 10,
			},
		]);
	});

	test("an imported layout value can't be followed", () => {
		const source =
			"import { mdsvex } from 'mdsvex';\nimport { layouts } from './layouts.js';\nmdsvex({ layout: layouts });";
		const { code, notes } = migrate_config(source);
		expect(code).toBe(source);
		expect(kinds(notes)).toEqual(["manual"]);
	});

	test("a conditional layout value is flagged", () => {
		const source =
			"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: dev ? './A.svelte' : { _: './B.svelte' } });";
		const { code, notes } = migrate_config(source);
		expect(code).toBe(source);
		expect(kinds(notes)).toEqual(["manual"]);
	});

	test("layout alongside templates is flagged", () => {
		const source =
			"import { mdsvex } from 'mdsvex';\nmdsvex({ layout: './A.svelte', templates: {} });";
		const { code, notes } = migrate_config(source);
		expect(code).toBe(source);
		expect(kinds(notes)).toEqual(["manual"]);
	});

	test("a syntax error throws", () => {
		expect(() => migrate_config("mdsvex({")).toThrow(SyntaxError);
	});
});

describe("frontmatter", () => {
	const fm = (source: string): string => {
		const { code, notes } = migrate_frontmatter(source);
		expect(notes).toEqual([]);
		return code;
	};

	test("layout becomes template", () => {
		expect(fm("---\ntitle: Hi\nlayout: blog\n---\n\n# Hi\n")).toBe(
			"---\ntitle: Hi\ntemplate: blog\n---\n\n# Hi\n",
		);
	});

	test("layout: false becomes template: false", () => {
		expect(fm("---\nlayout: false\n---\n")).toBe("---\ntemplate: false\n---\n");
	});

	test("the _ fallback becomes default", () => {
		expect(fm("---\nlayout: _\n---\n")).toBe("---\ntemplate: default\n---\n");
		expect(fm("---\nlayout: '_' # fallback\n---\n")).toBe(
			"---\ntemplate: 'default' # fallback\n---\n",
		);
	});

	test("quoted values and keys are kept", () => {
		expect(fm('---\n"layout": "blog"\n---\n')).toBe('---\n"template": "blog"\n---\n');
	});

	test("nested layout keys are left alone", () => {
		const source = "---\npage:\n  layout: grid\n---\n";
		expect(fm(source)).toBe(source);
	});

	test("layout in the body is left alone", () => {
		const source = "---\ntitle: Hi\n---\n\nlayout: blog\n";
		expect(fm(source)).toBe(source);
	});

	test("crlf line endings", () => {
		expect(fm("---\r\nlayout: blog\r\n---\r\n")).toBe("---\r\ntemplate: blog\r\n---\r\n");
	});

	test("an existing template key is flagged", () => {
		const source = "---\nlayout: blog\ntemplate: two-column\n---\n";
		const { code, notes } = migrate_frontmatter(source);
		expect(code).toBe(source);
		expect(notes).toEqual([
			{ kind: "template_key", message: expect.any(String), line: 3, column: 1 },
		]);
	});

	test("migrate keeps frontmatter and renames layout", () => {
		const out = migrate("---\nlayout: blog\ntitle: Hi\n---\n\n# Hello *x*\n");
		expect(out).toBe("---\ntemplate: blog\ntitle: Hi\n---\n\n# Hello _x_\n");
		expect(parse_markdown_svelte(out).errors.size).toBe(0);
	});

	test("migrate with only frontmatter", () => {
		expect(migrate("---\nlayout: false\n---")).toBe("---\ntemplate: false\n---\n");
	});
});

describe("template components", () => {
	test("<slot /> is flagged", () => {
		const notes = check_template(
			"<script>\n\texport let title;\n</script>\n\n<h1>{title}</h1>\n<slot />\n",
		);
		expect(notes).toEqual([
			{
				kind: "slot",
				message: expect.stringContaining("{@render children()}"),
				line: 6,
				column: 1,
			},
		]);
	});

	test("{...$$props} is flagged", () => {
		const notes = check_template("<article {...$$props}>\n\t<slot></slot>\n</article>");
		expect(notes).toEqual([
			{
				kind: "legacy_props",
				message: expect.stringContaining("let { children, ...props } = $props()"),
				line: 1,
				column: 10,
			},
			{ kind: "slot", message: expect.any(String), line: 2, column: 2 },
		]);
	});

	test("$$props and $$restProps in script are flagged", () => {
		const notes = check_template(
			"<script>\n\tconst { title } = $$props;\n\tconst rest = $$restProps;\n</script>",
		);
		expect(notes.map((n) => [n.kind, n.line, n.column])).toEqual([
			["legacy_props", 2, 20],
			["legacy_props", 3, 15],
		]);
		expect(notes[1].message).toContain("`$$restProps`");
	});

	test("comments, scripts and styles don't count", () => {
		const notes = check_template(
			"<!-- <slot /> {...$$props} -->\n<script>\n\t// $$props\n\tconst s = '<slot>';\n</script>\n<style>\n\tslot { color: red }\n</style>\n{@render children()}",
		);
		expect(notes).toEqual([]);
	});

	test("a runes template has nothing to flag", () => {
		expect(
			check_template(
				"<script>\n\tlet { title, children } = $props();\n</script>\n\n<h1>{title}</h1>\n{@render children()}\n",
			),
		).toEqual([]);
	});
});
