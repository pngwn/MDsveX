import { PFMParser, WireEmitter } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { Cursor } from '@mdsvex/parse/cursor';
import { WireTreeBuilder } from '@mdsvex/parse/wire-tree-builder';
import { CursorHTMLRenderer } from '@mdsvex/render/html-cursor';
import type { PreprocessorGroup } from 'svelte/compiler';

function render(source: string): string {
	const tree = new TreeBuilder(source.length >> 3 || 128);
	const parser = new PFMParser(tree);
	parser.parse(source);
	const renderer = new CursorHTMLRenderer({ cache: false });
	renderer.update(tree.get_buffer(), source);
	return renderer.html;
}

export function mdsvex_preprocessor({
	extensions = [],
}: {
	extensions: string[];
}): PreprocessorGroup {
	return {
		name: 'mdsvex',
		markup: async ({ content, filename }) => {
			const extensionsParts = extensions.map((ext) =>
				ext.startsWith('.') ? ext : '.' + ext
			);
			if (!extensionsParts.some((ext) => filename && filename.endsWith(ext)))
				return;

			// before calling parser.process, we need to wait for the layouts to be processed
			// or else the parser will be frozen

			const parsed = render(content);
			console.log(parsed);
			return {
				code: parsed,
				data: {},
				map: '',
			};
		},
	};
}

export { render as compile };
