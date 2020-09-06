import { Node, SvelteExpression } from 'svast';

export function clean_positions(node: Node): Node {
	if (node.position) delete node.position;
	if (node.expression)
		clean_positions(
			(node as { type: string; expression: SvelteExpression }).expression
		);
	if (node.children) {
		for (let index = 0; index < (node.children as []).length; index++) {
			clean_positions((node.children as [])[index]);
		}
	}
	if (node.value && Array.isArray(node.value)) {
		for (let index = 0; index < (node.value as []).length; index++) {
			clean_positions((node.value as [])[index]);
		}
	}
	if (node.properties) {
		for (let index = 0; index < (node.properties as []).length; index++) {
			clean_positions((node.properties as [])[index]);
		}
	}
	if (node.modifiers) {
		for (let index = 0; index < (node.modifiers as []).length; index++) {
			clean_positions((node.modifiers as [])[index]);
		}
	}
	if (node.branches) {
		for (let index = 0; index < (node.branches as []).length; index++) {
			clean_positions((node.branches as [])[index]);
		}
	}

	return node;
}
