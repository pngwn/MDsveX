import {
	Node,
	Text,
	Root,
	VoidBlock,
	Property,
	SvelteElement,
	Directive,
	SvelteExpression,
	Literal,
} from 'svast';

function render_attr_values(values: (Text | SvelteExpression)[]): string {
	let value = '';

	for (let index = 0; index < values.length; index++) {
		if (values[index].type === 'text') {
			value += values[index].value;
		}

		if (values[index].type === 'svelteExpression') {
			value += '{' + values[index].value + '}';
		}
	}

	return value;
}

function render_modifiers(modifiers: Literal[]): string {
	let mod_string = '';
	for (let index = 0; index < modifiers.length; index++) {
		mod_string += '|' + modifiers[index].value;
	}

	return mod_string;
}

function render_props(props: (Property | Directive)[]): string {
	let attrs = '\n';

	for (let index = 0; index < props.length; index++) {
		if (props[index].type === 'svelteProperty') {
			attrs += props[index].name;
		}

		if (props[index].type === 'svelteDirective') {
			attrs += props[index].name + ':' + props[index].specifier;
		}

		if (props[index].modifiers.length > 0) {
			attrs += render_modifiers(props[index].modifiers);
		}

		if (props[index].value.length > 0) {
			attrs += '="' + render_attr_values(props[index].value) + '"';
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
