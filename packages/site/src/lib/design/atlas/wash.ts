// the wash between a score and its output, SCORE.md's one interaction: pointing
// at a phrase lights what it became, and pointing at the output lights the
// phrase it came from. Both ways go through the compile's own mappings
// (compile.server.ts), never through matching text
import type { Focus } from '../score/Score.svelte';
import { read, settled } from '../score/reading';
import type { Segment } from './types';

/** the output a source range became: the node mapped to exactly that range, or else everything mapped inside it */
export function output_of(segments: Segment[], start: number, end: number): [number, number] | null {
	const exact = segments.find(([s, e]) => s === start && e === end);
	if (exact) return [exact[2], exact[3]];
	let a = Infinity;
	let b = -Infinity;
	for (const [s, e, g, h] of segments) {
		if (s < start || e > end) continue;
		a = Math.min(a, g);
		b = Math.max(b, h);
	}
	return a < b ? [a, b] : null;
}

/** the phrase an output offset came from: the narrowest mapping over it, as the parser's phrase of that range */
export function phrase_at(source: string, segments: Segment[], at: number): Focus | null {
	let best: Segment | null = null;
	for (const seg of segments) {
		if (seg[2] > at || seg[3] <= at) continue;
		if (!best || seg[3] - seg[2] < best[3] - best[2]) best = seg;
	}
	if (!best) return null;
	const [start, end] = best;
	// the deepest phrase on that range, so a list's only item wins over the list, and text over nothing
	const phrases = settled(read(source)).phrases;
	const exact = phrases.filter((p) => p.start === start && p.end === end).sort((a, b) => b.depth - a.depth)[0];
	if (exact) return { start, end, kind: exact.kind };
	// a mapping with no phrase of its own, like a list item's text, lights the innermost phrase around it
	const around = phrases
		.filter((p) => p.kind !== 'text' && p.start <= start && end <= (p.end ?? source.length))
		.sort((a, b) => b.depth - a.depth)[0];
	return around ? { start: around.start, end: around.end ?? source.length, kind: around.kind } : null;
}

/** split the output where mappings start and end, so the page can point at it by offset */
export function cuts(code: string, segments: Segment[]): [number, number][] {
	const at = new Set([0, code.length]);
	for (const [, , g, h] of segments) {
		at.add(g);
		at.add(h);
	}
	const sorted = [...at].sort((a, b) => a - b);
	return sorted.slice(1).map((end, i) => [sorted[i], end]);
}
