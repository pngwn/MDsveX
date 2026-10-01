import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	normalize_newlines,
	raw_offsets,
	take_collapsed,
} from '@mdsvex/parse';
import type { ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import {
	ComponentScope,
	CursorHTMLRenderer,
} from '@mdsvex/render/html-cursor';
import type { ComponentSource } from '@mdsvex/render/html-cursor';
import {
	chain_trace,
	mapped_source_lines,
	mappings_to_v3,
	trace_to_decoded,
	trace_to_v3,
} from '@mdsvex/render/sourcemap';
import type { Mapping, MappingData } from '@mdsvex/render/mappings';
import type {
	DecodedSourceMapV3,
	MapTrace,
	SourceMapV3,
} from '@mdsvex/render/sourcemap';
import type { Plugin, PluginOption, Rollup } from 'vite';
import { scan_exports_detail } from './scan_exports';
import remapping from '@ampproject/remapping';

export type { ParsePlugin } from '@mdsvex/parse';
export type { Mapping, MappingData, SourceMapV3, MapTrace };
export type { ComponentSource };
export { scan_exports, scan_exports_detail, module_script } from './scan_exports';
export type { ScanKind, ScannedExports } from './scan_exports';

export interface MdsvexOptions {
	extensions?: string[];
	/** parse plugins that hook into tree construction. */
	parse_plugins?: ParsePlugin[];
	/**
	 * modules whose exports named after an element replace it, lowest
	 * precedence first, each resolves as an import from the vite root would
	 *
	 * @example
	 * components: ['#lib/markdown.ts', new URL('./md.ts', import.meta.url)]
	 */
	components?: string | URL | (string | URL)[];
	component_mode?: ComponentMode;
}

/**
 * markdown replaces elements from markdown syntax and parse plugins, never
 * typed html, all is not implemented yet and behaves as markdown
 */
export type ComponentMode = 'markdown' | 'all';

export interface CompileOptions {
	parse_plugins?: ParsePlugin[];
	sourcemap?: boolean;
	/** root fallback replacements, lowest precedence first, each specifier is imported as written */
	components?: ComponentSource[];
	component_mode?: ComponentMode;
}

export interface CompileResult {
	code: string;
	mappings?: Mapping<MappingData>[];
}

export interface CompileV3Result {
	code: string;
	/** equals mappings_to_v3 over the compile mappings with raw as source */
	map: SourceMapV3;
}

export interface CompileTraceResult {
	code: string;
	/** collapsing \r\n keeps every line and column, so its positions hold in raw */
	trace: MapTrace;
	/** the normalized source the trace indexes */
	source: string;
}

// plugins keep one components array per config, so its scope is built once
const root_scopes = new WeakMap<ComponentSource[], ComponentScope>();

/** the scope chain for the root fallback, null when nothing is replaced */
function scope_of(
	components: ComponentSource[] | undefined,
	mode?: ComponentMode
): ComponentScope | null {
	if (mode !== undefined && mode !== 'markdown' && mode !== 'all')
		throw new Error(
			`component_mode must be 'markdown' or 'all', got ${JSON.stringify(mode)}`
		);
	if (components === undefined || components.length === 0) return null;
	let scope = root_scopes.get(components);
	if (scope === undefined) {
		scope = new ComponentScope(components, 'G');
		root_scopes.set(components, scope);
	}
	return scope;
}

// null while taken, so a compile inside a plugin makes its own
let spare_parser: PFMParser | null = null;
let spare_renderer: CursorHTMLRenderer | null = null;

function take_renderer(): CursorHTMLRenderer {
	const renderer = spare_renderer;
	if (renderer === null) return new CursorHTMLRenderer({ cache: false });
	spare_renderer = null;
	return renderer;
}

/** results hold no reference into the renderer, so it can serve the next compile */
function give_renderer(renderer: CursorHTMLRenderer): void {
	renderer.release();
	spare_renderer = renderer;
}

function parse_once(source: string, plugins?: ParsePlugin[]): NodeBuffer {
	let dispatcher: PluginDispatcher | undefined;
	if (plugins && plugins.length > 0) {
		const text_source = new SourceTextSource(source);
		dispatcher = new PluginDispatcher(plugins, text_source);
	}

	// short documents are denser in nodes and a small buffer is only a slab
	// carve, so size generously to skip a resize
	const len = source.length;
	const tree = new TreeBuilder(
		len < 512 ? (len >> 2) + 16 : len >> 3,
		dispatcher
	);
	let parser = spare_parser;
	if (parser === null) parser = new PFMParser(tree);
	else {
		spare_parser = null;
		parser.bind(tree);
	}
	parser.parse_normalized(source);
	// a throw above drops the parser, it may be half written
	parser.release();
	spare_parser = parser;

	const nodes = tree.get_buffer();
	if (dispatcher) {
		dispatcher.run_sequential(nodes);
	}
	nodes.trim();
	return nodes;
}

function render_once(raw: string, options?: CompileOptions): CompileResult {
	// parser offsets index the normalized string, so render and plugins read it too
	const source = normalize_newlines(raw);
	const nodes = parse_once(source, options?.parse_plugins);
	const scope = scope_of(options?.components, options?.component_mode);
	const renderer = take_renderer();
	renderer.scope = scope;

	if (options?.sourcemap) {
		// only a collapsed \r\n changes length, without one raw needs no \r\n scan
		const result = renderer.update_mapped(
			nodes,
			source,
			source.length === raw.length ? null : collapsed_of(raw)
		);
		const code = renderer.html;
		give_renderer(renderer);
		return { code, mappings: result.mappings };
	}

	renderer.update(nodes, source);
	const code = renderer.html;
	give_renderer(renderer);
	return { code };
}

function render_v3(
	renderer: CursorHTMLRenderer,
	nodes: NodeBuffer,
	source: string,
	raw: string,
	file?: string
): CompileV3Result {
	// only a collapsed \r\n changes length, without one the records index raw
	if (source.length === raw.length) {
		const map = renderer.update_v3(nodes, source, raw, file);
		return { code: renderer.html, map };
	}
	const result = renderer.update_mapped(nodes, source, collapsed_of(raw));
	const code = renderer.html;
	return { code, map: mappings_to_v3(result.mappings, raw, code, file) };
}

function render_trace(
	renderer: CursorHTMLRenderer,
	nodes: NodeBuffer,
	source: string
): CompileTraceResult {
	const trace = renderer.update_trace(nodes, source);
	return { code: renderer.html, trace, source };
}

/**
 * Reusable no-plugin compiler for sequential documents.
 *
 * The arena remains private so resetting it can never mutate an AST held by a
 * caller. Parse plugins retain the one-shot path because their dispatcher owns
 * a source-specific text view.
 */
export class CompilerSession {
	private tree: TreeBuilder | null = null;
	private parser: PFMParser | null = null;
	private renderer = new CursorHTMLRenderer({ cache: false });
	// release already reset the arena, so the next compile can skip it
	private released = false;

	/** @internal */
	get capacity(): number {
		return this.tree === null ? 0 : this.tree.get_buffer()._capacity;
	}

	private parse(source: string): NodeBuffer {
		if (this.tree === null) {
			this.tree = new TreeBuilder(source.length >> 3 || 16);
			this.parser = new PFMParser(this.tree);
		} else if (!this.released) {
			this.tree.reset();
		}
		this.released = false;

		this.parser!.parse_normalized(source);
		return this.tree.get_buffer();
	}

	compile(raw: string, options?: CompileOptions): CompileResult {
		if (options?.parse_plugins && options.parse_plugins.length > 0) {
			return render_once(raw, options);
		}

		const scope = scope_of(options?.components, options?.component_mode);
		const source = normalize_newlines(raw);
		const nodes = this.parse(source);
		this.renderer.scope = scope;
		if (options?.sourcemap) {
			const result = this.renderer.update_mapped(
				nodes,
				source,
				source.length === raw.length ? null : collapsed_of(raw)
			);
			return { code: this.renderer.html, mappings: result.mappings };
		}

		this.renderer.update(nodes, source);
		return { code: this.renderer.html };
	}

	/** @internal keeps only typed arrays so an idle session holds no document */
	release(): void {
		if (this.tree !== null) {
			this.tree.reset();
			this.parser!.release();
			this.released = true;
		}
		this.renderer.release();
	}

	/** @internal the map equals mappings_to_v3 over compile mappings with raw as source */
	compile_v3(
		raw: string,
		file?: string,
		parse_plugins?: ParsePlugin[],
		components?: ComponentSource[]
	): CompileV3Result {
		const scope = components === undefined ? null : scope_of(components);
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			// the dispatcher holds this source, so plugins get their own tree
			const nodes = parse_once(source, parse_plugins);
			const renderer = new CursorHTMLRenderer({ cache: false });
			renderer.scope = scope;
			return render_v3(renderer, nodes, source, raw, file);
		}
		const nodes = this.parse(source);
		this.renderer.scope = scope;
		return render_v3(this.renderer, nodes, source, raw, file);
	}

	/**
	 * defers the map, the vite plugin builds only the lines the svelte compiler
	 * map points at
	 * @internal
	 */
	compile_trace(
		raw: string,
		parse_plugins?: ParsePlugin[],
		components?: ComponentSource[]
	): CompileTraceResult {
		const scope = components === undefined ? null : scope_of(components);
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			const nodes = parse_once(source, parse_plugins);
			const renderer = new CursorHTMLRenderer({ cache: false });
			renderer.scope = scope;
			return render_trace(renderer, nodes, source);
		}
		const nodes = this.parse(source);
		this.renderer.scope = scope;
		return render_trace(this.renderer, nodes, source);
	}

	/**
	 * compile_trace without result objects, the trace goes into out
	 * @internal
	 */
	compile_trace_into(
		raw: string,
		parse_plugins: ParsePlugin[] | undefined,
		out: TraceTarget,
		components?: ComponentSource[]
	): void {
		const scope = components === undefined ? null : scope_of(components);
		const source = normalize_newlines(raw);
		let renderer = this.renderer;
		let nodes: NodeBuffer;
		if (parse_plugins && parse_plugins.length > 0) {
			nodes = parse_once(source, parse_plugins);
			renderer = new CursorHTMLRenderer({ cache: false });
		} else {
			nodes = this.parse(source);
		}
		renderer.scope = scope;
		renderer.update_trace_into(nodes, source, out);
		out.source = source;
		out.html = renderer.html;
	}
}

/** source is the normalized raw the trace and html come from */
interface TraceTarget extends MapTrace {
	source: string;
	html: string;
}

// a session keeps its arena at its largest document size, so large documents
// skip the shared session and one whose tree outgrew the cap drops it
const SHARED_SOURCE_CAP = 1 << 19;
const SHARED_CAPACITY_CAP = 1 << 16;

let shared_session: CompilerSession | null = null;
let shared_session_busy = false;

/**
 * without plugins a result holds no reference into the arena, parser or
 * renderer, so small documents can share one session
 */
function render(source: string, options?: CompileOptions): CompileResult {
	if (
		shared_session_busy ||
		source.length > SHARED_SOURCE_CAP ||
		(options?.parse_plugins && options.parse_plugins.length > 0)
	) {
		return render_once(source, options);
	}

	shared_session_busy = true;
	let keep = false;
	try {
		if (shared_session === null) shared_session = new CompilerSession();
		const result = shared_session.compile(source, options);
		keep = shared_session.capacity <= SHARED_CAPACITY_CAP;
		return result;
	} finally {
		// a throw can leave the arena or parser half written, start over
		if (keep) shared_session!.release();
		else shared_session = null;
		shared_session_busy = false;
	}
}

/** @internal for tests */
export function _shared_session(): CompilerSession | null {
	return shared_session;
}

/** normalized offsets of each \n that was \r\n in raw, null when none */
function collapsed_of(raw: string): number[] | null {
	// normalize_newlines just split raw, its lines give the offsets
	const taken = take_collapsed(raw);
	if (taken !== undefined) return taken;
	const offsets = raw_offsets(raw);
	return offsets === null ? null : offsets.collapsed;
}

interface StoredDocument extends TraceTarget {
	raw: string;
}

/**
 * remapping only reads the html lines the compile map points at, so only those
 * are built
 */
function pfm_map(
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
function chained_base64(
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
function base64_utf8(json: string): string {
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

/** sveltekit() is async, so its plugins arrive as a promise */
async function flat_plugins(
	options: PluginOption[] | undefined,
	out: Plugin[] = []
): Promise<Plugin[]> {
	if (!options) return out;
	for (const option of options) {
		const resolved = await option;
		if (Array.isArray(resolved)) await flat_plugins(resolved, out);
		else if (resolved) out.push(resolved as Plugin);
	}
	return out;
}

function api_extensions(plugin: Plugin | undefined): string[] | undefined {
	const extensions = plugin?.api?.options?.extensions;
	return Array.isArray(extensions) ? extensions : undefined;
}

// documents import these virtual ids, so output holds no paths and the graph edge is the real file
const COMPONENTS_ID = 'mdsvex:components';

function clean_id(id: string): string {
	const q = id.indexOf('?');
	return q < 0 ? id : id.slice(0, q);
}

function same_names(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	for (let i = 0; i < b.length; i++) if (!set.has(b[i])) return false;
	return true;
}

type Warn = (message: string) => void;

/**
 * export scans per resolved file and the files each document read names from,
 * any module that supplies replacements scans through here
 */
function export_tracker() {
	const scanned = new Map<string, { code: string; names: string[] }>();
	const doc_files = new Map<string, readonly string[]>();
	/** the timestamp of each file whose export set changed */
	const changed_at = new Map<string, number>();

	return {
		/** scanned again only when the code changed */
		async scan(file: string, warn: Warn, code?: string): Promise<string[]> {
			if (code === undefined) {
				const fs = await import('node:fs/promises');
				code = await fs.readFile(file, 'utf8');
			}
			const hit = scanned.get(file);
			if (hit !== undefined && hit.code === code) return hit.names;
			const result = await scan_exports_detail(
				code,
				file.endsWith('.svelte') ? 'svelte' : 'js'
			);
			for (const star of result.stars) {
				warn(
					`${file} re-exports "${star}" with export *, whose names a static ` +
						`scan cannot see. export each replacement by name`
				);
			}
			scanned.set(file, { code, names: result.names });
			return result.names;
		},
		/** true when the names differ, or differed at this timestamp, so every environment sees one change */
		changed(
			file: string,
			before: readonly string[],
			after: readonly string[],
			timestamp: number
		): boolean {
			if (!same_names(before, after)) {
				changed_at.set(file, timestamp);
				return true;
			}
			return changed_at.get(file) === timestamp;
		},
		track(doc: string, files: readonly string[]): void {
			doc_files.set(doc, files);
		},
		docs_using(file: string): string[] {
			const docs: string[] = [];
			for (const [doc, files] of doc_files) {
				if (files.includes(file)) docs.push(doc);
			}
			return docs;
		},
	};
}

type ExportTracker = ReturnType<typeof export_tracker>;

interface ComponentModule {
	/** the id documents import */
	virtual: string;
	/** the specifier resolved, a URL as a path */
	spec: string;
	/** the resolved id without its query */
	file: string;
	names: string[];
}

/**
 * the root components modules resolve and scan once, every document compiles
 * with the same option until an export set changes
 */
function component_registry(
	written: readonly (string | URL)[],
	tracker: ExportTracker
) {
	const virtual_ids =
		written.length === 1
			? [COMPONENTS_ID]
			: written.map((_, i) => COMPONENTS_ID + '/' + i);

	let root = '';
	let modules: ComponentModule[] | null = null;
	let loading: Promise<ComponentModule[]> | null = null;
	/** the compile option, replaced whenever an export set changes */
	let sources: ComponentSource[] | undefined;
	let files: readonly string[] = [];

	function importer(): string {
		const base = root || (globalThis as any).process?.cwd?.() || '';
		return base.replace(/\/$/, '') + '/vite.config';
	}

	function publish(list: ComponentModule[]): void {
		modules = list;
		files = list.map((m) => m.file);
		sources = list.map((m) => ({ specifier: m.virtual, names: m.names }));
	}

	async function load(ctx: Rollup.PluginContext): Promise<ComponentModule[]> {
		const from = importer();
		const list: ComponentModule[] = [];
		const failed: string[] = [];
		for (let i = 0; i < written.length; i++) {
			const entry = written[i];
			const shown = typeof entry === 'string' ? entry : entry.href;
			let spec = shown;
			if (spec.startsWith('file:')) {
				const url = await import('node:url');
				spec = url.fileURLToPath(spec);
			}
			const resolved = await ctx.resolve(spec, from, { skipSelf: true });
			if (resolved === null || resolved.external) {
				failed.push(JSON.stringify(shown));
				continue;
			}
			list.push({
				virtual: virtual_ids[i],
				spec,
				file: clean_id(resolved.id),
				names: [],
			});
		}
		if (failed.length !== 0) {
			throw new Error(
				`[mdsvex] could not resolve the components module ${failed.join(', ')} ` +
					`from the vite root ${from.slice(0, -'/vite.config'.length)}`
			);
		}
		const warn = (message: string) => ctx.warn(message);
		for (const m of list) m.names = await tracker.scan(m.file, warn);
		publish(list);
		return list;
	}

	/** resolves and scans once, a failure is kept so it is reported once */
	function ensure(ctx: Rollup.PluginContext): Promise<ComponentModule[]> {
		if (loading === null) loading = load(ctx);
		return loading;
	}

	return {
		set_root(dir: string): void {
			root = dir;
		},
		ensure,
		/** resolve and scan again on the next use, keeping the scans of unchanged code */
		reset(): void {
			loading = null;
			modules = null;
		},
		ready(): boolean {
			return modules !== null;
		},
		files(): readonly string[] {
			return files;
		},
		/** the compile option for a document, noting the files it read */
		for_doc(id: string): ComponentSource[] | undefined {
			tracker.track(id, files);
			return sources;
		},
		/** resolved in the environment of ctx, whose conditions may differ */
		async resolve(
			ctx: Rollup.PluginContext,
			id: string
		): Promise<Rollup.ResolvedId | null | undefined> {
			const i = virtual_ids.indexOf(id);
			if (i < 0) return undefined;
			const list = await ensure(ctx);
			return ctx.resolve(list[i].spec, importer(), { skipSelf: true });
		},
		/** scan a changed file again, true when its export set changed */
		async rescan(
			file: string,
			timestamp: number,
			warn: Warn,
			code: string
		): Promise<boolean> {
			if (modules === null) return false;
			const at = modules.findIndex((m) => m.file === file);
			if (at < 0) return false;
			const before = modules[at].names;
			const names = await tracker.scan(file, warn, code);
			if (names !== before) {
				const list = modules.slice();
				list[at] = { ...list[at], names };
				publish(list);
			}
			return tracker.changed(file, before, names, timestamp);
		},
	};
}

/**
 * mdsvex vite plugin. returns a single plugin that:
 *
 * 1. transforms markdown to svelte html (enforce: 'pre')
 * 2. does NOT return a sourcemap to vite (to avoid poisoning the
 *    svelte compiler's own sourcemap via getCombinedSourcemap())
 * 3. after svelte compiles, chains the compiler's JS to HTML map with
 *    our HTML to markdown map using @ampproject/remapping, and injects
 *    the result as an inline sourceMappingURL in the output code.
 */
export function mdsvex(options: MdsvexOptions = {}): Plugin[] {
	const extensions = (options.extensions ?? ['.svx']).map((ext) =>
		ext.startsWith('.') ? ext : '.' + ext
	);

	// vite asks about every module in both transforms, so this allocates
	// nothing when the id has no query
	const only = extensions.length === 1 ? extensions[0] : null;
	function matches(id: string): boolean {
		const q = id.indexOf('?');
		const clean = q < 0 ? id : id.slice(0, q);
		if (only !== null) return clean.endsWith(only);
		for (let i = 0; i < extensions.length; i++) {
			if (clean.endsWith(extensions[i])) return true;
		}
		return false;
	}

	const stored = new Map<string, StoredDocument>();
	const no_records = new Uint32Array(0);
	const compiler = new CompilerSession();
	if (options.component_mode !== undefined)
		scope_of(undefined, options.component_mode);
	const written = options.components;
	const list =
		written === undefined ? [] : Array.isArray(written) ? written : [written];
	// a config without replacements builds none of their state
	const tracker = list.length === 0 ? null : export_tracker();
	const registry =
		tracker === null ? null : component_registry(list, tracker);
	let command: 'build' | 'serve' = 'serve';

	function compile_doc(
		code: string,
		id: string,
		components: ComponentSource[] | undefined
	): { code: string } {
		let doc = stored.get(id);
		if (doc === undefined) {
			doc = {
				raw: '',
				source: '',
				html: '',
				buf: no_records,
				start: 0,
				split: 0,
				end: 0,
			};
			stored.set(id, doc);
		}
		// raw last, so a compile that throws leaves no document for post
		doc.raw = '';
		compiler.compile_trace_into(code, options.parse_plugins, doc, components);
		doc.raw = code;

		// return NO map, avoids poisoning getCombinedSourcemap()
		return { code: doc.html };
	}

	return [
		{
			name: 'mdsvex',
			enforce: 'pre',

			config: {
				order: 'pre',
				async handler(config) {
					// kit passes this same array to vite-plugin-svelte and reads it
					// lazily, so pushing here registers our extensions with both
					const plugins = await flat_plugins(config.plugins);
					const registered = api_extensions(
						plugins.find((p) => p.name === 'vite-plugin-sveltekit-setup')
					);
					if (!registered) return;
					// with no extensions option this is a default shared by every
					// sveltekit() call in the process
					for (const ext of extensions) {
						if (!registered.includes(ext)) registered.push(ext);
					}
				},
			},

			configResolved(config) {
				registry?.set_root(config.root);
				command = config.command;
				const svelte = config.plugins.find(
					(p) => p.name === 'vite-plugin-svelte:config'
				);
				if (!svelte) return;
				const registered = api_extensions(svelte) ?? [];
				const missing = extensions.filter((ext) => !registered.includes(ext));
				if (missing.length === 0) return;
				const all = [...registered, ...missing].map((ext) => `'${ext}'`);
				throw new Error(
					`[mdsvex] vite-plugin-svelte does not handle ${missing.join(', ')} files. ` +
						`Add them to the extensions option of sveltekit() or svelte(): extensions: [${all.join(', ')}]`
				);
			},

			async buildStart() {
				// one clear error at startup rather than one per document
				if (registry !== null) await registry.ensure(this);
			},

			resolveId(id) {
				if (registry === null || !id.startsWith(COMPONENTS_ID)) return;
				return registry.resolve(this, id);
			},

			transform(code, id) {
				if (!matches(id)) return;
				if (registry === null) return compile_doc(code, id, undefined);

				const finish = () => {
					// a watch build compiles again when the exports change, in dev the virtual import is the edge
					if (command === 'build')
						for (const file of registry.files()) this.addWatchFile(file);
					return compile_doc(code, id, registry.for_doc(id));
				};
				if (registry.ready()) return finish();
				return registry.ensure(this).then(finish);
			},

			watchChange(id) {
				// the dev server rescans in hotUpdate instead
				if (
					registry !== null &&
					command === 'build' &&
					registry.files().includes(clean_id(id))
				)
					registry.reset();
			},

			async hotUpdate(update) {
				if (registry === null || !registry.ready()) return;
				const file = update.file;
				if (!registry.files().includes(file)) return;
				const changed = await registry.rescan(
					file,
					update.timestamp,
					(m) => this.environment.logger.warn('[mdsvex] ' + m),
					await update.read()
				);
				if (!changed) return;

				// names changed, documents compiled against the old set compile again
				const graph = this.environment.moduleGraph;
				const modules = update.modules.slice();
				for (const doc of tracker!.docs_using(file)) {
					const mods = graph.getModulesByFile(clean_id(doc));
					if (mods === undefined) continue;
					for (const mod of mods) {
						graph.invalidateModule(mod, new Set(), update.timestamp, true);
						if (!modules.includes(mod)) modules.push(mod);
					}
				}
				return modules;
			},
		},
		{
			name: 'mdsvex:sourcemap',
			enforce: 'post',

			transform(code, id) {
				if (!matches(id)) return;
				const doc = stored.get(id);
				if (!doc || !doc.raw) return;
				try {
					const originalSource = doc.raw;

					// get the svelte compiler's JS to HTML map from the chain
					let compileMap: any;
					try {
						compileMap = this.getCombinedSourcemap();
					} catch {
						return;
					}
					if (!compileMap?.mappings) return;

					let mapBase64 = chained_base64(doc, compileMap, id);
					if (mapBase64 === null) {
						const pfmMap = pfm_map(doc, compileMap.mappings, id);

						// chain: JS to HTML (compile) + HTML to markdown (pfm) = JS to markdown
						const chained = remapping([compileMap, pfmMap as any], () => null);

						// override sourcesContent with the original markdown
						if (chained.sourcesContent) {
							chained.sourcesContent = chained.sourcesContent.map(
								() => originalSource
							);
						}
						mapBase64 = base64_utf8(JSON.stringify(chained));
					}

					// inject as inline sourceMappingURL since vite ignores
					// post-transform map return values
					const comment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapBase64}\n`;

					return { code: code + comment, map: { mappings: '' as const } };
				} finally {
					// keep the entry for reuse but drop the document
					doc.raw = '';
					doc.source = '';
					doc.html = '';
					doc.buf = no_records;
					doc.start = 0;
					doc.split = 0;
					doc.end = 0;
				}
			},
		},
	];
}

export { render as compile };
