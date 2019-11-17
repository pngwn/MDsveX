import visit from 'unist-util-visit';
import yaml from 'js-yaml';

export function parse_yaml() {
	return transformer;

	function transformer(tree, vFile) {
		visit(tree, 'yaml', node => {
			try {
				vFile.data.fm = yaml.safeLoad(node.value);
			} catch (e) {
				vFile.messages.push(['YAML failed to parse', e]);
			}
		});
	}
}
