import type { Bundle, NodeView } from '../src/main';

export interface TocHeading {
	depth: number;
	text: string;
	id: string | undefined;
}

/** the text a reader sees, the same from a source tree and a wire tree */
function text_of(node: NodeView): string {
	let out = '';
	for (let child = node.first_child; child !== null; child = child.next) {
		const type = child.type;
		out +=
			type === 'text' || type === 'code_span'
				? child.text_content
				: text_of(child);
	}
	return out;
}

/**
 * a table of contents as data, every heading is added to headings and
 * one that skips a level is reported
 *
 * the ids come from the heading_ids option, or from a plugin that sets them
 *
 * @example
 * const { data } = compile(source, { heading_ids: true, plugins: [toc()] });
 * data.toc.headings; // [{ depth: 1, text: 'Title', id: 'title' }]
 */
export function toc(): Bundle {
	return {
		name: 'toc',
		parse: {
			// heading_ids sets the ids after the parse, a fused handler would read none
			sequential: true,
			heading: {
				parse(node, ctx) {
					const depth = node.depth!;
					const headings = (ctx.data.headings ?? []) as TocHeading[];
					const last = headings[headings.length - 1];
					if (last !== undefined && depth > last.depth + 1) {
						ctx.warn(
							'skipped_heading_level',
							`a level ${depth} heading follows a level ${last.depth} heading`,
							node
						);
					}
					ctx.add('headings', {
						depth,
						text: text_of(node),
						id: node.attrs.id,
					});
				},
			},
		},
	};
}
