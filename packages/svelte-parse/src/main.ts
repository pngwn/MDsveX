import {
	Point,
	Node,
	BaseSvelteTag,
	SvelteTag,
	Property,
	SvelteElement,
	Directive,
	Text,
	Literal,
	Root,
	SvelteExpression,
	VoidBlock,
	BranchingBlock,
	Branch,
} from 'svast';

import {
	ParserOptions,
	Result,
	State,
	SLASH,
	CLOSE_ANGLE_BRACKET,
	COLON,
	EQUALS,
	QUOTE,
	APOSTROPHE,
	TAB,
	CLOSE_BRACE,
	BACKTICK,
	BACKSLASH,
	AT,
	OCTOTHERP,
	RE_BLOCK_BRANCH,
} from './types_and_things';

import {
	LINEFEED,
	OPEN_ANGLE_BRACKET,
	OPEN_BRACE,
	UPPERCASE_A,
	UPPERCASE_Z,
	LOWERCASE_A,
	LOWERCASE_Z,
	SPACE,
	PIPE,
} from './types_and_things';

import { void_els } from './void_els';

function default_eat(value: string) {
	return function apply(node: Node): Node {
		return node;
	};
}

const pos: Point & { index?: number } = {
	line: 1,
	column: 1,
	offset: 0,
};

function is_in_range(number: number, from: number, to: number): boolean {
	return number >= from && number <= to;
}

function is_upper_alpha(code: number) {
	return is_in_range(code, UPPERCASE_A, UPPERCASE_Z);
}

function is_lower_alpha(code: number) {
	return is_in_range(code, LOWERCASE_A, LOWERCASE_Z);
}

function is_void_element(tag_name: string): boolean {
	return void_els.includes(tag_name);
}

export function parseNode(opts: ParserOptions): Result | undefined {
	let index = 0;
	let quote_type = '';
	let closing_tag_name = '';
	let brace_count = 0;
	let done;
	let error;

	const node_stack: Node[] = [];
	const state: State[] = [];

	let {
		value,
		currentPosition = {
			line: 1,
			column: 1,
			offset: 0,
		},
		block = true,
		childParser,
	} = opts;

	// TODO: remove this
	const lineFeed = '\n';
	const lineBreaksExpression = /\r\n|\r/g;
	value = value.replace(lineBreaksExpression, lineFeed);

	const position = Object.assign(currentPosition, { index });

	function chomp() {
		// newline means new line
		if (value.charCodeAt(index) === LINEFEED) {
			position.line++;
			position.column = 1;
		} else {
			// otherwise shift along the column pointer
			position.column++;
		}

		// refers to the current parse
		index++;

		//@ts-ignore
		position.offset++;
		// stay in sync
		position.index = index;
	}

	function get_state() {
		return state[state.length - 1];
	}

	function current_node() {
		return node_stack[node_stack.length - 1];
	}

	while (!done && !error) {
		// console.log(value[index], state, node_stack);
		if (!value[index]) break;

		// right at the start
		if (!get_state()) {
			if (RE_BLOCK_BRANCH.test(value.substring(index))) return;

			// "<" => tag
			if (value.charCodeAt(index) === OPEN_BRACE) {
				state.push('MAYBE_IN_EXPRESSION');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_ANGLE_BRACKET) {
				state.push('IN_START_TAG');
				node_stack.push(<BaseSvelteTag>{
					type: '',
					tagName: '',
					properties: [],
					selfClosing: false,
					children: [],
				});
				chomp();
				continue;
			}

			// "{" => expression or block
			if (value.charCodeAt(index) === OPEN_BRACE) {
				chomp();
				// expression or svelte block
				// state.push('IN_EXPRESSION');
			}
		}

		if (get_state() === 'MAYBE_IN_EXPRESSION') {
			// if (value.charCodeAt(index) === COLON) return;
			// if (value.charCodeAt(index) === SLASH) return;

			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === LINEFEED ||
				value.charCodeAt(index) === TAB
			) {
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === AT) {
				node_stack.push(<VoidBlock>{
					type: 'svelteVoidBlock',
					name: '',
					expression: {
						type: 'svelteExpression',
						value: '',
					},
				});
				state.pop();
				state.push('IN_VOID_BLOCK');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OCTOTHERP) {
				node_stack.push(<Text>{
					type: 'text',
					value: '',
				});
				state.pop();
				state.push('IN_BRANCHING_BLOCK');
				state.push('IN_BRANCHING_BLOCK_NAME');
				chomp();
				continue;
			}

			state.pop();
			state.push('IN_EXPRESSION');
			node_stack.push(<SvelteExpression>{
				type: 'svelteExpression',
				value: '',
			});
			continue;
		}

		if (get_state() === 'IN_BRANCHING_BLOCK_NAME') {
			if (value.charCodeAt(index) === CLOSE_BRACE) {
				// each
				state.pop();

				continue;
			}

			if (value.charCodeAt(index) === SPACE) {
				const _n = <BranchingBlock>{
					type: 'svelteBranchingBlock',
					name: current_node().value,
					branches: [],
				};
				const _n2 = <Branch>{
					type: 'svelteBranch',
					name: current_node().value,
					expression: {
						type: 'svelteExpression',
						value: '',
					},
					children: [],
				};
				node_stack.pop();
				node_stack.push(_n);
				node_stack.push(_n2);
				node_stack.push(_n2.expression);
				_n.branches.push(_n2);
				state.pop();

				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_BRANCHING_BLOCK_END') {
			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === LINEFEED ||
				value.charCodeAt(index) === TAB
			) {
				// ERROR - NAME AFTER CLOSING BLOCK SLASH
			}

			if (value.charCodeAt(index) === CLOSE_BRACE) {
				if (closing_tag_name !== current_node().name) {
					// ERROR SHOULD BE A MATCHING NAME (current_node().name)
				}
				chomp();
				break;
			}

			closing_tag_name += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_BRANCHING_BLOCK_BRANCH_NAME') {
			if (
				(value.charCodeAt(index) === SPACE &&
					value.substring(index - 4, index + 3) !== 'else if') ||
				value.charCodeAt(index) === CLOSE_BRACE
			) {
				const _n2 = <Branch>{
					type: 'svelteBranch',
					name: current_node().value,
					expression: {
						type: 'svelteExpression',
						value: '',
					},
					children: [],
				};
				node_stack.pop();
				node_stack.pop();
				(current_node() as BranchingBlock).branches.push(_n2);
				node_stack.push(_n2);
				node_stack.push(_n2.expression);

				state.pop();
				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_BRANCHING_BLOCK') {
			if (value.charCodeAt(index) === CLOSE_BRACE) {
				chomp();
			}

			if (value.charCodeAt(index) === SPACE) {
				state.push('IN_EXPRESSION');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === COLON) {
				state.push('IN_BRANCHING_BLOCK_BRANCH_NAME');
				node_stack.push(<Text>{
					type: 'text',
					value: '',
				});
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === SLASH) {
				closing_tag_name = '';
				state.push('IN_BRANCHING_BLOCK_END');
				chomp();
				continue;
			}

			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === LINEFEED ||
				value.charCodeAt(index) === TAB
			) {
				chomp();
				continue;
			}
			node_stack.pop();
			state.push('PARSE_CHILDREN');
		}

		if (get_state() === 'IN_VOID_BLOCK') {
			if (value.charCodeAt(index) === SPACE) {
				node_stack.push((current_node() as VoidBlock).expression);
				state.push('IN_EXPRESSION');
				chomp();
				continue;
			}

			current_node().name += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_START_TAG') {
			if (value.charCodeAt(index) === SLASH) return undefined;
			// lowercase characters for element names
			if (is_lower_alpha(value.charCodeAt(index))) {
				(current_node() as BaseSvelteTag).type = 'svelteElement';
				state.push('IN_TAG_NAME');
				continue;
			}

			// uppercase characters for Component names
			if (is_upper_alpha(value.charCodeAt(index))) {
				(current_node() as BaseSvelteTag).type = 'svelteComponent';
				state.push('IN_TAG_NAME');
				continue;
			}

			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === TAB ||
				value.charCodeAt(index) === LINEFEED
			) {
				chomp();
				continue;
			}
		}

		// we are inside a tags name
		if (get_state() === 'IN_TAG_NAME') {
			// space or linefeed put us into the tag body
			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === TAB ||
				value.charCodeAt(index) === LINEFEED
			) {
				state.pop();
				state.push('IN_TAG_BODY');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === CLOSE_ANGLE_BRACKET) {
				state.pop();
				state.push('IN_TAG_BODY');
				continue;
			}

			(current_node() as SvelteTag).tagName += value[index];
			chomp();
			continue;
		}

		// we are inside a start tag after the name
		if (get_state() === 'IN_TAG_BODY') {
			if (value.charCodeAt(index) === OPEN_BRACE) {
				state.push('IN_SHORTHAND_ATTR');
				const _node = <Property>{
					type: 'svelteProperty',
					name: '',
					value: [
						{
							type: 'svelteExpression',
							value: '',
						},
					],
					modifiers: [],
					shorthand: 'expression',
				};

				(current_node() as BaseSvelteTag).properties.push(_node as Property);
				node_stack.push(_node);
				chomp();
				continue;
			}
			// letters mean we've hit an attribute
			if (
				is_lower_alpha(value.charCodeAt(index)) ||
				is_upper_alpha(value.charCodeAt(index))
			) {
				state.push('IN_ATTR_NAME');
				const _node = <Property>{
					type: 'svelteProperty',
					name: '',
					value: [],
					modifiers: [],
					shorthand: 'none',
				};

				(current_node() as BaseSvelteTag).properties.push(_node as Property);
				node_stack.push(_node);
				continue;
			}

			// "/" or  ">" (for void tags) put us in a terminal state
			if (
				value.charCodeAt(index) === SLASH ||
				(value.charCodeAt(index) === CLOSE_ANGLE_BRACKET &&
					is_void_element((current_node() as SvelteElement).tagName))
			) {
				state.pop();
				state.push('IN_CLOSING_SLASH');
				(current_node() as BaseSvelteTag).selfClosing = true;
				if (value.charCodeAt(index) === SLASH) chomp();
				continue;
			}

			if (value.charCodeAt(index) === CLOSE_ANGLE_BRACKET) {
				state.pop();
				state.push('PARSE_CHILDREN');
				chomp();
				continue;
			}

			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === TAB ||
				value.charCodeAt(index) === LINEFEED
			) {
				chomp();
				continue;
			}
		}

		if (get_state() === 'IN_SHORTHAND_ATTR') {
			if (value.charCodeAt(index) === CLOSE_BRACE) {
				(current_node() as Property).value[0].value = current_node().name;
				state.pop();
				node_stack.pop();
				chomp();
				continue;
			}

			current_node().name += value[index];
			chomp();
			continue;
		}

		// we are expecting the tag to close completely here
		if (get_state() === 'IN_CLOSING_SLASH') {
			// ignore ws
			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === TAB ||
				value.charCodeAt(index) === LINEFEED
			) {
				chomp();
				continue;
			}
			// we closed successfully, end the parse
			if (value.charCodeAt(index) === CLOSE_ANGLE_BRACKET) {
				chomp();
				break;
			}

			// DANGER ZONE - something went wrong
		}

		// we are parsing a property name
		if (get_state() === 'IN_ATTR_NAME') {
			let s;
			// " ", "\n", "/" or ">" => shorthand boolean attr

			if (
				(s = value.charCodeAt(index)) === SPACE ||
				s === TAB ||
				s === LINEFEED ||
				s === SLASH ||
				s === CLOSE_ANGLE_BRACKET
			) {
				(current_node() as Property).shorthand = 'boolean';
				state.pop();
				node_stack.pop();
				continue;
			}

			// ":" => directive
			if (value.charCodeAt(index) === COLON) {
				//@ts-ignore
				(current_node() as Directive).type = 'svelteDirective';
				(current_node() as Directive).specifier = '';
				state.pop();
				state.push('IN_DIRECTIVE_SPECIFIER');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === PIPE) {
				const _n = { value: '', type: 'modifier' };
				(current_node() as Directive).modifiers.push(_n as Literal);
				node_stack.push(_n);
				state.pop();
				state.push('IN_ATTR_MODIFIER');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === EQUALS) {
				state.pop();
				state.push('IN_ATTR_VALUE');
				chomp();
				continue;
			}

			// process the token and chomp, everything is good
			current_node().name += value[index];
			chomp();
			continue;
		}

		// att values can be quoted or unquoted
		if (get_state() === 'IN_ATTR_VALUE') {
			// ignore whitespace it is valid after `=`
			let s;
			if (
				(s = value.charCodeAt(index)) === SPACE ||
				s === TAB ||
				s === LINEFEED
			) {
				chomp();
				continue;
			}

			// quoted attr

			if (
				value.charCodeAt(index) === QUOTE ||
				value.charCodeAt(index) === APOSTROPHE
			) {
				state.pop();
				state.push('IN_QUOTED_ATTR_VALUE');
				quote_type = value[index];

				node_stack.push({ type: 'blank' });
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_BRACE) {
				state.pop();
				state.push('IN_UNQUOTED_ATTR_VALUE');

				const _n = { type: 'svelteExpression', value: '' };
				(current_node() as Property).value.push(_n as SvelteExpression);
				node_stack.push(_n);
				continue;
			} else {
				state.pop();
				state.push('IN_UNQUOTED_ATTR_VALUE');
				const _n = { type: 'text', value: '' };
				(current_node() as Property).value.push(_n as Text);
				node_stack.push(_n);

				continue;
			}

			// unquoted
		}

		if (get_state() === 'IN_UNQUOTED_ATTR_VALUE') {
			let s;
			// " ", "\n", "/" or ">" => ends the whole thing
			if (
				(s = value.charCodeAt(index)) === SPACE ||
				s === TAB ||
				s === LINEFEED ||
				s === SLASH ||
				s === CLOSE_ANGLE_BRACKET
			) {
				state.pop();
				node_stack.pop();
				node_stack.pop();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_BRACE) {
				state.push('IN_EXPRESSION');
				chomp();
				continue;
			}

			(current_node() as Text).value += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_QUOTED_ATTR_VALUE') {
			// if we meet our matching quote the attribute has ended
			if (value[index] === quote_type) {
				//end
				quote_type = '';
				state.pop();
				node_stack.pop();
				node_stack.pop();
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_BRACE) {
				node_stack.pop();
				const _n = {
					type: 'svelteExpression',
					value: '',
				};
				(current_node() as Property).value.push(_n as SvelteExpression);
				node_stack.push(_n);
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === CLOSE_BRACE) {
				chomp();
				continue;
			}

			let s;
			// " ", "\n" => still in the attribute value but make a new node
			if (
				(s = value.charCodeAt(index)) === SPACE ||
				s === TAB ||
				s === LINEFEED
			) {
				const _c = current_node();
				if (_c.type === 'text' && _c.value === '') {
					chomp();
					continue;
				}
				node_stack.pop();
				const _n = { type: 'text', value: '' };
				(current_node() as Property).value.push(_n as Text);
				node_stack.push(_n);
				chomp();
				continue;
			}

			if (
				(s = value.charCodeAt(index)) === SLASH ||
				s === CLOSE_ANGLE_BRACKET
			) {
				// this is a parsing error, we can't recover from this.
				// i'm not sure this is actually true
			}

			if (current_node().type === 'blank') {
				node_stack.pop();
				const _n = { type: 'text', value: '' };
				(current_node() as Property).value.push(_n as Text);
				node_stack.push(_n);
			}

			// capture the token otherwise
			(current_node() as Text).value += value[index];

			chomp();
			continue;
		}

		if (get_state() === 'IN_DIRECTIVE_SPECIFIER') {
			if (value.charCodeAt(index) === EQUALS) {
				state.pop();
				state.push('IN_ATTR_VALUE');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === PIPE) {
				const _n = { value: '', type: 'modifier' };
				(current_node() as Directive).modifiers.push(_n as Literal);
				node_stack.push(_n);
				state.pop();
				state.push('IN_ATTR_MODIFIER');
				chomp();
				continue;
			}

			let s;
			// " ", "\n", "/" or ">" => ends the whole thing
			if (
				(s = value.charCodeAt(index)) === SPACE ||
				s === TAB ||
				s === LINEFEED ||
				s === SLASH ||
				s === CLOSE_ANGLE_BRACKET
			) {
				state.pop();
				node_stack.pop();
				continue;
			}

			(current_node() as Directive).specifier += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_ATTR_MODIFIER') {
			if (value.charCodeAt(index) === PIPE) {
				node_stack.pop();
				const _n = { value: '', type: 'modifier' };
				(current_node() as Directive).modifiers.push(_n as Literal);
				node_stack.push(_n);
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === EQUALS) {
				state.pop();
				state.push('IN_ATTR_VALUE');
				node_stack.pop();
				chomp();
				continue;
			}

			let s;
			if (
				(s = value.charCodeAt(index)) === SPACE ||
				s === TAB ||
				s === LINEFEED
			) {
				chomp();
				continue;
			}

			if (
				(s = value.charCodeAt(index)) === SLASH ||
				s === CLOSE_ANGLE_BRACKET
			) {
				node_stack.pop();
				node_stack.pop();
				state.pop();
				continue;
			}
			(current_node() as Literal).value += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'PARSE_CHILDREN') {
			const [children, lastIndex] = childParser({
				value: value.slice(index),
				currentPosition,
				childParser,
			});
			current_node().children = children;

			position.index += lastIndex;
			index = position.index;
			state.pop();
			state.push('EXPECT_END_OR_BRANCH');
		}

		if (get_state() === 'EXPECT_END_OR_BRANCH') {
			let s;

			if (RE_BLOCK_BRANCH.test(value.substring(index))) {
				state.pop();
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_ANGLE_BRACKET) {
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === SLASH) {
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === SPACE) {
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === CLOSE_ANGLE_BRACKET) {
				if (closing_tag_name !== current_node().tagName) {
					console.log('something bad happened');
				}
				chomp();
				break;
			}

			closing_tag_name += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_TEXT') {
			if (
				value.charCodeAt(index) === OPEN_ANGLE_BRACKET ||
				value.charCodeAt(index) === OPEN_BRACE
			) {
				break;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_EXPRESSION') {
			if (quote_type === '' && value.charCodeAt(index) === CLOSE_BRACE) {
				if (brace_count === 0) {
					if (
						node_stack.length === 1 ||
						node_stack[0].type === 'svelteVoidBlock'
					) {
						chomp();
						break;
					}
					state.pop();
					chomp();
					continue;
				}
				brace_count--;
			}

			if (quote_type === '' && value.charCodeAt(index) === OPEN_BRACE) {
				brace_count++;
			}

			if (
				quote_type === '' &&
				(value.charCodeAt(index) === APOSTROPHE ||
					value.charCodeAt(index) === QUOTE ||
					value.charCodeAt(index) === BACKTICK ||
					value.charCodeAt(index) === SLASH)
			) {
				state.push('IN_EXPRESSION_QUOTE');
				quote_type = value[index];
				current_node().value += value[index];
				chomp();
				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_EXPRESSION_QUOTE') {
			if (
				value[index] === quote_type &&
				value.charCodeAt(index - 1) !== BACKSLASH
			) {
				quote_type = '';
				current_node().value += value[index];
				chomp();
				state.pop();
				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		state.push('IN_TEXT');
		const _n = {
			type: 'text',
			value: '',
		};
		node_stack.push(_n);
	}

	return {
		chomped: value.slice(0, index),
		unchomped: value.slice(index),
		parsed: node_stack[0],
		position,
	};
}

function parse_siblings(opts: ParserOptions): [Node[], number] {
	const {
		value,
		currentPosition = {
			line: 1,
			column: 1,
			offset: 0,
		},
		// block = true,
		childParser = parse_siblings,
	} = opts;

	const children = [];

	let unchomped = value;
	let position = Object.assign({}, currentPosition);
	let parsed;
	let index = 0;
	let result;
	for (;;) {
		result = parseNode({
			value: unchomped,
			currentPosition: position,
			childParser,
		});
		if (!result) break;
		({ position, unchomped, parsed } = result);
		//@ts-ignore

		index += position.index;

		children.push(parsed);
		if (unchomped.trim().length === 0) break;
	}

	return [children, index];
}

export function parse(opts: ParserOptions): Root {
	const lineFeed = '\n';
	const lineBreaksExpression = /\r\n|\r/g;

	const root = <Root>{
		type: 'root',
		children: parse_siblings({
			value: opts.value.replace(lineBreaksExpression, lineFeed),
			childParser: parse_siblings,
		})[0],
	};

	return root;
}
