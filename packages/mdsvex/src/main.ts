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
	/**
	 * trace_to_v3 over this with raw source gives the compile_v3 map, null
	 * when map is set
	 */
	trace: MapTrace | null;
	/** the compile_v3 map, built at once when collapsing \r\n moved offsets */
	map: SourceMapV3 | null;
}

// a one shot compile binds its own tree to a spare parser and renders with a
// spare renderer, one taken while in use (a plugin that compiles) leaves null
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
	parser.parse(source);
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
		const result = renderer.update_mapped(nodes, source, collapsed_of(raw));
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
	source: string,
	raw: string,
	file?: string
): CompileTraceResult {
	if (source.length === raw.length) {
		const trace = renderer.update_trace(nodes, source);
		return { code: renderer.html, trace, map: null };
	}
	const { code, map } = render_v3(renderer, nodes, source, raw, file);
	return { code, trace: null, map };
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

		this.parser!.parse(source);
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
		file?: string,
		parse_plugins?: ParsePlugin[]
	): CompileTraceResult {
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			const nodes = parse_once(source, parse_plugins);
			const renderer = new CursorHTMLRenderer({ cache: false });
			return render_trace(renderer, nodes, source, raw, file);
		}
		return render_trace(this.renderer, this.parse(source), source, raw, file);
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
	html: string;
	trace: MapTrace | null;
	map: SourceMapV3 | null;
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
	const lines = mapped_source_lines(compile_mappings as string);
	if (lines === null) return trace_to_v3(doc.trace!, doc.raw, doc.html, file);
	return trace_to_decoded(doc.trace!, doc.raw, doc.html, lines, file);
}

// names resolve-uri keeps as they are, as remapping resolves the source
const PLAIN_BASENAME = /^[\w\-+~@][\w.\-+~@]*$/;

/**
 * the inline map JSON remapping would give for [compile, pfm map] with
 * sourcesContent set to the raw source, null for anything left to remapping
 */
function chained_json(
	doc: StoredDocument,
	compile: any,
	file: string
): string | null {
	if (doc.trace === null || compile._decodedMemo) return null;
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

	const chained = chain_trace(mappings, names, doc.trace, doc.raw, doc.html);
	if (chained === null) return null;
	let json = '{"version":3';
	if (out_file) json += ',"file":' + JSON.stringify(out_file);
	json +=
		',"mappings":"' +
		chained.mappings +
		'","names":' +
		JSON.stringify(chained.names) +
		',"ignoreList":[],"sources":';
	if (chained.sourced) {
		json +=
			'[' +
			JSON.stringify(base) +
			'],"sourcesContent":[' +
			JSON.stringify(doc.raw) +
			']}';
	} else {
		json += '[],"sourcesContent":[]}';
	}
	return json;
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

				const result = compiler.compile_trace(code, id, options.parsePlugins);
				stored.set(id, {
					raw: code,
					html: result.code,
					trace: result.trace,
					map: result.map,
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

				let mapJson = chained_json(doc, compileMap, id);
				if (mapJson === null) {
					const pfmMap = doc.map ?? pfm_map(doc, compileMap.mappings, id);

					// chain: JS to HTML (compile) + HTML to markdown (pfm) = JS to markdown
					const chained = remapping([compileMap, pfmMap as any], () => null);

					// override sourcesContent with the original markdown
					if (chained.sourcesContent) {
						chained.sourcesContent = chained.sourcesContent.map(
							() => originalSource
						);
					}
					mapJson = JSON.stringify(chained);
				}

				// inject as inline sourceMappingURL since vite ignores
				// post-transform map return values
				const mapBase64 = Buffer.from(mapJson).toString('base64');
				const comment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapBase64}\n`;

				return { code: code + comment, map: { mappings: '' as const } };
			},
		},
	];
}

export { render as compile };
