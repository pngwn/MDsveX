// what an example is compiled with, the same at build time and in the
// workbook's browser compile, so an edited example gives what the build gave
import type { Segment } from '$lib/design/atlas/types';
import type { Setup } from './types';

/** the guide's two templates, as its vite.config.js names them */
export const TEMPLATES = {
	default: { specifier: '#lib/templates/Post.svelte', components: [] },
	docs: { specifier: '#lib/templates/Docs.svelte', components: [] },
};

export function options_for(setup: Setup, file?: string) {
	const filename = `/${file ?? 'example.svx'}`;
	// a template is never wrapped in one, so the guide's Note.svx is compiled without them
	if (setup === 'plain') return { filename, strict_directives: false };
	return { filename, strict_directives: false, templates: TEMPLATES };
}

/** a cue drawn as '^' under the source, line for line, as source ranges */
export function cue_ranges(source: string, cue: string): [number, number][] {
	const out: [number, number][] = [];
	let at = 0;
	const lines = source.split('\n');
	const marks = cue.split('\n');
	lines.forEach((line, i) => {
		const mark = marks[i] ?? '';
		for (let c = 0; c < mark.length; c++) {
			if (mark[c] !== '^') continue;
			const last = out[out.length - 1];
			if (last && last[1] === at + c) last[1]++;
			else out.push([at + c, at + c + 1]);
		}
		at += line.length + 1;
	});
	return out;
}

interface Mapping {
	sourceOffsets: number[];
	generatedOffsets: number[];
	lengths: number[];
	generatedLengths?: number[];
}

/**
 * the compile's mappings as source and output ranges, as the atlas reads them
 * (atlas/compile.server.ts), so a score can wash what its phrase became
 */
export function segments_of(result: { mappings?: Mapping[] }): Segment[] {
	const out = new Map<string, Segment>();
	for (const m of result.mappings ?? []) {
		m.sourceOffsets.forEach((start, i) => {
			const length = m.lengths[i];
			// structure with no source of its own, a `<p>` the paragraph's mapping already covers
			if (length === 0) return;
			const out_start = m.generatedOffsets[i];
			const out_end = out_start + (m.generatedLengths?.[i] ?? length);
			const key = `${start},${start + length}`;
			const known = out.get(key);
			// a node and its text can share a range, keep the widest output: the node's
			if (!known || out_end - out_start > known[3] - known[2]) out.set(key, [start, start + length, out_start, out_end]);
		});
	}
	return [...out.values()].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
}
