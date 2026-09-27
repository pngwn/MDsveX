import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	normalize_newlines,
	raw_offsets,
} from '@mdsvex/parse';
import type { ParsePlugin, RawOffsets } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import { CursorHTMLRenderer } from '@mdsvex/render/html-cursor';
import {
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
	/** equal to mappings_to_v3 over compile's mappings with the raw source. */
	map: SourceMapV3;
}

export interface CompileTraceResult {
	code: string;
	/**
	 * what the v3 map is built from, trace_to_v3 over it with the raw source
	 * and code giving compile_v3's map. null when map holds that map.
	 */
	trace: MapTrace | null;
	/** compile_v3's map, built at once when collapsing \r\n moved offsets. */
	map: SourceMapV3 | null;
}

/** parse a normalized source into its own tree, running parse plugins over it. */
function parse_once(source: string, plugins?: ParsePlugin[]): NodeBuffer {
	let dispatcher: PluginDispatcher | undefined;
	if (plugins && plugins.length > 0) {
		const text_source = new SourceTextSource(source);
		dispatcher = new PluginDispatcher(plugins, text_source);
	}

	// short documents are denser in nodes than long ones, so size them
	// generously to skip the resize, a small buffer is only a slab carve
	const len = source.length;
	const tree = new TreeBuilder(
		len < 512 ? (len >> 2) + 16 : len >> 3,
		dispatcher
	);
	const parser = new PFMParser(tree);
	parser.parse(source);

	if (dispatcher) {
		dispatcher.run_sequential(tree.get_buffer());
	}
	return tree.get_buffer();
}

function render_once(raw: string, options?: CompileOptions): CompileResult {
	// parser offsets index the normalized string, so render and plugins read it too
	const source = normalize_newlines(raw);
	const nodes = parse_once(source, options?.parsePlugins);
	const renderer = new CursorHTMLRenderer({ cache: false });

	if (options?.sourcemap) {
		const result = renderer.update_mapped(nodes, source);
		remap_to_raw(raw, result.mappings);
		return { code: renderer.html, mappings: result.mappings };
	}

	renderer.update(nodes, source);
	return { code: renderer.html };
}

/** html and v3 map of a parsed document, source being raw normalized. */
function render_v3(
	renderer: CursorHTMLRenderer,
	nodes: NodeBuffer,
	source: string,
	raw: string,
	file?: string
): CompileV3Result {
	// only a collapsed \r\n moves offsets, and it is the only change of length.
	// without one the records already index raw and encode straight to v3
	if (source.length === raw.length) {
		const map = renderer.update_v3(nodes, source, raw, file);
		return { code: renderer.html, map };
	}
	const result = renderer.update_mapped(nodes, source);
	remap_to_raw(raw, result.mappings);
	const code = renderer.html;
	return { code, map: mappings_to_v3(result.mappings, raw, code, file) };
}

/** render_v3 that keeps the records instead of encoding them when it can. */
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

	/** @internal node slots the arena holds, zero before the first compile. */
	get capacity(): number {
		return this.tree === null ? 0 : this.tree.get_buffer()._capacity;
	}

	/** parse a normalized source into the session's arena. */
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
			const result = this.renderer.update_mapped(nodes, source);
			remap_to_raw(raw, result.mappings);
			return { code: this.renderer.html, mappings: result.mappings };
		}

		this.renderer.update(nodes, source);
		return { code: this.renderer.html };
	}

	/**
	 * @internal drop everything the last compile left behind except the
	 * typed array storage, so an idle session holds no source, node
	 * metadata, html or chunks. the next compile would clear these anyway.
	 */
	release(): void {
		if (this.tree !== null) {
			this.tree.reset();
			this.parser!.release();
			this.released = true;
		}
		this.renderer.release();
	}

	/**
	 * html and v3 map of raw, the map equal to mappings_to_v3 over
	 * compile(raw, { sourcemap: true }).mappings with raw as the source. the
	 * vite plugin needs nothing else, so no Mapping objects are built.
	 */
	compile_v3(
		raw: string,
		file?: string,
		parse_plugins?: ParsePlugin[]
	): CompileV3Result {
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			// the dispatcher reads this source, so the tree is not the session's
			const nodes = parse_once(source, parse_plugins);
			const renderer = new CursorHTMLRenderer({ cache: false });
			return render_v3(renderer, nodes, source, raw, file);
		}
		return render_v3(this.renderer, this.parse(source), source, raw, file);
	}

	/**
	 * compile_v3 that defers the map. the vite plugin only looks up the few
	 * lines the svelte compiler's map points at, so it builds them later
	 * from the trace rather than encoding every line and decoding it again.
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

// a session retains its arena at the size of the largest document it has
// seen. large documents gain little from reuse, so they never enter the
// shared session, and one whose tree outgrew the arena cap drops it
const SHARED_SOURCE_CAP = 1 << 19;
const SHARED_CAPACITY_CAP = 1 << 16;

let shared_session: CompilerSession | null = null;
let shared_session_busy = false;

/**
 * one-shot compile. without plugins the result holds no reference into the
 * arena, parser or renderer, so small documents share one lazily created
 * module-level session instead of building and discarding all three.
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

/** @internal the shared one-shot session, for tests. */
export function _shared_session(): CompilerSession | null {
	return shared_session;
}

function remap_to_raw(raw: string, mappings: Mapping<MappingData>[]): void {
	const offsets = raw_offsets(raw);
	if (!offsets) return;
	for (const mapping of mappings) {
		remap_source_offsets(mapping, offsets);
	}
}

/**
 * identity mappings split after each collapsed \n so every piece stays
 * identity with that \n on its \r, other mappings widen their source range
 */
function remap_source_offsets(
	mapping: Mapping<MappingData>,
	offsets: RawOffsets
): void {
	const { sourceOffsets, lengths } = mapping;
	const { collapsed } = offsets;
	const identity = !mapping.generatedLengths;

	for (let i = 0; i < sourceOffsets.length; i++) {
		const start = sourceOffsets[i];
		const end = start + lengths[i];
		const k = offsets.rank(start);
		// a trailing collapsed \n maps onto its \r in an identity range
		const crosses =
			k < collapsed.length && collapsed[k] + (identity ? 1 : 0) < end;
		if (crosses) {
			if (identity) return split_mapping(mapping, offsets, i);
			lengths[i] = offsets.to_raw(end) - start - k;
		}
		sourceOffsets[i] = start + k;
	}
}

/** splits pieces from index `from` on, earlier pieces are already shifted */
function split_mapping(
	mapping: Mapping<MappingData>,
	offsets: RawOffsets,
	from: number
): void {
	const { sourceOffsets, generatedOffsets, lengths } = mapping;
	const { collapsed } = offsets;
	const src = sourceOffsets.slice(0, from);
	const gen = generatedOffsets.slice(0, from);
	const len = lengths.slice(0, from);
	for (let i = from; i < sourceOffsets.length; i++) {
		let start = sourceOffsets[i];
		let gen_start = generatedOffsets[i];
		const end = start + lengths[i];
		let k = offsets.rank(start);
		while (k < collapsed.length && collapsed[k] + 1 < end) {
			const cut = collapsed[k] + 1;
			src.push(start + k);
			gen.push(gen_start);
			len.push(cut - start);
			gen_start += cut - start;
			start = cut;
			k++;
		}
		src.push(start + k);
		gen.push(gen_start);
		len.push(end - start);
	}
	mapping.sourceOffsets = src;
	mapping.generatedOffsets = gen;
	mapping.lengths = len;
}

/** what the pre transform keeps of a document for the post transform. */
interface StoredDocument {
	raw: string;
	html: string;
	trace: MapTrace | null;
	map: SourceMapV3 | null;
}

/**
 * the html to markdown map as far as remapping reads it. remapping only
 * looks up the html lines the compile map's segments point at, so those
 * lines alone are built, each equal to the line of the full map. a compile
 * map whose lines cannot be read safely gets the full map.
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

				const pfmMap = doc.map ?? pfm_map(doc, compileMap.mappings, id);

				// chain: JS to HTML (compile) + HTML to markdown (pfm) = JS to markdown
				const chained = remapping([compileMap, pfmMap as any], () => null);

				// override sourcesContent with the original markdown
				if (chained.sourcesContent) {
					chained.sourcesContent = chained.sourcesContent.map(
						() => originalSource
					);
				}

				// inject as inline sourceMappingURL since vite ignores
				// post-transform map return values
				const mapJson = JSON.stringify(chained);
				const mapBase64 = Buffer.from(mapJson).toString('base64');
				const comment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapBase64}\n`;

				return { code: code + comment, map: { mappings: '' as const } };
			},
		},
	];
}

export { render as compile };
