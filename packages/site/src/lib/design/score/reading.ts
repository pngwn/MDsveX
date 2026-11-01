// a document read as a score, from 05's score.ts. The vocabulary:
//
// - reading, everything the parser said about one source, a bar per chunk fed
// - bar, the state after one chunk: the phrases open or closed so far
// - phrase, one node the parser opened, from the character it starts on to the
//   one it ends on, drawn as a line over the text it covers
// - guess, a phrase still pending, the parser may take it back
// - ghost, a phrase it took back, kept struck through so the change can be
//   read; a list item's paragraph, unwrapped when its list turns out tight,
//   leaves none
// - held, characters fed that no node accounts for yet, under a fermata
// - marks, the characters a phrase owns as syntax rather than text, a `*` or `{`
// - voice, the family a node belongs to
// - text phrase, a run of text, so the reading is complete, drawn quieter than
//   the structure over it
//
// All of it comes from pfm_stream, nothing here guesses at what the parser does.
// The settled reading feeds the whole source as one chunk; only a streamed one
// feeds it a character at a time, which copies the tree once per character
import { pfm_stream, type KindName, type LiveNode, type Op } from '../pfm';

export type Voice = 'block' | 'inline' | 'svelte' | 'directive' | 'document';

const VOICES: Partial<Record<KindName, Voice>> = {
	heading: 'block', paragraph: 'block', list: 'block', list_item: 'block',
	block_quote: 'block', code_fence: 'block', thematic_break: 'block', table: 'block',
	table_header: 'block', table_row: 'block', table_cell: 'block',
	footnote_definition: 'block', definition: 'block', html_comment: 'block',
	emphasis: 'inline', strong_emphasis: 'inline', code_span: 'inline', link: 'inline',
	image: 'inline', strikethrough: 'inline', superscript: 'inline', subscript: 'inline',
	footnote_reference: 'inline', hard_break: 'inline',
	mustache: 'svelte', svelte_tag: 'svelte', svelte_block: 'svelte',
	svelte_branch: 'svelte', html: 'svelte', import_statement: 'svelte',
	directive_inline: 'directive', directive_leaf: 'directive',
	directive_container: 'directive', directive_label: 'directive',
	frontmatter: 'document',
};

// the kinds that take whole lines
const BLOCK_KINDS = new Set<KindName>([
	'heading', 'paragraph', 'list', 'list_item', 'block_quote', 'code_fence', 'thematic_break',
	'table', 'table_header', 'table_row', 'footnote_definition', 'definition',
	'directive_leaf', 'directive_container', 'frontmatter', 'svelte_block', 'svelte_branch',
	'import_statement',
]);

// text is the underlay itself, and newlines between blocks are rests, not phrases
const SILENT = new Set<KindName>(['root', 'text', 'line_break', 'soft_break']);

export interface Phrase {
	id: number;
	kind: KindName;
	voice: Voice;
	/** 1 is a child of the root */
	depth: number;
	/** true when it sits inside a line of text rather than taking lines of its own */
	inline: boolean;
	start: number;
	/** null while the node is open */
	end: number | null;
	/** a guess, the parser may still take it back */
	pending: boolean;
	/** an element's tag or a directive's name, when it has one */
	name?: string;
}

export interface Ghost extends Phrase {
	/** how far the parser had read when it took this one back */
	revoked_at: number;
}

export interface Bar {
	/** characters fed so far */
	fed: number;
	finished: boolean;
	ops: Op[];
	phrases: Phrase[];
	/** revoked phrases up to and including this bar, kept as struck ghosts */
	ghosts: Ghost[];
	/** fed characters the parser has said nothing about yet */
	held: [number, number] | null;
	/** per character, the voice of the innermost phrase it is markup for, null for text */
	marks: (Voice | null)[];
}

export interface Reading {
	source: string;
	bars: Bar[];
}

function walk(node: LiveNode, depth: number, out: Phrase[]) {
	let run: Phrase | undefined;
	for (const child of node.children) {
		// text arrives a few characters at a time, siblings with nothing between are one run
		if (child.kind === 'text' && child.id !== null) {
			if (run && run.end === child.start) run.end = child.end;
			else {
				run = { id: child.id, kind: 'text', voice: 'document', depth: depth + 1, inline: true, start: child.start, end: child.end, pending: false };
				out.push(run);
			}
			continue;
		}
		if (child.kind !== 'soft_break') run = undefined;
		const voice = VOICES[child.kind];
		if (!SILENT.has(child.kind) && voice && child.id !== null) {
			// an element alone in a paragraph is inline there, at the root it is a block
			const inline = !BLOCK_KINDS.has(child.kind) && !(child.kind === 'html' && node.kind === 'root');
			const name = child.attrs.tag ?? child.attrs.name;
			out.push({
				id: child.id, kind: child.kind, voice, depth: depth + 1, inline,
				start: child.start, end: child.end < 0 ? null : child.end,
				pending: child.pending,
				name: typeof name === 'string' ? name : undefined,
			});
			walk(child, depth + 1, out);
		} else {
			walk(child, depth, out);
		}
	}
}

/** which characters are markup, the delimiters a phrase owns that no text covers */
function markup(root: LiveNode, fed: number, length: number): (Voice | null)[] {
	const marks: (Voice | null)[] = new Array(length).fill(null);
	const text = new Array<boolean>(length).fill(false);
	const visit = (node: LiveNode) => {
		const end = node.end < 0 ? fed : node.end;
		const voice = VOICES[node.kind];
		if (node.kind === 'text') for (let i = node.start; i < end; i++) text[i] = true;
		// a paragraph has no marks of its own, so a delimiter given back to it is text
		else if (voice && !SILENT.has(node.kind) && node.kind !== 'paragraph')
			for (let i = node.start; i < end; i++) marks[i] = voice;
		const value = node.attrs.value;
		if (Array.isArray(value)) for (let i = value[0]; i < value[1]; i++) text[i] = true;
		node.children.forEach(visit);
	};
	visit(root);
	return marks.map((m, i) => (text[i] ? null : m));
}

/** fed characters no node covers yet, the parser is waiting to know */
function held_span(root: LiveNode, fed: number): [number, number] | null {
	let covered = 0;
	const visit = (node: LiveNode) => {
		for (const child of node.children) {
			const end = child.end < 0 ? fed : child.end;
			if (end > covered) covered = end;
			visit(child);
		}
	};
	visit(root);
	return fed - covered > 0 ? [covered, fed] : null;
}

// a player and the score it drives read the same source, and a page may draw one
// source twice, so the last few readings are kept
const kept = new Map<string, Reading>();
const KEEP = 32;

/** read a source, settled, or a character at a time keeping every bar when streamed */
export function read(source: string, { stream = false }: { stream?: boolean } = {}): Reading {
	const key = `${stream ? 's' : 'r'}${source}`;
	const known = kept.get(key);
	if (known) return known;
	const reading = parse(source, stream);
	kept.set(key, reading);
	if (kept.size > KEEP) kept.delete(kept.keys().next().value!);
	return reading;
}

function parse(source: string, stream: boolean): Reading {
	const frames = pfm_stream(source, stream ? 1 : Math.max(1, source.length));
	const bars: Bar[] = [];
	const ghosts: Ghost[] = [];
	let seen = new Map<number, Phrase>();

	frames.forEach((frame, i) => {
		const finished = i === frames.length - 1;
		const phrases: Phrase[] = [];
		walk(frame.tree, 0, phrases);

		// closes and revokes land in the same frame, so the ghost takes its end from the close
		const ends = new Map<number, number>();
		for (const op of frame.ops) {
			if (op.op === 'close') ends.set(op.id, op.end);
			if (op.op === 'revoke') {
				const last = seen.get(op.id);
				// a list item's paragraph is a guess that the list is loose, settled when
				// the list closes: committed if it is, revoked if it's tight. That revoke
				// gives nothing back, a paragraph has no delimiters and its text stays in
				// the item, so it leaves no ghost: the guess goes, as a committed one's
				// dashes go, and the finished bar is the settled reading
				if (last && last.kind !== 'paragraph')
					ghosts.push({ ...last, end: ends.get(op.id) ?? last.end ?? frame.fed, revoked_at: frame.fed });
			}
		}

		seen = new Map(phrases.map((p) => [p.id, p]));
		bars.push({
			fed: frame.fed, finished, ops: frame.ops, phrases, ghosts: [...ghosts],
			held: finished ? null : held_span(frame.tree, frame.fed),
			marks: markup(frame.tree, frame.fed, source.length),
		});
	});

	return { source, bars };
}

/** the last bar, the document as the parser settled it */
export function settled(r: Reading): Bar {
	return r.bars[r.bars.length - 1];
}
