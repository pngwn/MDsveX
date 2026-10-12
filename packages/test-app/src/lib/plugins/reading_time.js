/** @import { Bundle, NodeView } from "mdsvex" */

/**
 * the words a reader sees in the inline content of a node
 * @param {NodeView} node
 * @returns {number}
 */
function words_in(node) {
	let count = 0;
	for (let child = node.first_child; child !== null; child = child.next) {
		const type = child.type;
		if (type === "text" || type === "code_span") {
			const words = child.text_content.match(/\S+/g);
			if (words !== null) count += words.length;
		} else if (type !== "paragraph" && type !== "list")
			count += words_in(child);
	}
	return count;
}

/**
 * a reading time as data, the words of every heading, paragraph and list item
 * @param {number} words_per_minute
 * @returns {Bundle}
 */
export function reading_time(words_per_minute = 200) {
	/** @type {{ parse(node: NodeView, ctx: any): void }} */
	const count = {
		parse(node, ctx) {
			const words = (ctx.data.words ?? 0) + words_in(node);
			ctx.data.words = words;
			ctx.data.minutes = Math.max(1, Math.ceil(words / words_per_minute));
		},
	};
	return {
		name: "reading_time",
		// the tree is complete, so every text node is there to count
		parse: {
			sequential: true,
			heading: count,
			paragraph: count,
			list_item: count,
		},
	};
}
