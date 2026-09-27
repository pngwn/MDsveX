/**
 * sourcemap utilities: line-starts, offset to position, vlq, v3 conversion.
 */

import type { Mapping, MappingData } from './mappings';

// past every offset, so the start of the line after the last one needs no
// bounds check
const PAST_END = 0x7fffffff;

/** line start offsets in a reusable buffer, followed by two past-the-end slots. */
class LineTable {
	starts = new Int32Array(256);
	count = 0;
}

// encode runs to completion without yielding, so one set of buffers serves
// every call and the hot loops never allocate
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

/** find the line of offset, trying the hint line and the one after it first. */
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

// mapped spans as parallel arrays, in the order the mappings list them
let span_gen = new Int32Array(1024);
let span_src = new Int32Array(1024);
let span_len = new Int32Array(1024);
// span indices by generated offset
let span_order = new Int32Array(1024);
let span_count = 0;

/** make room for need spans, keeping the first used. */
function reserve_spans(used: number, need: number): void {
	let size = span_gen.length * 2;
	while (size < need) size *= 2;
	span_gen = copy_i32(span_gen, used, size);
	span_src = copy_i32(span_src, used, size);
	span_len = copy_i32(span_len, used, size);
	span_order = new Int32Array(size);
}

/**
 * collect the spans that become v3 segments. identity-mapped content keeps
 * its length and is encoded as a run, one segment per character.
 */
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
			// identity-mapped content (source text = generated text).
			// every character gets a segment so downstream chaining
			// preserves column precision.
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

/**
 * collect_spans with every identity-mapped character as a span of its own,
 * for when runs overlap and their characters must be sorted one by one.
 */
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

function push_span(gen: number, src: number, len: number): void {
	const n = span_count;
	if (n === span_gen.length) reserve_spans(n, n + 1);
	span_gen[n] = gen;
	span_src[n] = src;
	span_len[n] = len;
	span_count = n + 1;
}

/**
 * order spans by generated offset, ties kept in mapping order. mappings come
 * nearly sorted, only node anchors land a little ahead of the content before
 * them, so an insertion sort does few moves and needs no comparator calls.
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

/**
 * whether a span starts inside the run before it. the characters of the two
 * would interleave when sorted one by one, so they cannot be encoded as runs.
 */
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

	// use basename to match svelte compiler convention, vite resolves relative
	// to the served JS file, so the browser can find the source.
	const basename = file
		? file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1)
		: 'input.md';

	return {
		version: 3,
		file: basename,
		sources: [basename],
		sourcesContent: [source],
		names: [],
		mappings: encoded,
	};
}

// base64 digit char codes
const VLQ_CODES = new Uint8Array(64);
{
	const chars =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	for (let i = 0; i < 64; i++) VLQ_CODES[i] = chars.charCodeAt(i);
}

const COMMA = 44;
const SEMICOLON = 59;
const CHAR_A = 65;
const CHAR_C = 67;

// the segment text is ascii bytes, decoded once into a flat string. building
// it by concatenation left a rope that survived scavenges and was flattened
// again by every consumer
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

// four ',CAAC' repeats as five little-endian words, so long runs take one
// store per four bytes instead of one per byte
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
			buf[p++] = CHAR_A; // source index delta (always 0, single source)
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
