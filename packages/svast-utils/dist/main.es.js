function walk(node, cb, parent) {
    var x = cb(node, parent);
    if (x === false)
        return node;
    if (node.expression)
        walk(node.expression, cb, node);
    if (node.children) {
        for (var index = 0; index < node.children.length; index++) {
            walk(node.children[index], cb, node);
        }
    }
    if (node.value && Array.isArray(node.value)) {
        for (var index = 0; index < node.value.length; index++) {
            walk(node.value[index], cb, node);
        }
    }
    else if (node.value) {
        walk(node.value, cb, node);
    }
    if (node.properties) {
        for (var index = 0; index < node.properties.length; index++) {
            walk(node.properties[index], cb, node);
        }
    }
    if (node.modifiers) {
        for (var index = 0; index < node.modifiers.length; index++) {
            walk(node.modifiers[index], cb, node);
        }
    }
    if (node.branches) {
        for (var index = 0; index < node.branches.length; index++) {
            walk(node.branches[index], cb, node);
        }
    }
    return node;
}

function clean_positions(node) {
    return walk(node, function (node) {
        if (node.position)
            delete node.position;
    });
}

export { clean_positions as cleanPositions, walk };
