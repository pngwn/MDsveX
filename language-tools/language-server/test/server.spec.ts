import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startLanguageServer } from "@volar/test-utils";
import type { LanguageServerHandle } from "@volar/test-utils";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, "../dist/server.cjs");
const require = createRequire(import.meta.url);

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

const FILES: Record<string, string> = {
	"src/lib/Docs.svelte": svelte(
		"title: string; draft?: boolean; children: Snippet",
		"  export { default as h2 } from './Heading.svelte';\n  export * as directives from './directives.ts';",
	),
	"src/lib/Plain.svelte": svelte("children: Snippet"),
	"src/lib/Heading.svelte": svelte("children?: Snippet"),
	"src/lib/Callout.svelte": svelte("tone?: 'info' | 'warn'; children?: Snippet"),
	"src/lib/directives.ts": "export { default as Callout } from './Callout.svelte';\n",
	"src/doc.svx": [
		"---",
		"draft: yes",
		"template: docs",
		"---",
		"",
		"## Heading",
		"",
		":::Callout[x](tone=urgent)",
		":::",
		"",
		"::missing[y]",
		"",
	].join("\n"),
};

describe.skipIf(!existsSync(SERVER))("the language server", () => {
	let root: string;
	let server: LanguageServerHandle;
	let doc: TextDocument;
	const at = (needle: string, delta = 0) =>
		doc.positionAt(doc.getText().indexOf(needle) + delta);

	beforeAll(async () => {
		root = mkdtempSync(join(HERE, ".tmp-server-"));
		for (const [file, content] of Object.entries(FILES)) {
			mkdirSync(dirname(join(root, file)), { recursive: true });
			writeFileSync(join(root, file), content);
		}
		const lib = root + "/src/lib/";
		mkdirSync(join(root, "node_modules/.mdsvex"), { recursive: true });
		writeFileSync(
			join(root, "node_modules/.mdsvex/manifest.json"),
			JSON.stringify({
				version: 1,
				root,
				extensions: [".svx"],
				component_mode: "markdown",
				frontmatter_parse: false,
				directive_plugins: false,
				select_template: false,
				templates: {
					docs: {
						id: "mdsvex:template/docs",
						file: lib + "Docs.svelte",
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
					plain: {
						id: "mdsvex:template/plain",
						file: lib + "Plain.svelte",
						components: [],
						extra: null,
						directives: [],
					},
				},
				components: [],
				directives: [],
				documents: {},
			}),
		);
		// windows can not remove a directory a live process works in
		server = startLanguageServer(SERVER, HERE);
		await server.initialize(URI.file(root).toString(), {
			typescript: { tsdk: dirname(require.resolve("typescript")) },
		});
		doc = await server.openTextDocument(join(root, "src/doc.svx"), "pfm");
	}, 60_000);

	afterAll(async () => {
		if (server) {
			const exited = new Promise((done) => server.process.once("exit", done));
			await server.shutdown();
			server.process.kill();
			await exited;
		}
		rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	});

	it("hovers and jumps straight to the component replacing a heading", async () => {
		const hover = await server.sendHoverRequest(doc.uri, at("## Heading"));
		expect((hover?.contents as { value: string }).value).toContain("const h2");
		const definitions = (await server.sendDefinitionRequest(
			doc.uri,
			at("## Heading"),
		)) as { uri: string }[];
		expect(definitions.map((d) => d.uri.split("/").pop())).toEqual([
			"Heading.svelte",
		]);
	});

	it("hovers a directive and the prop its arg becomes", async () => {
		const name = await server.sendHoverRequest(doc.uri, at("Callout["));
		expect((name?.contents as { value: string }).value).toContain("const Callout");
		const arg = await server.sendHoverRequest(doc.uri, at("tone="));
		expect((arg?.contents as { value: string }).value).toContain('"info" | "warn"');
	});

	it("types the template key as the union of template names", async () => {
		const hover = await server.sendHoverRequest(doc.uri, at("template:"));
		expect((hover?.contents as { value: string }).value).toContain(
			'(property) template: false | "docs" | "plain"',
		);
	});

	it("completes the template names and false", async () => {
		const list = await server.sendCompletionRequest(doc.uri, at("template: ", 10));
		expect(list?.items.map((i) => [i.label, i.detail])).toEqual([
			["docs", "./lib/Docs.svelte"],
			["plain", "./lib/Plain.svelte"],
			["false", "no template"],
		]);
		expect(list?.items[0].textEdit).toMatchObject({
			newText: "docs",
			range: { start: at("template: ", 10), end: at("docs\n", 4) },
		});
		expect(await server.sendCompletionRequest(doc.uri, at("## Heading", 3))).toMatchObject({
			items: expect.not.arrayContaining([expect.objectContaining({ label: "plain" })]),
		});
	});

	it("reports type errors and compile errors where they come from", async () => {
		const report = (await server.sendDocumentDiagnosticRequest(doc.uri)) as {
			items: { range: { start: unknown; end: unknown }; message: string }[];
		};
		const text = doc.getText();
		const found = report.items
			.map((d) => [
				text.slice(doc.offsetAt(d.range.start as never), doc.offsetAt(d.range.end as never)),
				d.message.split(". ")[0],
			])
			.sort();
		expect(found).toEqual([
			["::missing", "no component renders the directive ::missing at 11:1"],
			["draft", "Type 'string' is not assignable to type 'boolean'."],
			["tone", `Type '"urgent"' is not assignable to type '"info" | "warn"'.`],
		]);
	});
});
