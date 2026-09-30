/**
 * sourcemap utilities: line-starts, offset to position, vlq, v3 conversion.
 */

import type { Mapping, MappingData, MapSink } from './mappings';

// mirrors mappings.ts, local const enums build to literals while imported
// consts live in module cells that turbofan reloads on every use
const enum Rec {
	SIZE = 6,
}

const enum Role {
	CONTENT = 1,
	OPEN_SYNTAX = 2,
	CLOSE_SYNTAX = 3,
}

// past every offset so the line after the last needs no bounds check
const PAST_END = 0x7fffffff;

/** starts ends in two PAST_END slots, find_line_near reads two lines ahead */
class LineTable {
	starts = new Int32Array(256);
	count = 0;
}

// encoding never yields, so every call shares these buffers
const src_table = new LineTable();
const gen_table = new LineTable();

function copy_i32(a: Int32Array, used: number, size: number): Int32Array {
	const b = new Int32Array(size);
	b.set(a.subarray(0, used));
	return b;
}

function fill_line_starts(table: LineTable, s: string): void {
	let starts = table.starts;
	let n = 1;
	starts[0] = 0;
	if (s.indexOf('\r') === -1) {
		// without \r only \n ends a line, and indexOf finds it far faster than
		// a charCodeAt loop
		let i = s.indexOf('\n');
		while (i !== -1) {
			if (n + 2 >= starts.length)
				starts = copy_i32(starts, n, starts.length * 2);
			starts[n++] = i + 1;
			i = s.indexOf('\n', i + 1);
		}
	} else {
		for (let i = 0; i < s.length; i++) {
			const c = s.charCodeAt(i);
			// bare \r ends a line too, as editors split source
			if (c === 10 || (c === 13 && s.charCodeAt(i + 1) !== 10)) {
				if (n + 2 >= starts.length)
					starts = copy_i32(starts, n, starts.length * 2);
				starts[n++] = i + 1;
			}
		}
	}
	starts[n] = PAST_END;
	starts[n + 1] = PAST_END;
	table.starts = starts;
	table.count = n;
}

/** build an array of byte offsets where each line begins. line 0 starts at 0. */
export function build_line_starts(source: string): Uint32Array {
	const table = new LineTable();
	fill_line_starts(table, source);
	return new Uint32Array(table.starts.subarray(0, table.count));
}

/** convert a byte offset to [line, column] using a precomputed line_starts table. */
export function offset_to_position(
	line_starts: Uint32Array,
	offset: number
): [line: number, col: number] {
	let lo = 0,
		hi = line_starts.length;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (line_starts[mid] <= offset) lo = mid + 1;
		else hi = mid;
	}
	return [lo - 1, offset - line_starts[lo - 1]];
}

function find_line(starts: Int32Array, count: number, offset: number): number {
	let lo = 0,
		hi = count;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (starts[mid] <= offset) lo = mid + 1;
		else hi = mid;
	}
	return lo - 1;
}

function find_line_near(
	starts: Int32Array,
	count: number,
	hint: number,
	offset: number
): number {
	// consecutive lookups mostly stay on a line or step onto the next one
	if (offset >= starts[hint]) {
		if (offset < starts[hint + 1]) return hint;
		if (offset < starts[hint + 2]) return hint + 1;
	}
	return find_line(starts, count, offset);
}

export interface SourceMapV3 {
	version: 3;
	file?: string;
	sources: string[];
	sourcesContent: (string | null)[];
	names: string[];
	mappings: string;
}

// spans in the order the mappings list them
let span_gen = new Int32Array(1024);
let span_src = new Int32Array(1024);
let span_len = new Int32Array(1024);
// span indices by generated offset
let span_order = new Int32Array(1024);
let span_count = 0;

function reserve_spans(used: number, need: number): void {
	let size = span_gen.length * 2;
	while (size < need) size *= 2;
	span_gen = copy_i32(span_gen, used, size);
	span_src = copy_i32(span_src, used, size);
	span_len = copy_i32(span_len, used, size);
	span_order = new Int32Array(size);
}

/** identity pieces stay one span, encoded as a run of per character segments */
function collect_spans(mappings: Mapping<MappingData>[]): void {
	let gen = span_gen;
	let src = span_src;
	let len = span_len;
	let n = 0;
	for (let k = 0; k < mappings.length; k++) {
		const m = mappings[k];
		const role = m.data.role;
		if (role === 'open_syntax' || role === 'close_syntax') continue;

		const src_offsets = m.sourceOffsets;
		const gen_offsets = m.generatedOffsets;
		const count = src_offsets.length;
		if (n + count > gen.length) {
			reserve_spans(n, n + count);
			gen = span_gen;
			src = span_src;
			len = span_len;
		}
		if (role === 'node') {
			// one anchor per node even when split around \r\n
			if (count > 0) {
				gen[n] = gen_offsets[0];
				src[n] = src_offsets[0];
				len[n] = 1;
				n++;
			}
		} else if (!m.generatedLengths) {
			// one segment per character so chained maps keep column precision
			const lengths = m.lengths;
			for (let i = 0; i < count; i++) {
				const l = lengths[i];
				if (l > 0) {
					gen[n] = gen_offsets[i];
					src[n] = src_offsets[i];
					len[n] = l;
					n++;
				}
			}
		} else {
			// escaped/transformed content, lengths differ.
			// emit start point only.
			for (let i = 0; i < count; i++) {
				gen[n] = gen_offsets[i];
				src[n] = src_offsets[i];
				len[n] = 1;
				n++;
			}
		}
	}
	span_count = n;
}

/** one span per identity character, for overlapping runs sorted by character */
function collect_char_spans(mappings: Mapping<MappingData>[]): void {
	span_count = 0;
	for (let k = 0; k < mappings.length; k++) {
		const m = mappings[k];
		const role = m.data.role;
		if (role === 'open_syntax' || role === 'close_syntax') continue;

		const src_offsets = m.sourceOffsets;
		const gen_offsets = m.generatedOffsets;
		if (role === 'node') {
			if (src_offsets.length > 0) push_span(gen_offsets[0], src_offsets[0], 1);
		} else if (!m.generatedLengths) {
			const lengths = m.lengths;
			for (let i = 0; i < src_offsets.length; i++) {
				for (let d = 0; d < lengths[i]; d++) {
					push_span(gen_offsets[i] + d, src_offsets[i] + d, 1);
				}
			}
		} else {
			for (let i = 0; i < src_offsets.length; i++) {
				push_span(gen_offsets[i], src_offsets[i], 1);
			}
		}
	}
}

/** a record is one mapping piece, identity when both lengths match */
function collect_record_spans(
	rec: Uint32Array,
	start: number,
	end: number
): void {
	// at most one span per record
	const most = (end - start) / Rec.SIZE;
	if (most > span_gen.length) reserve_spans(0, most);
	const gen = span_gen;
	const src = span_src;
	const len = span_len;
	let k = 0;
	for (let p = start; p < end; p += Rec.SIZE) {
		const role = rec[p + 5] & 3;
		if (role === Role.OPEN_SYNTAX || role === Role.CLOSE_SYNTAX) continue;
		const g = rec[p];
		let l = 1;
		if (role === Role.CONTENT) {
			const source_length = rec[p + 3];
			if (rec[p + 1] === source_length) {
				if (source_length === 0) continue;
				l = source_length;
			}
		}
		gen[k] = g;
		src[k] = rec[p + 2];
		len[k] = l;
		k++;
	}
	span_count = k;
}

function collect_record_char_spans(
	rec: Uint32Array,
	start: number,
	end: number
): void {
	span_count = 0;
	for (let p = start; p < end; p += Rec.SIZE) {
		const role = rec[p + 5] & 3;
		if (role === Role.OPEN_SYNTAX || role === Role.CLOSE_SYNTAX) continue;
		const g = rec[p];
		const s = rec[p + 2];
		const source_length = rec[p + 3];
		if (role === Role.CONTENT && rec[p + 1] === source_length) {
			for (let d = 0; d < source_length; d++) push_span(g + d, s + d, 1);
		} else {
			push_span(g, s, 1);
		}
	}
}

function push_span(gen: number, src: number, len: number): void {
	const n = span_count;
	if (n === span_gen.length) reserve_spans(n, n + 1);
	span_gen[n] = gen;
	span_src[n] = src;
	span_len[n] = len;
	span_count = n + 1;
}

/**
 * mappings come nearly sorted, only node anchors land a little ahead of the
 * content before them, so insertion sort does few moves and no comparator calls
 */
function sort_spans(): void {
	const n = span_count;
	const gen = span_gen;
	const order = span_order;
	// past this many moves the input is far from sorted and a real sort wins
	const move_limit = 32 * n + 1024;
	let moves = 0;
	order[0] = 0;
	for (let k = 1; k < n; k++) {
		const g = gen[k];
		let j = k - 1;
		// strict > keeps equal offsets in mapping order
		while (j >= 0 && gen[order[j]] > g) {
			order[j + 1] = order[j];
			j--;
		}
		order[j + 1] = k;
		moves += k - 1 - j;
		if (moves > move_limit) {
			for (let i = k + 1; i < n; i++) order[i] = i;
			order.subarray(0, n).sort((a, b) => gen[a] - gen[b] || a - b);
			return;
		}
	}
}

/** a span starting inside the run before it interleaves, so runs cannot be used */
function runs_overlap(): boolean {
	const gen = span_gen;
	const len = span_len;
	const order = span_order;
	for (let k = 1; k < span_count; k++) {
		const a = order[k - 1];
		const b = order[k];
		const last = gen[a] + len[a] - 1;
		if (last > gen[b] || (last === gen[b] && a > b)) return true;
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
	// empty documents are common enough that the span setup would show
	const encoded =
		mappings.length === 0 ? '' : encode_mappings(mappings, source, generated);
	return v3_map(encoded, source, file);
}

/** @internal equals mappings_to_v3 over the Mapping objects the records resolve to */
export function records_to_v3(
	sink: MapSink,
	offsets: Uint32Array | null,
	source: string,
	generated: string,
	file?: string
): SourceMapV3 {
	const n = sink.n;
	let encoded = '';
	if (n !== 0) {
		const rec =
			offsets === null ? sink.rec : records_by_offset(sink.rec, n, offsets);
		encoded = encode_records(rec, 0, n, source, generated);
	}
	return v3_map(encoded, source, file);
}

/**
 * records whose generated start and length count out chunks, as records of
 * generated offsets, offsets holding each chunk's offset then the end
 * @internal
 */
export function records_by_offset(
	rec: Uint32Array,
	n: number,
	offsets: Uint32Array
): Uint32Array {
	const copy = new Uint32Array(n > 0 ? n : Rec.SIZE);
	for (let p = 0; p < n; p += Rec.SIZE) {
		const g = offsets[rec[p]];
		copy[p] = g;
		copy[p + 1] = offsets[rec[p] + rec[p + 1]] - g;
		copy[p + 2] = rec[p + 2];
		copy[p + 3] = rec[p + 3];
		copy[p + 4] = rec[p + 4];
		copy[p + 5] = rec[p + 5];
	}
	return copy;
}

export function map_basename(file?: string): string {
	// use basename to match svelte compiler convention, vite resolves relative
	// to the served JS file, so the browser can find the source.
	return file
		? file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1)
		: 'input.md';
}

function v3_map(encoded: string, source: string, file?: string): SourceMapV3 {
	const basename = map_basename(file);
	return {
		version: 3,
		file: basename,
		sources: [basename],
		sourcesContent: [source],
		names: [],
		mappings: encoded,
	};
}

const VLQ_CODES = new Uint8Array(64);
{
	const chars =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	for (let i = 0; i < 64; i++) VLQ_CODES[i] = chars.charCodeAt(i);
}

const VLQ_DIGITS = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) VLQ_DIGITS[VLQ_CODES[i]] = i;

const COMMA = 44;
const SEMICOLON = 59;
const CHAR_A = 65;
const CHAR_C = 67;

// ascii bytes decoded once give a flat string, concatenation leaves a rope
// that survives scavenges and is flattened again by every consumer
let out = new Uint8Array(16384);
let out_view = new DataView(out.buffer);
const decoder = new TextDecoder();

function grow_out(used: number, need: number): void {
	let size = out.length * 2;
	while (size < need) size *= 2;
	const next = new Uint8Array(size);
	next.set(out.subarray(0, used));
	out = next;
	out_view = new DataView(next.buffer);
}

// four CAAC segments as five little endian words, one store per four bytes
const CAAC_4 = new Uint32Array(5);
{
	const bytes = ',CAAC,CAAC,CAAC,CAAC';
	for (let w = 0; w < 5; w++) {
		let word = 0;
		for (let b = 3; b >= 0; b--)
			word = (word << 8) | bytes.charCodeAt(w * 4 + b);
		CAAC_4[w] = word;
	}
}
const CAAC_W0 = CAAC_4[0];
const CAAC_W1 = CAAC_4[1];
const CAAC_W2 = CAAC_4[2];
const CAAC_W3 = CAAC_4[3];
const CAAC_W4 = CAAC_4[4];

function write_vlq(buf: Uint8Array, p: number, value: number): number {
	let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
	while (vlq > 0x1f) {
		buf[p++] = VLQ_CODES[(vlq & 0x1f) | 0x20];
		vlq >>>= 5;
	}
	buf[p++] = VLQ_CODES[vlq];
	return p;
}

function encode_mappings(
	mappings: Mapping<MappingData>[],
	source: string,
	generated: string
): string {
	fill_line_starts(src_table, source);
	fill_line_starts(gen_table, generated);

	collect_spans(mappings);
	sort_spans();
	if (runs_overlap()) {
		collect_char_spans(mappings);
		sort_spans();
	}
	return encode_spans();
}

/** records hold generated offsets and lengths */
function encode_records(
	rec: Uint32Array,
	start: number,
	end: number,
	source: string,
	generated: string
): string {
	fill_line_starts(src_table, source);
	fill_line_starts(gen_table, generated);

	collect_record_spans(rec, start, end);
	sort_spans();
	if (runs_overlap()) {
		collect_record_char_spans(rec, start, end);
		sort_spans();
	}
	return encode_spans();
}

function encode_spans(): string {
	const n = span_count;
	const gen = span_gen;
	const src = span_src;
	const len = span_len;
	const order = span_order;
	const gen_starts = gen_table.starts;
	const gen_count = gen_table.count;
	const src_starts = src_table.starts;
	const src_count = src_table.count;

	let buf = out;
	let view = out_view;
	let p = 0;
	let prev_gen_col = 0;
	let prev_src_line = 0;
	let prev_src_col = 0;
	let prev_gen_line = 0;
	let gen_line = 0;
	let src_line = 0;
	let line_has_segment = false;

	for (let k = 0; k < n; k++) {
		const i = order[k];
		let gen_offset = gen[i];
		let src_offset = src[i];
		let remaining = len[i];

		for (;;) {
			gen_line = find_line_near(gen_starts, gen_count, gen_line, gen_offset);
			src_line = find_line_near(src_starts, src_count, src_line, src_offset);
			const gen_col = gen_offset - gen_starts[gen_line];
			const src_col = src_offset - src_starts[src_line];

			// until the run reaches a line start in either text, each next
			// character moves both columns by one, which encodes as CAAC
			let run = remaining;
			const gen_left = gen_starts[gen_line + 1] - gen_offset;
			if (gen_left < run) run = gen_left;
			const src_left = src_starts[src_line + 1] - src_offset;
			if (src_left < run) run = src_left;

			// separators, a comma and three vlq fields of at most 7 digits
			const need = p + (gen_line - prev_gen_line) + 24 + 5 * run;
			if (need > buf.length) {
				grow_out(p, need);
				buf = out;
				view = out_view;
			}

			if (prev_gen_line < gen_line) {
				do buf[p++] = SEMICOLON;
				while (++prev_gen_line < gen_line);
				prev_gen_col = 0;
			} else if (line_has_segment) {
				buf[p++] = COMMA;
			}
			line_has_segment = true;

			// 4-field segment: gen_col, source_idx(0), src_line, src_col
			p = write_vlq(buf, p, gen_col - prev_gen_col);
			buf[p++] = CHAR_A; // source index delta, always 0 with one source
			p = write_vlq(buf, p, src_line - prev_src_line);
			p = write_vlq(buf, p, src_col - prev_src_col);

			let reps = run - 1;
			while (reps >= 4) {
				view.setUint32(p, CAAC_W0, true);
				view.setUint32(p + 4, CAAC_W1, true);
				view.setUint32(p + 8, CAAC_W2, true);
				view.setUint32(p + 12, CAAC_W3, true);
				view.setUint32(p + 16, CAAC_W4, true);
				p += 20;
				reps -= 4;
			}
			for (; reps > 0; reps--) {
				buf[p] = COMMA;
				buf[p + 1] = CHAR_C;
				buf[p + 2] = CHAR_A;
				buf[p + 3] = CHAR_A;
				buf[p + 4] = CHAR_C;
				p += 5;
			}

			prev_gen_col = gen_col + run - 1;
			prev_src_line = src_line;
			prev_src_col = src_col + run - 1;

			remaining -= run;
			if (remaining === 0) break;
			gen_offset += run;
			src_offset += run;
		}
	}

	return decoder.decode(buf.subarray(0, p));
}

/**
 * a render copied out of the shared buffers to build its map later, records
 * of generated offsets from start to split, buf may hold other traces
 */
export interface MapTrace {
	buf: Uint32Array;
	start: number;
	split: number;
	end: number;
}

// an off heap backing store per trace costs far more than copying words, so
// traces are carved from append only slabs, and a large trace gets its own
// array so it neither pins a mostly empty slab nor wastes one
const TRACE_SLAB_WORDS = 32768;
const TRACE_OWN_WORDS = 8192;
let trace_slab = new Uint32Array(0);
let trace_used = 0;

export function reserve_trace(
	rec_words: number,
	offset_words: number
): MapTrace {
	const words = rec_words + offset_words;
	if (words > TRACE_OWN_WORDS) {
		return {
			buf: new Uint32Array(words),
			start: 0,
			split: rec_words,
			end: words,
		};
	}
	let start = trace_used;
	if (start + words > trace_slab.length) {
		trace_slab = new Uint32Array(TRACE_SLAB_WORDS);
		start = 0;
	}
	trace_used = start + words;
	return {
		buf: trace_slab,
		start,
		split: start + rec_words,
		end: start + words,
	};
}

/** @internal */
export function trace_to_v3(
	trace: MapTrace,
	source: string,
	generated: string,
	file?: string
): SourceMapV3 {
	const start = trace.start;
	const split = trace.split;
	const buf = trace.buf;
	const encoded =
		split === start
			? ''
			: encode_records(buf, start, split, source, generated);
	return v3_map(encoded, source, file);
}

export type DecodedSegment = [
	gen_col: number,
	source: number,
	src_line: number,
	src_col: number,
];

export interface DecodedSourceMapV3 {
	version: 3;
	file?: string;
	sources: string[];
	sourcesContent: (string | null)[];
	names: string[];
	mappings: DecodedSegment[][];
}

/**
 * only the listed generated lines hold segments, each equal to that line of
 * the decoded trace_to_v3 map, so lookups on them match the full map
 * @internal
 */
export function trace_to_decoded(
	trace: MapTrace,
	source: string,
	generated: string,
	lines: ArrayLike<number>,
	file?: string
): DecodedSourceMapV3 {
	const start = trace.start;
	const split = trace.split;
	const basename = map_basename(file);
	return {
		version: 3,
		file: basename,
		sources: [basename],
		sourcesContent: [source],
		names: [],
		mappings:
			lines.length === 0 || split === start
				? []
				: decode_lines(trace.buf, start, split, source, generated, lines),
	};
}

// shared by every empty line, never write to it
const NO_SEGMENTS: DecodedSegment[] = [];

/**
 * the encoder writes one segment per identity character and one per other
 * record, ordered by generated offset then record whether or not runs
 * overlap, so each line is those points in that order
 */
function decode_lines(
	buf: Uint32Array,
	start: number,
	split: number,
	source: string,
	generated: string,
	lines: ArrayLike<number>
): DecodedSegment[][] {
	fill_line_starts(gen_table, generated);
	const gen_starts = gen_table.starts;
	const gen_count = gen_table.count;

	// a line past the last one has no segments in the full map either
	const wanted = new Uint8Array(gen_count);
	let last = -1;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line >= 0 && line < gen_count) {
			wanted[line] = 1;
			if (line > last) last = line;
		}
	}
	const mappings: DecodedSegment[][] = [];
	if (last < 0) return mappings;

	span_count = 0;
	let gen_line = 0;
	for (let p = start; p < split; p += Rec.SIZE) {
		const role = buf[p + 5] & 3;
		if (role === Role.OPEN_SYNTAX || role === Role.CLOSE_SYNTAX) continue;
		const g = buf[p];
		const s = buf[p + 2];
		const source_length = buf[p + 3];
		if (role === Role.CONTENT && buf[p + 1] === source_length) {
			// a run can cross lines
			const end = g + source_length;
			let at = g;
			while (at < end) {
				gen_line = find_line_near(gen_starts, gen_count, gen_line, at);
				let stop = gen_starts[gen_line + 1];
				if (stop > end) stop = end;
				if (wanted[gen_line] === 1) {
					for (; at < stop; at++) push_span(at, s + (at - g), 1);
				} else {
					at = stop;
				}
			}
		} else {
			gen_line = find_line_near(gen_starts, gen_count, gen_line, g);
			if (wanted[gen_line] === 1) push_span(g, s, 1);
		}
	}
	for (let i = 0; i <= last; i++) mappings.push(NO_SEGMENTS);
	if (span_count === 0) return mappings;

	fill_line_starts(src_table, source);
	const src_starts = src_table.starts;
	const src_count = src_table.count;
	sort_spans();

	const gen = span_gen;
	const src = span_src;
	const order = span_order;
	let src_line = 0;
	let current = -1;
	let segments = NO_SEGMENTS;
	gen_line = 0;
	for (let k = 0; k < span_count; k++) {
		const i = order[k];
		const g = gen[i];
		const s = src[i];
		gen_line = find_line_near(gen_starts, gen_count, gen_line, g);
		if (gen_line !== current) {
			segments = [];
			mappings[gen_line] = segments;
			current = gen_line;
		}
		src_line = find_line_near(src_starts, src_count, src_line, s);
		segments.push([
			g - gen_starts[gen_line],
			0,
			src_line,
			s - src_starts[src_line],
		]);
	}
	return mappings;
}

/**
 * source lines of v3 mappings, unordered with repeats, null when a segment is
 * one decoders read differently or names another source
 * @internal
 */
export function mapped_source_lines(
	mappings: string | readonly (readonly number[])[][]
): number[] | null {
	const lines: number[] = [];
	if (typeof mappings !== 'string') {
		if (!Array.isArray(mappings)) return null;
		for (let i = 0; i < mappings.length; i++) {
			const line = mappings[i];
			if (!Array.isArray(line)) return null;
			for (let j = 0; j < line.length; j++) {
				const segment = line[j];
				if (!Array.isArray(segment)) return null;
				if (segment.length === 1) continue;
				if (segment.length !== 4 && segment.length !== 5) return null;
				const src_line = segment[2];
				if (segment[1] !== 0 || !Number.isInteger(src_line) || src_line < 0)
					return null;
				lines.push(src_line);
			}
		}
		return lines;
	}

	let field = 0;
	let source_index = 0;
	let src_line = 0;
	let last_line = -1;
	let value = 0;
	let shift = 0;
	const length = mappings.length;
	for (let i = 0; i <= length; i++) {
		const c = i < length ? mappings.charCodeAt(i) : SEMICOLON;
		if (c === COMMA || c === SEMICOLON) {
			// a value cut short, or a segment of a length decoders disagree on
			if (shift !== 0) return null;
			if (field === 4 || field === 5) {
				if (source_index !== 0 || src_line < 0) return null;
				// consecutive segments mostly stay on one line
				if (src_line !== last_line) {
					lines.push(src_line);
					last_line = src_line;
				}
			} else if (field !== 1 && (field !== 0 || c === COMMA)) {
				return null;
			}
			field = 0;
			continue;
		}
		const digit = c < 128 ? VLQ_DIGITS[c] : -1;
		// past six digits a value no longer fits the int32 decoders use
		if (digit < 0 || shift > 25) return null;
		value |= (digit & 31) << shift;
		if ((digit & 32) !== 0) {
			shift += 5;
			continue;
		}
		const magnitude = value >>> 1;
		// @jridgewell/sourcemap-codec decodes negative zero to the int32 minimum
		if ((value & 1) !== 0 && magnitude === 0) return null;
		const delta = (value & 1) !== 0 ? -magnitude : magnitude;
		if (field === 1) source_index += delta;
		else if (field === 2) src_line += delta;
		field++;
		value = 0;
		shift = 0;
	}
	return lines;
}

export interface ChainedMappings {
	/** encoded mappings of the chained map */
	mappings: string;
	/** names in first use order */
	names: string[];
	/** whether any segment reached the source, then it is the only source */
	sourced: boolean;
}

// compile map segments decoded flat, one entry per segment
let cseg_line = new Int32Array(1024);
let cseg_col = new Int32Array(1024);
let cseg_len = new Int32Array(1024);
let cseg_sline = new Int32Array(1024);
let cseg_scol = new Int32Array(1024);
let cseg_name = new Int32Array(1024);

function grow_cseg(used: number): void {
	const size = cseg_line.length * 2;
	cseg_line = copy_i32(cseg_line, used, size);
	cseg_col = copy_i32(cseg_col, used, size);
	cseg_len = copy_i32(cseg_len, used, size);
	cseg_sline = copy_i32(cseg_sline, used, size);
	cseg_scol = copy_i32(cseg_scol, used, size);
	cseg_name = copy_i32(cseg_name, used, size);
}

/**
 * decodes like @jridgewell/sourcemap-codec, -1 for input it reads
 * differently, a line out of order or a source other than the first
 */
function decode_compile(mappings: string): number {
	let n = 0;
	let line = 0;
	let field = 0;
	let gen_col = 0;
	let last_col = 0;
	let source_index = 0;
	let src_line = 0;
	let src_col = 0;
	let name_index = 0;
	let value = 0;
	let shift = 0;
	const length = mappings.length;
	for (let i = 0; i <= length; i++) {
		const c = i < length ? mappings.charCodeAt(i) : SEMICOLON;
		if (c === COMMA || c === SEMICOLON) {
			if (shift !== 0) return -1;
			if (field === 1 || field === 4 || field === 5) {
				if (gen_col < last_col || gen_col < 0) return -1;
				last_col = gen_col;
				if (field !== 1) {
					if (source_index !== 0 || src_line < 0 || src_col < 0) return -1;
					if (field === 5 && name_index < 0) return -1;
				}
				if (n === cseg_line.length) grow_cseg(n);
				cseg_line[n] = line;
				cseg_col[n] = gen_col;
				cseg_len[n] = field;
				cseg_sline[n] = src_line;
				cseg_scol[n] = src_col;
				cseg_name[n] = name_index;
				n++;
			} else if (field !== 0 || c === COMMA) {
				return -1;
			}
			field = 0;
			if (c === SEMICOLON) {
				line++;
				gen_col = 0;
				last_col = 0;
			}
			continue;
		}
		const digit = c < 128 ? VLQ_DIGITS[c] : -1;
		if (digit < 0 || shift > 25) return -1;
		value |= (digit & 31) << shift;
		if ((digit & 32) !== 0) {
			shift += 5;
			continue;
		}
		const magnitude = value >>> 1;
		if ((value & 1) !== 0 && magnitude === 0) return -1;
		const delta = (value & 1) !== 0 ? -magnitude : magnitude;
		if (field === 0) gen_col += delta;
		else if (field === 1) source_index += delta;
		else if (field === 2) src_line += delta;
		else if (field === 3) src_col += delta;
		else if (field === 4) name_index += delta;
		else return -1;
		field++;
		value = 0;
		shift = 0;
	}
	return n;
}

// trace segments of the wanted generated lines, line l holds
// line_first[l] to line_first[l + 1]
let pseg_col = new Int32Array(1024);
let pseg_sline = new Int32Array(1024);
let pseg_scol = new Int32Array(1024);
let line_first = new Int32Array(256);
let query_buf = new Int32Array(256);

/** fills the p arrays with the segments decode_lines would build, returns the line count */
function trace_lines(
	buf: Uint32Array,
	start: number,
	split: number,
	source: string,
	generated: string,
	wanted: Uint8Array,
	queries: Int32Array,
	query_count: number
): number {
	const gen_starts = gen_table.starts;
	const gen_count = gen_table.count;

	span_count = 0;
	let gen_line = 0;
	for (let p = start; p < split; p += Rec.SIZE) {
		const role = buf[p + 5] & 3;
		if (role === Role.OPEN_SYNTAX || role === Role.CLOSE_SYNTAX) continue;
		const g = buf[p];
		const s = buf[p + 2];
		const source_length = buf[p + 3];
		if (role === Role.CONTENT && buf[p + 1] === source_length) {
			const end = g + source_length;
			let at = g;
			while (at < end) {
				gen_line = find_line_near(gen_starts, gen_count, gen_line, at);
				let stop = gen_starts[gen_line + 1];
				if (stop > end) stop = end;
				if (wanted[gen_line] === 1) {
					// a lookup lands on a queried offset in the run or, when no run
					// holds that offset, on the last point of a run, so only those
					// points change a lookup
					const last = stop - 1;
					let lo = 0;
					let hi = query_count;
					while (lo < hi) {
						const mid = (lo + hi) >>> 1;
						if (queries[mid] < at) lo = mid + 1;
						else hi = mid;
					}
					for (; lo < query_count && queries[lo] < last; lo++) {
						const q = queries[lo];
						push_span(q, s + (q - g), 1);
					}
					push_span(last, s + (last - g), 1);
				}
				at = stop;
			}
		} else {
			gen_line = find_line_near(gen_starts, gen_count, gen_line, g);
			if (wanted[gen_line] === 1) push_span(g, s, 1);
		}
	}

	if (line_first.length < gen_count + 1)
		line_first = new Int32Array(gen_count + 1);
	const first = line_first;
	const n = span_count;
	if (n === 0) {
		first.fill(0, 0, gen_count + 1);
		return gen_count;
	}
	if (pseg_col.length < n) {
		let size = pseg_col.length * 2;
		while (size < n) size *= 2;
		pseg_col = new Int32Array(size);
		pseg_sline = new Int32Array(size);
		pseg_scol = new Int32Array(size);
	}

	fill_line_starts(src_table, source);
	const src_starts = src_table.starts;
	const src_count = src_table.count;
	sort_spans();

	const gen = span_gen;
	const src = span_src;
	const order = span_order;
	const col = pseg_col;
	const sline = pseg_sline;
	const scol = pseg_scol;
	let src_line = 0;
	let filled = 0;
	gen_line = 0;
	for (let k = 0; k < n; k++) {
		const i = order[k];
		const g = gen[i];
		const s = src[i];
		gen_line = find_line_near(gen_starts, gen_count, gen_line, g);
		while (filled <= gen_line) first[filled++] = k;
		src_line = find_line_near(src_starts, src_count, src_line, s);
		col[k] = g - gen_starts[gen_line];
		sline[k] = src_line;
		scol[k] = s - src_starts[src_line];
	}
	while (filled <= gen_count) first[filled++] = n;
	return gen_count;
}

function write_vlq_codec(buf: Uint8Array, p: number, delta: number): number {
	// as @jridgewell/sourcemap-codec encodes
	delta = delta < 0 ? (-delta << 1) | 1 : delta << 1;
	do {
		let clamped = delta & 31;
		delta >>>= 5;
		if (delta > 0) clamped |= 32;
		buf[p++] = VLQ_CODES[clamped];
	} while (delta > 0);
	return p;
}

/**
 * chains a compile map from the html onto the trace's map of the html, the
 * mappings and names equal @ampproject/remapping of [compile, trace_to_v3],
 * null when the compile mappings are ones it leaves to remapping
 * @internal
 */
export function chain_trace(
	compile_mappings: string,
	compile_names: readonly string[],
	trace: MapTrace,
	source: string,
	generated: string
): ChainedMappings | null {
	const count = decode_compile(compile_mappings);
	if (count < 0) return null;

	fill_line_starts(gen_table, generated);
	const gen_count = gen_table.count;
	const wanted = new Uint8Array(gen_count);
	if (query_buf.length < count) query_buf = new Int32Array(count * 2);
	const queries = query_buf;
	let query_count = 0;
	const gen_starts = gen_table.starts;
	for (let k = 0; k < count; k++) {
		if (cseg_len[k] !== 1) {
			const l = cseg_sline[k];
			if (l < gen_count) {
				wanted[l] = 1;
				queries[query_count++] = gen_starts[l] + cseg_scol[k];
			}
		}
	}
	if (query_count > 1) {
		queries.subarray(0, query_count).sort();
		let kept = 1;
		for (let k = 1; k < query_count; k++) {
			if (queries[k] !== queries[kept - 1]) queries[kept++] = queries[k];
		}
		query_count = kept;
	}
	const lines =
		trace.split === trace.start
			? 0
			: trace_lines(
					trace.buf,
					trace.start,
					trace.split,
					source,
					generated,
					wanted,
					queries,
					query_count
				);
	const first = line_first;
	const pcol = pseg_col;
	const psline = pseg_sline;
	const pscol = pseg_scol;

	const names: string[] = [];
	let name_ids: Map<string, number> | null = null;
	let sourced = false;

	let buf = out;
	let p = 0;
	let out_line = 0;
	// the previous segment kept on the current line, len 0 when none
	let cur_line = -1;
	let prev_len = 0;
	let prev_sline = 0;
	let prev_scol = 0;
	let prev_name = -1;
	let enc_col = 0;
	let enc_sline = 0;
	let enc_scol = 0;
	let enc_name = 0;

	for (let k = 0; k < count; k++) {
		const line = cseg_line[k];
		if (line !== cur_line) {
			cur_line = line;
			prev_len = 0;
		}
		const col = cseg_col[k];
		let seg_len = 1;
		let sline = 0;
		let scol = 0;
		let name = -1;
		if (cseg_len[k] !== 1) {
			// greatest lower bound in the trace line
			const l = cseg_sline[k];
			if (l >= lines) continue;
			const c = cseg_scol[k];
			let lo = first[l];
			let hi = first[l + 1] - 1;
			let found = -1;
			while (lo <= hi) {
				const mid = (lo + hi) >>> 1;
				if (pcol[mid] <= c) {
					found = mid;
					lo = mid + 1;
				} else hi = mid - 1;
			}
			if (found < 0) continue;
			// an equal column takes the first of its run, a lower one the last,
			// as trace-mapping's greatest lower bound does
			if (pcol[found] === c) {
				const lower = first[l];
				while (found > lower && pcol[found - 1] === c) found--;
			}
			seg_len = 4;
			sline = psline[found];
			scol = pscol[found];
			sourced = true;
			if (cseg_len[k] === 5) {
				const text = compile_names[cseg_name[k]];
				if (text) {
					if (name_ids === null) name_ids = new Map();
					let id = name_ids.get(text);
					if (id === undefined) {
						id = names.length;
						names.push(text);
						name_ids.set(text, id);
					}
					name = id;
					seg_len = 5;
				}
			}
			if (
				prev_len > 1 &&
				prev_sline === sline &&
				prev_scol === scol &&
				prev_name === name
			)
				continue;
		} else if (prev_len === 0 || prev_len === 1) {
			continue;
		}

		const need = p + (line - out_line) + 40;
		if (need > buf.length) {
			grow_out(p, need);
			buf = out;
		}
		if (out_line < line) {
			do buf[p++] = SEMICOLON;
			while (++out_line < line);
			enc_col = 0;
		} else if (p > 0) {
			// out_line only reaches a line by writing a segment on it
			buf[p++] = COMMA;
		}
		p = write_vlq_codec(buf, p, col - enc_col);
		enc_col = col;
		if (seg_len !== 1) {
			buf[p++] = CHAR_A;
			p = write_vlq_codec(buf, p, sline - enc_sline);
			enc_sline = sline;
			p = write_vlq_codec(buf, p, scol - enc_scol);
			enc_scol = scol;
			if (seg_len === 5) {
				p = write_vlq_codec(buf, p, name - enc_name);
				enc_name = name;
			}
		}
		prev_len = seg_len;
		prev_sline = sline;
		prev_scol = scol;
		prev_name = name;
	}
	return { mappings: decoder.decode(buf.subarray(0, p)), names, sourced };
}
