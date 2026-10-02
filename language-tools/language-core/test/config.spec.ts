import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import type { MdsvexManifest } from "mdsvex";

import {
	create_config_loader,
	document_options,
	from_json,
	scan_exports,
} from "../src/config";
import { is_document } from "../src/language_plugin";

const HERE = dirname(fileURLToPath(import.meta.url));
const posix = (p: string) => p.replace(/\\/g, "/");

let roots: string[] = [];
afterEach(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
	roots = [];
});

function tree(files: Record<string, string>): string {
	const root = posix(mkdtempSync(join(HERE, ".tmp-config-")));
	roots.push(root);
	for (const [file, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, file)), { recursive: true });
		writeFileSync(join(root, file), content);
	}
	return root;
}

function manifest(root: string, extra: Partial<MdsvexManifest> = {}): string {
	return JSON.stringify({
		version: 1,
		root,
		extensions: [".svx"],
		component_mode: "markdown",
		frontmatter_parse: false,
		directive_plugins: false,
		select_template: false,
		templates: {},
		components: [],
		directives: [],
		documents: {},
		...extra,
	});
}

const MANIFEST = "node_modules/.mdsvex/manifest.json";

describe("finding the config of a document", () => {
	it("walks up to the nearest manifest or json config", () => {
		const root = tree({
			"app/src/routes/deep/doc.svx": "# x",
			"app/other/doc.svx": "# x",
			"doc.svx": "# x",
		});
		mkdirSync(join(root, "app/node_modules/.mdsvex"), { recursive: true });
		writeFileSync(join(root, "app", MANIFEST), manifest(root + "/app"));
		writeFileSync(join(root, "mdsvex.config.json"), "{}");
		const loader = create_config_loader({ typescript: ts });
		expect(loader.load(join(root, "app/src/routes/deep/doc.svx"))?.file).toBe(
			join(root, "app", MANIFEST),
		);
		expect(loader.load(join(root, "doc.svx"))?.file).toBe(
			join(root, "mdsvex.config.json"),
		);
	});

	it("prefers a manifest to a json config beside it, and skips an unknown version", () => {
		const root = tree({
			[MANIFEST]: manifest("/r"),
			"mdsvex.config.json": '{ "component_mode": "all" }',
		});
		const loader = create_config_loader({ typescript: ts });
		const doc = join(root, "doc.svx");
		expect(loader.load(doc)?.manifest.root).toBe("/r");
		writeFileSync(join(root, MANIFEST), JSON.stringify({ version: 2 }));
		utimesSync(join(root, MANIFEST), new Date(), new Date(Date.now() + 5000));
		expect(loader.load(doc)?.manifest.component_mode).toBe("all");
	});

	it("reads a changed file again and stamps it anew", () => {
		const root = tree({ [MANIFEST]: manifest("/r") });
		const seen: string[] = [];
		const loader = create_config_loader({ on_read: (f) => seen.push(f) });
		const doc = join(root, "doc.svx");
		const first = loader.options_for(doc).stamp;
		expect(loader.options_for(doc).stamp).toBe(first);
		writeFileSync(join(root, MANIFEST), manifest("/r", { component_mode: "all" }));
		utimesSync(join(root, MANIFEST), new Date(), new Date(Date.now() + 5000));
		const second = loader.options_for(doc);
		expect(second.stamp).not.toBe(first);
		expect(second.options.compile?.component_mode).toBe("all");
		expect(seen.filter((f) => f.endsWith("manifest.json"))).toHaveLength(2);
	});

	it("gives no options without a config", () => {
		const root = tree({ "doc.svx": "# x" });
		const loader = create_config_loader();
		expect(loader.options_for(join(root, "doc.svx"))).toEqual({
			stamp: "",
			options: {},
		});
	});

	it("takes the extensions of the config as documents", () => {
		const root = tree({
			[MANIFEST]: manifest("/r", { extensions: [".svx", ".md"] }),
		});
		const loader = create_config_loader();
		expect(is_document(join(root, "a.md"), loader)).toBe(true);
		expect(is_document(join(root, "a.svx"), loader)).toBe(true);
		expect(is_document(join(root, "a.pfm"), loader)).toBe(true);
		expect(is_document(join(root, "a.ts"), loader)).toBe(false);
		expect(is_document(join(root, "a.markdown"), loader)).toBe(false);
		// no config, only the extensions every document has
		expect(is_document("/nowhere/a.md", create_config_loader())).toBe(false);
	});
});

describe("document options from a manifest", () => {
	const m: MdsvexManifest = {
		version: 1,
		root: "/app",
		extensions: [".svx"],
		component_mode: "all",
		frontmatter_parse: true,
		directive_plugins: false,
		select_template: true,
		templates: {
			theme: {
				id: "mdsvex:template/theme",
				file: "/app/node_modules/@acme/theme/Layout.svelte",
				components: ["h1", "p"],
				extra: {
					id: "mdsvex:template/theme",
					file: "/app/src/lib/theme.ts",
					names: ["h1", "img"],
				},
				directives: [
					{
						id: "mdsvex:template-directives/theme",
						file: "/app/src/lib/theme-directives.ts",
						names: ["note"],
					},
				],
			},
		},
		components: [
			{ id: "mdsvex:components", file: "/app/src/lib/md.ts", names: ["a"] },
		],
		directives: [
			{ id: "mdsvex:directives", file: "/app/src/lib/d.mts", names: ["box"] },
		],
		documents: {
			"/app/src/blog/a.svx": "theme",
			"/app/src/changelog/b.svx": null,
		},
	};

	it("gives the compile options the plugin would", () => {
		const { compile } = document_options(m, "/app/src/blog/a.svx");
		expect(compile).toMatchObject({
			component_mode: "all",
			templates: {
				theme: {
					specifier: "mdsvex:template/theme",
					components: ["h1", "p", "img"],
					directives: [
						{ specifier: "mdsvex:template-directives/theme", names: ["note"] },
					],
				},
			},
			components: [{ specifier: "mdsvex:components", names: ["a"] }],
			directives: [{ specifier: "mdsvex:directives", names: ["box"] }],
		});
	});

	it("resolves each virtual id from the document, the extra module winning", () => {
		const { resolve } = document_options(m, "/app/src/blog/a.svx");
		expect(resolve!("mdsvex:template/theme", "default")).toBe(
			"../../node_modules/@acme/theme/Layout.svelte",
		);
		expect(resolve!("mdsvex:template/theme", "p")).toBe(
			"../../node_modules/@acme/theme/Layout.svelte",
		);
		expect(resolve!("mdsvex:template/theme", "h1")).toBe("../lib/theme.js");
		expect(resolve!("mdsvex:template-directives/theme", "note")).toBe(
			"../lib/theme-directives.js",
		);
		expect(resolve!("mdsvex:components", "a")).toBe("../lib/md.js");
		expect(resolve!("mdsvex:directives", "box")).toBe("../lib/d.mjs");
		expect(resolve!("mdsvex:components/3", "a")).toBeUndefined();
	});

	it("selects what select_template picked when the plugin compiled the file", () => {
		const pick = (doc: string) =>
			document_options(m, doc).compile!.select_template!({});
		expect(pick("/app/src/blog/a.svx")).toBe("theme");
		expect(pick("/app/src/changelog/b.svx")).toBe(false);
		expect(pick("/app/src/new.svx")).toBeUndefined();
	});

	it("reports directives and frontmatter only when nothing at build could handle them", () => {
		const opts = document_options(m, "/app/a.svx");
		expect(opts.report_directives).toBe(true);
		expect(opts.lenient_frontmatter).toBe(true);
		expect(
			document_options({ ...m, directive_plugins: true }, "/app/a.svx").report_directives,
		).toBe(false);
	});
});

describe("mdsvex.config.json", () => {
	const app = () =>
		tree({
			"package.json": JSON.stringify({ imports: { "#lib/*": "./src/lib/*" } }),
			"node_modules/@acme/theme/package.json": JSON.stringify({
				name: "@acme/theme",
				exports: { "./Layout.svelte": { svelte: "./src/Layout.svelte" } },
			}),
			"node_modules/@acme/theme/src/Layout.svelte": [
				'<script module lang="ts">',
				"  export { default as h1 } from './H1.svelte';",
				"  export type Props = { a: string };",
				"</script>",
			].join("\n"),
			"src/lib/Docs.svelte": [
				"<!-- <script module>export const nope = 1</script> -->",
				"<script module>",
				"  export { default as h2, default as p } from './Heading.svelte';",
				"  export * as directives from './directives.ts';",
				"  export const helper = 1;",
				"</script>",
				"<script>let { children } = $props();</script>",
			].join("\n"),
			"src/lib/directives.ts": "export { default as Callout } from './Callout.svelte';\nexport function note() {}\n",
			"src/lib/theme.ts": "export { default as img } from './Img.svelte';\n",
			"src/lib/md.ts": "export { default as a } from './A.svelte';\nexport * as directives from './root-directives.ts';\n",
			"src/lib/root-directives.ts": "export { default as box } from './Box.svelte';\n",
			"src/lib/more.ts": "export { default as em } from './Em.svelte';\n",
		});

	it("resolves and scans what a config names, as the plugin does", () => {
		const root = app();
		const m = from_json(
			{
				extensions: ["md", ".svx"],
				templates: {
					docs: "#lib/Docs.svelte",
					theme: { component: "@acme/theme/Layout.svelte", components: "./src/lib/theme.ts" },
					missing: "#lib/Missing.svelte",
				},
				components: ["#lib/md.ts", "./src/lib/more.ts"],
			},
			root,
			ts,
		);
		expect(m.extensions).toEqual([".md", ".svx"]);
		expect(Object.keys(m.templates)).toEqual(["docs", "theme"]);
		expect(m.templates.docs).toEqual({
			id: "mdsvex:template/docs",
			file: root + "/src/lib/Docs.svelte",
			components: ["h2", "p", "helper"],
			extra: null,
			directives: [
				{
					id: "mdsvex:template-directives/docs",
					file: root + "/src/lib/directives.ts",
					names: ["Callout", "note"],
				},
			],
		});
		expect(m.templates.theme).toMatchObject({
			file: root + "/node_modules/@acme/theme/src/Layout.svelte",
			components: ["h1"],
			extra: { file: root + "/src/lib/theme.ts", names: ["img"] },
		});
		expect(m.components).toEqual([
			{ id: "mdsvex:components/0", file: root + "/src/lib/md.ts", names: ["a"] },
			{ id: "mdsvex:components/1", file: root + "/src/lib/more.ts", names: ["em"] },
		]);
		expect(m.directives).toEqual([
			{
				id: "mdsvex:directives/0",
				file: root + "/src/lib/root-directives.ts",
				names: ["box"],
			},
		]);
	});

	it("scans nothing without typescript, so nothing is replaced", () => {
		const root = app();
		expect(scan_exports(root + "/src/lib/md.ts", undefined)).toEqual({
			names: [],
			directives: null,
		});
	});
});
