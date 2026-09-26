/**
 * sourcemap utilities: line-starts, offset to position, vlq, v3 conversion.
 */

import type { Mapping, MappingData } from './mappings';

/** build an array of byte offsets where each line begins. line 0 starts at 0. */
export function build_line_starts(source: string): Uint32Array {
	const starts: number[] = [0];
	for (let i = 0; i < source.length; i++) {
		const c = source.charCodeAt(i);
		// bare \r ends a line too, as editors split source
		if (c === 10 || (c === 13 && source.charCodeAt(i + 1) !== 10)) {
			starts.push(i + 1);
		}
	}
	return new Uint32Array(starts);
}

/** convert a byte offset to [line, column] using a precomputed line_starts table. */
export function offset_to_position(
	line_starts: Uint32Array,
	offset: number
): [line: number, col: number] {
	const line = find_line(line_starts, offset);
	return [line, offset - line_starts[line]];
}

function find_line(line_starts: Uint32Array, offset: number): number {
	let lo = 0,
		hi = line_starts.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (line_starts[mid] <= offset) lo = mid + 1;
		else hi = mid;
	}
	return lo - 1;
}

function next_line_start(line_starts: Uint32Array, line: number): number {
	return line + 1 < line_starts.length ? line_starts[line + 1] : Infinity;
}

/** find the line of offset, trying the hint line and the one after it first. */
function find_line_near(
	line_starts: Uint32Array,
	hint: number,
	offset: number
): number {
	// consecutive lookups mostly stay on a line or step onto the next one
	if (offset >= line_starts[hint]) {
		if (offset < next_line_start(line_starts, hint)) return hint;
		if (offset < next_line_start(line_starts, hint + 1)) return hint + 1;
	}
	return find_line(line_starts, offset);
}

const VLQ_CHARS =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq_encode(value: number): string {
	let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
	let result = '';
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

/** mapped spans as parallel arrays, in the order the mappings list them. */
interface Spans {
	gen: number[];
	src: number[];
	len: number[];
}

/**
 * collect the spans that become v3 segments. identity-mapped content keeps
 * its length and is encoded as a run, one segment per character. with
 * per_char set, each of its characters becomes a span of its own.
 */
function collect_spans(
	mappings: Mapping<MappingData>[],
	per_char: boolean
): Spans {
	const spans: Spans = { gen: [], src: [], len: [] };
	for (const m of mappings) {
		const role = m.data.role;
		if (role === 'open_syntax' || role === 'close_syntax') continue;

		for (let i = 0; i < m.sourceOffsets.length; i++) {
			const gen_start = m.generatedOffsets[i];
			const src_start = m.sourceOffsets[i];

			if (role === 'node') {
				// one anchor per node even when split around \r\n
				if (i === 0) push_span(spans, gen_start, src_start, 1);
			} else if (!m.generatedLengths) {
				// identity-mapped content (source text = generated text).
				// every character gets a segment so downstream chaining
				// preserves column precision.
				const len = m.lengths[i];
				if (!per_char) {
					if (len > 0) push_span(spans, gen_start, src_start, len);
				} else {
					for (let d = 0; d < len; d++) {
						push_span(spans, gen_start + d, src_start + d, 1);
					}
				}
			} else {
				// escaped/transformed content, lengths differ.
				// emit start point only.
				push_span(spans, gen_start, src_start, 1);
			}
		}
	}
	return spans;
}

function push_span(spans: Spans, gen: number, src: number, len: number): void {
	spans.gen.push(gen);
	spans.src.push(src);
	spans.len.push(len);
}

/** span indices by generated offset, ties kept in mapping order. */
function sort_spans(spans: Spans): number[] {
	const order: number[] = [];
	for (let i = 0; i < spans.gen.length; i++) order.push(i);
	const gen = spans.gen;
	order.sort((a, b) => gen[a] - gen[b]);
	return order;
}

/**
 * whether a span starts inside the run before it. the characters of the two
 * would interleave when sorted one by one, so they cannot be encoded as runs.
 */
function runs_overlap(spans: Spans, order: number[]): boolean {
	for (let k = 1; k < order.length; k++) {
		const a = order[k - 1];
		const b = order[k];
		const last = spans.gen[a] + spans.len[a] - 1;
		if (last > spans.gen[b] || (last === spans.gen[b] && a > b)) return true;
	}
	return false;
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
	file?: string
): SourceMapV3 {
	const src_lines = build_line_starts(source);
	const gen_lines = build_line_starts(generated);

	let spans = collect_spans(mappings, false);
	let order = sort_spans(spans);
	if (runs_overlap(spans, order)) {
		spans = collect_spans(mappings, true);
		order = sort_spans(spans);
	}

	// encode as vlq
	let prev_gen_col = 0;
	let prev_src_line = 0;
	let prev_src_col = 0;
	let prev_gen_line = 0;
	let gen_line = 0;
	let src_line = 0;
	let result = '';
	// indexing result would flatten the rope on every segment
	let line_has_segment = false;

	for (const i of order) {
		let gen_offset = spans.gen[i];
		let src_offset = spans.src[i];
		let remaining = spans.len[i];

		for (;;) {
			gen_line = find_line_near(gen_lines, gen_line, gen_offset);
			src_line = find_line_near(src_lines, src_line, src_offset);
			const gen_col = gen_offset - gen_lines[gen_line];
			const src_col = src_offset - src_lines[src_line];

			// emit line separators
			while (prev_gen_line < gen_line) {
				result += ';';
				prev_gen_line++;
				prev_gen_col = 0;
				line_has_segment = false;
			}

			// comma separator between segments on same line
			if (line_has_segment) result += ',';
			line_has_segment = true;

			// 4-field segment: gen_col, source_idx(0), src_line, src_col
			result += vlq_encode(gen_col - prev_gen_col);
			result += 'A'; // source index delta (always 0, single source)
			result += vlq_encode(src_line - prev_src_line);
			result += vlq_encode(src_col - prev_src_col);

			// until the run reaches a line start in either text, each next
			// character moves both columns by one, which encodes as CAAC
			const run = Math.min(
				remaining,
				next_line_start(gen_lines, gen_line) - gen_offset,
				next_line_start(src_lines, src_line) - src_offset
			);
			if (run > 1) result += ',CAAC'.repeat(run - 1);

			prev_gen_col = gen_col + run - 1;
			prev_src_line = src_line;
			prev_src_col = src_col + run - 1;

			remaining -= run;
			if (remaining === 0) break;
			gen_offset += run;
			src_offset += run;
		}
	}

	// use basename to match svelte compiler convention, vite resolves relative
	// to the served JS file, so the browser can find the source.
	const basename = file ? file.split(/[/\\]/).pop()! : 'input.md';

	return {
		version: 3,
		file: basename,
		sources: [basename],
		sourcesContent: [source],
		names: [],
		mappings: result,
	};
}
