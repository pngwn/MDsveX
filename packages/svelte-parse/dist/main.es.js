var TAB = 9; // "\t"
var LINEFEED = 10; // "\n"
var SPACE = 32; // " "
var QUOTE = 34; // "'"
var OCTOTHERP = 35; // "#"
var APOSTROPHE = 39; // "'"
var SLASH = 47; // "/"
var COLON = 58; // ":"
var OPEN_ANGLE_BRACKET = 60; // "<"
var EQUALS = 61; // "="
var CLOSE_ANGLE_BRACKET = 62; // ">"
var AT = 64; // "@"
var OPEN_BRACE = 123; // "{"
var CLOSE_BRACE = 125; // "}"
var UPPERCASE_A = 65; // "A"
var UPPERCASE_Z = 90; // "Z"
var BACKSLASH = 92; // "\"
var BACKTICK = 96;
var LOWERCASE_A = 97; // "A"
var LOWERCASE_Z = 122; // "Z"
var PIPE = 124; // "|"
var RE_BLOCK_BRANCH = /^{\s*(?::|\/)/;
var RE_SCRIPT_STYLE = /^<\/(?:script|style)\s*>/;
var RE_COMMENT_START = /^<!--/;
var RE_COMMENT_END = /^-->/;
var RE_END_TAG_START = /^<\s*\//;
var RE_ONLY_WHITESPACE = /^\s*$/;

var void_els = {
    area: 1,
    base: 1,
    basefont: 1,
    bgsound: 1,
    br: 1,
    col: 1,
    command: 1,
    embed: 1,
    frame: 1,
    hr: 1,
    image: 1,
    img: 1,
    input: 1,
    isindex: 1,
    keygen: 1,
    link: 1,
    menuitem: 1,
    meta: 1,
    nextid: 1,
    param: 1,
    source: 1,
    track: 1,
    wbr: 1
};

function parseNode(opts) {
    var index = 0;
    var quote_type = '';
    var expr_quote_type = '';
    var closing_tag_name = '';
    var brace_count = 0;
    var node_stack = [];
    var state = [];
    var value = opts.value; opts.block; var childParser = opts.childParser, _b = opts.generatePositions, generatePositions = _b === void 0 ? true : _b;
    var position = opts.currentPosition || {
        line: 1,
        column: 1,
        offset: 0,
        index: index
    };
    var char = value.charCodeAt(index);
    function chomp() {
        // newline means new line
        if (char === LINEFEED) {
            position.line++;
            position.column = 1;
        }
        else {
            // otherwise shift along the column pointer
            position.column++;
        }
        // refers to the current parse
        index++;
        //@ts-ignore
        position.offset++;
        // stay in sync
        position.index = index;
        char = value.charCodeAt(index);
    }
    function place() {
        return {
            line: position.line,
            column: position.column,
            offset: position.offset
        };
    }
    var current_state;
    function pop_state() {
        state.pop();
        current_state = state[state.length - 1];
    }
    function set_state(name, toPop) {
        if (toPop)
            state.pop();
        state.push((current_state = name));
    }
    var current_node;
    function push_node(node) {
        node_stack.push((current_node = node));
    }
    function pop_node() {
        node_stack.pop();
        current_node = node_stack[node_stack.length - 1];
    }
    var _n;
    var _n2;
    for (;;) {
        // console.log(value[index], node_stack, state);
        if (value[index] === void 0) {
            if (generatePositions)
                //@ts-ignore
                current_node.position.end = place();
            break;
        }
        // right at the start
        if (current_state === void 0) {
            if (RE_BLOCK_BRANCH.test(value.substring(index))) {
                if (generatePositions && node_stack.length)
                    //@ts-ignore
                    current_node.position.end = place();
                return;
            }
            if (RE_END_TAG_START.test(value.substring(index))) {
                return;
            }
            if (RE_COMMENT_START.test(value.substring(index))) {
                _n = {
                    type: 'comment',
                    value: ''
                };
                //@ts-ignore
                if (generatePositions)
                    _n.position = { start: place(), end: {} };
                push_node(_n);
                set_state(28 /* IN_COMMENT */);
                chomp();
                chomp();
                chomp();
                chomp();
                continue;
            }
            // "{" => tag
            if (char === OPEN_BRACE) {
                push_node({
                    type: 'svelteDynamicContent'
                });
                if (generatePositions) {
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                }
                set_state(20 /* MAYBE_IN_DYNAMIC_CONTENT */);
                chomp();
                continue;
            }
            if (char === OPEN_ANGLE_BRACKET) {
                set_state(0 /* IN_START_TAG */);
                push_node({
                    type: '',
                    tagName: '',
                    properties: [],
                    selfClosing: false,
                    children: []
                });
                if (generatePositions)
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                chomp();
                continue;
            }
        }
        if (current_state === 28 /* IN_COMMENT */) {
            if (RE_COMMENT_END.test(value.substring(index))) {
                chomp();
                chomp();
                chomp();
                //@ts-ignore
                if (generatePositions)
                    current_node.position.end = place();
                break;
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 20 /* MAYBE_IN_DYNAMIC_CONTENT */) {
            if (char === SPACE || char === LINEFEED || char === TAB) {
                chomp();
                continue;
            }
            if (char === AT) {
                _n = {
                    type: 'svelteVoidBlock',
                    name: '',
                    expression: {
                        type: 'svelteExpression',
                        value: ''
                    }
                };
                if (generatePositions) {
                    //@ts-ignore
                    _n.position = Object.assign({}, current_node.position);
                }
                pop_node();
                push_node(_n);
                set_state(21 /* IN_VOID_BLOCK */, true);
                chomp();
                continue;
            }
            if (char === OCTOTHERP) {
                set_state(22 /* IN_BRANCHING_BLOCK */, true);
                set_state(25 /* IN_BRANCHING_BLOCK_NAME */);
                chomp();
                continue;
            }
            set_state(14 /* IN_DYNAMIC_CONTENT */, true);
            continue;
        }
        if (current_state === 14 /* IN_DYNAMIC_CONTENT */) {
            if (char === CLOSE_BRACE) {
                chomp();
                if (generatePositions) {
                    //@ts-ignore
                    current_node.position.end = place();
                }
                if (node_stack.length === 1)
                    break;
                pop_node();
                pop_state();
                continue;
            }
            var n = {
                type: 'svelteExpression',
                value: ''
            };
            current_node.expression = n;
            push_node(n);
            if (generatePositions) {
                //@ts-ignore
                current_node.position = { start: place(), end: {} };
            }
            set_state(15 /* IN_EXPRESSION */);
            continue;
        }
        if (current_state === 25 /* IN_BRANCHING_BLOCK_NAME */) {
            if (char === CLOSE_BRACE) {
                // each
                pop_state();
                continue;
            }
            if (char === SPACE) {
                _n = {
                    type: 'svelteBranchingBlock',
                    name: current_node.value,
                    branches: []
                };
                _n2 = {
                    type: 'svelteBranch',
                    name: current_node.value,
                    expression: {
                        type: 'svelteExpression',
                        value: ''
                    },
                    children: []
                };
                if (generatePositions) {
                    _n.position = Object.assign({}, current_node.position);
                    _n2.position = Object.assign({}, current_node.position);
                }
                pop_node();
                push_node(_n);
                push_node(_n2);
                push_node(_n2.expression);
                _n.branches.push(_n2);
                pop_state();
                continue;
            }
            if (!current_node.value) {
                current_node.value = '';
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 24 /* IN_BRANCHING_BLOCK_END */) {
            if (char === CLOSE_BRACE) {
                pop_node();
                chomp();
                if (generatePositions)
                    //@ts-ignore
                    current_node.position.end = place();
                if (closing_tag_name !== current_node.name) ;
                break;
            }
            closing_tag_name += value[index];
            chomp();
            continue;
        }
        if (current_state === 26 /* IN_BRANCHING_BLOCK_BRANCH_NAME */) {
            if ((char === SPACE &&
                value.substring(index - 4, index + 3) !== 'else if') ||
                char === CLOSE_BRACE) {
                _n2 = {
                    type: 'svelteBranch',
                    name: current_node.value,
                    expression: {
                        type: 'svelteExpression',
                        value: ''
                    },
                    children: []
                };
                if (generatePositions) {
                    _n2.position = Object.assign({}, current_node.position);
                }
                pop_node();
                pop_node();
                current_node.branches.push(_n2);
                push_node(_n2);
                push_node(_n2.expression);
                pop_state();
                continue;
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 22 /* IN_BRANCHING_BLOCK */) {
            if (char === CLOSE_BRACE) {
                if (current_node.type === 'svelteExpression')
                    pop_node();
                chomp();
                set_state(16 /* PARSE_CHILDREN */);
                continue;
            }
            if (char === SPACE) {
                set_state(15 /* IN_EXPRESSION */);
                chomp();
                if (generatePositions)
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                continue;
            }
        }
        if (current_state === 23 /* IN_BRANCHING_BLOCK_BRANCH */) {
            if (char === COLON) {
                set_state(26 /* IN_BRANCHING_BLOCK_BRANCH_NAME */, true);
                chomp();
                continue;
            }
            if (char === SLASH) {
                closing_tag_name = '';
                pop_node();
                set_state(24 /* IN_BRANCHING_BLOCK_END */, true);
                chomp();
                continue;
            }
            if (char === SPACE || char === LINEFEED || char === TAB) {
                chomp();
                continue;
            }
        }
        if (current_state === 21 /* IN_VOID_BLOCK */) {
            if (char === SPACE) {
                push_node(current_node.expression);
                set_state(15 /* IN_EXPRESSION */);
                chomp();
                if (generatePositions)
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                continue;
            }
            if (char === CLOSE_BRACE) {
                // if (generatePositions)
                // 	//@ts-ignore
                // 	(current_node as VoidBlock).expression.position = {
                // 		start: place(),
                // 		end: place(),
                // 	};
                chomp();
                if (generatePositions)
                    //@ts-ignore
                    current_node.position.end = place();
                break;
            }
            current_node.name += value[index];
            chomp();
            continue;
        }
        if (current_state === 0 /* IN_START_TAG */) {
            if (char === SLASH)
                return;
            // lowercase characters for element names
            if (char >= LOWERCASE_A && char <= LOWERCASE_Z) {
                current_node.type = 'svelteElement';
                set_state(1 /* IN_TAG_NAME */);
                continue;
            }
            // uppercase characters for Component names UPPERCASE_A, UPPERCASE_Z
            if (char >= UPPERCASE_A && char <= UPPERCASE_Z) {
                current_node.type =
                    'svelteComponent';
                set_state(1 /* IN_TAG_NAME */);
                continue;
            }
            if (char === SPACE || char === TAB || char === LINEFEED) {
                chomp();
                continue;
            }
        }
        // we are inside a tags name
        if (current_state === 1 /* IN_TAG_NAME */) {
            if (char === SLASH ||
                (char === CLOSE_ANGLE_BRACKET &&
                    //@ts-ignore
                    void_els[current_node.tagName] !== void 0)) {
                set_state(12 /* IN_CLOSING_SLASH */, true);
                current_node.selfClosing = true;
                if (char === SLASH)
                    chomp();
                continue;
            }
            // space or linefeed put us into the tag body
            if (char === SPACE || char === TAB || char === LINEFEED) {
                set_state(2 /* IN_TAG_BODY */, true);
                chomp();
                continue;
            }
            if (char === COLON) {
                current_node.type = 'svelteMeta';
                current_node.tagName = '';
                chomp();
                continue;
            }
            if (char === CLOSE_ANGLE_BRACKET) {
                set_state(2 /* IN_TAG_BODY */, true);
                continue;
            }
            current_node.tagName += value[index];
            chomp();
            continue;
        }
        // we are inside a start tag after the name
        if (current_state === 2 /* IN_TAG_BODY */) {
            if (char === OPEN_BRACE) {
                set_state(3 /* IN_SHORTHAND_ATTR */);
                var _node = {
                    type: 'svelteProperty',
                    name: '',
                    value: [
                        {
                            type: 'svelteDynamicContent',
                            expression: {
                                type: 'svelteExpression',
                                value: ''
                            }
                        },
                    ],
                    modifiers: [],
                    shorthand: 'expression'
                };
                current_node.properties.push(_node);
                push_node(_node);
                if (generatePositions) {
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                    //@ts-ignore
                    current_node.value[0].position = {
                        start: place(),
                        //@ts-ignore
                        end: {}
                    };
                }
                chomp();
                if (generatePositions) {
                    //@ts-ignore
                    current_node.value[0].expression.position = {
                        start: place(),
                        //@ts-ignore
                        end: {}
                    };
                }
                continue;
            }
            // letters mean we've hit an attribute
            if ((char >= LOWERCASE_A && char <= LOWERCASE_Z) ||
                (char >= UPPERCASE_A && char <= UPPERCASE_Z)) {
                set_state(4 /* IN_ATTR_NAME */);
                var _node = {
                    type: 'svelteProperty',
                    name: '',
                    value: [],
                    modifiers: [],
                    shorthand: 'none'
                };
                current_node.properties.push(_node);
                push_node(_node);
                if (generatePositions)
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                continue;
            }
            // "/" or  ">" (for void tags) put us in a terminal state
            if (char === SLASH ||
                (char === CLOSE_ANGLE_BRACKET &&
                    //@ts-ignore
                    void_els[current_node.tagName] !== void 0)) {
                set_state(12 /* IN_CLOSING_SLASH */, true);
                current_node.selfClosing = true;
                if (char === SLASH)
                    chomp();
                continue;
            }
            if (char === CLOSE_ANGLE_BRACKET) {
                set_state(16 /* PARSE_CHILDREN */, true);
                chomp();
                //@ts-ignore
                if (generatePositions)
                    current_node.position.end = place();
                continue;
            }
            if (char === SPACE || char === TAB || char === LINEFEED) {
                chomp();
                continue;
            }
        }
        if (current_state === 3 /* IN_SHORTHAND_ATTR */) {
            if (char === CLOSE_BRACE) {
                current_node.name = current_node
                    .value[0].expression.value;
                if (generatePositions) {
                    //@ts-ignore
                    current_node.position.end = place();
                    //@ts-ignore
                    current_node.value[0].position.end = place();
                }
                pop_state();
                pop_node();
                chomp();
                continue;
            }
            push_node(current_node.value[0].expression);
            set_state(15 /* IN_EXPRESSION */);
            continue;
        }
        // we are expecting the tag to close completely here
        if (current_state === 12 /* IN_CLOSING_SLASH */) {
            // ignore ws
            if (char === SPACE || char === TAB || char === LINEFEED) {
                chomp();
                continue;
            }
            // we closed successfully, end the parse
            if (char === CLOSE_ANGLE_BRACKET) {
                chomp();
                // @ts-ignore
                if (generatePositions)
                    current_node.position.end = place();
                break;
            }
            // DANGER ZONE - something went wrong
        }
        // we are parsing a property name
        if (current_state === 4 /* IN_ATTR_NAME */) {
            // " ", "\n", "/" or ">" => shorthand boolean attr
            if (char === SPACE ||
                char === TAB ||
                char === LINEFEED ||
                char === SLASH ||
                char === CLOSE_ANGLE_BRACKET) {
                current_node.shorthand = 'boolean';
                if (generatePositions)
                    //@ts-ignore
                    current_node.position.end = place();
                pop_state();
                pop_node();
                continue;
            }
            // ":" => directive
            if (char === COLON) {
                //@ts-ignore
                current_node.type = 'svelteDirective';
                current_node.specifier = '';
                set_state(5 /* IN_DIRECTIVE_SPECIFIER */, true);
                chomp();
                continue;
            }
            if (char === PIPE) {
                chomp();
                _n = { value: '', type: 'modifier' };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: [] };
                current_node.modifiers.push(_n);
                push_node(_n);
                set_state(6 /* IN_ATTR_MODIFIER */, true);
                continue;
            }
            if (char === EQUALS) {
                set_state(8 /* IN_ATTR_VALUE */, true);
                chomp();
                continue;
            }
            // process the token and chomp, everything is good
            current_node.name += value[index];
            chomp();
            continue;
        }
        // att values can be quoted or unquoted
        if (current_state === 8 /* IN_ATTR_VALUE */) {
            // ignore whitespace it is valid after `=`
            if (char === SPACE || char === TAB || char === LINEFEED) {
                chomp();
                continue;
            }
            // quoted attr
            if (char === QUOTE || char === APOSTROPHE) {
                set_state(10 /* IN_QUOTED_ATTR_VALUE */, true);
                quote_type = value[index];
                push_node({ type: 'blank' });
                chomp();
                continue;
            }
            set_state(9 /* IN_UNQUOTED_ATTR_VALUE */, true);
            continue;
        }
        if (current_state === 9 /* IN_UNQUOTED_ATTR_VALUE */) {
            // " ", "\n", "/" or ">" => ends the whole thing
            if (char === SPACE ||
                char === TAB ||
                char === LINEFEED ||
                char === CLOSE_ANGLE_BRACKET ||
                /^\/\s*>/.test(value.substring(index))) {
                //@ts-ignore
                if (current_node.type === 'text') {
                    if (generatePositions)
                        //@ts-ignore
                        current_node.position.end = place();
                    pop_node();
                }
                pop_state();
                if (generatePositions)
                    //@ts-ignore
                    current_node.position.end = place();
                pop_node();
                continue;
            }
            if (char === OPEN_BRACE) {
                set_state(14 /* IN_DYNAMIC_CONTENT */);
                var _n_1 = {
                    type: 'svelteDynamicContent'
                };
                current_node.value.push(_n_1);
                push_node(_n_1);
                // current_node.
                if (generatePositions) {
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                }
                chomp();
                continue;
            }
            //@ts-ignore
            if (current_node.type !== 'text') {
                var _n_2 = {
                    type: 'text',
                    value: ''
                };
                current_node.value.push(_n_2);
                push_node(_n_2);
                if (generatePositions) {
                    //@ts-ignore
                    current_node.position = { start: place(), end: {} };
                }
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 10 /* IN_QUOTED_ATTR_VALUE */) {
            // if we meet our matching quote the attribute has ended
            if (value[index] === quote_type) {
                chomp();
                //@ts-ignore
                if (generatePositions)
                    current_node.position.end = place();
                pop_node();
                quote_type = '';
                pop_state();
                if (
                //@ts-ignore
                current_node.type !== 'svelteElement' &&
                    //@ts-ignore
                    current_node.type !== 'svelteComponent' &&
                    //@ts-ignore
                    current_node.type !== 'svelteMeta') {
                    //@ts-ignore
                    if (generatePositions)
                        current_node.position.end = place();
                    pop_node();
                }
                continue;
            }
            if (char === OPEN_BRACE) {
                //@ts-ignore
                if (generatePositions && current_node.type !== 'blank')
                    //@ts-ignore
                    current_node.position.end = place();
                //@ts-ignore
                current_node.type !== 'svelteProperty' && pop_node();
                _n = {
                    type: 'svelteDynamicContent'
                };
                current_node.value.push(_n);
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                push_node(_n);
                set_state(14 /* IN_DYNAMIC_CONTENT */);
                chomp();
                continue;
            }
            if (char === CLOSE_BRACE) {
                chomp();
                continue;
            }
            // " ", "\n" => still in the attribute value but make a new node
            if (char === SPACE || char === TAB || char === LINEFEED) {
                var _c = current_node;
                if (_c.type === 'text' && RE_ONLY_WHITESPACE.test(_c.value)) {
                    _c.value += value[index];
                    chomp();
                    continue;
                }
                //@ts-ignore
                current_node.type !== 'svelteProperty' && pop_node();
                _n = { type: 'text', value: value[index] };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                current_node.value.push(_n);
                push_node(_n);
                chomp();
                continue;
            }
            if (value.charCodeAt(index - 1) === CLOSE_BRACE) {
                //@ts-ignore
                current_node.type !== 'svelteProperty' && pop_node();
                _n = { type: 'text', value: value[index] };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                current_node.value.push(_n);
                push_node(_n);
                chomp();
                continue;
            }
            if (current_node.type === 'text' &&
                RE_ONLY_WHITESPACE.test(current_node.value)) {
                pop_node();
                _n = { type: 'text', value: '' };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                current_node.value.push(_n);
                push_node(_n);
                //@ts-ignore
            }
            else if (current_node.type === 'blank') {
                pop_node();
                _n = { type: 'text', value: '' };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                current_node.value.push(_n);
                push_node(_n);
            }
            // capture the token otherwise
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 5 /* IN_DIRECTIVE_SPECIFIER */) {
            if (char === EQUALS) {
                set_state(8 /* IN_ATTR_VALUE */, true);
                chomp();
                continue;
            }
            if (char === PIPE) {
                _n = { value: '', type: 'modifier' };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                current_node.modifiers.push(_n);
                push_node(_n);
                set_state(6 /* IN_ATTR_MODIFIER */, true);
                chomp();
                continue;
            }
            // " ", "\n", "/" or ">" => ends the whole thing
            if (char === SPACE ||
                char === TAB ||
                char === LINEFEED ||
                char === SLASH ||
                char === CLOSE_ANGLE_BRACKET) {
                if (generatePositions)
                    //@ts-ignore
                    current_node.position.end = place();
                pop_state();
                pop_node();
                continue;
            }
            current_node.specifier += value[index];
            chomp();
            continue;
        }
        if (current_state === 6 /* IN_ATTR_MODIFIER */) {
            if (char === PIPE) {
                pop_node();
                _n = { value: '', type: 'modifier' };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                current_node.modifiers.push(_n);
                push_node(_n);
                chomp();
                continue;
            }
            if (char === EQUALS) {
                set_state(8 /* IN_ATTR_VALUE */, true);
                pop_node();
                chomp();
                continue;
            }
            if (char === SLASH ||
                char === CLOSE_ANGLE_BRACKET ||
                ((value.charCodeAt(index - 1) === SPACE ||
                    value.charCodeAt(index - 1) === TAB ||
                    value.charCodeAt(index - 1) === LINEFEED) &&
                    ((char >= LOWERCASE_A && char <= LOWERCASE_Z) ||
                        (char >= UPPERCASE_A && char <= UPPERCASE_Z)))) {
                pop_node();
                pop_node();
                pop_state();
                continue;
            }
            if (char === SPACE || char === TAB || char === LINEFEED) {
                chomp();
                continue;
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 27 /* IN_SCRIPT_STYLE */) {
            if (char === OPEN_ANGLE_BRACKET) {
                if (RE_SCRIPT_STYLE.test(value.substring(index))) {
                    if (generatePositions)
                        //@ts-ignore
                        current_node.position.end = place();
                    pop_node();
                    set_state(17 /* EXPECT_END_OR_BRANCH */, true);
                    continue;
                }
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 16 /* PARSE_CHILDREN */) {
            if (current_node.tagName === 'script' ||
                current_node.tagName === 'style') {
                //@ts-ignore
                current_node.type =
                    'svelteS' +
                        current_node.tagName.substring(1);
                _n = {
                    type: 'text',
                    value: ''
                };
                if (generatePositions)
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                current_node.children.push(_n);
                push_node(_n);
                set_state(27 /* IN_SCRIPT_STYLE */, true);
                continue;
            }
            else {
                var result = childParser({
                    generatePositions: generatePositions,
                    value: value.substring(index),
                    currentPosition: position,
                    childParser: childParser
                });
                current_node.children = result[0];
                //@ts-ignore
                var _index = position.index + result[2];
                position = Object.assign({}, result[1]);
                position.index = _index;
                index = position.index;
                char = value.charCodeAt(index);
            }
            set_state(17 /* EXPECT_END_OR_BRANCH */, true);
        }
        if (current_state === 17 /* EXPECT_END_OR_BRANCH */) {
            if (RE_BLOCK_BRANCH.test(value.substring(index))) {
                set_state(23 /* IN_BRANCHING_BLOCK_BRANCH */, true);
                _n = {
                    type: 'text',
                    value: ''
                };
                if (generatePositions) {
                    //@ts-ignore
                    _n.position = { start: place(), end: {} };
                }
                //@ts-ignore
                if (generatePositions)
                    current_node.position.end = place();
                push_node(_n);
                chomp();
                continue;
            }
            if (char === OPEN_ANGLE_BRACKET) {
                chomp();
                continue;
            }
            if (char === SLASH) {
                chomp();
                continue;
            }
            if (char === SPACE) {
                chomp();
                continue;
            }
            if (char === CLOSE_ANGLE_BRACKET) {
                chomp();
                if (generatePositions) {
                    //@ts-ignore
                    current_node.position.end = place();
                }
                var current_node_name = closing_tag_name;
                if (current_node.type === 'svelteMeta') {
                    current_node_name = current_node_name.replace('svelte:', '');
                }
                if (current_node_name !==
                    current_node.tagName) {
                    console.log("Was expecting a closing tag for " + current_node
                        .tagName + " but got " + closing_tag_name, 
                    //@ts-ignore
                    JSON.stringify(current_node.position));
                }
                break;
            }
            closing_tag_name += value[index];
            chomp();
            continue;
        }
        if (current_state === 18 /* IN_TEXT */) {
            if (char === OPEN_ANGLE_BRACKET || char === OPEN_BRACE) {
                if (generatePositions)
                    //@ts-ignore
                    current_node.position.end = place();
                break;
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 15 /* IN_EXPRESSION */) {
            if (expr_quote_type === '' && char === CLOSE_BRACE) {
                if (brace_count === 0) {
                    if (generatePositions) {
                        //@ts-ignore
                        current_node.position.end = place();
                    }
                    pop_node();
                    pop_state();
                    continue;
                    // if (
                    // 	node_stack.length === 1 ||
                    // 	node_stack[0].type === 'svelteVoidBlock'
                    // ) {
                    // 	if (generatePositions && node_stack[0].type === 'svelteVoidBlock') {
                    // 		//@ts-ignore
                    // 		`current_node.position.end = place();
                    // 		pop_node();`
                    // 	}
                    // 	chomp();
                    // 	if (generatePositions) {
                    // 		//@ts-ignore
                    // 		current_node.position.end = place();
                    // 	}
                    // 	break;
                    // } else if (
                    // 	node_stack[node_stack.length - 2].type === 'svelteBranch'
                    // ) {
                    // 	pop_state();
                    // 	if (generatePositions) {
                    // 		//@ts-ignore
                    // 		current_node.position.end = place();
                    // 	}
                    // 	continue;
                    // } else {
                    // 	pop_state();
                    // 	chomp();
                    // 	if (generatePositions) {
                    // 		//@ts-ignore
                    // 		current_node.position.end = place();
                    // 	}
                    // 	continue;
                    // }
                }
                brace_count--;
            }
            if (expr_quote_type === '' && char === OPEN_BRACE) {
                brace_count++;
            }
            if (expr_quote_type === '' &&
                (char === APOSTROPHE || char === QUOTE || char === BACKTICK)) {
                set_state(19 /* IN_EXPRESSION_QUOTE */);
                expr_quote_type = value[index];
                current_node.value += value[index];
                chomp();
                continue;
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        if (current_state === 19 /* IN_EXPRESSION_QUOTE */) {
            if (value[index] === expr_quote_type &&
                value.charCodeAt(index - 1) !== BACKSLASH) {
                expr_quote_type = '';
                current_node.value += value[index];
                chomp();
                pop_state();
                continue;
            }
            current_node.value += value[index];
            chomp();
            continue;
        }
        set_state(18 /* IN_TEXT */);
        _n = {
            type: 'text',
            value: ''
        };
        push_node(_n);
        if (generatePositions)
            //@ts-ignore
            _n.position = { start: place(), end: {} };
    }
    return {
        chomped: value.substring(0, index),
        unchomped: value.substring(index),
        parsed: node_stack[0],
        position: position
    };
}
function parse_siblings(opts) {
    var value = opts.value, _a = opts.currentPosition, currentPosition = _a === void 0 ? {
        line: 1,
        column: 1,
        offset: 0
    } : _a, 
    // block = true,
    _b = opts.childParser, 
    // block = true,
    childParser = _b === void 0 ? parse_siblings : _b;
    var children = [];
    var unchomped = value;
    var position = Object.assign({}, currentPosition);
    var parsed;
    var index = 0;
    var result;
    for (;;) {
        result = parseNode({
            generatePositions: opts.generatePositions,
            value: unchomped,
            currentPosition: position,
            childParser: childParser
        });
        if (!result)
            break;
        position = result.position;
        unchomped = result.unchomped;
        parsed = result.parsed;
        //@ts-ignore
        index += position.index;
        children.push(parsed);
        if (unchomped.trim().length === 0)
            break;
    }
    return [children, position, index];
}
var lineFeed = '\n';
var lineBreaksExpression = /\r\n|\r/g;
function parse(opts) {
    var root = {
        type: 'root',
        children: parse_siblings({
            generatePositions: opts.generatePositions,
            value: opts.value.replace(lineBreaksExpression, lineFeed),
            childParser: parse_siblings
        })[0]
    };
    // console.log(JSON.stringify(root.children[root.children.length - 1], null, 2));
    if (opts.generatePositions) {
        root.position = {
            start: { column: 1, line: 1, offset: 0 },
            end: Object.assign({}, 
            //@ts-ignore
            root.children[root.children.length - 1].position.end)
        };
    }
    return root;
}

export { parse, parseNode };
