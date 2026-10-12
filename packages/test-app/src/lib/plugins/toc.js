/** @import { Bundle, NodeView } from "mdsvex" */

/**
 * the text a reader sees in a node
 * @param {NodeView} node
 * @returns {string}
 */
export function text_of(node) {
	let out = "";
	for (let child = node.first_child; child !== null; child = child.next) {
		const type = child.type;
		out +=
			type === "text" || type === "code_span"
				? child.text_content
				: text_of(child);
	}
	return out;
}

/**
 * a table of contents as data, every heading with its depth, text and id
 * @returns {Bundle}
 */
export function toc() {
	return {
		name: "toc",
		parse: {
			// heading_ids sets the ids after the parse, a fused handler would read none
			sequential: true,
			heading: {
				parse(node, ctx) {
					const headings = (ctx.data.headings ??= []);
					headings.push({
						depth: node.depth,
						text: text_of(node),
						id: node.attrs.id,
					});
				},
			},
		},
	};
}
