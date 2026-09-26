import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	normalize_newlines,
	raw_offsets,
} from "@mdsvex/parse";
import type { ParsePlugin, RawOffsets } from "@mdsvex/parse";
import { TreeBuilder } from "@mdsvex/parse/tree-builder";
import { CursorHTMLRenderer } from "@mdsvex/render/html-cursor";
import { mappings_to_v3 } from "@mdsvex/render/sourcemap";
import type { Mapping, MappingData } from "@mdsvex/render/mappings";
import type { SourceMapV3 } from "@mdsvex/render/sourcemap";
import type { Plugin } from "vite";
import remapping from "@ampproject/remapping";

export type { ParsePlugin } from "@mdsvex/parse";
export type { Mapping, MappingData, SourceMapV3 };

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

function render_once(
	raw: string,
	options?: CompileOptions,
): CompileResult {
	// parser offsets index the normalized string, so render and plugins read it too
	const source = normalize_newlines(raw);

	let dispatcher: PluginDispatcher | undefined;
	if (options?.parsePlugins && options.parsePlugins.length > 0) {
		const text_source = new SourceTextSource(source);
		dispatcher = new PluginDispatcher(options.parsePlugins, text_source);
	}

	const tree = new TreeBuilder(source.length >> 3 || 128, dispatcher);
	const parser = new PFMParser(tree);
	parser.parse(source);

	if (dispatcher) {
		dispatcher.run_sequential(tree.get_buffer());
	}

	const renderer = new CursorHTMLRenderer({ cache: false });

	if (options?.sourcemap) {
		const result = renderer.update_mapped(tree.get_buffer(), source);
		remap_to_raw(raw, result.mappings);
		return { code: renderer.html, mappings: result.mappings };
	}

	renderer.update(tree.get_buffer(), source);
	return { code: renderer.html };
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

	compile(
		raw: string,
		options?: CompileOptions,
	): CompileResult {
		if (options?.parsePlugins && options.parsePlugins.length > 0) {
			return render_once(raw, options);
		}

		const source = normalize_newlines(raw);
		if (this.tree === null) {
			this.tree = new TreeBuilder(source.length >> 3 || 128);
			this.parser = new PFMParser(this.tree);
		} else {
			this.tree.reset();
		}

		this.parser!.parse(source);
		const nodes = this.tree.get_buffer();
		if (options?.sourcemap) {
			const result = this.renderer.update_mapped(nodes, source);
			remap_to_raw(raw, result.mappings);
			return { code: this.renderer.html, mappings: result.mappings };
		}

		this.renderer.update(nodes, source);
		return { code: this.renderer.html };
	}
}

function render(
	source: string,
	options?: CompileOptions,
): CompileResult {
	return render_once(source, options);
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
	offsets: RawOffsets,
): void {
	const { sourceOffsets, lengths } = mapping;
	const { collapsed } = offsets;
	const identity = !mapping.generatedLengths;

	for (let i = 0; i < sourceOffsets.length; i++) {
		const start = sourceOffsets[i];
		const end = start + lengths[i];
		const k = offsets.rank(start);
		// a trailing collapsed \n maps onto its \r in an identity range
		const crosses = k < collapsed.length && collapsed[k] + (identity ? 1 : 0) < end;
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
	from: number,
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
	const extensions = (options.extensions ?? [".svx"]).map((ext) =>
		ext.startsWith(".") ? ext : "." + ext,
	);

	function matches(id: string): boolean {
		const clean = id.split("?")[0];
		return extensions.some((ext) => clean.endsWith(ext));
	}

	const storedMaps = new Map<string, SourceMapV3>();
	const storedSources = new Map<string, string>();
	const compiler = new CompilerSession();

	return [
		{
			name: "mdsvex",
			enforce: "pre",

			transform(code, id) {
				if (!matches(id)) return;

				const result = compiler.compile(code, {
					parsePlugins: options.parsePlugins,
					sourcemap: true,
				});

				if (result.mappings) {
					storedMaps.set(
						id,
						mappings_to_v3(result.mappings, code, result.code, id),
					);
					storedSources.set(id, code);
				}

				// return NO map, avoids poisoning getCombinedSourcemap()
				return { code: result.code };
			},
		},
		{
			name: "mdsvex:sourcemap",
			enforce: "post",

			transform(code, id) {
				if (!matches(id)) return;
				const pfmMap = storedMaps.get(id);
				const originalSource = storedSources.get(id);
				if (!pfmMap || !originalSource) return;
				storedMaps.delete(id);
				storedSources.delete(id);

				// get the svelte compiler's JS to HTML map from the chain
				let compileMap: any;
				try {
					compileMap = this.getCombinedSourcemap();
				} catch {
					return;
				}
				if (!compileMap?.mappings) return;

				// chain: JS to HTML (compile) + HTML to markdown (pfm) = JS to markdown
				const chained = remapping(
					[compileMap, pfmMap as any],
					() => null,
				);

				// override sourcesContent with the original markdown
				if (chained.sourcesContent) {
					chained.sourcesContent = chained.sourcesContent.map(() => originalSource);
				}

				// inject as inline sourceMappingURL since vite ignores
				// post-transform map return values
				const mapJson = JSON.stringify(chained);
				const mapBase64 = Buffer.from(mapJson).toString("base64");
				const comment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapBase64}\n`;

				return { code: code + comment, map: { mappings: "" as const } };
			},
		},
	];
}

export { render as compile };
