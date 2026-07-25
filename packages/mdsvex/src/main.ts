import { PFMParser, PluginDispatcher, SourceTextSource } from "@mdsvex/parse";
import type { ParsePlugin } from "@mdsvex/parse";
import {
	DirectTreeBuilder,
	TreeBuilder,
} from "@mdsvex/parse/tree-builder";
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

export interface CompileV3Result {
	code: string;
	map: SourceMapV3;
}

function render_once(
	source: string,
	options?: CompileOptions,
): CompileResult {
	let dispatcher: PluginDispatcher | undefined;
	if (options?.parsePlugins && options.parsePlugins.length > 0) {
		const text_source = new SourceTextSource(source);
		dispatcher = new PluginDispatcher(options.parsePlugins, text_source);
	}

	const tree = dispatcher
		? new TreeBuilder(source.length >> 3 || 128, dispatcher)
		: new DirectTreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);

	if (dispatcher) {
		dispatcher.run_sequential(tree.get_buffer());
	}

	const renderer = new CursorHTMLRenderer({ cache: false });

	if (options?.sourcemap) {
		const result = renderer.update_mapped(tree.get_buffer(), source);
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
	private tree: DirectTreeBuilder | null = null;
	private parser: PFMParser | null = null;
	private renderer = new CursorHTMLRenderer({ cache: false });

	compile(
		source: string,
		options?: CompileOptions,
	): CompileResult {
		if (options?.parsePlugins && options.parsePlugins.length > 0) {
			return render_once(source, options);
		}

		if (this.tree === null) {
			this.tree = new DirectTreeBuilder(source.length >> 3 || 128);
			this.parser = new PFMParser(this.tree);
		} else {
			this.tree.reset();
		}

		this.parser!.parse(source);
		const nodes = this.tree.get_buffer();
		if (options?.sourcemap) {
			const result = this.renderer.update_mapped(nodes, source);
			return { code: this.renderer.html, mappings: result.mappings };
		}

		this.renderer.update(nodes, source);
		return { code: this.renderer.html };
	}

	compile_v3(
		source: string,
		file?: string,
		options?: Omit<CompileOptions, "sourcemap">,
	): CompileV3Result {
		if (options?.parsePlugins && options.parsePlugins.length > 0) {
			const result = render_once(source, {
				...options,
				sourcemap: true,
			});
			return {
				code: result.code,
				map: mappings_to_v3(result.mappings!, source, result.code, file),
			};
		}

		if (this.tree === null) {
			this.tree = new DirectTreeBuilder(source.length >> 3 || 128);
			this.parser = new PFMParser(this.tree);
		} else {
			this.tree.reset();
		}

		this.parser!.parse(source);
		const result = this.renderer.update_v3(
			this.tree.get_buffer(),
			source,
			file,
		);
		return { code: this.renderer.html, map: result.map };
	}
}

function render(
	source: string,
	options?: CompileOptions,
): CompileResult {
	return render_once(source, options);
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

				const result = compiler.compile_v3(code, id, {
					parsePlugins: options.parsePlugins,
				});

				storedMaps.set(id, result.map);
				storedSources.set(id, code);

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
