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
		parse_plugins: false,
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
		expect(p.hover(doc, "tags:")).toBe("(property) tags: string[]");
		// the prop the arg becomes, as the component declares it
		expect(p.hover(doc, "kind=")).toBe('(property) kind: "info" | "warn"');
		expect(p.hover(doc, "metadata.title", 9)).toBe("(property) title: string");
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
