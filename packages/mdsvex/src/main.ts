import { PFMParser, WireEmitter, PluginDispatcher, SourceTextSource } from "@mdsvex/parse";
import type { ParsePlugin } from "@mdsvex/parse";
import { TreeBuilder } from "@mdsvex/parse/tree-builder";
import { Cursor } from "@mdsvex/parse/cursor";
import { WireTreeBuilder } from "@mdsvex/parse/wire-tree-builder";
import { CursorHTMLRenderer } from "@mdsvex/render/html-cursor";
import { mappings_to_v3 } from "@mdsvex/render/sourcemap";
import type { Mapping, CodeInformation } from "@mdsvex/render/mappings";
import type { SourceMapV3 } from "@mdsvex/render/sourcemap";
import type { PreprocessorGroup } from "svelte/compiler";

export type { ParsePlugin } from "@mdsvex/parse";
export type { Mapping, CodeInformation, SourceMapV3 };

export interface MdsvexOptions {
	extensions: string[];
	/** parse plugins that hook into tree construction. */
	parsePlugins?: ParsePlugin[];
}

interface RenderResult {
	code: string;
	mappings?: Mapping<CodeInformation>[];
}

function render(
	source: string,
	options?: { parsePlugins?: ParsePlugin[]; sourcemap?: boolean },
): RenderResult {
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
		const result = renderer.updateMapped(tree.get_buffer(), source);
		return { code: renderer.html, mappings: result.mappings };
	}

	renderer.update(tree.get_buffer(), source);
	return { code: renderer.html };
}

export function mdsvex_preprocessor({
	extensions = [],
	parsePlugins,
}: MdsvexOptions): PreprocessorGroup {
	return {
		name: "mdsvex",
		markup: async ({ content, filename }) => {
			const extensionsParts = extensions.map((ext) =>
				ext.startsWith(".") ? ext : "." + ext,
			);
			if (!extensionsParts.some((ext) => filename && filename.endsWith(ext)))
				return;

			const parsed = render(content, {
				parsePlugins,
				sourcemap: true,
			});

			return {
				code: parsed.code,
				map: parsed.mappings
					? mappings_to_v3(parsed.mappings, content, parsed.code, filename)
					: "",
			};
		},
	};
}

export { render as compile };
