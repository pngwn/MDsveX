/**
 * End-to-end composition test.
 *
 * Tests three things:
 * 1. pfmToSvelte output is valid Svelte that the compiler accepts
 * 2. The mapping pipeline works with synthetic v3 maps
 * 3. The real pipeline works with svelte2tsx
 */
import { describe, it, expect } from "vitest";
import { compile } from "svelte/compiler";
import { svelte2tsx } from "svelte2tsx";
import { pfmToSvelte } from "../src/pfm_to_svelte";
import { v3ToVolarMappings } from "../src/v3_to_volar";
import { composeMappings } from "../src/compose_mappings";
import { CI_SVELTE } from "@mdsvex/render/mappings";
import type { Mapping, CodeInformation } from "@mdsvex/render/mappings";

// ── helpers ──

function findBySource(
	source: string,
	mappings: Mapping<CodeInformation>[],
	substr: string,
): Mapping<CodeInformation> | undefined {
	for (const m of mappings) {
		for (let i = 0; i < m.sourceOffsets.length; i++) {
			const text = source.slice(
				m.sourceOffsets[i],
				m.sourceOffsets[i] + m.lengths[i],
			);
			if (text.includes(substr)) return m;
		}
	}
	return undefined;
}

// ── Svelte compiler acceptance tests ──

describe("pfmToSvelte → Svelte compiler", () => {
	it("bare markdown compiles without error", () => {
		const svelte = pfmToSvelte("# Hello\n\nWorld\n");
		expect(() =>
			compile(svelte.code, { filename: "test.pfm", generate: "client" }),
		).not.toThrow();
	});

	it("frontmatter + imports compiles without error", () => {
		const pfm =
			'---\ntitle: hello\ncount: 42\n---\nimport Counter from "./Counter.svelte"\n\n# {title}\n\n<Counter value={count} />\n';
		const svelte = pfmToSvelte(pfm);
		expect(() =>
			compile(svelte.code, { filename: "test.pfm", generate: "client" }),
		).not.toThrow();
	});

	it("frontmatter + script tag compiles without error", () => {
		const pfm =
			"---\ntitle: hello\n---\n\n<script>\nlet x = 1;\n</script>\n\n# Hello\n";
		const svelte = pfmToSvelte(pfm);
		expect(() =>
			compile(svelte.code, { filename: "test.pfm", generate: "client" }),
		).not.toThrow();
	});

	it("complex document compiles without error", () => {
		const pfm = `---
title: Hello World
count: 42
---
import Counter from "./Counter.svelte"

# {title}

<Counter value={count} />

The count is {count + 1}.

> A blockquote with _emphasis_ and *strong*.

\`\`\`js
const x = 1;
\`\`\`

---

- item one
- item two
`;
		const svelte = pfmToSvelte(pfm);
		expect(() =>
			compile(svelte.code, { filename: "test.pfm", generate: "client" }),
		).not.toThrow();
	});
});

// ── Mapping composition tests with synthetic v3 maps ──

describe("Full mapping composition pipeline", () => {
	it("composes pfmToSvelte mappings with identity v3 map", () => {
		const pfm = "---\ntitle: hello\n---\n\n# Hello {title}\n";
		const svelte = pfmToSvelte(pfm);

		// Create a synthetic identity v3 map (as if svelte2tsx preserved source positions)
		// Map the entire generated code to itself
		const syntheticSegments: string[] = [];
		for (let i = 0; i < svelte.code.length; i++) {
			if (i === 0) {
				syntheticSegments.push("AAAA");
			} else {
				syntheticSegments.push("CAAC");
			}
		}

		const syntheticV3 = {
			version: 3 as const,
			sources: ["test.svelte"],
			mappings: syntheticSegments.join(","),
		};

		const svelteToTs = v3ToVolarMappings(
			syntheticV3,
			svelte.code,
			svelte.code,
		);
		expect(svelteToTs.length).toBeGreaterThan(0);

		const composed = composeMappings(svelte.mappings, svelteToTs);
		expect(composed.length).toBeGreaterThan(0);

		// "title" from frontmatter should survive composition
		const titleMapping = findBySource(pfm, composed, "title");
		expect(titleMapping).toBeDefined();
		expect(titleMapping!.data.verification).toBe(true);
	});

	it("frontmatter key positions are preserved through composition", () => {
		const pfm = "---\ntitle: hello\ncount: 42\n---\n\n# Hello\n";
		const svelte = pfmToSvelte(pfm);

		// Build identity v3 map
		const segs: string[] = [];
		for (let i = 0; i < svelte.code.length; i++) {
			segs.push(i === 0 ? "AAAA" : "CAAC");
		}
		const v3 = {
			version: 3 as const,
			sources: ["test.svelte"],
			mappings: segs.join(","),
		};

		const svelteToTs = v3ToVolarMappings(v3, svelte.code, svelte.code);
		const composed = composeMappings(svelte.mappings, svelteToTs);

		// both keys should map through
		const titleM = findBySource(pfm, composed, "title");
		const countM = findBySource(pfm, composed, "count");
		expect(titleM).toBeDefined();
		expect(countM).toBeDefined();

		// verify source offsets point into the YAML frontmatter area
		const fmStart = pfm.indexOf("title");
		const fmEnd = pfm.indexOf("---", 4);
		expect(titleM!.sourceOffsets[0]).toBeGreaterThanOrEqual(fmStart);
		expect(titleM!.sourceOffsets[0]).toBeLessThan(fmEnd);
	});

	it("import positions are preserved through composition", () => {
		const pfm = 'import A from "./A.svelte"\n\n# Hello\n';
		const svelte = pfmToSvelte(pfm);

		const segs: string[] = [];
		for (let i = 0; i < svelte.code.length; i++) {
			segs.push(i === 0 ? "AAAA" : "CAAC");
		}
		const v3 = {
			version: 3 as const,
			sources: ["test.svelte"],
			mappings: segs.join(","),
		};

		const svelteToTs = v3ToVolarMappings(v3, svelte.code, svelte.code);
		const composed = composeMappings(svelte.mappings, svelteToTs);

		const importM = findBySource(pfm, composed, "import A");
		expect(importM).toBeDefined();

		// source offset should point to the import in PFM
		expect(importM!.sourceOffsets[0]).toBe(0);
	});

	it("expression positions survive round-trip", () => {
		const pfm = "---\nname: world\n---\n\nHello {name}!\n";
		const svelte = pfmToSvelte(pfm);

		const segs: string[] = [];
		for (let i = 0; i < svelte.code.length; i++) {
			segs.push(i === 0 ? "AAAA" : "CAAC");
		}
		const v3 = {
			version: 3 as const,
			sources: ["test.svelte"],
			mappings: segs.join(","),
		};

		const svelteToTs = v3ToVolarMappings(v3, svelte.code, svelte.code);
		const composed = composeMappings(svelte.mappings, svelteToTs);

		// find the mustache expression mapping for "name"
		// (there may be multiple — one from frontmatter `let name`, one from {name})
		const nameMs = composed.filter((m) => {
			const text = pfm.slice(
				m.sourceOffsets[0],
				m.sourceOffsets[0] + m.lengths[0],
			);
			return text === "name";
		});

		// should find at least the frontmatter key and possibly the expression
		expect(nameMs.length).toBeGreaterThanOrEqual(1);

		// at least one should have CI_SVELTE-level capabilities
		const hasSvelteCapabilities = nameMs.some(
			(m) => m.data.completion === true && m.data.verification === true,
		);
		expect(hasSvelteCapabilities).toBe(true);
	});

	it("all composed mappings have valid offsets", () => {
		const pfm = `---
title: Hello
count: 42
---
import Counter from "./Counter.svelte"

# {title}

<Counter value={count} />

The count is {count + 1}.
`;
		const svelte = pfmToSvelte(pfm);

		const segs: string[] = [];
		for (let i = 0; i < svelte.code.length; i++) {
			segs.push(i === 0 ? "AAAA" : "CAAC");
		}
		const v3 = {
			version: 3 as const,
			sources: ["test.svelte"],
			mappings: segs.join(","),
		};

		const svelteToTs = v3ToVolarMappings(v3, svelte.code, svelte.code);
		const composed = composeMappings(svelte.mappings, svelteToTs);

		for (const m of composed) {
			for (let i = 0; i < m.sourceOffsets.length; i++) {
				expect(m.sourceOffsets[i]).toBeGreaterThanOrEqual(0);
				expect(m.sourceOffsets[i] + m.lengths[i]).toBeLessThanOrEqual(
					pfm.length,
				);
				expect(m.generatedOffsets[i]).toBeGreaterThanOrEqual(0);
				const genLen = m.generatedLengths
					? m.generatedLengths[i]
					: m.lengths[i];
				expect(m.generatedOffsets[i] + genLen).toBeLessThanOrEqual(
					svelte.code.length,
				);
			}
		}
	});
});

// ── Real svelte2tsx pipeline tests ──

function realPipeline(pfmSource: string) {
	const svelte = pfmToSvelte(pfmSource);
	const tsx = svelte2tsx(svelte.code, {
		filename: "test.svelte",
		isTsFile: false,
		mode: "ts",
	});
	const map = tsx.map.toJSON ? tsx.map.toJSON() : tsx.map;
	const svelteToTs = v3ToVolarMappings(map as any, tsx.code, svelte.code);
	const composed = composeMappings(svelte.mappings, svelteToTs);

	return { pfmSource, svelteCode: svelte.code, tsCode: tsx.code, composed };
}

function findComposed(
	pfmSource: string,
	tsCode: string,
	mappings: Mapping<CodeInformation>[],
	pfmSubstr: string,
): { srcText: string; genText: string; mapping: Mapping<CodeInformation> }[] {
	const results: { srcText: string; genText: string; mapping: Mapping<CodeInformation> }[] = [];
	for (const m of mappings) {
		for (let i = 0; i < m.sourceOffsets.length; i++) {
			const srcText = pfmSource.slice(m.sourceOffsets[i], m.sourceOffsets[i] + m.lengths[i]);
			if (srcText === pfmSubstr) {
				const genLen = m.generatedLengths ? m.generatedLengths[i] : m.lengths[i];
				const genText = tsCode.slice(m.generatedOffsets[i], m.generatedOffsets[i] + genLen);
				results.push({ srcText, genText, mapping: m });
			}
		}
	}
	return results;
}

describe("Real svelte2tsx pipeline", () => {
	it("frontmatter keys survive PFM → Svelte → svelte2tsx composition", () => {
		const result = realPipeline("---\ntitle: hello\ncount: 42\n---\n\n# Hello\n");

		const titleHits = findComposed(result.pfmSource, result.tsCode, result.composed, "title");
		const countHits = findComposed(result.pfmSource, result.tsCode, result.composed, "count");

		expect(titleHits.length).toBeGreaterThanOrEqual(1);
		expect(countHits.length).toBeGreaterThanOrEqual(1);

		// at least one hit should map to "title" in TS
		expect(titleHits.some((h) => h.genText === "title")).toBe(true);
		expect(countHits.some((h) => h.genText === "count")).toBe(true);
	});

	it("import statement maps through svelte2tsx", () => {
		const pfm = 'import Counter from "./Counter.svelte"\n\n# Hello\n';
		const result = realPipeline(pfm);

		const importHits = findComposed(
			result.pfmSource,
			result.tsCode,
			result.composed,
			'import Counter from "./Counter.svelte"',
		);

		expect(importHits.length).toBeGreaterThanOrEqual(1);
		expect(
			importHits.some((h) => h.genText.includes("import Counter")),
		).toBe(true);
	});

	it("inline expression maps through svelte2tsx", () => {
		const pfm = "---\ncount: 0\n---\n\nThe value is {count + 1}.\n";
		const result = realPipeline(pfm);

		const exprHits = findComposed(
			result.pfmSource,
			result.tsCode,
			result.composed,
			"count + 1",
		);

		expect(exprHits.length).toBeGreaterThanOrEqual(1);
		expect(exprHits.some((h) => h.genText.includes("count + 1"))).toBe(true);
	});

	it("all composed mappings have valid offsets with svelte2tsx", () => {
		const pfm = `---
title: Hello
count: 42
---
import Counter from "./Counter.svelte"

# {title}

<Counter value={count} />

The count is {count + 1}.
`;
		const result = realPipeline(pfm);

		expect(result.composed.length).toBeGreaterThan(0);

		for (const m of result.composed) {
			for (let i = 0; i < m.sourceOffsets.length; i++) {
				expect(m.sourceOffsets[i]).toBeGreaterThanOrEqual(0);
				expect(m.sourceOffsets[i] + m.lengths[i]).toBeLessThanOrEqual(pfm.length);
				expect(m.generatedOffsets[i]).toBeGreaterThanOrEqual(0);
				const genLen = m.generatedLengths ? m.generatedLengths[i] : m.lengths[i];
				expect(m.generatedOffsets[i] + genLen).toBeLessThanOrEqual(result.tsCode.length);
			}
		}
	});

	it("self-closing component produces per-token mappings (no duplicate hover)", () => {
		// Regression test: self-closing tags without space before /> must produce
		// per-token composed mappings, not a single broad mapping for the whole tag.
		const pfm = '---\ntitle: Hello\n---\nimport Test from "./Test.svelte"\n\n<Test value={42} label="BOO"/>\n';
		const result = realPipeline(pfm);

		// Simulate hover: find all composed mappings covering each token position
		function hitsAt(offset: number) {
			const hits: number[] = [];
			for (const m of result.composed) {
				for (let i = 0; i < m.sourceOffsets.length; i++) {
					if (offset >= m.sourceOffsets[i] && offset < m.sourceOffsets[i] + m.lengths[i]) {
						hits.push(m.generatedOffsets[i]);
					}
				}
			}
			return hits;
		}

		const tagStart = pfm.indexOf("<Test");
		const testHits = hitsAt(pfm.indexOf("Test", tagStart));
		const valueHits = hitsAt(pfm.indexOf("value", tagStart));
		const labelHits = hitsAt(pfm.indexOf("label", tagStart));

		// Each token should map to exactly 1 TS position (not the whole tag's worth)
		expect(testHits).toHaveLength(1);
		expect(valueHits).toHaveLength(1);
		expect(labelHits).toHaveLength(1);

		// And they should be DIFFERENT positions (per-token precision)
		expect(testHits[0]).not.toBe(valueHits[0]);
		expect(testHits[0]).not.toBe(labelHits[0]);
		expect(valueHits[0]).not.toBe(labelHits[0]);
	});
});
