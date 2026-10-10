import { describe, it, expect } from "vitest";
import { pfmToSvelte, template_value_at } from "../src/pfm_to_svelte";
import type {
	EditorMappingData,
	PfmToSvelteOptions,
	PfmToSvelteResult,
} from "../src/pfm_to_svelte";
import type { Mapping, MappingData } from "@mdsvex/render/mappings";

function src_of(source: string, m: Mapping<MappingData>) {
	return source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]);
}

function gen_of(code: string, m: Mapping<MappingData>) {
	const len = m.generatedLengths ? m.generatedLengths[0] : m.lengths[0];
	return code.slice(m.generatedOffsets[0], m.generatedOffsets[0] + len);
}

/** the source, generated text and capabilities of each mapping the converter added */
function added(source: string, r: PfmToSvelteResult) {
	return r.mappings
		.filter((m) => (m.data as EditorMappingData).editor)
		.map((m) => {
			const d = m.data;
			const caps =
				(d.verification ? "v" : "") +
				(d.completion ? "c" : "") +
				(d.semantic ? "s" : "") +
				(d.navigation ? "n" : "");
			return [src_of(source, m), gen_of(r.code, m), caps];
		});
}

function valid(source: string, r: PfmToSvelteResult) {
	for (const m of r.mappings) {
		const len = m.generatedLengths ? m.generatedLengths[0] : m.lengths[0];
		expect(m.sourceOffsets[0] + m.lengths[0]).toBeLessThanOrEqual(source.length);
		expect(m.generatedOffsets[0] + len).toBeLessThanOrEqual(r.code.length);
	}
}

const FILES: Record<string, string> = {
	"mdsvex:template/docs": "./lib/Docs.svelte",
	"mdsvex:template-directives/docs": "./lib/directives.js",
	"mdsvex:components": "./lib/markdown.js",
	"mdsvex:directives": "./lib/root-directives.js",
};

const docs: PfmToSvelteOptions = {
	compile: {
		templates: {
			docs: {
				specifier: "mdsvex:template/docs",
				components: ["h2"],
				directives: [
					{ specifier: "mdsvex:template-directives/docs", names: ["Callout"] },
				],
			},
		},
		components: [{ specifier: "mdsvex:components", names: ["img", "a"] }],
	},
	resolve: (id) => FILES[id],
	report_directives: true,
};

describe("pfmToSvelte with a config", () => {
	it("compiles as core does, imports pointing at the resolved files", () => {
		const source = "---\ntemplate: docs\n---\n\n## Two\n\n![cat](/c.png)\n";
		const r = pfmToSvelte(source, docs);
		valid(source, r);
		expect(r.template).toBe("docs");
		expect(r.code).toContain('import Template_MDSVEX from "./lib/Docs.svelte";');
		expect(r.code).toContain(
			'import { h2 as H2_MDSVEX_T } from "./lib/Docs.svelte";',
		);
		expect(r.code).toContain(
			'import { img as Img_MDSVEX_G } from "./lib/markdown.js";',
		);
		expect(r.code).not.toContain("mdsvex:");
		expect(r.code).toContain("<Template_MDSVEX {...metadata} {...__mdsvex_props}>");
		expect(r.code).toContain("<H2_MDSVEX_T level={2}>Two</H2_MDSVEX_T>");
		expect(r.diagnostics).toEqual([]);
	});

	it("unwraps a paragraph of only images when the config says so", () => {
		const source = "text\n\n![cat](/c.png)\n";
		const compile = { components: docs.compile!.components };
		const off = pfmToSvelte(source, { ...docs, compile });
		expect(off.code).toContain('<p><Img_MDSVEX_G src="/c.png" alt="cat" /></p>');
		const on = pfmToSvelte(source, {
			...docs,
			compile: { ...compile, unwrap_images: true },
		});
		valid(source, on);
		expect(on.code).toContain('<p>text</p><Img_MDSVEX_G src="/c.png" alt="cat" />');
		expect(on.code).not.toContain("<p><Img_MDSVEX_G");
		expect(on.diagnostics).toEqual([]);
	});

	it("keeps the virtual id of an import it can not resolve", () => {
		const source = "## Two\n\n![cat](/c.png)\n";
		const r = pfmToSvelte(source, {
			...docs,
			compile: { ...docs.compile, default_template: "docs" },
			resolve: (id, name) => (name === "h2" ? "./lib/Docs.svelte" : undefined),
		});
		expect(r.code).toContain(
			'import { h2 as H2_MDSVEX_T } from "./lib/Docs.svelte";',
		);
		expect(r.code).toContain(
			"import { default as Template_MDSVEX } from 'mdsvex:template/docs';",
		);
		expect(r.code).toContain("import { img as Img_MDSVEX_G } from 'mdsvex:components';");
	});

	it("points each replaced element and directive at its export", () => {
		const source =
			"---\ntemplate: docs\n---\n\n## Two\n\n![cat](/c.png) [l](/x)\n\n:::Callout[Hi](kind=warn)\nbody\n:::\n";
		const r = pfmToSvelte(source, docs);
		valid(source, r);
		const hovers = added(source, r).filter(([, , caps]) => caps === "sn");
		expect(hovers).toContainEqual(["##", "h2", "sn"]);
		expect(hovers).toContainEqual(["!", "img", "sn"]);
		expect(hovers).toContainEqual(["](/x)", "a", "sn"]);
		expect(hovers).toContainEqual(["Callout", "Callout", "sn"]);
		// the template value points at the template
		expect(hovers).toContainEqual(["docs", "Template_MDSVEX", "sn"]);
	});

	it("drops the capabilities of syntax that maps onto a whole component tag", () => {
		const source = "---\ntemplate: docs\n---\n\n## Two\n";
		const r = pfmToSvelte(source, docs);
		const open = r.mappings.find((m) => gen_of(r.code, m) === "<H2_MDSVEX_T level={2}>");
		expect(open).toBeDefined();
		const d = open!.data;
		expect(d.verification || d.semantic || d.navigation || d.completion).toBeFalsy();
	});

	it("maps directive args to the props they become, checked", () => {
		const source =
			'---\ntemplate: docs\n---\n\n:::Callout[Hi](kind=warn, title="a b")\nbody\n:::\n';
		const r = pfmToSvelte(source, {
			...docs,
			compile: {
				...docs.compile,
				templates: {
					docs: {
						...docs.compile!.templates!.docs,
					},
				},
			},
		});
		valid(source, r);
		expect(r.code).toContain('<Callout_MDSVEX_D_T kind="warn" title="a b">');
		const args = added(source, r).filter(([, , caps]) => caps === "vsn");
		expect(args).toEqual([
			["kind", "kind", "vsn"],
			["warn", "warn", "vsn"],
			["title", "title", "vsn"],
			["a b", "a b", "vsn"],
		]);
	});

	it("checks typed attribute values of a replaced element but not their names", () => {
		const source = '<script>\nlet u = "/a.png";\n</script>\n\n<img src={u} loading="lazy" />\n';
		const r = pfmToSvelte(source, {
			...docs,
			compile: { ...docs.compile, component_mode: "all" },
		});
		valid(source, r);
		expect(r.code).toContain('<Img_MDSVEX_G src={u} loading="lazy" />');
		const attrs = added(source, r).filter(([, , caps]) => caps.includes("c"));
		expect(attrs).toEqual([
			["src", "src", "csn"],
			["{u}", "{u}", "vcsn"],
			["loading", "loading", "csn"],
			['"lazy"', '"lazy"', "vcsn"],
		]);
		// the tag name hovers the replacement
		expect(added(source, r)).toContainEqual(["img", "img", "sn"]);
	});

	it("checks the frontmatter against the props of the template", () => {
		const source = "---\ntitle: Hi\nmy-key: 1\ntemplate: docs\n---\n\n# x\n";
		const r = pfmToSvelte(source, docs);
		valid(source, r);
		expect(r.code).toContain(
			';({ title: "Hi", "my-key": 1, template: "docs" }) satisfies ' +
				"Partial<import('svelte').ComponentProps<typeof Template_MDSVEX>> & Record<string, unknown>;",
		);
		const checks = added(source, r).filter(([, , caps]) => caps === "v");
		expect(checks).toEqual([
			["title", "title", "v"],
			["my-key", '"my-key"', "v"],
			["template", "template", "v"],
		]);
		// the check sits in the instance script, where the template is in scope
		const instance = /<script>[^]*?<\/script>/.exec(r.code)![0];
		expect(instance).toContain("satisfies");
	});

	it("types the template key as the union of template names and false", () => {
		const source = "---\ntitle: Hi\ntemplate: docs\n---\n\n# x\n";
		const r = pfmToSvelte(source, docs);
		expect(r.code).toContain(
			'export const metadata = {title: "Hi", template: "docs" as "docs" | false};',
		);
		expect(r.frontmatter).toEqual({ start: 4, end: 29 });
		// without templates the key is whatever the frontmatter holds
		expect(pfmToSvelte(source).code).toContain(
			'export const metadata = {title: "Hi", template: "docs"};',
		);
	});

	it("emits a props type for every template and directive the config knows", () => {
		const r = pfmToSvelte("# x\n", {
			...docs,
			compile: {
				...docs.compile,
				directives: [{ specifier: "mdsvex:directives", names: ["box"] }],
			},
		});
		expect(r.probes).toEqual([
			{ kind: "template", name: "docs", alias: "__mdsvex_props_0" },
			{ kind: "directive", name: "Callout", template: "docs", alias: "__mdsvex_props_1" },
			{ kind: "directive", name: "box", alias: "__mdsvex_props_2" },
		]);
		// a document with no instance script gets one to hold them
		expect(r.code).toContain(
			'<script lang="ts">\n' +
				"type __mdsvex_props_0 = import('svelte').ComponentProps<typeof import(\"./lib/Docs.svelte\")[\"default\"]>;\n" +
				"type __mdsvex_props_1 = import('svelte').ComponentProps<typeof import(\"./lib/directives.js\")[\"Callout\"]>;\n" +
				"type __mdsvex_props_2 = import('svelte').ComponentProps<typeof import(\"./lib/root-directives.js\")[\"box\"]>;\n" +
				"</script>\n<h1>x</h1>",
		);
		expect(pfmToSvelte("# x\n").probes).toEqual([]);
	});

	it("checks nothing without a template", () => {
		const source = "---\ntitle: Hi\n---\n\n# x\n";
		const r = pfmToSvelte(source, docs);
		expect(r.code).not.toContain("satisfies");
	});

	it("passes select_template through, as the plugin binds it", () => {
		const source = "## Two\n";
		const r = pfmToSvelte(source, {
			...docs,
			compile: { ...docs.compile, select_template: () => "docs" },
		});
		expect(r.template).toBe("docs");
		expect(r.code).toContain("<H2_MDSVEX_T");
	});
});

describe("pfmToSvelte compile diagnostics", () => {
	it("reports a directive no component renders and renders its children", () => {
		const source = "# t\n\n:::thing[x]\nbody\n:::\n";
		const r = pfmToSvelte(source, docs);
		expect(r.diagnostics).toHaveLength(1);
		const [d] = r.diagnostics;
		expect(source.slice(d.start, d.end)).toBe(":::thing");
		expect(d.severity).toBe("error");
		expect(d.message).toContain(":::thing");
		expect(r.code).toContain("<p>body</p>");
	});

	it("never reports directives without a known config", () => {
		const source = "# t\n\n:::thing[x]\nbody\n:::\n\n:inline[y]\n";
		const r = pfmToSvelte(source);
		expect(r.diagnostics).toEqual([]);
		expect(r.code).toContain("<p>body</p>");
	});

	it("reports an argument a snippet takes and still renders", () => {
		const source = "::leaf[x](children=a)\n\n# after\n";
		const r = pfmToSvelte(source, {
			compile: { directives: [{ specifier: "mdsvex:directives", names: ["leaf"] }] },
			resolve: (id) => FILES[id],
		});
		expect(r.diagnostics).toHaveLength(1);
		expect(r.diagnostics[0].message).toContain("children");
		expect(r.code).toContain("<h1>after</h1>");
	});

	it("reports an unknown template at its line and renders without one", () => {
		const source = "---\ntitle: x\ntemplate: nope\n---\n\n## Two\n";
		const r = pfmToSvelte(source, docs);
		expect(r.diagnostics).toHaveLength(1);
		const [d] = r.diagnostics;
		expect(source.slice(d.start, d.end)).toBe("nope");
		expect(d.message).toContain('Unknown template "nope"');
		expect(r.template).toBeUndefined();
		expect(r.code).not.toContain("Template_MDSVEX");
		expect(r.metadata).toEqual({ title: "x", template: "nope" });
	});

	it("reports frontmatter the core parser rejects and types metadata loosely", () => {
		const source = "---\ntitle: x\nanchor: &a 1\n---\n\n{metadata.anything}\n";
		const r = pfmToSvelte(source);
		expect(r.diagnostics).toHaveLength(1);
		expect(source.slice(r.diagnostics[0].start, r.diagnostics[0].end)).toBe(
			"anchor: &a 1",
		);
		expect(r.metadata).toBeUndefined();
		expect(r.code).toContain("export const metadata: Record<string, any> = {};");
	});

	it("leaves rejected frontmatter to a custom parser", () => {
		const source = "---\nanchor: &a 1\n---\n\n# x\n";
		const r = pfmToSvelte(source, { lenient_frontmatter: true });
		expect(r.diagnostics).toEqual([]);
		expect(r.code).toContain("export const metadata: Record<string, any> = {};");
	});

	it("reports an element all mode keeps as a warning", () => {
		const source = "<img src=\"/a.png\" use:act />\n";
		const r = pfmToSvelte(source, {
			...docs,
			compile: { ...docs.compile, component_mode: "all" },
		});
		expect(r.diagnostics).toHaveLength(1);
		const [d] = r.diagnostics;
		expect(d.severity).toBe("warning");
		expect(source.slice(d.start, d.end)).toBe("<img");
	});
});

describe("template_value_at", () => {
	const source = "---\ntitle: x\ntemplate: docs # main\n'template':\n---\n";
	const frontmatter = { start: 4, end: source.indexOf("\n---", 4) };
	const value = (offset: number) => {
		const r = template_value_at(source, offset, frontmatter);
		return r && [source.slice(r.start, r.end), r.start];
	};

	it("gives the value of the template key the offset is in, without a comment", () => {
		const at = source.indexOf("docs");
		expect(value(at)).toEqual(["docs", at]);
		expect(value(at + 2)).toEqual(["docs", at]);
		expect(value(at + 4)).toEqual(["docs", at]);
	});

	it("gives an empty range for a key with no value yet", () => {
		const end = source.indexOf("\n---");
		expect(value(end)).toEqual(["", end]);
	});

	it("is null before the value, on another key or outside the frontmatter", () => {
		expect(value(source.indexOf("template:") + 3)).toBeNull();
		expect(value(source.indexOf("title") + 8)).toBeNull();
		expect(value(source.length)).toBeNull();
	});
});
