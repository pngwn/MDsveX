// the link and image references of a compile that no definition resolved,
// the parser reads a reference by its syntax alone, so each is a typed error

import { undefined_references } from '@mdsvex/parse/buf-utils';
import type { NodeBuffer } from '@mdsvex/parse/utils';

/** where a reference with no definition is, line and column from 1 */
export interface ReferenceProblemAt {
	code: 'reference_undefined';
	label: string;
	line: number;
	column: number;
}

/**
 * a link or image reference whose label has no definition, `[text][label]`
 * and `[label][]` are references wherever they stand, so brackets that are
 * not one are escaped or put in code
 */
export class LinkReferenceError extends Error {
	code: 'reference_undefined';
	label: string;
	/** 1 based line of the reference in the document */
	line: number;
	/** 1 based column */
	column: number;
	/** every such reference of the document, in its order, the error is the first */
	problems: ReferenceProblemAt[];

	constructor(message: string, problems: ReferenceProblemAt[]) {
		super(message);
		const first = problems[0];
		this.name = 'LinkReferenceError';
		this.code = first.code;
		this.label = first.label;
		this.line = first.line;
		this.column = first.column;
		this.problems = problems;
	}
}

/** @throws LinkReferenceError when a reference of the document has no definition */
export function check_references(
	nodes: NodeBuffer,
	source: string,
	filename: string | undefined,
	position: (source: string, start: number) => { line: number; column: number }
): void {
	const found = undefined_references(nodes, source);
	if (found.length === 0) return;
	const problems: ReferenceProblemAt[] = [];
	for (const { label, node } of found)
		problems.push({
			code: 'reference_undefined',
			label,
			...position(source, nodes.start_at(node)),
		});
	const first = found[0];
	const start = nodes.start_at(first.node);
	const written = source.slice(start, nodes.end_at(first.node));
	const escaped =
		(first.image ? '!\\[' : '\\[') + written.slice(first.image ? 2 : 1);
	throw new LinkReferenceError(
		`the reference ${written} has no definition, add \`[${first.label}]: url\`, or escape the bracket as \`${escaped}\` if it is not a reference` +
			' (' +
			(filename === undefined ? 'line ' : filename + ':') +
			problems[0].line +
			')',
		problems
	);
}
