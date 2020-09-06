import { Node, SvelteExpression } from 'svast';
import { walk } from './walk';

export function clean_positions(node: Node): Node {
	return walk(node, (node) => {
		if (node.position) delete node.position;
	});
}
