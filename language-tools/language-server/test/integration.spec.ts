/**
 * Integration test for the PFM LanguagePlugin.
 *
 * Tests the plugin in the context of Volar's language system,
 * verifying that VirtualCode structure, mappings, and source maps
 * work correctly for editor features.
 */
import { describe, it, expect } from "vitest";
import { createPfmLanguagePlugin } from "@pfm/language-core";
import type { IScriptSnapshot, CodeMapping } from "@volar/language-core";

function snap(text: string): IScriptSnapshot {
	return {
		getText: (s, e) => text.slice(s, e),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
}

const dummyCtx = { getAssociatedScript: () => undefined as any };

/**
 * Simulate what a Volar SourceMap.toGeneratedLocation does:
 * given a source offset, find the generated offset through mappings.
 */
function toGeneratedOffset(
	mappings: CodeMapping[],
	sourceOffset: number,
): number | undefined {
	for (const m of mappings) {
		for (let i = 0; i < m.sourceOffsets.length; i++) {
			const srcStart = m.sourceOffsets[i];
			const srcLen = m.lengths[i];
			if (sourceOffset >= srcStart && sourceOffset < srcStart + srcLen) {
				const delta = sourceOffset - srcStart;
				const genLen = m.generatedLengths
					? m.generatedLengths[i]
					: m.lengths[i];
				// for identity mappings, delta applies directly
				if (srcLen === genLen || !m.generatedLengths) {
					return m.generatedOffsets[i] + delta;
				}
				// for non-identity, return start of generated range
				return m.generatedOffsets[i];
			}
		}
	}
	return undefined;
}

/**
 * Simulate what a Volar SourceMap.toSourceLocation does:
 * given a generated offset, find the source offset through mappings.
 */
function toSourceOffset(
	mappings: CodeMapping[],
	generatedOffset: number,
): number | undefined {
	for (const m of mappings) {
		for (let i = 0; i < m.generatedOffsets.length; i++) {
			const genStart = m.generatedOffsets[i];
			const genLen = m.generatedLengths
				? m.generatedLengths[i]
				: m.lengths[i];
			if (
				generatedOffset >= genStart &&
				generatedOffset < genStart + genLen
			) {
				const delta = generatedOffset - genStart;
				const srcLen = m.lengths[i];
				if (srcLen === genLen || !m.generatedLengths) {
					return m.sourceOffsets[i] + delta;
				}
				return m.sourceOffsets[i];
			}
		}
	}
	return undefined;
}

describe("Integration: LanguagePlugin in Volar context", () => {
	const plugin = createPfmLanguagePlugin();

	it("frontmatter variable is navigable from PFM source to TS", () => {
		const pfm = "---\ntitle: hello\n---\n\n# {title}\n";
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap(pfm),
			dummyCtx,
		);

		const tsCode = vc!.embeddedCodes![0];
		const tsText = tsCode.snapshot.getText(0, tsCode.snapshot.getLength());

		// Find "title" in the PFM frontmatter
		const pfmTitleOffset = pfm.indexOf("title:");
		expect(pfmTitleOffset).toBeGreaterThan(0);

		// Map it to TS
		const tsOffset = toGeneratedOffset(tsCode.mappings, pfmTitleOffset);
		expect(tsOffset).toBeDefined();

		// The TS text at that offset should be "title"
		const tsAtOffset = tsText.slice(tsOffset!, tsOffset! + 5);
		expect(tsAtOffset).toBe("title");
	});

	it("inline expression round-trips: PFM → TS → PFM", () => {
		const pfm = "---\ncount: 0\n---\n\n{count + 1}\n";
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap(pfm),
			dummyCtx,
		);

		const tsCode = vc!.embeddedCodes![0];
		const tsText = tsCode.snapshot.getText(0, tsCode.snapshot.getLength());

		// Find "count + 1" in PFM
		const pfmExprOffset = pfm.indexOf("count + 1");
		expect(pfmExprOffset).toBeGreaterThan(0);

		// Forward: PFM → TS
		const tsOffset = toGeneratedOffset(tsCode.mappings, pfmExprOffset);
		expect(tsOffset).toBeDefined();

		// Verify TS text
		const tsAtOffset = tsText.slice(tsOffset!, tsOffset! + 9);
		expect(tsAtOffset).toBe("count + 1");

		// Reverse: TS → PFM
		const pfmOffset = toSourceOffset(tsCode.mappings, tsOffset!);
		expect(pfmOffset).toBeDefined();
		expect(pfmOffset).toBe(pfmExprOffset);
	});

	it("import statement round-trips: PFM → TS → PFM", () => {
		const pfm = 'import Counter from "./Counter.svelte"\n\n# Hello\n';
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap(pfm),
			dummyCtx,
		);

		const tsCode = vc!.embeddedCodes![0];
		const tsText = tsCode.snapshot.getText(0, tsCode.snapshot.getLength());

		// Find "import Counter" in PFM
		const pfmImportOffset = pfm.indexOf("import Counter");
		expect(pfmImportOffset).toBe(0);

		// Forward: PFM → TS
		const tsOffset = toGeneratedOffset(tsCode.mappings, pfmImportOffset);
		expect(tsOffset).toBeDefined();

		// TS should contain the import
		const tsAtOffset = tsText.slice(tsOffset!, tsOffset! + 14);
		expect(tsAtOffset).toBe("import Counter");

		// Reverse: TS → PFM
		const pfmOffset = toSourceOffset(tsCode.mappings, tsOffset!);
		expect(pfmOffset).toBeDefined();
		expect(pfmOffset).toBe(pfmImportOffset);
	});

	it("VirtualCode tree structure is correct for Volar", () => {
		const pfm = "---\ntitle: hello\n---\n\n# {title}\n";
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap(pfm),
			dummyCtx,
		);

		// Root VirtualCode
		expect(vc!.id).toBe("root");
		expect(vc!.languageId).toBe("pfm");
		expect(vc!.snapshot.getLength()).toBe(pfm.length);
		expect(vc!.mappings.length).toBeGreaterThan(0);

		// Embedded TS VirtualCode
		expect(vc!.embeddedCodes!.length).toBe(2); // TS + markdown
		const tsVc = vc!.embeddedCodes![0];
		expect(tsVc.id).toBe("ts");
		expect(tsVc.languageId).toBe("typescript");
		expect(tsVc.snapshot.getLength()).toBeGreaterThan(0);
		expect(tsVc.mappings.length).toBeGreaterThan(0);
	});

	it("verification capability is set on navigable mappings", () => {
		const pfm = "---\ntitle: hello\n---\n\n# {title}\n";
		const vc = plugin.createVirtualCode!(
			"test.pfm",
			"pfm",
			snap(pfm),
			dummyCtx,
		);

		const tsCode = vc!.embeddedCodes![0];

		// Find a mapping that covers the "title" expression
		const pfmExprOffset = pfm.lastIndexOf("title");
		const mapping = tsCode.mappings.find((m) => {
			for (let i = 0; i < m.sourceOffsets.length; i++) {
				const start = m.sourceOffsets[i];
				const end = start + m.lengths[i];
				if (pfmExprOffset >= start && pfmExprOffset < end) return true;
			}
			return false;
		});

		// Should have at least verification or navigation capability
		expect(mapping).toBeDefined();
		const data = mapping!.data;
		const hasCapability =
			data.verification || data.navigation || data.semantic;
		expect(hasCapability).toBeTruthy();
	});
});
