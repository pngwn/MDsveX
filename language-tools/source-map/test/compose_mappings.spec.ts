import { describe, it, expect } from "vitest";
import { composeMappings } from "../src/compose_mappings";
import { CI_SVELTE, CI_TEXT, CI_CODE, CI_STRUCTURE } from "@mdsvex/render/mappings";
import type { Mapping, CodeInformation } from "@mdsvex/render/mappings";

// ── helpers ──

function m(
	srcOff: number,
	genOff: number,
	len: number,
	data: CodeInformation = CI_SVELTE,
	genLen?: number,
): Mapping<CodeInformation> {
	const mapping: Mapping<CodeInformation> = {
		sourceOffsets: [srcOff],
		generatedOffsets: [genOff],
		lengths: [len],
		data,
	};
	if (genLen !== undefined) {
		mapping.generatedLengths = [genLen];
	}
	return mapping;
}

// ── tests ──

describe("composeMappings", () => {
	it("identity composition: A[0,10)→[0,10) + B[0,10)→[0,10) = [0,10)→[0,10)", () => {
		const a = [m(0, 0, 10)];
		const b = [m(0, 0, 10)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(1);
		expect(result[0].sourceOffsets[0]).toBe(0);
		expect(result[0].generatedOffsets[0]).toBe(0);
		expect(result[0].lengths[0]).toBe(10);
		expect(result[0].generatedLengths).toBeUndefined();
	});

	it("offset composition: A[0,10)→[5,15) + B[5,15)→[20,30) = [0,10)→[20,30)", () => {
		const a = [m(0, 5, 10)];
		const b = [m(5, 20, 10)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(1);
		expect(result[0].sourceOffsets[0]).toBe(0);
		expect(result[0].generatedOffsets[0]).toBe(20);
		expect(result[0].lengths[0]).toBe(10);
	});

	it("partial overlap: A[0,10)→[0,10) + B[3,7)→[100,104) = [3,4)→[100,104)", () => {
		const a = [m(0, 0, 10)];
		const b = [m(3, 100, 4)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(1);
		expect(result[0].sourceOffsets[0]).toBe(3);
		expect(result[0].generatedOffsets[0]).toBe(100);
		expect(result[0].lengths[0]).toBe(4);
	});

	it("no overlap produces empty result", () => {
		const a = [m(0, 0, 10)];
		const b = [m(20, 100, 10)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(0);
	});

	it("multiple B ranges produce multiple composed entries", () => {
		const a = [m(0, 0, 20)];
		const b = [m(0, 100, 5), m(10, 200, 5)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(2);
		expect(result[0].sourceOffsets[0]).toBe(0);
		expect(result[0].generatedOffsets[0]).toBe(100);
		expect(result[0].lengths[0]).toBe(5);

		expect(result[1].sourceOffsets[0]).toBe(10);
		expect(result[1].generatedOffsets[0]).toBe(200);
		expect(result[1].lengths[0]).toBe(5);
	});

	it("capability intersection: CI_SVELTE ∩ CI_TEXT = verification + semantic + navigation", () => {
		const a = [m(0, 0, 10, CI_SVELTE)];
		const b = [m(0, 0, 10, CI_TEXT)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(1);
		const data = result[0].data;
		// CI_SVELTE has all caps, CI_TEXT has verification+semantic+navigation
		expect(data.verification).toBe(true);
		expect(data.semantic).toBe(true);
		expect(data.navigation).toBe(true);
		// CI_TEXT does NOT have completion, structure, format
		expect(data.completion).toBeUndefined();
		expect(data.structure).toBeUndefined();
		expect(data.format).toBeUndefined();
	});

	it("CI_STRUCTURE ∩ CI_SVELTE = structure only", () => {
		const a = [m(0, 0, 10, CI_STRUCTURE)];
		const b = [m(0, 0, 10, CI_SVELTE)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(1);
		const data = result[0].data;
		expect(data.structure).toBe(true);
		expect(data.verification).toBeUndefined();
		expect(data.completion).toBeUndefined();
	});

	it("non-identity A: A[0,5)→[0,10) + B[0,10)→[0,10) uses A source anchor", () => {
		// A maps 5 source chars to 10 generated chars (non-identity)
		const a = [m(0, 0, 5, CI_SVELTE, 10)];
		const b = [m(0, 0, 10)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(1);
		// should use A's full source range
		expect(result[0].sourceOffsets[0]).toBe(0);
		expect(result[0].lengths[0]).toBe(5);
	});

	it("non-identity B: A[0,10)→[0,10) + B[0,5)→[0,10) produces correct generatedLengths", () => {
		// B maps 5 source chars to 10 generated chars
		const a = [m(0, 0, 10)];
		const b = [m(0, 0, 5, CI_SVELTE, 10)];
		const result = composeMappings(a, b);

		expect(result.length).toBe(1);
		expect(result[0].lengths[0]).toBe(5);
		expect(result[0].generatedLengths).toBeDefined();
		expect(result[0].generatedLengths![0]).toBe(10);
	});

	it("empty A produces empty result", () => {
		const result = composeMappings([], [m(0, 0, 10)]);
		expect(result.length).toBe(0);
	});

	it("empty B produces empty result", () => {
		const result = composeMappings([m(0, 0, 10)], []);
		expect(result.length).toBe(0);
	});

	it("custom mergeData function is called", () => {
		const a = [m(0, 0, 10, CI_SVELTE)];
		const b = [m(0, 0, 10, CI_TEXT)];

		const result = composeMappings(a, b, (_da, _db) => {
			return { verification: true, completion: true } as any;
		});

		expect(result[0].data.verification).toBe(true);
		expect(result[0].data.completion).toBe(true);
	});
});
