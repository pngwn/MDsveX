import { node_buffer } from '../src/utils';

/** Get the range of all children of the given parent */
export function get_child_range(
	nodes: node_buffer,
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
	nodes: node_buffer,
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
	nodes: node_buffer,
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

export function get_all_child_kinds(nodes: node_buffer, parent: number) {
	const root = nodes.get_node(parent);
	const children = root.children || [];
	const kinds = [];
	for (const child of children) {
		kinds.push(nodes.get_node(child).kind);
	}
	return kinds;
}
