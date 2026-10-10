import { parse_markdown_svelte } from '@mdsvex/parse';
import type { SyntaxOptions } from '@mdsvex/parse';

export interface PfmNode {
	type: string;
	start: number;
	end: number;
	/** the text of a leaf, like text and code */
	value?: string;
	children?: PfmNode[];
	[key: string]: unknown;
}

/**
 * the arena is not cloneable, so the tree is rebuilt as plain objects the ast view can walk,
 * syntax is the config, so the tree is the one the compile renders
 */
export function pfm_ast(input: string, syntax?: SyntaxOptions): PfmNode {
	const { nodes, source } = parse_markdown_svelte(input, syntax);

	function build(index: number): PfmNode {
		const node = nodes.get_node(index);
		const out: PfmNode = { type: node.kind, start: node.start, end: node.end };

		for (const [key, value] of Object.entries(node.metadata ?? {})) {
			if (value !== undefined) out[key] = value;
		}

		if (node.children.length > 0) {
			out.children = node.children.map(build);
			return out;
		}

		// containers span their children, so only leaves show their text
		const [value_start, value_end] = node.value;
		if (value_end > value_start)
			out.value = source.slice(value_start, value_end);
		return out;
	}

	return build(0);
}
