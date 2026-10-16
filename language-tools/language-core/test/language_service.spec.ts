import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { project } from "./ts_harness";
import type { Project } from "./ts_harness";

const svelte = (props: string, module = "") =>
	[
		...(module ? ['<script module lang="ts">', module, "</script>"] : []),
		'<script lang="ts">',
		"  import type { Snippet } from 'svelte';",
		`  let p: { ${props} } = $props();`,
		"</script>",
		"<div></div>",
		"",
	].join("\n");

/** a vite app whose templates and replacements a manifest describes */
const APP: Record<string, string> = {
	"src/lib/templates/Docs.svelte": svelte(
		"title: string; draft?: boolean; children: Snippet",
		[
			"  export { default as h2 } from '../Heading.svelte';",
			"  export * as directives from '../directives.ts';",
		].join("\n"),
	),
	// no level prop, which the replacement still receives
	"src/lib/Heading.svelte": svelte("id?: string; children?: Snippet"),
	"src/lib/directives.ts": "export { default as Callout } from './Callout.svelte';\n",
	"src/lib/Callout.svelte": svelte(
		"kind: 'info' | 'warn'; label?: Snippet; children?: Snippet",
	),
	"src/lib/Img.svelte": svelte("src: string; alt: string"),
	"src/lib/Pre.svelte": svelte("lang?: string; code: string; children?: Snippet"),
	"src/lib/A.svelte": svelte("href: string; children?: Snippet"),
	"src/lib/Badge.svelte": svelte("tone?: 'info' | 'warn'; children?: Snippet"),
	"src/lib/markdown.ts": [
		"export { default as img } from './Img.svelte';",
		"export { default as pre } from './Pre.svelte';",
		"export { default as a } from './A.svelte';",
		"export * as directives from './root-directives.ts';",
		"",
	].join("\n"),
	"src/lib/root-directives.ts": "export { default as badge } from './Badge.svelte';\n",
};

function manifest(root: string) {
	const lib = root + "/src/lib/";
	return JSON.stringify({
		version: 1,
		root,
		extensions: [".svx"],
		component_mode: "all",
		frontmatter_parse: false,
		directive_plugins: false,
		select_template: false,
		templates: {
			docs: {
				id: "mdsvex:template/docs",
				file: lib + "templates/Docs.svelte",
				components: ["h2"],
				extra: null,
				directives: [
					{
						id: "mdsvex:template-directives/docs",
						file: lib + "directives.ts",
						names: ["Callout"],
					},
				],
			},
		},
		components: [
			{ id: "mdsvex:components", file: lib + "markdown.ts", names: ["img", "pre", "a"] },
		],
		directives: [
			{ id: "mdsvex:directives", file: lib + "root-directives.ts", names: ["badge"] },
		],
		documents: {},
	});
}

const VALID = `---
title: Hello
tags: [a, b]
nested:
  deep: 1
template: docs
---

<script>
  let n = $state(1);
  let url = '/a.png';
</script>

## Heading {n}

Text ![cat](./cat.png) and <img src={url} alt="x" loading="lazy" /> and [l](/x "t").

<a href="/y" class="c">typed</a>

\`\`\`js title="x"
const a = 1;
\`\`\`

:::Callout[Heads *up*](kind=warn)
Body :badge[new](tone=info)
:::

{metadata.title} {metadata.nested.deep} {metadata.tags.length}
`;

describe("with a plugin manifest", () => {
	let p: Project;
	beforeAll(() => {
		p = project({
			...APP,
			"src/valid.svx": VALID,
			"src/wrong.svx": [
				"---",
				"title: 3",
				"draft: yes",
				"extra: kept",
				"template: docs",
				"---",
				"",
				":::Callout[Hi](kind=warning)",
				"body",
				":::",
				"",
				"<img src={nope} alt=\"x\" />",
				"",
				"{title}",
				"",
			].join("\n"),
			"src/bare.svx": [
				"---",
				"title: x",
				"template: docs",
				"---",
				"",
				":::Callout(kind=warning)",
				"body",
				":::",
				"",
				":::Callout(kind=info)",
				"fine",
				":::",
				"",
				"::before is text",
				"",
			].join("\n"),
		});
		p.write("node_modules/.mdsvex/manifest.json", manifest(p.root));
	});
	afterAll(() => p.dispose());

	it("reports nothing on a valid document", () => {
		expect(p.diagnostics("src/valid.svx")).toEqual([]);
	});

	it("checks frontmatter against the template, directive args and expressions", () => {
		const found = p.diagnostics("src/wrong.svx").map((d) => [d.text, d.message]);
		expect(found).toEqual([
			["title", "Type 'number' is not assignable to type 'string'."],
			["draft", "Type 'string' is not assignable to type 'boolean | undefined'."],
			["kind", `Type '"warning"' is not assignable to type '"info" | "warn"'.`],
			["nope", "Cannot find name 'nope'."],
			// frontmatter is metadata, as compile makes it
			["title", "Cannot find name 'title'."],
		]);
	});

	it("checks and hovers a directive written without brackets", () => {
		const doc = "src/bare.svx";
		expect(p.diagnostics(doc).map((d) => [d.text, d.message])).toEqual([
			["kind", `Type '"warning"' is not assignable to type '"info" | "warn"'.`],
		]);
		expect(p.hover(doc, "Callout(", 1)).toContain("const Callout: Component<");
		expect(p.hover(doc, "kind=info")).toBe('(property) kind: "info" | "warn"');
	});

	it("hovers the replacement of a markdown element, typed element and directive", () => {
		const doc = "src/valid.svx";
		expect(p.hover(doc, "## Heading")).toContain("const h2: Component<");
		expect(p.hover(doc, "![cat]")).toContain("const img: Component<");
		expect(p.hover(doc, "img src", 1)).toContain("const img: Component<");
		expect(p.hover(doc, "```js")).toContain("const pre: Component<");
		expect(p.hover(doc, "Callout[", 1)).toContain("const Callout: Component<");
		expect(p.hover(doc, "badge[")).toContain("const badge: Component<");
		expect(p.hover(doc, "docs\n---")).toContain("Template_MDSVEX: Component<");
	});

	it("hovers frontmatter keys and directive args with their types", () => {
		const doc = "src/valid.svx";
		expect(p.hover(doc, "title:")).toBe("(property) title: string");
		// the names of the configured templates, as only they or false compile
		expect(p.hover(doc, "template:")).toBe('(property) template: false | "docs"');
		expect(p.hover(doc, "tags:")).toBe("(property) tags: string[]");
		// the prop the arg becomes, as the component declares it
		expect(p.hover(doc, "kind=")).toBe('(property) kind: "info" | "warn"');
		expect(p.hover(doc, "metadata.title", 9)).toBe("(property) title: string");
	});
});

describe("live expressions in code", () => {
	const LIVE = [
		"<script lang=\"ts\">",
		"  let install_command = 'pnpm add';",
		"  let count = 1;",
		"  let unread = 2;",
		"</script>",
		"",
		"```sh",
		"{install_command} @pkg/my-pkg # [!eval]",
		"{count.nope} # [!eval]",
		"```",
		"",
		"```js eval",
		"run({install_command})",
		"```",
		"",
	].join("\n");
	let p: Project;
	beforeAll(() => {
		p = project({ ...APP, "src/live.svx": LIVE });
		p.write("node_modules/.mdsvex/manifest.json", manifest(p.root));
	});
	afterAll(() => p.dispose());

	it("checks a live expression", () => {
		expect(p.diagnostics("src/live.svx").map((d) => [d.text, d.message])).toEqual([
			["nope", "Property 'nope' does not exist on type 'number'."],
		]);
	});

	it("hovers a live expression", () => {
		expect(p.hover("src/live.svx", "install_command} @")).toBe(
			"let install_command: string",
		);
		expect(p.hover("src/live.svx", "install_command})")).toBe(
			"let install_command: string",
		);
	});

	it("renames through a live expression", () => {
		const at = (needle: string) => LIVE.indexOf(needle);
		expect(p.rename("src/live.svx", "install_command} @").sort()).toEqual(
			[
				["src/live.svx", at("install_command =")],
				["src/live.svx", at("install_command} @")],
				["src/live.svx", at("install_command})")],
			].sort(),
		);
	});

	it("counts a live expression as a read", () => {
		const unread = p
			.suggestions("src/live.svx")
			.filter((d) => d.code === 6133)
			.map((d) => d.text);
		expect(unread).toEqual(["unread"]);
	});

	it("reads nothing live when the plugin renders code plain", () => {
		const q = project({ ...APP, "src/live.svx": LIVE });
		try {
			q.write(
				"node_modules/.mdsvex/manifest.json",
				JSON.stringify({ ...JSON.parse(manifest(q.root)), highlight: false }),
			);
			expect(q.diagnostics("src/live.svx")).toEqual([]);
		} finally {
			q.dispose();
		}
	});
});

describe("without a config", () => {
	let p: Project;
	beforeAll(() => {
		p = project({
			"doc.pfm": [
				"---",
				"title: x",
				"---",
				"",
				":::anything[x](a=b)",
				"body :inline[y]",
				":::",
				"",
				"::leaf[z]",
				"",
				"{metadata.title}",
				"",
			].join("\n"),
		});
	});
	afterAll(() => p.dispose());

	it("reports nothing, a directive no config names may be rendered at build", () => {
		expect(p.diagnostics("doc.pfm")).toEqual([]);
	});
});

describe("with a mdsvex.config.json", () => {
	let p: Project;
	beforeAll(() => {
		p = project({
			...APP,
			"package.json": JSON.stringify({ imports: { "#lib/*": "./src/lib/*" } }),
			"mdsvex.config.json": JSON.stringify({
				templates: { docs: "#lib/templates/Docs.svelte" },
				components: "#lib/markdown.ts",
			}),
			"src/doc.svx": [
				"---",
				"draft: yes",
				"template: docs",
				"---",
				"",
				"## Two",
				"",
				":::Callout[x](kind=info)",
				":::",
				"",
				"![c](/c.png)",
				"",
			].join("\n"),
		});
	});
	afterAll(() => p.dispose());

	it("resolves and scans the config itself", () => {
		expect(p.diagnostics("src/doc.svx").map((d) => d.text)).toEqual(["draft"]);
		expect(p.hover("src/doc.svx", "## Two")).toContain("const h2: Component<");
		expect(p.hover("src/doc.svx", "Callout[", 1)).toContain(
			"const Callout: Component<",
		);
		expect(p.hover("src/doc.svx", "![c]")).toContain("const img: Component<");
	});
});

describe("the plugin_data export", () => {
	const DOC = "# One\n\n{plugin_data.toc.headings.length} {plugin_data.other}\n";
	const USE = [
		'import { plugin_data } from "./doc.svx";',
		"export const n: number = plugin_data.toc.headings.length;",
		"export const wrong: string = plugin_data.toc.headings;",
		"",
	].join("\n");
	const TYPES = [
		"export {};",
		'declare module "mdsvex" {',
		"\tinterface PluginData {",
		"\t\ttoc: { headings: { depth: number; text: string }[] };",
		"\t}",
		"}",
		"",
	].join("\n");

	it("resolves in the document and from an import when the config has plugins", () => {
		const p = project({
			"mdsvex.config.json": JSON.stringify({
				plugins: [{ name: "toc", module: "./toc.js", directives: [] }],
			}),
			"src/doc.svx": DOC,
			"src/use.ts": USE,
			"src/types.d.ts": TYPES,
		});
		try {
			expect(p.diagnostics("src/doc.svx")).toEqual([]);
			expect(p.hover("src/doc.svx", "plugin_data.toc")).toContain("PluginData");
			expect(p.diagnostics("src/use.ts").map((d) => d.text)).toEqual(["wrong"]);
		} finally {
			p.dispose();
		}
	});

	it("is not declared without plugins", () => {
		const p = project({
			"mdsvex.config.json": JSON.stringify({}),
			"src/doc.svx": DOC,
		});
		try {
			expect(p.diagnostics("src/doc.svx").map((d) => d.text)).toEqual([
				"plugin_data",
				"plugin_data",
			]);
		} finally {
			p.dispose();
		}
	});
});

describe("an image the build imports", () => {
	const FILES: Record<string, string> = {
		// a replacement that takes what an enhanced import gives, not a string
		"src/lib/Picture.svelte": svelte("src: { img: { src: string } }; alt: string"),
		"src/lib/pictures.ts": "export { default as img } from './Picture.svelte';\n",
		"src/enhanced.d.ts": [
			"declare module '*?enhanced' {",
			"\tconst picture: { img: { src: string } };",
			"\texport default picture;",
			"}",
			"",
		].join("\n"),
		"src/doc.svx": "![A chart](./chart.png?enhanced)\n\n![Gone](./gone.png)\n",
	};

	function with_manifest(import_images: boolean | undefined) {
		const p = project(FILES);
		const lib = p.root + "/src/lib/";
		p.write(
			"node_modules/.mdsvex/manifest.json",
			JSON.stringify({
				version: 1,
				root: p.root,
				extensions: [".svx"],
				component_mode: "markdown",
				frontmatter_parse: false,
				directive_plugins: false,
				select_template: false,
				templates: {},
				components: [
					{ id: "mdsvex:components", file: lib + "pictures.ts", names: ["img"] },
				],
				directives: [],
				documents: {},
				...(import_images === undefined ? {} : { import_images }),
			}),
		);
		return p;
	}

	/** what typescript finds wrong with a src in the generated code of the document */
	function src_errors(p: Project): string[] {
		const program = p.program();
		const doc = program
			.getSourceFiles()
			.find((f) => f.fileName.endsWith("doc.svx"))!;
		return program
			.getSemanticDiagnostics(doc)
			.filter((d) => d.code === 2322)
			.map((d) => doc.text.slice(d.start!, d.start! + d.length!));
	}

	it("is typed as the import when the manifest says the plugin imports it", () => {
		const p = with_manifest(true);
		try {
			expect(src_errors(p)).toEqual([]);
			// ./gone.png resolves to no module, its import line maps to nothing and reports nothing
			expect(p.diagnostics("src/doc.svx")).toEqual([]);
		} finally {
			p.dispose();
		}
	});

	it("is a string without the field, as the plugin had it off", () => {
		const p = with_manifest(undefined);
		try {
			expect(src_errors(p)).toEqual(['"src"', '"src"']);
		} finally {
			p.dispose();
		}
	});

	it("is imported with a mdsvex.config.json unless it says false", () => {
		const config = (json: object) =>
			project({
				...FILES,
				"mdsvex.config.json": JSON.stringify({
					components: "./src/lib/pictures.ts",
					...json,
				}),
			});
		const on = config({});
		const off = config({ import_images: false });
		try {
			expect(src_errors(on)).toEqual([]);
			expect(src_errors(off)).toEqual(['"src"', '"src"']);
		} finally {
			on.dispose();
			off.dispose();
		}
	});
});

describe("the props markdown gives a replacement", () => {
	const MODULE = [
		"export { default as img } from './Picture.svelte';",
		"export { default as h2 } from './H.svelte';",
		"export { default as a } from './A.svelte';",
		"",
	].join("\n");

	function check(props: { img: string; h2: string; a: string }, doc: string) {
		const p = project({
			"src/lib/Picture.svelte": svelte(props.img),
			"src/lib/H.svelte": svelte(props.h2),
			"src/lib/A.svelte": svelte(props.a),
			"src/lib/m.ts": MODULE,
			"src/enhanced.d.ts": [
				"declare module '*?enhanced' {",
				"\tconst picture: { img: { src: string } };",
				"\texport default picture;",
				"}",
				"",
			].join("\n"),
			"mdsvex.config.json": JSON.stringify({ components: "./src/lib/m.ts" }),
			"src/doc.svx": doc,
		});
		try {
			return p.diagnostics("src/doc.svx").map((d) => [d.code, d.text]);
		} finally {
			p.dispose();
		}
	}

	const FIT = {
		img: "src: string; alt: string; title?: string",
		h2: "level: number; id?: string; children: Snippet",
		a: "href: string; title?: string; children: Snippet",
	};

	it("reports none when the props fit", () => {
		expect(
			check(FIT, '![A chart](/chart.png "Big")\n\n## Two\n\n[l](/x "t")\n'),
		).toEqual([]);
	});

	it("reports a prop that does not fit at the markdown that makes it", () => {
		const props = {
			img: "src: number; alt: string",
			h2: "level: string; children: Snippet",
			a: "href: number; children: Snippet",
		};
		expect(check(props, "![A chart](/chart.png)\n\n## Two\n\n[l](/x)\n")).toEqual([
			[2322, "/chart.png"],
			[2322, "##"],
			[2322, "/x"],
		]);
	});

	it("reports the alt and title of an image and the title of a link at their text", () => {
		const props = {
			...FIT,
			img: "src: string; alt: number; title?: number",
			a: "href: string; title?: number; children: Snippet",
		};
		expect(
			check(props, '![A chart](/chart.png "Big")\n\n[l](</a b> (t))\n'),
		).toEqual([
			[2322, "A chart"],
			[2322, "Big"],
			[2322, "t"],
		]);
	});

	it("reports a reference link or image as a whole, its destination is in the definition", () => {
		const props = {
			...FIT,
			img: "src: number; alt: string",
			a: "href: number; children: Snippet",
		};
		expect(check(props, "[ref]: /x\n\n[l][ref] and ![A][ref]\n")).toEqual([
			[2322, "[l][ref]"],
			[2322, "![A][ref]"],
		]);
	});

	it("reports no prop the replacement does not declare, as for html it replaces", () => {
		const props = {
			img: "src: string",
			h2: "children: Snippet",
			a: "href: string; children: Snippet",
		};
		expect(
			check(props, '![A chart](/chart.png "Big")\n\n## Two\n\n[l](/x "t")\n'),
		).toEqual([]);
	});

	it("reports an imported image whose module the replacement does not take", () => {
		expect(
			check(FIT, "![A chart](./chart.png?enhanced)\n\n![Kept](/kept.png)\n"),
		).toEqual([[2322, "./chart.png?enhanced"]]);
	});
});
