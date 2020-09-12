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
	SvelteParent,
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

type Handler = (node: Node, compile_children: CompileChildren) => string;

const handlers: Record<string, Handler> = {
	text(node, compile_children) {
		return (node as Text).value;
	},
	svelteExpression(node, compile_children) {
		return '{' + node.value + '}';
	},
	svelteVoidBlock(node, compile_children) {
		return '{@' + node.name + ' ' + (node as VoidBlock).expression.value + '}';
	},
	svelteElement(node, compile_children) {
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

		return '';
	},
	svelteMeta(node, compile_children) {
		if (node.selfClosing === true) {
			return (
				'<svelte:' +
				node.tagName +
				' ' +
				((node as SvelteElement).properties.length > 0
					? render_props((node as SvelteElement).properties)
					: '') +
				'/>'
			);
		} else {
			return (
				'<svelte:' +
				node.tagName +
				' ' +
				((node as SvelteElement).properties.length > 0
					? render_props((node as SvelteElement).properties)
					: '') +
				'>' +
				((node as SvelteParent).children.length > 0
					? compile_children((node as SvelteParent).children)
					: '') +
				'\n' +
				'</svelte:' +
				node.tagName +
				'>'
			);
		}
	},
};

type CompileChildren = (nodes: Node[]) => string;

function compile_node(
	node: Node,
	compile_children: CompileChildren
): string | undefined {
	return handlers[node.type](node, compile_children);
}

function compile_children(children: Node[]) {
	let str = '';
	for (let index = 0; index < children.length; index++) {
		str += compile_node(children[index], compile_children);
	}
	return str;
}

function compile(tree: Root): string {
	if (tree.type === 'root') {
		return compile_children(tree.children);
	} else {
		throw new Error(
			`A svast tree must have a single 'root' node but instead got "${tree.type}"`
		);
	}
}

export { compile_node as compileNode, compile };
