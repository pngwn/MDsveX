/**
 * sourcemap utilities: line-starts, offset to position, vlq, v3 conversion.
 */

import type { Mapping, MappingData } from "./mappings";
import type { PendingMapping } from "./html_cursor";


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

function source_map(
	source: string,
	mappings: string,
	file?: string,
): SourceMapV3 {
	// use basename to match svelte compiler convention, vite resolves relative
	// to the served JS file, so the browser can find the source.
	const basename = file ? file.split(/[/\\]/).pop()! : "input.md";

	return {
		version: 3,
		file: basename,
		sources: [basename],
		sourcesContent: [source],
		names: [],
		mappings,
	};
}


export interface SourceMapV3 {
	version: 3;
	file?: string;
	sources: string[];
	sourcesContent: (string | null)[];
	names: string[];
	mappings: string;
}

/**
 * convert Mapping<MappingData>[] to a v3 sourcemap.
 *
 * emits content spans (for cursor placement) and node span start anchors
 * (for block identification). skips open_syntax and close_syntax to avoid
 * overlapping ranges that cause nondeterministic cursor jumps in devtools.
 */
export function mappings_to_v3(
	mappings: Mapping<MappingData>[],
	source: string,
	generated: string,
	file?: string,
): SourceMapV3 {
	const src_lines = build_line_starts(source);
	const gen_lines = build_line_starts(generated);

	interface Segment {
		gen_offset: number;
		src_offset: number;
	}

	const segments: Segment[] = [];
	for (const m of mappings) {
		const role = m.data.role;
		if (role === "open_syntax" || role === "close_syntax") continue;

		for (let i = 0; i < m.sourceOffsets.length; i++) {
			const gen_start = m.generatedOffsets[i];
			const src_start = m.sourceOffsets[i];

			if (role === "node") {
				// collapse node span to start anchor
				segments.push({ gen_offset: gen_start, src_offset: src_start });
			} else {
				const gen_len = m.generatedLengths
					? m.generatedLengths[i]
					: m.lengths[i];
				const src_len = m.lengths[i];

				if (!m.generatedLengths && src_len === gen_len) {
					// identity-mapped content (source text = generated text).
					// emit per-character segments so downstream chaining
					// preserves column precision. VLQ is compact for identity
					// runs (CAAC repeated).
					for (let d = 0; d < gen_len; d++) {
						segments.push({
							gen_offset: gen_start + d,
							src_offset: src_start + d,
						});
					}
				} else {
					// escaped/transformed content, lengths differ.
					// emit start point only.
					segments.push({
						gen_offset: gen_start,
						src_offset: src_start,
					});
				}
			}
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
		result += vlq_encode(0); // source index delta (always 0, single source)
		result += vlq_encode(src_line - prev_src_line);
		result += vlq_encode(src_col - prev_src_col);

		prev_gen_col = gen_col;
		prev_src_line = src_line;
		prev_src_col = src_col;
	}

	return source_map(source, result, file);
}

/**
 * Convert the renderer's pending entries straight to V3 without first
 * allocating the public Volar Mapping objects and their one-element arrays.
 */
export function pending_mappings_to_v3(
	out: string[],
	entries: PendingMapping[],
	source: string,
	generated: string,
	file?: string,
	offset_scratch?: Uint32Array,
	ordered = false,
): SourceMapV3 {
	const needed = out.length + 1;
	const offsets =
		offset_scratch !== undefined && offset_scratch.length >= needed
			? offset_scratch
			: new Uint32Array(needed);
	offsets[0] = 0;
	for (let i = 0; i < out.length; i++) {
		offsets[i + 1] = offsets[i] + out[i].length;
	}

	// Sort mapping entries, not expanded per-character segments. Content spans
	// are non-overlapping, so their identity runs can be encoded in place.
	let order: number[] | undefined;
	if (!ordered) {
		order = [];
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const role = entry.data.role;
			if (role === "open_syntax" || role === "close_syntax") continue;
			order.push(i);
		}
		order.sort(
			(a, b) =>
				offsets[entries[a].out_idx] - offsets[entries[b].out_idx] ||
				a - b,
		);
	}

	const source_lines = build_line_starts(source);
	const generated_lines = build_line_starts(generated);
	let previous_generated_column = 0;
	let previous_source_line = 0;
	let previous_source_column = 0;
	let previous_generated_line = 0;
	let result = "";

	const entry_count = ordered ? entries.length : order!.length;
	for (let i = 0; i < entry_count; i++) {
		const entry = entries[ordered ? i : order![i]];
		const generated_offset = offsets[entry.out_idx];
		const generated_length =
			offsets[entry.out_idx + entry.out_count] - generated_offset;
		const identity =
			entry.data.role !== "node" &&
			generated_length === entry.source_length;
		const segment_count = identity ? generated_length : 1;
		let [generated_line, generated_column] = offset_to_position(
			generated_lines,
			generated_offset,
		);
		let [source_line, source_column] = offset_to_position(
			source_lines,
			entry.source_offset,
		);

		for (let delta = 0; delta < segment_count; delta++) {
			if (
				delta > 0 &&
				generated_line === previous_generated_line &&
				source_line === previous_source_line &&
				generated_column === previous_generated_column + 1 &&
				source_column === previous_source_column + 1
			) {
				// The common identity-run segment is [1, 0, 0, 1].
				result += ",CAAC";
			} else {
				while (previous_generated_line < generated_line) {
					result += ";";
					previous_generated_line++;
					previous_generated_column = 0;
				}
				if (result.length > 0 && result[result.length - 1] !== ";") {
					result += ",";
				}

				result += vlq_encode(
					generated_column - previous_generated_column,
				);
				result += "A";
				result += vlq_encode(source_line - previous_source_line);
				result += vlq_encode(source_column - previous_source_column);
			}

			previous_generated_column = generated_column;
			previous_source_line = source_line;
			previous_source_column = source_column;

			if (identity) {
				if (generated.charCodeAt(generated_offset + delta) === 10) {
					generated_line++;
					generated_column = 0;
				} else {
					generated_column++;
				}
				if (source.charCodeAt(entry.source_offset + delta) === 10) {
					source_line++;
					source_column = 0;
				} else {
					source_column++;
				}
			}
		}
	}

	return source_map(source, result, file);
}
