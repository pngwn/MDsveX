import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	normalize_newlines,
	raw_offsets,
} from '@mdsvex/parse';
import type { ParsePlugin } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import { CursorHTMLRenderer } from '@mdsvex/render/html-cursor';
import {
	chain_trace,
	map_basename,
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
import type { Plugin } from 'vite';
import remapping from '@ampproject/remapping';

export type { ParsePlugin } from '@mdsvex/parse';
export type { Mapping, MappingData, SourceMapV3, MapTrace };

export interface MdsvexOptions {
	extensions?: string[];
	/** parse plugins that hook into tree construction. */
	parsePlugins?: ParsePlugin[];
}

export interface CompileOptions {
	parsePlugins?: ParsePlugin[];
	sourcemap?: boolean;
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
	const nodes = parse_once(source, options?.parsePlugins);
	const renderer = take_renderer();

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
		if (options?.parsePlugins && options.parsePlugins.length > 0) {
			return render_once(raw, options);
		}

		const source = normalize_newlines(raw);
		const nodes = this.parse(source);
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
		parse_plugins?: ParsePlugin[]
	): CompileV3Result {
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			// the dispatcher holds this source, so plugins get their own tree
			const nodes = parse_once(source, parse_plugins);
			const renderer = new CursorHTMLRenderer({ cache: false });
			return render_v3(renderer, nodes, source, raw, file);
		}
		return render_v3(this.renderer, this.parse(source), source, raw, file);
	}

	/**
	 * defers the map, the vite plugin builds only the lines the svelte compiler
	 * map points at
	 * @internal
	 */
	compile_trace(
		raw: string,
		parse_plugins?: ParsePlugin[]
	): CompileTraceResult {
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			const nodes = parse_once(source, parse_plugins);
			const renderer = new CursorHTMLRenderer({ cache: false });
			return render_trace(renderer, nodes, source);
		}
		return render_trace(this.renderer, this.parse(source), source);
	}
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
		(options?.parsePlugins && options.parsePlugins.length > 0)
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
	const offsets = raw_offsets(raw);
	return offsets === null ? null : offsets.collapsed;
}

interface StoredDocument {
	raw: string;
	/** normalized raw, the trace indexes it */
	source: string;
	html: string;
	trace: MapTrace;
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
	if (lines === null) return trace_to_v3(doc.trace, doc.source, doc.html, file);
	return trace_to_decoded(doc.trace, doc.source, doc.html, lines, file);
}

// names resolve-uri keeps as they are, as remapping resolves the source
const PLAIN_BASENAME = /^[\w\-+~@][\w.\-+~@]*$/;

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
	const base = map_basename(file);
	if (!PLAIN_BASENAME.test(base)) return null;

	const chained = chain_trace(mappings, names, doc.trace, doc.source, doc.html);
	if (chained === null) return null;
	let head = '{"version":3';
	if (out_file) head += ',"file":' + JSON.stringify(out_file);
	head += ',"mappings":"';
	const chained_names = chained.names;
	let tail =
		'","names":' +
		(chained_names === null ? '[]' : JSON.stringify(chained_names)) +
		',"ignoreList":[],"sources":';
	// a longer well formed source is escaped from its utf8 bytes, faster than
	// JSON.stringify, and written after the tail
	const raw = doc.raw;
	let escape = false;
	if (chained.sourced) {
		// a plain basename has no char json escapes, so quoting equals JSON.stringify
		tail += '["' + base + '"],"sourcesContent":[';
		escape =
			raw.length >= JSON_ESCAPE_MIN &&
			typeof (raw as any).isWellFormed === 'function' &&
			(raw as any).isWellFormed();
		if (!escape) tail += JSON.stringify(raw) + ']}';
	} else {
		tail += '[],"sourcesContent":[]}';
	}

	// the mappings are ascii, written as bytes they skip a decode to a string
	// and its encode, head and tail end and start in ascii so their utf8 joins
	const length = chained.length;
	const src = chained.bytes;
	const most =
		(head.length + tail.length) * 3 +
		length +
		(escape ? raw.length * 6 + 4 : 0);
	if (most > BASE64_KEEP) {
		const text = Buffer.from(src.buffer, src.byteOffset, length).toString(
			'latin1'
		);
		if (escape) tail += JSON.stringify(raw) + ']}';
		return Buffer.from(head + text + tail).toString('base64');
	}
	let bytes = base64_bytes;
	if (bytes === null || bytes.length < most) {
		let size = 1 << 14;
		while (size < most) size <<= 1;
		bytes = base64_bytes = Buffer.allocUnsafe(size);
	}
	let n = bytes.write(head, 0, 'utf8');
	if (length > 64) bytes.set(src.subarray(0, length), n);
	else for (let i = 0; i < length; i++) bytes[n + i] = src[i];
	n += length;
	n += bytes.write(tail, n, 'utf8');
	if (escape) {
		n = write_json_string(raw, bytes, n);
		bytes[n++] = 93; // ]
		bytes[n++] = 125; // }
	}
	return bytes.toString('base64', 0, n);
}

// below this JSON.stringify is as fast as escaping bytes
const JSON_ESCAPE_MIN = 128;

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

// utf8 of a source being escaped, reused across transforms
let json_stage: Buffer | null = null;

/**
 * writes the utf8 of JSON.stringify(raw) into out at n, raw well formed (no
 * lone surrogate, which utf8 would replace), out holding 6 bytes per unit of
 * raw and 2 more, returns the end
 */
function write_json_string(raw: string, out: Buffer, n: number): number {
	let stage = json_stage;
	if (stage === null || stage.length < raw.length * 3) {
		let size = 1 << 14;
		while (size < raw.length * 3) size <<= 1;
		stage = json_stage = Buffer.allocUnsafe(size);
	}
	const len = stage.write(raw, 0, 'utf8');
	const view = new DataView(stage.buffer, stage.byteOffset, len);
	const out_view = new DataView(out.buffer, out.byteOffset, out.length);
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

/** equals Buffer.from(json).toString('base64') */
function base64_utf8(json: string): string {
	// three utf8 bytes per utf16 unit at most
	const most = json.length * 3;
	if (most > BASE64_KEEP) return Buffer.from(json).toString('base64');
	let bytes = base64_bytes;
	if (bytes === null || bytes.length < most) {
		let size = 1 << 14;
		while (size < most) size <<= 1;
		bytes = base64_bytes = Buffer.allocUnsafe(size);
	}
	const n = bytes.write(json, 0, 'utf8');
	return bytes.toString('base64', 0, n);
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
	function matches(id: string): boolean {
		const q = id.indexOf('?');
		const clean = q < 0 ? id : id.slice(0, q);
		for (let i = 0; i < extensions.length; i++) {
			if (clean.endsWith(extensions[i])) return true;
		}
		return false;
	}

	const stored = new Map<string, StoredDocument>();
	const compiler = new CompilerSession();

	return [
		{
			name: 'mdsvex',
			enforce: 'pre',

			transform(code, id) {
				if (!matches(id)) return;

				const result = compiler.compile_trace(code, options.parsePlugins);
				stored.set(id, {
					raw: code,
					source: result.source,
					html: result.code,
					trace: result.trace,
				});

				// return NO map, avoids poisoning getCombinedSourcemap()
				return { code: result.code };
			},
		},
		{
			name: 'mdsvex:sourcemap',
			enforce: 'post',

			transform(code, id) {
				if (!matches(id)) return;
				const doc = stored.get(id);
				if (!doc || !doc.raw) return;
				stored.delete(id);
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
			},
		},
	];
}

export { render as compile };
