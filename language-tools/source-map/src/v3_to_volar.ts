/**
 * Convert v3 source maps (VLQ line/column) to Volar offset-based Mapping[].
 *
 * Decodes a standard SourceMapV3 (as emitted by svelte2tsx) and produces
 * coalesced range mappings suitable for Volar's SourceMap.
 */

import { TraceMap, decodedMappings } from "@jridgewell/trace-mapping";
import { build_line_starts } from "@mdsvex/render/sourcemap";
import { CI_SVELTE } from "@mdsvex/render/mappings";
import type { Mapping, CodeInformation } from "@mdsvex/render/mappings";

export type { Mapping, CodeInformation } from "@mdsvex/render/mappings";

export interface SourceMapV3 {
	version: 3;
	file?: string;
	sources: (string | null)[];
	sourcesContent?: (string | null)[];
	names?: string[];
	mappings: string;
}

interface PointMapping {
	genOffset: number;
	srcOffset: number;
}

/**
 * Convert a v3 source map to Volar-compatible Mapping[] format.
 *
 * Decodes VLQ segments, converts line/column to offsets, and coalesces
 * adjacent identity-mapped points into compact range mappings.
 */
export function v3ToVolarMappings(
	v3Map: SourceMapV3,
	generatedCode: string,
	sourceCode: string,
	defaultData?: CodeInformation,
): Mapping<CodeInformation>[] {
	const traced = new TraceMap(v3Map as any);
	const decoded = decodedMappings(traced);

	const srcLineStarts = build_line_starts(sourceCode);
	const genLineStarts = build_line_starts(generatedCode);

	// collect point mappings
	const points: PointMapping[] = [];

	for (let genLine = 0; genLine < decoded.length; genLine++) {
		const segments = decoded[genLine];
		if (!segments) continue;

		for (const seg of segments) {
			// segments with source info have >= 4 fields: [genCol, srcIdx, srcLine, srcCol]
			if (seg.length < 4) continue;

			const genCol = seg[0];
			const srcLine = seg[2];
			const srcCol = seg[3];

			const genOff =
				genLine < genLineStarts.length
					? genLineStarts[genLine] + genCol
					: genCol;
			const srcOff =
				srcLine < srcLineStarts.length
					? srcLineStarts[srcLine] + srcCol
					: srcCol;

			points.push({ genOffset: genOff, srcOffset: srcOff });
		}
	}

	// sort by generated offset
	points.sort((a, b) => a.genOffset - b.genOffset);

	// coalesce adjacent identity-mapped points into ranges
	const data = defaultData ?? CI_SVELTE;
	const mappings: Mapping<CodeInformation>[] = [];
	let i = 0;

	while (i < points.length) {
		const start = points[i];
		let runLen = 1;

		// extend run while consecutive points are identity-mapped (delta gen === delta src === 1)
		while (i + runLen < points.length) {
			const prev = points[i + runLen - 1];
			const next = points[i + runLen];
			const genDelta = next.genOffset - prev.genOffset;
			const srcDelta = next.srcOffset - prev.srcOffset;
			if (genDelta === 1 && srcDelta === 1) {
				runLen++;
			} else if (genDelta === srcDelta && genDelta > 0) {
				// larger identity stride (e.g., both advance by same amount)
				// treat as a single range up to this point, then start new range
				break;
			} else {
				break;
			}
		}

		mappings.push({
			sourceOffsets: [start.srcOffset],
			generatedOffsets: [start.genOffset],
			lengths: [runLen],
			data,
		});

		i += runLen;
	}

	return mappings;
}
