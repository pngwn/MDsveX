import { describe, it, expect } from "vitest";
import { v3ToVolarMappings } from "../src/v3_to_volar";
import type { SourceMapV3 } from "../src/v3_to_volar";
import { CI_SVELTE, CI_TEXT } from "@mdsvex/render/mappings";

// ── helpers ──

/** Create a minimal v3 map with raw VLQ mappings string. */
function makeV3(
	mappings: string,
	sources = ["input.svelte"],
): SourceMapV3 {
	return {
		version: 3,
		sources,
		mappings,
	};
}

// ── tests ──

describe("v3ToVolarMappings", () => {
	it("single point mapping", () => {
		// VLQ "AAAA" = gen col 0, src idx 0, src line 0, src col 0
		const source = "hello";
		const generated = "hello";
		const v3 = makeV3("AAAA");

		const mappings = v3ToVolarMappings(v3, generated, source);

		expect(mappings.length).toBeGreaterThanOrEqual(1);
		expect(mappings[0].sourceOffsets[0]).toBe(0);
		expect(mappings[0].generatedOffsets[0]).toBe(0);
	});

	it("identity mapping produces correct offsets", () => {
		// Map "hello" at 0,0 → 0,0 — 5 consecutive characters
		// AAAA,CAAC,CAAC,CAAC,CAAC = 5 points at offsets 0,1,2,3,4
		const source = "hello";
		const generated = "hello";
		const v3 = makeV3("AAAA,CAAC,CAAC,CAAC,CAAC");

		const mappings = v3ToVolarMappings(v3, generated, source);

		// should coalesce into one range
		expect(mappings.length).toBe(1);
		expect(mappings[0].sourceOffsets[0]).toBe(0);
		expect(mappings[0].generatedOffsets[0]).toBe(0);
		expect(mappings[0].lengths[0]).toBe(5);
	});

	it("coalesces consecutive identity-mapped points", () => {
		// Generate per-character mappings for a 10-char string
		// AAAA, then 9x CAAC
		const segments = ["AAAA"];
		for (let i = 1; i < 10; i++) segments.push("CAAC");
		const v3 = makeV3(segments.join(","));

		const source = "0123456789";
		const generated = "0123456789";

		const mappings = v3ToVolarMappings(v3, generated, source);

		// all 10 points should coalesce into 1 range
		expect(mappings.length).toBe(1);
		expect(mappings[0].lengths[0]).toBe(10);
	});

	it("handles multi-line mappings", () => {
		const source = "ab\ncd\n";
		const generated = "ab\ncd\n";
		// line 0: col 0→0,0 col 1→0,1; line 1: col 0→1,0 col 1→1,1
		const v3 = makeV3("AAAA,CAAC;AAAA,CAAC");

		const mappings = v3ToVolarMappings(v3, generated, source);

		// should produce 2 ranges (one per line, since newline breaks the identity run)
		expect(mappings.length).toBeGreaterThanOrEqual(1);

		// first range starts at offset 0
		expect(mappings[0].sourceOffsets[0]).toBe(0);
		expect(mappings[0].generatedOffsets[0]).toBe(0);
	});

	it("respects defaultData parameter", () => {
		const v3 = makeV3("AAAA");
		const mappings = v3ToVolarMappings(v3, "x", "x", CI_TEXT);

		expect(mappings[0].data).toEqual(CI_TEXT);
	});

	it("defaults to CI_SVELTE when no defaultData", () => {
		const v3 = makeV3("AAAA");
		const mappings = v3ToVolarMappings(v3, "x", "x");

		expect(mappings[0].data).toEqual(CI_SVELTE);
	});

	it("handles offset mapping (source offset != generated offset)", () => {
		// gen col 2, src idx 0, src line 0, src col 0 = generated starts at col 2
		// VLQ: E=2, A=0, A=0, A=0 → "EAAA"
		const source = "hello";
		const generated = "  hello";
		const v3 = makeV3("EAAA");

		const mappings = v3ToVolarMappings(v3, generated, source);

		expect(mappings.length).toBe(1);
		expect(mappings[0].generatedOffsets[0]).toBe(2);
		expect(mappings[0].sourceOffsets[0]).toBe(0);
	});

	it("non-identity gap produces separate ranges", () => {
		// Two identity points with a gap: offset 0→0 and offset 5→5
		// AAAA, then jump to col 5 with src col 5
		// Delta from 0 to 5: gen col delta=5(K), src col delta=5(K)
		const v3 = makeV3("AAAA,KAAK");

		const source = "0123456789";
		const generated = "0123456789";

		const mappings = v3ToVolarMappings(v3, generated, source);

		// should be 2 separate ranges (the gap breaks the run)
		expect(mappings.length).toBe(2);
		expect(mappings[0].generatedOffsets[0]).toBe(0);
		expect(mappings[1].generatedOffsets[0]).toBe(5);
	});

	it("handles empty mappings string", () => {
		const v3 = makeV3("");
		const mappings = v3ToVolarMappings(v3, "hello", "hello");
		expect(mappings.length).toBe(0);
	});
});
