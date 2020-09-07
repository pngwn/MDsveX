import {
	Node,
	Text,
	Root,
	VoidBlock,
	Property,
	SvelteElement,
	Directive,
} from 'svast';

function render_props(props: (Property | Directive)[]): string {
	let attrs = '\n';
	attributes: for (let index = 0; index < props.length; index++) {
		if (props[index].type === 'svelteProperty') {
			attrs += props[index].name;

			if (props[index].value.length > 0) {
				attrs += '="';
				values: for (
					let index2 = 0;
					index2 < props[index].value.length;
					index2++
				) {
					if (props[index].value[index2].type === 'text') {
						if (index2 > 0) {
							attrs += ' ';
						}
						attrs += props[index].value[index2].value;
					}

					if (props[index].value[index2].type === 'svelteExpression') {
						attrs += '{' + props[index].value[index2].value + '}';
						if (index2 < props[index].value.length - 1) {
						}
					}
				}
				attrs += '"';
			}
		}

		attrs += '\n';
	}
	return attrs;
}

function compile_node(node: Node): string | undefined {
	if (node.type === 'text') return (node as Text).value;
	if (node.type === 'svelteExpression') return '{' + node.value + '}';
	if (node.type === 'svelteVoidBlock')
		return '{@' + node.name + ' ' + (node as VoidBlock).expression.value + '}';

	if (node.type === 'svelteElement') {
		if (node.selfClosing === true)
			return (
				'<' +
				node.tagName +
				' ' +
				((node as SvelteElement).properties.length > 0
					? render_props((node as SvelteElement).properties)
					: '') +
				'/>'
			);
	}
}

function compile(tree: Root): string {
	if (tree.type === 'root') {
		let str = '';
		for (let index = 0; index < tree.children.length; index++) {
			str += compile_node(tree.children[index]);
		}
		return str;
	} else {
		throw new Error(
			`A svast tree must have a single 'root' node but instead got ${tree.type}`
		);
	}
}

export { compile_node as compileNode, compile };
