/**
 * Compose two sets of Volar mappings: A→B + B→C = A→C.
 *
 * For each mapping in A (PFM→Svelte), find overlapping mappings in B
 * (Svelte→TS), and produce composed mappings (PFM→TS).
 */

import type { Mapping, CodeInformation } from "@mdsvex/render/mappings";

export type { Mapping, CodeInformation } from "@mdsvex/render/mappings";

interface Segment {
	srcStart: number;
	srcEnd: number;
	genStart: number;
	genEnd: number;
}

/** extract flat segments from a mapping (handles multi-entry sourceOffsets). */
function toSegments<T>(m: Mapping<T>): Segment[] {
	const segs: Segment[] = [];
	for (let i = 0; i < m.sourceOffsets.length; i++) {
		const srcLen = m.lengths[i];
		const genLen = m.generatedLengths ? m.generatedLengths[i] : m.lengths[i];
		segs.push({
			srcStart: m.sourceOffsets[i],
			srcEnd: m.sourceOffsets[i] + srcLen,
			genStart: m.generatedOffsets[i],
			genEnd: m.generatedOffsets[i] + genLen,
		});
	}
	return segs;
}

/** merge CodeInformation via intersection — capability present only if both legs have it. */
function intersectCapabilities(
	a: CodeInformation,
	b: CodeInformation,
): CodeInformation {
	const result: CodeInformation = {};
	if (a.verification && b.verification) result.verification = true;
	if (a.completion && b.completion) result.completion = true;
	if (a.semantic && b.semantic) result.semantic = true;
	if (a.navigation && b.navigation) result.navigation = true;
	if (a.structure && b.structure) result.structure = true;
	if (a.format && b.format) result.format = true;
	return result;
}

/**
 * Compose mappings A→B and B→C into A→C.
 *
 * For each A segment that maps A-source to B (generated), finds overlapping
 * B segments that map B-source to C (generated). The overlap region in B-space
 * determines the composed A→C mapping.
 *
 * @param a - Mappings from A to B (e.g., PFM → Svelte)
 * @param b - Mappings from B to C (e.g., Svelte → TS)
 * @param mergeData - Optional custom data merger. Defaults to intersectCapabilities.
 */
export function composeMappings<
	DA extends CodeInformation,
	DB extends CodeInformation,
>(
	a: Mapping<DA>[],
	b: Mapping<DB>[],
	mergeData?: (da: DA, db: DB) => DA,
): Mapping<DA>[] {
	// flatten B into sorted segments keyed by source offset
	const bSegs: (Segment & { data: DB })[] = [];
	for (const bm of b) {
		const segs = toSegments(bm);
		for (const s of segs) {
			bSegs.push({ ...s, data: bm.data });
		}
	}
	bSegs.sort((x, y) => x.srcStart - y.srcStart);

	const merge =
		mergeData ??
		((da: DA, db: DB) => intersectCapabilities(da, db) as DA);

	const result: Mapping<DA>[] = [];

	for (const am of a) {
		const aSegs = toSegments(am);

		for (const aSeg of aSegs) {
			// A maps A-source [aSeg.srcStart, aSeg.srcEnd) to B [aSeg.genStart, aSeg.genEnd)
			// Find B segments whose source range overlaps with A's generated range
			const aGenStart = aSeg.genStart;
			const aGenEnd = aSeg.genEnd;
			const aIsIdentity = aSeg.srcEnd - aSeg.srcStart === aGenEnd - aGenStart;

			// binary search for first B segment that might overlap
			let lo = 0,
				hi = bSegs.length;
			while (lo < hi) {
				const mid = (lo + hi) >>> 1;
				if (bSegs[mid].srcEnd <= aGenStart) lo = mid + 1;
				else hi = mid;
			}

			// scan through potentially overlapping B segments
			for (let j = lo; j < bSegs.length; j++) {
				const bSeg = bSegs[j];
				if (bSeg.srcStart >= aGenEnd) break; // past overlap

				// compute overlap in B-source space (= A's generated space)
				const overlapStart = Math.max(aGenStart, bSeg.srcStart);
				const overlapEnd = Math.min(aGenEnd, bSeg.srcEnd);
				if (overlapEnd <= overlapStart) continue;

				const overlapLen = overlapEnd - overlapStart;

				// map overlap back to A-source
				let composedSrcStart: number;
				let composedSrcLen: number;
				if (aIsIdentity) {
					composedSrcStart = aSeg.srcStart + (overlapStart - aGenStart);
					composedSrcLen = overlapLen;
				} else {
					// non-identity A — can only use the start anchor
					composedSrcStart = aSeg.srcStart;
					composedSrcLen = aSeg.srcEnd - aSeg.srcStart;
				}

				// map overlap forward to C (B's generated space)
				const bIsIdentity =
					bSeg.srcEnd - bSeg.srcStart === bSeg.genEnd - bSeg.genStart;
				let composedGenStart: number;
				let composedGenLen: number;
				if (bIsIdentity) {
					composedGenStart = bSeg.genStart + (overlapStart - bSeg.srcStart);
					composedGenLen = overlapLen;
				} else {
					composedGenStart = bSeg.genStart;
					composedGenLen = bSeg.genEnd - bSeg.genStart;
				}

				const m: Mapping<DA> = {
					sourceOffsets: [composedSrcStart],
					generatedOffsets: [composedGenStart],
					lengths: [composedSrcLen],
					data: merge(am.data, bSeg.data),
				};
				if (composedGenLen !== composedSrcLen) {
					m.generatedLengths = [composedGenLen];
				}
				result.push(m);
			}
		}
	}

	return result;
}
