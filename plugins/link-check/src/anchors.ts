import type { NodeView } from 'mdsvex/compile';

/** an id the author typed, one with a svelte expression is only known when the page renders */
function typed(value: unknown): value is string {
	return typeof value === 'string' && value !== '' && value.indexOf('{') === -1;
}

/**
 * every id a finished tree gives an element, those of headings and what
 * plugins set, the id of an element typed as html and the name of an `<a>`,
 * the id arg of a directive and the id of each footnote, links gets the
 * links in document order when it is given
 */
export function anchors_of(
	parent: NodeView,
	ids: Set<string>,
	links?: NodeView[]
): void {
	for (let child = parent.first_child; child !== null; child = child.next) {
		const type = child.type;
		if (type === 'text') continue;
		const attrs = child.attrs;
		if (typed(attrs.id)) ids.add(attrs.id);
		switch (type) {
			case 'link':
				links?.push(child);
				break;
			case 'html': {
				const written = attrs.attributes as Record<string, unknown> | undefined;
				if (written !== undefined) {
					if (typed(written.id)) ids.add(written.id);
					if (attrs.tag === 'a' && typed(written.name)) ids.add(written.name);
				}
				break;
			}
			case 'directive_inline':
			case 'directive_leaf':
			case 'directive_container': {
				const args = attrs.args as Record<string, string> | undefined;
				if (args !== undefined && typed(args.id)) ids.add(args.id);
				break;
			}
			case 'footnote_definition':
				if (typed(attrs.label)) ids.add('fn-' + attrs.label);
				break;
		}
		anchors_of(child, ids, links);
	}
}
