import { describe, it, expect } from "vitest";
import { pfmToSvelte } from "../src/pfm_to_svelte";
import type { PfmToSvelteResult } from "../src/pfm_to_svelte";
import type { Mapping, MappingData } from "@mdsvex/render/mappings";

// ── helpers ──

function byRole(mappings: Mapping<MappingData>[], role: string) {
	return mappings.filter((m) => m.data.role === role);
}

function srcSlice(source: string, m: Mapping<MappingData>) {
	return source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]);
}

function genSlice(code: string, m: Mapping<MappingData>) {
	const len = m.generatedLengths ? m.generatedLengths[0] : m.lengths[0];
	return code.slice(m.generatedOffsets[0], m.generatedOffsets[0] + len);
}

/** find a content mapping whose source text contains `substr`. */
function findContentBySource(
	source: string,
	mappings: Mapping<MappingData>[],
	substr: string,
): Mapping<MappingData> | undefined {
	return byRole(mappings, "content").find((m) =>
		srcSlice(source, m).includes(substr),
	);
}

/** find a content mapping whose generated text contains `substr`. */
function findContentByGenerated(
	code: string,
	mappings: Mapping<MappingData>[],
	substr: string,
): Mapping<MappingData> | undefined {
	return byRole(mappings, "content").find((m) =>
		genSlice(code, m).includes(substr),
	);
}

/** assert all mappings have valid offsets. */
function assertMappingsValid(
	source: string,
	result: PfmToSvelteResult,
) {
	const { code, mappings } = result;
	for (const m of mappings) {
		for (let i = 0; i < m.sourceOffsets.length; i++) {
			const srcOff = m.sourceOffsets[i];
			const srcLen = m.lengths[i];
			const genOff = m.generatedOffsets[i];
			const genLen = m.generatedLengths ? m.generatedLengths[i] : m.lengths[i];

			expect(srcOff).toBeGreaterThanOrEqual(0);
			expect(srcOff + srcLen).toBeLessThanOrEqual(source.length);
			expect(genOff).toBeGreaterThanOrEqual(0);
			expect(genOff + genLen).toBeLessThanOrEqual(code.length);
		}
	}
}

// ── tests ──

describe("pfmToSvelte", () => {
	it("bare markdown (no frontmatter, no imports)", () => {
		const source = "# Hello\n\nWorld\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		// no <script> block
		expect(result.code).not.toContain("<script");
		// body rendered
		expect(result.code).toContain("<h1>Hello</h1>");
		expect(result.code).toContain("<p>World</p>");
	});

	it("frontmatter only", () => {
		const source = "---\ntitle: hello\n---\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("<script");
		expect(result.code).toContain("let title: any;");
		expect(result.code).toContain("</script>");
		expect(result.code).toContain("<h1>Hello</h1>");

		// title key maps back to source
		const titleMapping = findContentByGenerated(
			result.code,
			result.mappings,
			"title",
		);
		expect(titleMapping).toBeDefined();
		expect(srcSlice(source, titleMapping!)).toBe("title");
	});

	it("imports only", () => {
		const source =
			'import Component from "./Component.svelte"\n\n# Hello\n';
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("<script");
		expect(result.code).toContain(
			'import Component from "./Component.svelte"',
		);
		expect(result.code).toContain("<h1>Hello</h1>");

		// import maps back to source
		const importMapping = findContentBySource(
			source,
			result.mappings,
			"import Component",
		);
		expect(importMapping).toBeDefined();
		expect(genSlice(result.code, importMapping!)).toContain(
			"import Component",
		);
	});

	it("frontmatter + imports", () => {
		const source =
			'---\ntitle: hello\n---\nimport A from "./A.svelte"\n\n# {title}\n';
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("<script");
		expect(result.code).toContain('import A from "./A.svelte"');
		expect(result.code).toContain("let title: any;");

		// imports come before frontmatter declarations
		const importIdx = result.code.indexOf("import A");
		const letIdx = result.code.indexOf("let title");
		expect(importIdx).toBeLessThan(letIdx);
	});

	it("multiple imports", () => {
		const source =
			'import A from "./A.svelte"\nimport B from "./B.svelte"\n\n# Hello\n';
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain('import A from "./A.svelte"');
		expect(result.code).toContain('import B from "./B.svelte"');
	});

	it("multi-key frontmatter", () => {
		const source =
			"---\ntitle: hello\ncount: 42\ndescription: world\n---\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("let title: any;");
		expect(result.code).toContain("let count: any;");
		expect(result.code).toContain("let description: any;");

		// each key maps to its source position
		for (const keyName of ["title", "count", "description"]) {
			const m = findContentBySource(source, result.mappings, keyName);
			expect(m).toBeDefined();
			expect(srcSlice(source, m!)).toBe(keyName);
		}
	});

	it("frontmatter with block YAML value", () => {
		const source =
			"---\ntitle: hello\nbody: |\n  line1\n  line2\ntags: foo\n---\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		// should extract title, body, tags (not line1, line2)
		expect(result.code).toContain("let title: any;");
		expect(result.code).toContain("let body: any;");
		expect(result.code).toContain("let tags: any;");
		expect(result.code).not.toContain("let line1");
		expect(result.code).not.toContain("let line2");
	});

	it("empty frontmatter", () => {
		const source = "---\n---\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		// empty frontmatter still generates a script block (but with no declarations)
		expect(result.code).toContain("<script");
		expect(result.code).not.toContain("let ");
		expect(result.code).toContain("<h1>Hello</h1>");
	});

	it("existing script tag in body", () => {
		const source = "<script>\nlet x = 1;\n</script>\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		// script content should be merged
		expect(result.code).toContain("<script");
		expect(result.code).toContain("let x = 1;");
		expect(result.code).toContain("<h1>Hello</h1>");

		// should NOT have duplicate <script> tags
		const scriptCount = (result.code.match(/<script[^>]*>/g) || []).length;
		expect(scriptCount).toBe(1);
	});

	it("frontmatter + existing script tag", () => {
		const source =
			"---\ntitle: hello\n---\n\n<script>\nlet x = 1;\n</script>\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("let title: any;");
		expect(result.code).toContain("let x = 1;");

		// single <script> block
		const scriptCount = (result.code.match(/<script[^>]*>/g) || []).length;
		expect(scriptCount).toBe(1);
	});

	it("body with mustache expression", () => {
		const source = "{name}\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("{name}");

		// expression mapped with CI_SVELTE capabilities
		const nameMapping = findContentBySource(
			source,
			result.mappings,
			"name",
		);
		expect(nameMapping).toBeDefined();
		expect(nameMapping!.data.completion).toBe(true);
	});

	it("body with Svelte component", () => {
		const source =
			'import Counter from "./Counter.svelte"\n\n<Counter value={count} />\n';
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("<Counter");
		expect(result.code).toContain("value={count}");
	});

	it("frontmatter keys with invalid JS identifiers are skipped", () => {
		const source = "---\ntitle: hello\nmy-key: value\n$valid: yes\n---\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		expect(result.code).toContain("let title: any;");
		expect(result.code).toContain("let $valid: any;");
		// hyphenated key should be skipped
		expect(result.code).not.toContain("my-key");
	});

	it("preserves mapping accuracy for identity-mapped imports", () => {
		const source = 'import { onMount } from "svelte"\n\n# Hello\n';
		const result = pfmToSvelte(source);
		assertMappingsValid(source, result);

		const importMapping = findContentBySource(
			source,
			result.mappings,
			"import",
		);
		expect(importMapping).toBeDefined();

		// source and generated text should be identical
		const srcText = srcSlice(source, importMapping!);
		const genText = genSlice(result.code, importMapping!);
		expect(genText).toBe(srcText);
	});
});
