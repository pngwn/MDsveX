import visit from 'unist-util-visit';
import yaml from 'js-yaml';

export function mdsvex_transformer() {
	return transformer;

	function transformer(tree, vFile) {
		visit(tree, 'yaml', node => {
			try {
				vFile.data = yaml.safeLoad(node.value);
			} catch (e) {
				vFile.messages.push(['YAML failed to parse', e]);
			}
		});
		console.log(tree);
		return tree;
	}
}
