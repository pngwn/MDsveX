// what each construct becomes, from mdsvex's real compile, at build time. The
// page is prerendered, so none of this reaches the browser but its results.
//
// Beside the code, the compile's own mappings: for every node it renders, the
// source range it came from and the output range it became. They are what lets
// a phrase on the score wash its output (wash.ts), with nothing matched by text.
//
// The notes are markdown too, compiled the same way, so their `code` is set by
// mdsvex rather than by a regex here
import { compile } from 'mdsvex/compile';
import { create_highlight } from 'mdsvex/highlight';
import { load_math } from 'mdsvex/math';
import { constructs, type Construct } from './constructs';
import type { Compiled, Notes, Segment } from './types';

/**
 * the names a construct's output refers to: a directive's component and the
 * `docs` template, registered as the Vite plugin would from the site's modules
 */
const OPTIONS = {
	filename: '/atlas.svx',
	sourcemap: true,
	math: false as const,
	highlight: false as const,
	directives: [{ specifier: './directives.js', names: ['note', 'kbd', 'figure'] }],
	templates: { docs: { specifier: './templates/docs.svelte', components: ['h2'] } },
};

function segments_of(result: ReturnType<typeof compile>): Segment[] {
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

let renderers: Promise<{ math: Awaited<ReturnType<typeof load_math>>; highlight: ReturnType<typeof create_highlight> }> | null = null;

export async function compile_construct(c: Construct): Promise<Compiled> {
	renderers ??= load_math().then((math) => ({ math, highlight: create_highlight() }));
	const { math, highlight } = await renderers;
	const result = compile(c.source, {
		...OPTIONS,
		math: c.needs?.includes('math') ? math : false,
		highlight: c.needs?.includes('highlight') ? highlight : false,
	});
	const used: string[] = [];
	if (c.needs?.includes('math')) used.push('math, Temml');
	if (c.needs?.includes('highlight')) used.push('highlight');
	return { code: result.code, segments: segments_of(result), with: used };
}

/** a line of notes as inline markup: mdsvex's paragraph, without the paragraph */
function inline(text: string): string {
	const { code } = compile(text, { filename: '/note.svx' });
	return code.replace(/^<p>/, '').replace(/<\/p>\s*$/, '');
}

export function notes_of(c: Construct): Notes {
	return { what: inline(c.what), edges: c.edges.map(inline), commonmark: inline(c.commonmark) };
}

export async function compile_all() {
	return Promise.all(
		constructs.map(async (c) => ({ id: c.id, compiled: await compile_construct(c), notes: notes_of(c) })),
	);
}
