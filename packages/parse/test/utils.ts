import { PFMParser, parse_markdown_svelte } from '../src/main';
import { TreeBuilder } from '../src/tree_builder';
import { NodeBuffer } from '../src/utils';

/** Get the range of all children of the given parent */
export function get_child_range(
	nodes: NodeBuffer,
	parent: number,
	source: string
): { start: number; end: number; content: string } {
	const children = nodes.get_node(parent).children;
	const start = nodes.get_node(children[0]).start;
	const end = nodes.get_node(children[children.length - 1]).end;
	const content = source.slice(start, end);

	return { start, end, content };
}

/** Get the content and value of the given node */
export function get_content(
	nodes: NodeBuffer,
	node: number,
	source: string
): {
	content: string;
	value: string;
} {
	const start = nodes.get_node(node).start;
	const end = nodes.get_node(node).end;

	const content = source.slice(start, end);
	const value_start = nodes.get_node(node).value[0];
	const value_end = nodes.get_node(node).value[1];
	const value = source.slice(value_start, value_end);
	return { content, value };
}

/** Print all nodes in the given node buffer starting from the given parent */
export function print_all_nodes(
	nodes: NodeBuffer,
	source: string,
	parent: number = 0
) {
	const root = nodes.get_node(parent);
	console.log(root);
	const children = root.children || [];
	for (const child of children) {
		print_all_nodes(nodes, source, child);
	}
}

export function get_all_child_kinds(nodes: NodeBuffer, parent: number) {
	const root = nodes.get_node(parent);
	const children = root.children || [];
	const kinds = [];
	for (const child of children) {
		kinds.push(nodes.get_node(child).kind);
	}
	return kinds;
}

function node_shape(nodes: NodeBuffer, source: string, index: number): string {
	const node = nodes.get_node(index);
	if (node.kind === 'text') {
		return JSON.stringify(source.slice(node.value[0], node.value[1]));
	}
	const children = (node.children || []).map((child) =>
		node_shape(nodes, source, child)
	);
	return `${node.kind}(${children.join(' ')})`;
}

/**
 * the inline children of the first paragraph on one line with text as quoted strings, a chunk size
 * feeds the source in pieces
 * @example inline_shape('a *b*') // "a " strong_emphasis("b")
 */
export function inline_shape(input: string, chunk_size?: number): string {
	const source = input + '\n';
	let nodes: NodeBuffer;
	if (chunk_size === undefined) {
		nodes = parse_markdown_svelte(source).nodes;
	} else {
		const tree = new TreeBuilder(source.length);
		const parser = new PFMParser(tree);
		parser.init();
		for (let i = 0; i < source.length; i += chunk_size) {
			parser.feed(source.slice(i, i + chunk_size));
		}
		parser.finish();
		nodes = tree.get_buffer();
	}
	const paragraph = nodes.get_node(nodes.get_node().children[0]);
	return paragraph.children
		.map((child) => node_shape(nodes, source, child))
		.join(' ');
}
