// what the docs plugin compiles an example with, and how it reads a contrast's
// cue and a compile's mappings: shared by build/examples.js, which runs them at
// build time, and the components that draw what they made

/** the templates guide's two templates, as its vite.config.js names them, for a fence flagged `templates` */
export const TEMPLATES = {
	default: { specifier: "#lib/templates/Post.svelte", components: [] },
	docs: { specifier: "#lib/templates/Docs.svelte", components: [] },
};

/** the compile options of an example: mdsvex's defaults, or with the guide's templates */
export function options_for({ templates = false, file } = {}) {
	const filename = `/${file ?? "example.svx"}`;
	return templates ? { filename, strict_directives: false, templates: TEMPLATES } : { filename, strict_directives: false };
}

/**
 * a contrast's cue, a regular expression in the fence's meta, as the source
 * ranges it matches: `cue="##$"` is the closing hashes, `cue="^    "` an indent.
 * It is matched line by line, so `^` and `$` are a line's ends
 * @param {string} source
 * @param {string | undefined} cue
 * @returns {[number, number][]}
 */
export function cue_ranges(source, cue) {
	if (!cue) return [];
	const out = [];
	for (const match of source.matchAll(new RegExp(cue, "gm"))) {
		if (match[0].length) out.push([match.index, match.index + match[0].length]);
	}
	return out;
}

/**
 * the compile's mappings as [source start, end, output start, end], as the
 * atlas reads them (lib/design/atlas/compile.server.ts), so a phrase on the
 * score washes what it became
 * @param {{ mappings?: { sourceOffsets: number[], generatedOffsets: number[], lengths: number[], generatedLengths?: number[] }[] }} result
 * @returns {[number, number, number, number][]}
 */
export function segments_of(result) {
	const out = new Map();
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
