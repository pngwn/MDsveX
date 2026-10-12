/** a place in the source of a document, line from 1 and column from 0 */
export interface TocPoint {
	offset: number;
	line: number;
	column: number;
}

/** one heading of a document, in the order they are written */
export interface TocHeading {
	/** 1 to 6 */
	depth: number;
	/** the id the heading has in the page, a link to it is `#` and the id */
	id: string;
	/** the text a reader sees, without markup */
	text: string;
	/** where the heading is in the source, a tree built from the wire has none */
	position?: { start: TocPoint; end: TocPoint };
}

/** a heading with the deeper headings that follow it */
export interface TocNode extends TocHeading {
	children: TocNode[];
}

/**
 * nests a flat list of headings, each one under the nearest heading before it
 * that is less deep, so a heading that skips a level still has a parent
 *
 * @example
 * toc_tree(plugin_data.toc.headings);
 * // [{ depth: 2, id: 'install', text: 'Install', children: [{ depth: 3, ... }] }]
 */
export function toc_tree(headings: readonly TocHeading[]): TocNode[] {
	const roots: TocNode[] = [];
	const open: TocNode[] = [];
	for (const heading of headings) {
		const node: TocNode = { ...heading, children: [] };
		while (open.length > 0 && open[open.length - 1].depth >= node.depth)
			open.pop();
		if (open.length === 0) roots.push(node);
		else open[open.length - 1].children.push(node);
		open.push(node);
	}
	return roots;
}
