import { describe, it, expect } from "vitest";
import { create_pfm_language_plugin } from "../src/language_plugin";
import type { IScriptSnapshot, CodegenContext, VirtualCode, CodeMapping } from "@volar/language-core";

function snap(text: string): IScriptSnapshot {
	return {
		getText: (s, e) => text.slice(s, e),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

const dummyCtx: CodegenContext<string> = {
	getAssociatedScript: () => undefined,
};

describe("create_pfm_language_plugin", () => {
	const plugin = create_pfm_language_plugin();

	it("getLanguageId returns 'pfm' for .pfm files", () => {
		expect(plugin.getLanguageId("file.pfm")).toBe("pfm");
		expect(plugin.getLanguageId("/path/to/doc.pfm")).toBe("pfm");
	});

	it("getLanguageId returns undefined for non-.pfm files", () => {
		expect(plugin.getLanguageId("file.md")).toBeUndefined();
		expect(plugin.getLanguageId("file.svelte")).toBeUndefined();
		expect(plugin.getLanguageId("file.ts")).toBeUndefined();
	});

	it("createVirtualCode returns undefined for non-pfm languageId", () => {
		const result = plugin.createVirtualCode!(
			"test.pfm",
			"markdown",
			snap("# Hello"),
			dummyCtx,
		);
		expect(result).toBeUndefined();
	});

	it("createVirtualCode produces valid VirtualCode for simple markdown", () => {
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap("# Hello\n\nWorld\n"),
			dummyCtx,
		);

		expect(vc).toBeDefined();
		expect(vc!.id).toBe("root");
		expect(vc!.languageId).toBe("pfm");
		expect(vc!.mappings.length).toBeGreaterThan(0);
		expect(vc!.embeddedCodes).toBeDefined();
	});

	it("produces TypeScript embedded VirtualCode", () => {
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap("# Hello\n\nWorld\n"),
			dummyCtx,
		);

		const tsCode = vc!.embeddedCodes!.find((c) => c.languageId === "typescript");
		expect(tsCode).toBeDefined();
		expect(tsCode!.id).toBe("ts");
		expect(tsCode!.snapshot.getLength()).toBeGreaterThan(0);
		expect(tsCode!.mappings.length).toBeGreaterThanOrEqual(0);
	});

	it("TS VirtualCode contains svelte2tsx output", () => {
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap("---\ntitle: hello\n---\n\n# {title}\n"),
			dummyCtx,
		);

		const tsCode = vc!.embeddedCodes!.find((c) => c.languageId === "typescript");
		const tsText = tsCode!.snapshot.getText(0, tsCode!.snapshot.getLength());

		// svelte2tsx produces a $$render function
		expect(tsText).toContain("$$render");
		// the title variable should appear
		expect(tsText).toContain("title");
	});

	it("mappings survive into the TS VirtualCode", () => {
		const pfm = "---\ntitle: hello\ncount: 42\n---\n\n# {title}\n\n{count + 1}\n";
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap(pfm),
			dummyCtx,
		);

		const tsCode = vc!.embeddedCodes!.find((c) => c.languageId === "typescript");
		const tsText = tsCode!.snapshot.getText(0, tsCode!.snapshot.getLength());

		// should have composed PFM→TS mappings
		expect(tsCode!.mappings.length).toBeGreaterThan(0);

		// verify at least one mapping points back to PFM source correctly
		let foundTitle = false;
		for (const m of tsCode!.mappings) {
			for (let i = 0; i < m.sourceOffsets.length; i++) {
				const srcText = pfm.slice(
					m.sourceOffsets[i],
					m.sourceOffsets[i] + m.lengths[i],
				);
				if (srcText === "title") foundTitle = true;
			}
		}
		expect(foundTitle).toBe(true);
	});

	it("updateVirtualCode produces fresh VirtualCode", () => {
		const vc1 = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap("---\nfoo: 1\n---\n\n{foo}\n"),
			dummyCtx,
		);

		const vc2 = plugin.updateVirtualCode!(
			"test.pfm",
			vc1!,
			snap("---\nbar: 2\n---\n\n{bar}\n"),
			dummyCtx,
		);

		expect(vc2).toBeDefined();
		const tsCode = vc2!.embeddedCodes!.find((c) => c.languageId === "typescript");
		const tsText = tsCode!.snapshot.getText(0, tsCode!.snapshot.getLength());
		// svelte2tsx preserves expressions — "bar" should appear, "foo" should not
		expect(tsText).toContain("bar");
		expect(tsText).not.toContain("foo");
	});

	it("handles complex PFM with imports and expressions", () => {
		const pfm = `---
title: Hello World
count: 42
---
import Counter from "./Counter.svelte"

# {title}

<Counter value={count} />

The count is {count + 1}.
`;
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap(pfm),
			dummyCtx,
		);

		expect(vc).toBeDefined();
		const tsCode = vc!.embeddedCodes!.find((c) => c.languageId === "typescript");
		const tsText = tsCode!.snapshot.getText(0, tsCode!.snapshot.getLength());

		expect(tsText).toContain("title");
		expect(tsText).toContain("count");
		expect(tsText).toContain("Counter");
		expect(tsText).toContain("count + 1");

		// all mappings should have valid offsets
		for (const m of tsCode!.mappings) {
			for (let i = 0; i < m.sourceOffsets.length; i++) {
				expect(m.sourceOffsets[i]).toBeGreaterThanOrEqual(0);
				expect(m.sourceOffsets[i] + m.lengths[i]).toBeLessThanOrEqual(pfm.length);
			}
		}
	});
});
