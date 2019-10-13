const visit = require('unist-util-visit');

export function mdsvex_transformer() {
	return transformer;

	function transformer(tree) {
		return tree;
	}
}
