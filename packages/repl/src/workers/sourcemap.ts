import remapping from '@ampproject/remapping';
import { decode } from '@jridgewell/sourcemap-codec';
import type { SourceMapV3 } from '@mdsvex/render/sourcemap';

/** a svelte output map whose source is markdown output, chained back to the markdown */
export function chain(outer: any, inner: SourceMapV3, filename: string) {
	if (!outer) return outer;
	// the inner map names the same file as its source, so only the first level may load it
	const map = remapping(outer, (file, ctx) =>
		ctx.depth === 1 && file === filename ? (inner as any) : null
	);
	map.sources = [filename];
	return map;
}

function line_starts(text: string) {
	const starts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 10) starts.push(i + 1);
	}
	return starts;
}

/** maps generated offsets back to the source, an offset between segments takes the one before it */
export function offset_mapper(
	map: SourceMapV3,
	generated: string,
	original: string
) {
	const decoded = decode(map.mappings);
	const generated_lines = line_starts(generated);
	const original_lines = line_starts(original);

	return (offset: number): number => {
		let line = generated_lines.length - 1;
		while (line > 0 && generated_lines[line] > offset) line--;
		const column = offset - generated_lines[line];

		for (let l = line; l >= 0; l--) {
			const segments = decoded[l] ?? [];
			for (let i = segments.length - 1; i >= 0; i--) {
				const seg = segments[i];
				if (seg.length < 4) continue;
				if (l === line && seg[0] > column) continue;
				const delta = l === line ? column - seg[0] : 0;
				const start = original_lines[seg[2]!] ?? original.length;
				return Math.min(start + seg[3]! + delta, original.length);
			}
		}
		return 0;
	};
}
