import { Node, SvelteExpression } from 'svast';

export type WalkCallback = (node: Node, parent: Node | undefined) => void;

export function walk(node: Node, cb: WalkCallback, parent?: Node): Node {
	cb(node, parent);
	if (node.expression)
		walk(
			(node as { type: string; expression: SvelteExpression }).expression,
			cb,
			node
		);
	if (node.children) {
		for (let index = 0; index < (node.children as []).length; index++) {
			walk((node.children as [])[index], cb, node);
		}
	}
	if (node.value && Array.isArray(node.value)) {
		for (let index = 0; index < (node.value as []).length; index++) {
			walk((node.value as [])[index], cb, node);
		}
	} else if (node.value) {
		walk(node.value as Node, cb, node);
	}
	if (node.properties) {
		for (let index = 0; index < (node.properties as []).length; index++) {
			walk((node.properties as [])[index], cb, node);
		}
	}
	if (node.modifiers) {
		for (let index = 0; index < (node.modifiers as []).length; index++) {
			walk((node.modifiers as [])[index], cb, node);
		}
	}
	if (node.branches) {
		for (let index = 0; index < (node.branches as []).length; index++) {
			walk((node.branches as [])[index], cb, node);
		}
	}
	return node;
}
