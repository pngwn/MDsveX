import {
	chain_trace,
	mapped_source_lines,
	trace_to_decoded,
	trace_to_v3,
} from '@mdsvex/render/sourcemap';
import type { DecodedSourceMapV3, SourceMapV3 } from '@mdsvex/render/sourcemap';
import type { TraceTarget } from './compile';

export interface StoredDocument extends TraceTarget {
	raw: string;
}

/**
 * remapping only reads the html lines the compile map points at, so only those
 * are built
 */
export function pfm_map(
	doc: StoredDocument,
	compile_mappings: unknown,
	file: string
): SourceMapV3 | DecodedSourceMapV3 {
	// sourcesContent is replaced by raw after chaining
	const lines = mapped_source_lines(compile_mappings as string);
	if (lines === null) return trace_to_v3(doc, doc.source, doc.html, file);
	return trace_to_decoded(doc, doc.source, doc.html, lines, file);
}

// the map json head when the compile map names no file
const PLAIN_HEAD = '{"version":3,"mappings":"';
const PLAIN_HEAD_BYTES = /* @__PURE__ */ ascii_table(PLAIN_HEAD);

// chars of names resolve-uri keeps as they are when remapping resolves the
// source, 1 for a char a name may start with, 2 for a dot, which may only follow
const PLAIN_CHARS = /* @__PURE__ */ (() => {
	const t = new Uint8Array(128);
	const plain =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-+~@';
	for (let i = 0; i < plain.length; i++) t[plain.charCodeAt(i)] = 1;
	t[46] = 2;
	return t;
})();

/** map_basename(file) when it is a plain name, null otherwise */
function plain_basename(file: string): string | null {
	if (!file) return 'input.md';
	const table = PLAIN_CHARS;
	let k = file.length - 1;
	for (; k >= 0; k--) {
		const c = file.charCodeAt(k);
		if (c === 47 || c === 92) break;
		if (c >= 128 || table[c] === 0) return null;
	}
	const first = k + 1;
	if (first === file.length || table[file.charCodeAt(first)] !== 1) return null;
	return file.slice(first);
}

/**
 * base64 of the inline map json remapping gives for the compile and pfm maps
 * with raw as sourcesContent, null for anything left to remapping
 */
export function chained_base64(
	doc: StoredDocument,
	compile: any,
	file: string
): string | null {
	if (compile._decodedMemo) return null;
	const mappings = compile.mappings;
	if (typeof mappings !== 'string') return null;
	const sources = compile.sources;
	if (!Array.isArray(sources) || sources.length > 1) return null;
	if (
		sources.length === 1 &&
		sources[0] != null &&
		typeof sources[0] !== 'string'
	)
		return null;
	const root = compile.sourceRoot;
	if (root != null && typeof root !== 'string') return null;
	const out_file = compile.file;
	if (out_file != null && typeof out_file !== 'string') return null;
	let names = compile.names;
	if (names == null) names = [];
	else if (!Array.isArray(names)) return null;
	for (let i = 0; i < names.length; i++) {
		if (typeof names[i] !== 'string') return null;
	}
	const base = plain_basename(file);
	if (base === null) return null;

	const head = out_file
		? '{"version":3,"file":' + JSON.stringify(out_file) + ',"mappings":"'
		: '';
	let bytes = base64_bytes;
	if (bytes === null || bytes.length < head.length * 3 + MAP_FIXED_BYTES) {
		let size = 1 << 14;
		while (size < head.length * 3 + MAP_FIXED_BYTES) size <<= 1;
		bytes = base64_bytes = new_buffer(size);
		plain_head_kept = false;
	}
	let n: number;
	if (out_file) {
		n = utf8_into(bytes, head, 0);
		plain_head_kept = false;
	} else {
		if (!plain_head_kept) {
			put_table(view_of(bytes), 0, PLAIN_HEAD_BYTES);
			plain_head_kept = true;
		}
		n = PLAIN_HEAD_BYTES.length;
	}

	// chain_trace reads the mappings as utf8 bytes, a byte loop beats charCodeAt
	let map_bytes: Buffer | null = null;
	let map_length = 0;
	if (mappings.length * 3 <= BASE64_KEEP) {
		map_bytes = mappings_stage;
		if (map_bytes === null || map_bytes.length < mappings.length * 3) {
			let size = 1 << 12;
			while (size < mappings.length * 3) size <<= 1;
			map_bytes = mappings_stage = new_buffer(size);
		}
		map_length = utf8_into(map_bytes, mappings, 0);
	}

	// doc.source is normalized raw
	const chained = chain_trace(
		mappings,
		names,
		doc,
		doc.source,
		doc.html,
		true,
		bytes,
		n,
		map_bytes,
		map_length
	);
	if (chained === null) return null;
	const chained_names = chained.names;
	const names_json =
		chained_names === null ? '' : JSON.stringify(chained_names);
	// a well formed raw is escaped from its utf8 bytes, beating JSON.stringify
	const raw = doc.raw;
	const sourced = chained.sourced;
	let escape = false;
	let raw_json = '';
	if (sourced) {
		escape =
			typeof (raw as any).isWellFormed === 'function' &&
			(raw as any).isWellFormed();
		if (!escape) raw_json = JSON.stringify(raw);
	}

	// the ascii mappings stay bytes, every part starts and ends in ascii so the
	// utf8 joins
	const length = chained.length;
	const src = chained.bytes;
	const most =
		MAP_FIXED_BYTES +
		base.length +
		n +
		length +
		(names_json.length + raw_json.length) * 3 +
		(escape ? raw.length * 6 : 0);
	if (most > BASE64_KEEP) {
		const text = Buffer.from(
			src.buffer,
			src.byteOffset + chained.start,
			length
		).toString('latin1');
		let json =
			(out_file ? head : PLAIN_HEAD) +
			text +
			'","names":' +
			(chained_names === null ? '[]' : names_json) +
			',"ignoreList":[],"sources":';
		// a plain basename has no char json escapes, so quoting equals JSON.stringify
		if (sourced)
			json +=
				'["' +
				base +
				'"],"sourcesContent":[' +
				(escape ? JSON.stringify(raw) : raw_json) +
				']}';
		else json += '[],"sourcesContent":[]}';
		return Buffer.from(json).toString('base64');
	}
	n += length;
	if (src !== bytes || bytes.length < most) {
		// chain_trace outgrew the buffer or the rest will, move to a larger one
		let size = 1 << 14;
		while (size < most) size <<= 1;
		const next = new_buffer(size);
		next.set(src.subarray(0, n));
		bytes = base64_bytes = next;
	}
	// word stores beat utf8 writes and byte stores, a table may write three bytes
	// past its end, which the next part overwrites or which lie past the map
	const view = view_of(bytes);
	if (chained_names === null)
		n = put_table(view, n, sourced ? NO_NAMES_OPEN_BYTES : NO_NAMES_BYTES);
	else {
		n = put_table(view, n, NAMES_BYTES);
		n += utf8_into(bytes, names_json, n);
		n = put_table(view, n, AFTER_NAMES_BYTES);
		if (sourced) n = put_table(view, n, SOURCE_OPEN_BYTES);
	}
	if (sourced) {
		// a plain basename is ascii with no char json escapes
		for (let i = 0; i < base.length; i++) bytes[n++] = base.charCodeAt(i);
		n = put_table(view, n, SOURCE_CLOSE_BYTES);
		if (escape) n = write_json_string(raw, bytes, n);
		else n += utf8_into(bytes, raw_json, n);
		bytes[n++] = 93; // ]
		bytes[n++] = 125; // }
	} else n = put_table(view, n, NO_SOURCE_BYTES);
	return base64_of(bytes, n);
}

/** an ascii string as little endian words, the last one zero padded */
interface AsciiTable {
	words: Uint32Array;
	length: number;
}

function ascii_table(s: string): AsciiTable {
	const words = new Uint32Array((s.length + 3) >> 2);
	for (let i = 0; i < s.length; i++)
		words[i >> 2] |= s.charCodeAt(i) << ((i & 3) << 3);
	return { words, length: s.length };
}

const NAMES_BYTES = /* @__PURE__ */ ascii_table('","names":');
const AFTER_NAMES_BYTES = /* @__PURE__ */ ascii_table(
	',"ignoreList":[],"sources":'
);
const NO_NAMES_BYTES = /* @__PURE__ */ ascii_table(
	'","names":[],"ignoreList":[],"sources":'
);
const NO_NAMES_OPEN_BYTES = /* @__PURE__ */ ascii_table(
	'","names":[],"ignoreList":[],"sources":["'
);
const SOURCE_OPEN_BYTES = /* @__PURE__ */ ascii_table('["');
const SOURCE_CLOSE_BYTES = /* @__PURE__ */ ascii_table('"],"sourcesContent":[');
const NO_SOURCE_BYTES = /* @__PURE__ */ ascii_table('[],"sourcesContent":[]}');
// covers every fixed table, three bytes of overrun and the two closing bytes
const MAP_FIXED_BYTES = 128;

function put_table(view: DataView, n: number, table: AsciiTable): number {
	const words = table.words;
	for (let i = 0; i < words.length; i++)
		view.setUint32(n + (i << 2), words[i], true);
	return n + table.length;
}

// node, deno and bun expose utf8Write and base64Slice on Buffer, calling them
// skips the checks in write and toString, set when a reused buffer is made
let buffer_direct = false;

function new_buffer(size: number): Buffer {
	const b: any = Buffer.allocUnsafe(size);
	buffer_direct =
		typeof b.utf8Write === 'function' && typeof b.base64Slice === 'function';
	return b;
}

function utf8_into(b: Buffer, s: string, n: number): number {
	return buffer_direct
		? (b as any).utf8Write(s, n, b.length - n)
		: b.write(s, n, 'utf8');
}

function base64_of(b: Buffer, n: number): string {
	return buffer_direct
		? (b as any).base64Slice(0, n)
		: b.toString('base64', 0, n);
}

// the escape after a backslash for each byte, 0 for none, u for \u00XX
const JSON_ESCAPES = /* @__PURE__ */ (() => {
	const t = new Uint8Array(256);
	for (let c = 0; c < 32; c++) t[c] = 117;
	t[8] = 98; // b
	t[9] = 116; // t
	t[10] = 110; // n
	t[12] = 102; // f
	t[13] = 114; // r
	t[34] = 34; // "
	t[92] = 92; // \
	return t;
})();

// reused across transforms, each view made once per buffer
let json_stage: Buffer | null = null;
let json_stage_view: DataView | null = null;
let json_out: Buffer | null = null;
let json_out_view: DataView | null = null;

function view_of(out: Buffer): DataView {
	if (json_out !== out) {
		json_out = out;
		json_out_view = new DataView(out.buffer, out.byteOffset, out.length);
	}
	return json_out_view!;
}

/**
 * writes the utf8 of JSON.stringify(raw) into out at n and returns the end,
 * raw has no lone surrogate and out holds 6 bytes per unit of raw plus 2
 */
function write_json_string(raw: string, out: Buffer, n: number): number {
	let stage = json_stage;
	if (stage === null || stage.length < raw.length * 3) {
		let size = 1 << 14;
		while (size < raw.length * 3) size <<= 1;
		stage = json_stage = new_buffer(size);
		json_stage_view = new DataView(stage.buffer, stage.byteOffset, size);
	}
	const len = utf8_into(stage, raw, 0);
	const view = json_stage_view!;
	const out_view = view_of(out);
	const escapes = JSON_ESCAPES;
	out[n++] = 34;
	const words = len - 3;
	let i = 0;
	while (i < len) {
		if (i < words) {
			// four bytes at once while none is below 0x20, a quote or a backslash,
			// utf8 bytes past 0x7f have the top bit the checks look at set in ~w
			const w = view.getUint32(i, true);
			const q = w ^ 0x22222222;
			const b = w ^ 0x5c5c5c5c;
			if (
				((((w - 0x20202020) & ~w) |
					((q - 0x01010101) & ~q) |
					((b - 0x01010101) & ~b)) &
					0x80808080) ===
				0
			) {
				out_view.setUint32(n, w, true);
				n += 4;
				i += 4;
				continue;
			}
		}
		const c = stage[i++];
		const e = escapes[c];
		if (e === 0) {
			out[n++] = c;
			continue;
		}
		out[n++] = 92;
		out[n++] = e;
		if (e === 117) {
			const h = c & 15;
			out[n++] = 48;
			out[n++] = 48;
			out[n++] = c < 16 ? 48 : 49;
			out[n++] = h < 10 ? 48 + h : 87 + h;
		}
	}
	out[n++] = 34;
	return n;
}

// utf8 bytes of a map before base64, reused so a large map does not allocate
// an off heap buffer on every transform, bounded so no huge one is pinned
const BASE64_KEEP = 1 << 22;
let base64_bytes: Buffer | null = null;
// whether base64_bytes starts with PLAIN_HEAD
let plain_head_kept = false;
// utf8 of the compile mappings being chained
let mappings_stage: Buffer | null = null;

/** equals Buffer.from(json).toString('base64') */
export function base64_utf8(json: string): string {
	// three utf8 bytes per utf16 unit at most
	const most = json.length * 3;
	if (most > BASE64_KEEP) return Buffer.from(json).toString('base64');
	let bytes = base64_bytes;
	if (bytes === null || bytes.length < most) {
		let size = 1 << 14;
		while (size < most) size <<= 1;
		bytes = base64_bytes = new_buffer(size);
	}
	// the json overwrites the kept head
	plain_head_kept = false;
	return base64_of(bytes, utf8_into(bytes, json, 0));
}
