/**
 * sourcemap utilities: line-starts, offset→position, vlq, v3 conversion.
 */

import type { Mapping, CodeInformation } from "./mappings";


/** build an array of byte offsets where each line begins. line 0 starts at 0. */
export function build_line_starts(source: string): Uint32Array {
	const starts: number[] = [0];
	for (let i = 0; i < source.length; i++) {
		if (source.charCodeAt(i) === 10) starts.push(i + 1);
	}
	return new Uint32Array(starts);
}

/** convert a byte offset to [line, column] using a precomputed line_starts table. */
export function offset_to_position(
	line_starts: Uint32Array,
	offset: number,
): [line: number, col: number] {
	let lo = 0,
		hi = line_starts.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (line_starts[mid] <= offset) lo = mid + 1;
		else hi = mid;
	}
	const line = lo - 1;
	return [line, offset - line_starts[line]];
}


const VLQ_CHARS =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlq_encode(value: number): string {
	let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
	let result = "";
	do {
		let digit = vlq & 0x1f;
		vlq >>>= 5;
		if (vlq > 0) digit |= 0x20;
		result += VLQ_CHARS[digit];
	} while (vlq > 0);
	return result;
}


export interface SourceMapV3 {
	version: 3;
	file?: string;
	sources: string[];
	sourcesContent: (string | null)[];
	names: string[];
	mappings: string;
}

export function mappings_to_v3(
	mappings: Mapping<CodeInformation>[],
	source: string,
	generated: string,
	file?: string,
): SourceMapV3 {
	const src_lines = build_line_starts(source);
	const gen_lines = build_line_starts(generated);

	// flatten: each mapping can have multiple offset pairs
	interface Segment {
		gen_offset: number;
		gen_length: number;
		src_offset: number;
		src_length: number;
	}

	const segments: Segment[] = [];
	for (const m of mappings) {
		for (let i = 0; i < m.sourceOffsets.length; i++) {
			segments.push({
				gen_offset: m.generatedOffsets[i],
				gen_length: m.generatedLengths
					? m.generatedLengths[i]
					: m.lengths[i],
				src_offset: m.sourceOffsets[i],
				src_length: m.lengths[i],
			});
		}
	}

	// sort by generated offset
	segments.sort((a, b) => a.gen_offset - b.gen_offset);

	// encode as vlq
	let prev_gen_col = 0;
	let prev_src_line = 0;
	let prev_src_col = 0;
	let prev_gen_line = 0;
	let result = "";

	for (const seg of segments) {
		const [gen_line, gen_col] = offset_to_position(
			gen_lines,
			seg.gen_offset,
		);
		const [src_line, src_col] = offset_to_position(
			src_lines,
			seg.src_offset,
		);

		// emit line separators
		while (prev_gen_line < gen_line) {
			result += ";";
			prev_gen_line++;
			prev_gen_col = 0;
		}

		// comma separator between segments on same line
		if (result.length > 0 && result[result.length - 1] !== ";") {
			result += ",";
		}

		// 4-field segment: gen_col, source_idx(0), src_line, src_col
		result += vlq_encode(gen_col - prev_gen_col);
		result += vlq_encode(0 - 0); // source index delta (always 0, single source)
		result += vlq_encode(src_line - prev_src_line);
		result += vlq_encode(src_col - prev_src_col);

		prev_gen_col = gen_col;
		prev_src_line = src_line;
		prev_src_col = src_col;
	}

	// svelte's preprocessor uses basename for source matching
	const basename = file ? /** @type {string} */ (file.split(/[/\\]/).pop()) : "input.md";

	return {
		version: 3,
		file: basename,
		sources: [basename],
		sourcesContent: [source],
		names: [],
		mappings: result,
	};
}
