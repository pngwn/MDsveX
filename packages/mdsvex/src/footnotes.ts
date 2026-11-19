// the footnotes of a compile, numbered by footnote_index of @mdsvex/parse,
// what that finds wrong is a typed error here, or a warning

import { footnote_index } from '@mdsvex/parse/buf-utils';
import type { FootnoteProblem } from '@mdsvex/parse/buf-utils';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import type { FootnoteRender } from '@mdsvex/render/html-cursor';

export interface FootnoteOptions {
	/** the accessible name of the footnotes section, `Footnotes` when unset */
	label?: string;
	/**
	 * the accessible name of the link from a footnote back to a reference,
	 * `{n}` is the number of the reference, `Back to reference {n}` when unset
	 */
	back_label?: string;
	/**
	 * false renders a document a compile rejects, a reference with no
	 * definition is numbered and linked and the first of two definitions of a
	 * label is taken, each with a warning, for a preview of a document that is
	 * still being written
	 */
	strict?: boolean;
}

export type FootnoteErrorCode =
	| 'footnote_undefined'
	| 'footnote_duplicate'
	| 'footnote_empty';

/** where a footnote problem is, line and column from 1 */
export interface FootnoteProblemAt {
	code: FootnoteErrorCode;
	label: string;
	line: number;
	column: number;
}

/**
 * a footnote reference with no definition, a second definition of a label,
 * or a definition with no text, the parser reads a reference by its syntax
 * alone, so `[^abc]` in prose is one and has to be escaped or put in code
 */
export class FootnoteError extends Error {
	code: FootnoteErrorCode;
	label: string;
	/** 1 based line in the document, of the reference or of the definition */
	line: number;
	/** 1 based column */
	column: number;
	/** every such reference and definition of the document, in its order, the error is the first */
	problems: FootnoteProblemAt[];

	constructor(message: string, problems: FootnoteProblemAt[]) {
		super(message);
		const first = problems[0];
		this.name = 'FootnoteError';
		this.code = first.code;
		this.label = first.label;
		this.line = first.line;
		this.column = first.column;
		this.problems = problems;
	}
}

/** a problem a compile reports without failing, start indexes the source */
export interface FootnoteWarning {
	code: FootnoteProblem['code'];
	message: string;
	start: number;
}

/** what a render takes, with the warnings of the document beside it */
export interface Footnotes extends FootnoteRender {
	warnings: FootnoteWarning[] | null;
}

function message_of(problem: FootnoteProblem): string {
	const written = '[^' + problem.label + ']';
	switch (problem.code) {
		case 'footnote_undefined':
			return `the footnote reference ${written} has no definition, add \`${written}: text\`, or escape the bracket as \`\\${written}\` if it is not a footnote`;
		case 'footnote_duplicate':
			return `the footnote ${written} is defined twice, a label has one definition`;
		case 'footnote_empty':
			return `the footnote ${written} has no text, write it after \`${written}:\` or on the lines below indented by four spaces`;
		default:
			return `the footnote ${written} is never referenced, so it is not rendered`;
	}
}

function position(
	source: string,
	start: number
): { line: number; column: number } {
	let line = 1;
	let line_start = 0;
	for (
		let i = source.indexOf('\n');
		i !== -1 && i < start;
		i = source.indexOf('\n', i + 1)
	) {
		line++;
		line_start = i + 1;
	}
	return { line, column: start - line_start + 1 };
}

/**
 * the footnotes of a parsed document, null for one with none
 * @throws FootnoteError for a reference with no definition, a label defined twice and a definition with no text, unless strict is false
 */
export function footnotes_of(
	nodes: NodeBuffer,
	source: string,
	options: FootnoteOptions | undefined,
	filename: string | undefined,
	moved: Map<string, string> | null = null
): Footnotes | null {
	const strict = options === undefined || options.strict !== false;
	const index = footnote_index(nodes);
	if (index === null) return null;
	let warnings: FootnoteWarning[] | null = null;
	let failed: FootnoteProblemAt[] | null = null;
	let first = '';
	for (const problem of index.problems) {
		const start = nodes.start_at(problem.node);
		if (strict && problem.code !== 'footnote_unused') {
			const at = position(source, start);
			if (failed === null) {
				failed = [];
				first =
					message_of(problem) +
					' (' +
					(filename === undefined ? 'line ' : filename + ':') +
					at.line +
					')';
			}
			failed.push({ code: problem.code, label: problem.label, ...at });
		} else {
			if (warnings === null) warnings = [];
			warnings.push({
				code: problem.code,
				message: message_of(problem),
				start,
			});
		}
	}
	if (failed !== null) throw new FootnoteError(first, failed);
	// a preview numbers a reference that has no definition too
	const numbered =
		strict || index.problems.length === 0
			? index
			: footnote_index(nodes, true)!;
	const out = numbered as Footnotes;
	out.warnings = warnings;
	// a heading was given the id of a footnote first
	if (moved !== null) out.moved = moved;
	if (options !== undefined) {
		if (options.label !== undefined) out.label = options.label;
		if (options.back_label !== undefined) out.back_label = options.back_label;
	}
	return out;
}
