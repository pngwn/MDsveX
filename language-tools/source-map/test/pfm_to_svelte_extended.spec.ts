/**
 * Extended test fixtures for pfmToSvelte — covers edge cases,
 * control flow, nested expressions, style blocks, and complex documents.
 */
import { describe, it, expect } from "vitest";
import { pfmToSvelte } from "../src/pfm_to_svelte";
import type { PfmToSvelteResult } from "../src/pfm_to_svelte";
import type { Mapping, MappingData } from "@mdsvex/render/mappings";

function assertValid(source: string, result: PfmToSvelteResult) {
	for (const m of result.mappings) {
		for (let i = 0; i < m.sourceOffsets.length; i++) {
			expect(m.sourceOffsets[i]).toBeGreaterThanOrEqual(0);
			expect(m.sourceOffsets[i] + m.lengths[i]).toBeLessThanOrEqual(source.length);
			expect(m.generatedOffsets[i]).toBeGreaterThanOrEqual(0);
		}
	}
}

describe("pfmToSvelte — control flow blocks", () => {
	it("if/else block", () => {
		const source = "---\nshow: true\n---\n\n{#if show}\nVisible\n{:else}\nHidden\n{/if}\n";
		const result = pfmToSvelte(source);
		assertValid(source, result);
		expect(result.code).toContain("{#if");
		expect(result.code).toContain("{:else}");
		expect(result.code).toContain("{/if}");
	});

	it("each block", () => {
		const source = "---\nitems: [1, 2, 3]\n---\n\n{#each items as item}\n- {item}\n{/each}\n";
		const result = pfmToSvelte(source);
		assertValid(source, result);
		expect(result.code).toContain("{#each");
		expect(result.code).toContain("{/each}");
	});

	it("nested if inside each", () => {
		const source = "{#each items as item}\n{#if item > 0}\n{item}\n{/if}\n{/each}\n";
		const result = pfmToSvelte(source);
		assertValid(source, result);
	});
});

describe("pfmToSvelte — style blocks", () => {
	it("extracts style block positions", () => {
		const source = "<style>\nh1 { color: red; }\n</style>\n\n# Hello\n";
		const result = pfmToSvelte(source);
		assertValid(source, result);

		expect(result.styleBlocks.length).toBe(1);
		const sb = result.styleBlocks[0];
		const cssContent = source.slice(sb.sourceStart, sb.sourceEnd);
		expect(cssContent).toContain("h1 { color: red; }");
	});

	it("multiple style blocks", () => {
		const source = "<style>\nh1 { color: red; }\n</style>\n\n# Hello\n\n<style>\np { margin: 0; }\n</style>\n";
		const result = pfmToSvelte(source);
		assertValid(source, result);
		expect(result.styleBlocks.length).toBe(2);
	});

	it("no style blocks when none present", () => {
		const source = "# Hello\n\nWorld\n";
		const result = pfmToSvelte(source);
		expect(result.styleBlocks.length).toBe(0);
	});
});

describe("pfmToSvelte — excluded regions", () => {
	it("excludes frontmatter", () => {
		const source = "---\ntitle: hello\n---\n\n# Hello\n";
		const result = pfmToSvelte(source);
		expect(result.excludedRegions.length).toBeGreaterThanOrEqual(1);
		const fmRegion = result.excludedRegions[0];
		expect(source.slice(fmRegion.start, fmRegion.end)).toContain("---");
	});

	it("excludes script blocks", () => {
		const source = "<script>\nlet x = 1;\n</script>\n\n# Hello\n";
		const result = pfmToSvelte(source);
		const scriptRegion = result.excludedRegions.find(r =>
			source.slice(r.start, r.end).includes("script"),
		);
		expect(scriptRegion).toBeDefined();
	});

	it("excludes style blocks", () => {
		const source = "<style>\nh1 { color: red; }\n</style>\n\n# Hello\n";
		const result = pfmToSvelte(source);
		const styleRegion = result.excludedRegions.find(r =>
			source.slice(r.start, r.end).includes("style"),
		);
		expect(styleRegion).toBeDefined();
	});

	it("excludes import statements", () => {
		const source = 'import A from "./A.svelte"\n\n# Hello\n';
		const result = pfmToSvelte(source);
		const importRegion = result.excludedRegions.find(r =>
			source.slice(r.start, r.end).includes("import"),
		);
		expect(importRegion).toBeDefined();
	});
});

describe("pfmToSvelte — complex documents", () => {
	it("full-featured document", () => {
		const source = `---
title: My Page
count: 42
draft: true
---
import Counter from "./Counter.svelte"

<script lang="ts">
  const doubled = count * 2;
</script>

<style>
  h1 { color: blue; }
  p { margin: 1rem; }
</style>

# {title}

{#if !draft}
<Counter value={count} />
{:else}
**Draft mode** — count is {count}
{/if}

The doubled value is {doubled}.

> A blockquote with {title}

- Item {count}
- Item {count + 1}

\`\`\`ts
const x: number = 42;
\`\`\`
`;
		const result = pfmToSvelte(source);
		assertValid(source, result);

		// script block merged
		expect(result.code).toContain("const doubled = count * 2");
		expect(result.code).toContain('import Counter from "./Counter.svelte"');
		expect(result.code).toContain("export const title = ");
		expect(result.code).toContain("export const count = ");
		expect(result.code).toContain("export const draft = ");

		// style block detected
		expect(result.styleBlocks.length).toBe(1);

		// excluded regions cover frontmatter, imports, script, style
		expect(result.excludedRegions.length).toBeGreaterThanOrEqual(3);

		// body preserved
		expect(result.code).toContain("{#if");
		expect(result.code).toContain("<Counter");
		expect(result.code).toContain("{:else}");

		// two script blocks: <script module> for frontmatter + <script> for user code
		const scriptCount = (result.code.match(/<script[^>]*>/g) || []).length;
		expect(scriptCount).toBe(2);
	});

	it("empty document", () => {
		const result = pfmToSvelte("\n");
		expect(result.code).toBeDefined();
		expect(result.mappings).toBeDefined();
	});

	it("frontmatter only, no body", () => {
		const source = "---\ntitle: hello\n---\n";
		const result = pfmToSvelte(source);
		assertValid(source, result);
		expect(result.code).toContain("export const title = ");
	});

	it("frontmatter with all YAML scalar types", () => {
		const source = "---\nstr: hello world\nnum: 3.14\nbool: false\nnull_val: null\ntilde_null: ~\nempty:\nint: -42\nsci: 1e10\n---\n\n# Test\n";
		const result = pfmToSvelte(source);
		assertValid(source, result);

		expect(result.code).toContain('export const str = "hello world"');
		expect(result.code).toContain("export const num = 3.14");
		expect(result.code).toContain("export const bool = false");
		expect(result.code).toContain("export const null_val = null");
		expect(result.code).toContain("export const tilde_null = null");
		expect(result.code).toContain("export const empty = null");
		expect(result.code).toContain("export const int = -42");
		expect(result.code).toContain("export const sci = 1e10");
	});
});
