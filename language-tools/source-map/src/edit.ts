/**
 * text edits over generated code that carry its mappings along, edits only
 * replace or insert generated text, so a mapping either moves past an edit or
 * contains it whole
 */

import type { Mapping } from '@mdsvex/render/mappings';

export interface Edit<D> {
	/** offsets in the code before any edit, start === end inserts */
	start: number;
	end: number;
	text: string;
	/** mappings into text, their generated offsets relative to its start */
	mappings?: Mapping<D>[];
}

/** a plain copy, core mappings read their arrays through accessors */
export function plain<D>(m: Mapping<D>): Mapping<D> {
	const out: Mapping<D> = {
		sourceOffsets: m.sourceOffsets.slice(),
		generatedOffsets: m.generatedOffsets.slice(),
		lengths: m.lengths.slice(),
		data: m.data,
	};
	if (m.generatedLengths) out.generatedLengths = m.generatedLengths.slice();
	return out;
}

export function apply_edits<D>(
	code: string,
	mappings: Mapping<D>[],
	edits: Edit<D>[]
): { code: string; mappings: Mapping<D>[] } {
	if (edits.length === 0) return { code, mappings };
	const sorted = edits
		.slice()
		.sort((a, b) => a.start - b.start || a.end - b.end);

	let out = '';
	let at = 0;
	const placed: number[] = [];
	for (const e of sorted) {
		out += code.slice(at, e.start);
		placed.push(out.length);
		out += e.text;
		at = e.end;
	}
	out += code.slice(at);

	// a start moves past every edit ending at or before it, an end past every edit starting before it
	const start_of = (p: number) => {
		let d = 0;
		for (const e of sorted) {
			if (e.end <= p) d += e.text.length - (e.end - e.start);
			else break;
		}
		return p + d;
	};
	const end_of = (p: number) => {
		let d = 0;
		for (const e of sorted) {
			if (e.start < p) d += e.text.length - (e.end - e.start);
			else break;
		}
		return p + d;
	};

	const result: Mapping<D>[] = [];
	for (const m of mappings) {
		const moved = plain(m);
		for (let i = 0; i < moved.generatedOffsets.length; i++) {
			const g = moved.generatedOffsets[i];
			const len = moved.generatedLengths
				? moved.generatedLengths[i]
				: moved.lengths[i];
			const s = start_of(g);
			const e = len === 0 ? s : end_of(g + len);
			moved.generatedOffsets[i] = s;
			if (e - s !== len) moved.generatedLengths ??= moved.lengths.slice();
			if (moved.generatedLengths) moved.generatedLengths[i] = e - s;
		}
		result.push(moved);
	}
	for (let k = 0; k < sorted.length; k++) {
		const e = sorted[k];
		if (!e.mappings) continue;
		for (const m of e.mappings) {
			const moved = plain(m);
			moved.generatedOffsets = moved.generatedOffsets.map((g) => g + placed[k]);
			result.push(moved);
		}
	}
	return { code: out, mappings: result };
}
