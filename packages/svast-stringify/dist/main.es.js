function render_attr_values(values) {
    var value = '';
    for (var index = 0; index < values.length; index++) {
        if (values[index].type === 'text') {
            value += values[index].value;
        }
        if (values[index].type === 'svelteDynamicContent') {
            value +=
                '{' + values[index].expression.value + '}';
        }
    }
    return value;
}
function render_modifiers(modifiers) {
    var mod_string = '';
    for (var index = 0; index < modifiers.length; index++) {
        mod_string += '|' + modifiers[index].value;
    }
    return mod_string;
}
function render_props(props) {
    var attrs = '\n';
    for (var index = 0; index < props.length; index++) {
        if (props[index].type === 'svelteProperty') {
            if (props[index].shorthand === 'boolean') {
                attrs += props[index].name + '\n';
                continue;
            }
            else if (props[index].shorthand === 'expression') {
                attrs += '{' + props[index].name + '}\n';
                continue;
            }
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
var handlers = {
    text: function (node) {
        return node.value;
    },
    svelteDynamicContent: function (node) {
        return '{' + node.expression.value + '}';
    },
    svelteVoidBlock: function (node) {
        return '{@' + node.name + ' ' + node.expression.value + '}';
    },
    svelteElement: function (node, compile_children) {
        if (node.selfClosing === true) {
            return ('<' +
                node.tagName +
                ' ' +
                (node.properties.length > 0
                    ? render_props(node.properties)
                    : '') +
                '/>');
        }
        else {
            return ('<' +
                node.tagName +
                ' ' +
                (node.properties.length > 0
                    ? render_props(node.properties)
                    : '') +
                '>' +
                (node.children.length > 0
                    ? compile_children(node.children)
                    : '') +
                '</' +
                node.tagName +
                '>');
        }
    },
    svelteMeta: function (node, compile_children) {
        if (node.selfClosing === true) {
            return ('<svelte:' +
                node.tagName +
                ' ' +
                (node.properties.length > 0
                    ? render_props(node.properties)
                    : '') +
                '/>');
        }
        else {
            return ('<svelte:' +
                node.tagName +
                ' ' +
                (node.properties.length > 0
                    ? render_props(node.properties)
                    : '') +
                '>' +
                (node.children.length > 0
                    ? compile_children(node.children)
                    : '') +
                '</svelte:' +
                node.tagName +
                '>');
        }
    },
    svelteBranchingBlock: function (node, compile_children) {
        var branches = '';
        for (var index = 0; index < node.branches.length; index++) {
            if (index === 0) {
                branches += '{#';
            }
            else {
                branches += '{:';
            }
            branches +=
                node.branches[index].name +
                    ' ' +
                    node.branches[index].expression.value +
                    '}' +
                    compile_children(node.branches[index].children);
        }
        return branches + '{/' + node.name + '}';
    },
    svelteComponent: function (node, compile_children) {
        return this.svelteElement(node, compile_children);
    },
    svelteScript: function (node, compile_children) {
        return this.svelteElement(node, compile_children);
    },
    svelteStyle: function (node, compile_children) {
        return this.svelteElement(node, compile_children);
    }
};
function compile_node(node, compile_children) {
    return handlers[node.type](node, compile_children);
}
function compile_children(children) {
    var str = '';
    for (var index = 0; index < children.length; index++) {
        str += compile_node(children[index], compile_children);
    }
    return str;
}
function compile(tree) {
    if (tree.type === 'root') {
        return compile_children(tree.children);
    }
    else {
        throw new Error("A svast tree must have a single 'root' node but instead got \"" + tree.type + "\"");
    }
}

export { compile, compile_node as compileNode };
