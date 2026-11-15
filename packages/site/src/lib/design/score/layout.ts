// where a reading goes on the page, from 05's engrave.ts. The reading comes from
// reading.ts, this file only decides where it goes:
//
// - system, one run of the underlay with the phrases over it, a source line or
//   part of one, the way a score breaks a long passage across the page
// - stroke, one phrase as it is drawn: a line from its first character to its
//   last, a bar where the node opens, a bar where it closes, its name
// - bar line, the end of a block; the last one is the double bar of the end
import { spoken, tone, type Tone } from './kinds';
import type { Bar, Phrase, Voice } from './reading';

export type Ink = Voice | 'text';

export interface Stroke {
	key: string;
	kind: string;
	tone: Tone;
	start: number;
	/** null while the node is still open */
	end: number | null;
	/** 1 for the outermost row */
	depth: number;
	ink: Ink;
	/** takes lines of its own, only blocks are nested */
	block: boolean;
	name: string;
	/** a guess, only drawn as one while streamed */
	pending?: boolean;
	/** taken back, only while streamed */
	ghost?: boolean;
}

export interface System {
	start: number;
	end: number;
	/** the last system of a block, a bar line closes it */
	closes: boolean;
	/** the last system of the piece, a double bar */
	fine: boolean;
	/** it ends where its source line does, so a node that takes the newline closes here */
	eol: boolean;
}

/** break the source into systems of at most `cols` characters, at a space when there is one */
export function systems(source: string, cols: number): System[] {
	const out: System[] = [];
	let at = 0;
	const lines = source.split('\n');
	lines.forEach((line, n) => {
		const begin = at;
		at += line.length + 1;
		if (line.length === 0) {
			// a blank line ends a block
			if (out.length) out[out.length - 1].closes = true;
			return;
		}
		let s = 0;
		while (s < line.length) {
			let e = Math.min(line.length, s + cols);
			if (e < line.length) {
				const space = line.lastIndexOf(' ', e);
				if (space > s) e = space + 1;
			}
			out.push({ start: begin + s, end: begin + e, closes: false, fine: false, eol: e === line.length });
			s = e;
		}
		if (n === lines.length - 1 || lines[n + 1] === '') out[out.length - 1].closes = true;
	});
	if (out.length) {
		out[out.length - 1].closes = true;
		out[out.length - 1].fine = true;
	}
	return out;
}

function stroke(p: Phrase, key: string): Stroke {
	const text = p.kind === 'text';
	return {
		key,
		kind: p.kind,
		tone: tone(p.kind),
		start: p.start,
		end: p.end,
		depth: p.depth,
		ink: text ? 'text' : p.voice,
		block: !p.inline && !text,
		name: text ? 'text' : spoken(p),
	};
}

/** the parser's phrases in one bar as strokes, the streaming marks only when streamed */
export function strokes(bar: Bar, streaming: boolean): Stroke[] {
	const out = bar.phrases.map((p) => ({ ...stroke(p, `p${p.id}`), pending: streaming && p.pending }));
	if (streaming) for (const g of bar.ghosts) out.push({ ...stroke(g, `g${g.id}`), pending: false, ghost: true });
	return out;
}

/** one stroke as it falls in one system, in columns from the system's start */
export interface Placed {
	stroke: Stroke;
	x0: number;
	x1: number;
	/** the node opens in this system */
	head: boolean;
	/** it closes in this system */
	tail: boolean;
}

export function place(stroke: Stroke, sys: System, fed: number): Placed | null {
	const s = stroke.start;
	const e = stroke.end ?? fed;
	// an empty node, like a paragraph the parser has just opened, still gets its head
	if (s >= sys.end || e < sys.start || (e === sys.start && s < sys.start)) return null;
	const x0 = Math.max(s, sys.start) - sys.start;
	const x1 = Math.min(e, sys.end) - sys.start;
	return {
		stroke,
		x0,
		x1: Math.max(x1, x0 + (stroke.end === null ? 0 : 1)),
		head: s >= sys.start,
		tail: stroke.end !== null && e <= sys.end + (sys.eol ? 1 : 0),
	};
}
