import type { Bundle, NodeView } from '../src/main';

/** the words a reader sees in the inline content of a node */
function words_in(node: NodeView): number {
	let count = 0;
	for (let child = node.first_child; child !== null; child = child.next) {
		const type = child.type;
		if (type === 'text' || type === 'code_span') {
			const words = child.text_content.match(/\S+/g);
			if (words !== null) count += words.length;
		} else if (type !== 'paragraph' && type !== 'list')
			count += words_in(child);
	}
	return count;
}

/**
 * a reading time as data, the words of every heading, paragraph and list
 * item, and the minutes they take at a reading speed
 *
 * @example
 * const { data } = compile(source, { plugins: [reading_time()] });
 * data.reading_time; // { words: 420, minutes: 2 }
 */
export function reading_time(words_per_minute = 200): Bundle {
	const count: { parse(node: NodeView, ctx: any): void } = {
		parse(node, ctx) {
			const words = (ctx.data.words ?? 0) + words_in(node);
			ctx.set('words', words);
			ctx.set('minutes', Math.max(1, Math.ceil(words / words_per_minute)));
		},
	};
	return {
		name: 'reading_time',
		// the tree is complete, so every text node is there to count
		parse: {
			sequential: true,
			heading: count,
			paragraph: count,
			list_item: count,
		},
	};
}
