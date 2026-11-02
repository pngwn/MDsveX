// the two lab pages as data, so three directions draw the same content. Every
// `md` string is the real page's prose, split to fit a form and otherwise as
// written; build.server.ts compiles it with mdsvex. Every example is compiled
// by mdsvex too, and every CommonMark reading is micromark's
import type { Tone } from '$lib/design/score/kinds';
import type { Segment } from '$lib/design/atlas/types';

/** markdown, compiled to html at build time */
export type Md = string;

/** which compile an example takes: mdsvex's defaults, or the guide's two templates */
export type Setup = 'plain' | 'templates';

export interface ExampleSpec {
	/** the svx as written */
	source: string;
	/** the file it stands for, said over it */
	file?: string;
	setup?: Setup;
	/** shown as its score first, as the docs' ```svx score does */
	scored?: boolean;
	/** taken from a sentence of the page's own prose, to show what the sentence says */
	from_prose?: boolean;
}

/** code that is read, not compiled: a config, a component */
export interface CodeSpec {
	lang: string;
	code: string;
	file?: string;
}

/** a concept: an atlas plate, a passage with its margin, a lesson */
export interface Unit {
	id: string;
	/** the typed mark that stands for it */
	mark: string;
	tone: Tone;
	title: string;
	lede?: Md;
	example?: ExampleSpec;
	code?: CodeSpec[];
	/** prose after the example */
	body?: Md;
	/** where it stops holding */
	edges?: Md[];
	/** an edge the compile can show: a source and the error it gives */
	error?: ExampleSpec;
	commonmark?: Md;
	see?: Md;
	/** for the workbook: what to change in the example, and what it shows */
	try?: { change: Md; source?: string }[];
}

/** a difference from CommonMark: one source, read both ways */
export interface ContrastSpec {
	id: string;
	mark: string;
	tone: Tone;
	/** what the table's "you write" column said */
	write: Md;
	source: string;
	/** a '^' under each character that makes the difference, line for line with the source */
	cue: string;
	/** CommonMark's reading, as the table said it */
	commonmark: Md;
	/** mdsvex's reading, as the table said it */
	mdsvex: Md;
	/** what to write instead */
	fix?: Md;
	/** the reading CommonMark gives is GFM's, the autolink */
	gfm?: boolean;
}

/** a row of "Added to CommonMark" */
export interface AddedSpec {
	id: string;
	mark: string;
	tone: Tone;
	write: Md;
	get: Md;
}

export interface Section {
	id: string;
	title: string;
	lede?: Md;
	units: Unit[];
	contrasts?: ContrastSpec[];
	added?: AddedSpec[];
	/** prose after the section's units */
	after?: Md;
	/** for the workbook: one example for a section with none of its own, made from its own words */
	bench?: ExampleSpec;
}

export interface PageSpec {
	slug: 'markdown' | 'templates';
	kicker: 'Learn' | 'Guides';
	/** the real page, for the nav */
	href: string;
	title: string;
	lede: Md[];
	sections: Section[];
}

// what the build makes of it

export interface BuiltExample {
	source: string;
	file?: string;
	setup: Setup;
	scored: boolean;
	from_prose: boolean;
	/** the source highlighted, as the docs set a fence */
	source_html: string;
	/** what mdsvex compiles it to, and the mappings that let the score wash it */
	code: string;
	segments: Segment[];
	/** the compile's error, for an edge that is one */
	error?: string;
}

export interface BuiltUnit extends Omit<Unit, 'example' | 'error' | 'code'> {
	example?: BuiltExample;
	error?: BuiltExample;
	code?: { file?: string; html: string }[];
}

export interface Reading {
	/** the html as the parser's compile gives it, laid out a block per line */
	html: string;
	/** the html highlighted */
	html_code: string;
}

export interface BuiltContrast extends ContrastSpec {
	ranges: [number, number][];
	source_html: string;
	commonmark_reading: Reading;
	mdsvex_reading: Reading;
}

export interface BuiltSection extends Omit<Section, 'units' | 'contrasts' | 'bench'> {
	bench?: BuiltExample;
	units: BuiltUnit[];
	contrasts?: BuiltContrast[];
}

export interface BuiltPage extends Omit<PageSpec, 'sections'> {
	sections: BuiltSection[];
}
