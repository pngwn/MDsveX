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
	Comment,
} from 'svast';

import {
	ParseNodeOptions,
	ParseOptions,
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
	RE_SCRIPT_STYLE,
	RE_COMMENT_START,
	RE_COMMENT_END,
	RE_END_TAG_START,
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

export function parseNode(opts: ParseNodeOptions): Result | undefined {
	let index = 0;
	let quote_type = '';
	let expr_quote_type = '';
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
		generatePositions = true,
	} = opts;

	// TODO: remove this
	const lineFeed = '\n';
	const lineBreaksExpression = /\r\n|\r/g;
	value = value.replace(lineBreaksExpression, lineFeed);

	let position = Object.assign(currentPosition, { index });

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

	// function current_state {
	// 	return state[state.length - 1];
	// }

	function current_node() {
		return node_stack[node_stack.length - 1];
	}

	function place() {
		const _p = Object.assign({}, position);
		delete _p.index;
		return _p;
	}

	let current_state: State;

	function pop_state() {
		state.pop();
		current_state = state[state.length - 1];
	}

	function set_state(name: State, toPop?: boolean) {
		if (toPop) state.pop();

		state.push((current_state = name));
	}

	while (!done && !error) {
		// console.log(value[index], node_stack, state);
		if (!value[index]) {
			if (generatePositions)
				//@ts-ignore
				current_node().position.end = place();
			break;
		}

		// right at the start
		if (!current_state) {
			if (RE_BLOCK_BRANCH.test(value.substring(index))) {
				if (generatePositions && node_stack.length)
					//@ts-ignore
					current_node().position.end = place();
				return;
			}

			if (RE_END_TAG_START.test(value.substring(index))) {
				return;
			}

			if (RE_COMMENT_START.test(value.substring(index))) {
				const _n = <Comment>{
					type: 'comment',
					value: '',
				};

				//@ts-ignore
				if (generatePositions) _n.position = { start: place(), end: {} };

				node_stack.push(_n);
				set_state('IN_COMMENT');
				chomp();
				chomp();
				chomp();
				chomp();
				continue;
			}
			// "{" => tag
			if (value.charCodeAt(index) === OPEN_BRACE) {
				node_stack.push(<SvelteExpression>{
					type: 'svelteExpression',
					value: '',
				});
				if (generatePositions) {
					//@ts-ignore
					current_node().position = { start: place(), end: {} };
				}
				set_state('MAYBE_IN_EXPRESSION');
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_ANGLE_BRACKET) {
				set_state('IN_START_TAG');
				node_stack.push(<BaseSvelteTag>{
					type: '',
					tagName: '',
					properties: [],
					selfClosing: false,
					children: [],
				});
				if (generatePositions)
					//@ts-ignore
					current_node().position = { start: place(), end: {} };

				chomp();
				continue;
			}
		}

		if (current_state === 'IN_COMMENT') {
			if (RE_COMMENT_END.test(value.substring(index))) {
				chomp();
				chomp();
				chomp();

				//@ts-ignore
				if (generatePositions) current_node().position.end = place();
				break;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (current_state === 'MAYBE_IN_EXPRESSION') {
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
				const _n = <VoidBlock>{
					type: 'svelteVoidBlock',
					name: '',
					expression: {
						type: 'svelteExpression',
						value: '',
					},
				};

				if (generatePositions) {
					//@ts-ignore
					_n.position = Object.assign({}, current_node().position);
				}

				node_stack.pop();
				node_stack.push(_n);

				set_state('IN_VOID_BLOCK', true);
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OCTOTHERP) {
				set_state('IN_BRANCHING_BLOCK', true);
				set_state('IN_BRANCHING_BLOCK_NAME');
				chomp();
				continue;
			}

			set_state('IN_EXPRESSION', true);

			continue;
		}

		if (current_state === 'IN_BRANCHING_BLOCK_NAME') {
			if (value.charCodeAt(index) === CLOSE_BRACE) {
				// each
				pop_state();

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
				if (generatePositions) {
					_n.position = Object.assign({}, current_node().position);
					_n2.position = Object.assign({}, current_node().position);
				}

				node_stack.pop();
				node_stack.push(_n);
				node_stack.push(_n2);

				node_stack.push(_n2.expression);
				_n.branches.push(_n2);
				pop_state();

				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_BRANCHING_BLOCK_END') {
			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === LINEFEED ||
				value.charCodeAt(index) === TAB
			) {
				// ERROR - NAME AFTER CLOSING BLOCK SLASH
			}

			if (value.charCodeAt(index) === CLOSE_BRACE) {
				node_stack.pop();
				chomp();
				if (generatePositions)
					//@ts-ignore
					current_node().position.end = place();
				if (closing_tag_name !== current_node().name) {
					// ERROR SHOULD BE A MATCHING NAME (current_node().name)
				}

				break;
			}

			closing_tag_name += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_BRANCHING_BLOCK_BRANCH_NAME') {
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
				if (generatePositions) {
					_n2.position = Object.assign({}, current_node().position);
				}
				node_stack.pop();
				node_stack.pop();
				(current_node() as BranchingBlock).branches.push(_n2);
				node_stack.push(_n2);
				node_stack.push(_n2.expression);

				pop_state();
				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_BRANCHING_BLOCK') {
			if (value.charCodeAt(index) === CLOSE_BRACE) {
				chomp();
				node_stack.pop();
				set_state('PARSE_CHILDREN');
				continue;
			}

			if (value.charCodeAt(index) === SPACE) {
				set_state('IN_EXPRESSION');
				chomp();

				if (generatePositions)
					//@ts-ignore
					current_node().position = { start: place(), end: {} };

				continue;
			}
		}

		if (current_state === 'IN_BRANCHING_BLOCK_BRANCH') {
			if (value.charCodeAt(index) === COLON) {
				set_state('IN_BRANCHING_BLOCK_BRANCH_NAME', true);

				chomp();
				continue;
			}

			if (value.charCodeAt(index) === SLASH) {
				closing_tag_name = '';
				node_stack.pop();
				set_state('IN_BRANCHING_BLOCK_END', true);
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
		}

		if (current_state === 'IN_VOID_BLOCK') {
			if (value.charCodeAt(index) === SPACE) {
				node_stack.push((current_node() as VoidBlock).expression);
				set_state('IN_EXPRESSION');
				chomp();
				if (generatePositions)
					//@ts-ignore
					current_node().position = { start: place(), end: {} };
				continue;
			}

			if (value.charCodeAt(index) === CLOSE_BRACE) {
				//node_stack.push((current_node() as VoidBlock).expression);

				if (generatePositions)
					//@ts-ignore
					(current_node() as VoidBlock).expression.position = {
						start: place(),
						end: place(),
					};

				chomp();
				if (generatePositions)
					//@ts-ignore
					current_node().position.end = place();

				break;
			}

			current_node().name += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_START_TAG') {
			if (value.charCodeAt(index) === SLASH) return undefined;
			// lowercase characters for element names
			if (is_lower_alpha(value.charCodeAt(index))) {
				(current_node() as BaseSvelteTag).type = 'svelteElement';
				set_state('IN_TAG_NAME');
				continue;
			}

			// uppercase characters for Component names
			if (is_upper_alpha(value.charCodeAt(index))) {
				(current_node() as BaseSvelteTag).type = 'svelteComponent';
				set_state('IN_TAG_NAME');
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
		if (current_state === 'IN_TAG_NAME') {
			if (
				value.charCodeAt(index) === SLASH ||
				(value.charCodeAt(index) === CLOSE_ANGLE_BRACKET &&
					is_void_element((current_node() as SvelteElement).tagName))
			) {
				set_state('IN_CLOSING_SLASH', true);
				(current_node() as BaseSvelteTag).selfClosing = true;
				if (value.charCodeAt(index) === SLASH) chomp();
				continue;
			}
			// space or linefeed put us into the tag body
			if (
				value.charCodeAt(index) === SPACE ||
				value.charCodeAt(index) === TAB ||
				value.charCodeAt(index) === LINEFEED
			) {
				set_state('IN_TAG_BODY', true);
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === COLON) {
				current_node().type = 'svelteTag';
				current_node().tagName = '';
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === CLOSE_ANGLE_BRACKET) {
				set_state('IN_TAG_BODY', true);
				continue;
			}

			(current_node() as SvelteTag).tagName += value[index];
			chomp();
			continue;
		}

		// we are inside a start tag after the name
		if (current_state === 'IN_TAG_BODY') {
			if (value.charCodeAt(index) === OPEN_BRACE) {
				set_state('IN_SHORTHAND_ATTR');
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
				if (generatePositions)
					//@ts-ignore
					current_node().position = { start: place(), end: {} };
				chomp();
				continue;
			}
			// letters mean we've hit an attribute
			if (
				is_lower_alpha(value.charCodeAt(index)) ||
				is_upper_alpha(value.charCodeAt(index))
			) {
				set_state('IN_ATTR_NAME');
				const _node = <Property>{
					type: 'svelteProperty',
					name: '',
					value: [],
					modifiers: [],
					shorthand: 'none',
				};

				(current_node() as BaseSvelteTag).properties.push(_node as Property);
				node_stack.push(_node);
				if (generatePositions)
					//@ts-ignore
					current_node().position = { start: place(), end: {} };
				continue;
			}

			// "/" or  ">" (for void tags) put us in a terminal state
			if (
				value.charCodeAt(index) === SLASH ||
				(value.charCodeAt(index) === CLOSE_ANGLE_BRACKET &&
					is_void_element((current_node() as SvelteElement).tagName))
			) {
				set_state('IN_CLOSING_SLASH', true);
				(current_node() as BaseSvelteTag).selfClosing = true;
				if (value.charCodeAt(index) === SLASH) chomp();
				continue;
			}

			if (value.charCodeAt(index) === CLOSE_ANGLE_BRACKET) {
				set_state('PARSE_CHILDREN', true);
				chomp();
				//@ts-ignore
				if (generatePositions) current_node().position.end = place();
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

		if (current_state === 'IN_SHORTHAND_ATTR') {
			if (value.charCodeAt(index) === CLOSE_BRACE) {
				(current_node() as Property).value[0].value = current_node().name;
				pop_state();
				node_stack.pop();
				chomp();
				continue;
			}

			current_node().name += value[index];
			chomp();
			continue;
		}

		// we are expecting the tag to close completely here
		if (current_state === 'IN_CLOSING_SLASH') {
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
				// @ts-ignore
				if (generatePositions) current_node().position.end = place();
				break;
			}

			// DANGER ZONE - something went wrong
		}

		// we are parsing a property name
		if (current_state === 'IN_ATTR_NAME') {
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
				pop_state();
				node_stack.pop();
				continue;
			}

			// ":" => directive
			if (value.charCodeAt(index) === COLON) {
				//@ts-ignore
				(current_node() as Directive).type = 'svelteDirective';
				(current_node() as Directive).specifier = '';
				set_state('IN_DIRECTIVE_SPECIFIER', true);
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === PIPE) {
				chomp();
				const _n = { value: '', type: 'modifier' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: [] };
				(current_node() as Directive).modifiers.push(_n as Literal);
				node_stack.push(_n);
				set_state('IN_ATTR_MODIFIER', true);
				continue;
			}

			if (value.charCodeAt(index) === EQUALS) {
				set_state('IN_ATTR_VALUE', true);
				chomp();
				continue;
			}

			// process the token and chomp, everything is good
			current_node().name += value[index];
			chomp();
			continue;
		}

		// att values can be quoted or unquoted
		if (current_state === 'IN_ATTR_VALUE') {
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
				set_state('IN_QUOTED_ATTR_VALUE', true);
				quote_type = value[index];

				node_stack.push({ type: 'blank' });
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_BRACE) {
				set_state('IN_UNQUOTED_ATTR_VALUE', true);

				const _n = <SvelteExpression>{ type: 'svelteExpression', value: '' };
				(current_node() as Property).value.push(_n as SvelteExpression);
				node_stack.push(_n);
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				continue;
			} else {
				set_state('IN_UNQUOTED_ATTR_VALUE', true);
				const _n = { type: 'text', value: '' };
				(current_node() as Property).value.push(_n as Text);
				node_stack.push(_n);
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };

				continue;
			}

			// unquoted
		}

		if (current_state === 'IN_UNQUOTED_ATTR_VALUE') {
			let s;
			// " ", "\n", "/" or ">" => ends the whole thing
			if (
				(s = value.charCodeAt(index)) === SPACE ||
				s === TAB ||
				s === LINEFEED ||
				s === CLOSE_ANGLE_BRACKET ||
				/^\/\s*>/.test(value.slice(index))
			) {
				pop_state();
				if (generatePositions)
					//@ts-ignore
					current_node().position.end = place();
				node_stack.pop();
				if (generatePositions)
					//@ts-ignore
					current_node().position.end = place();
				node_stack.pop();
				continue;
			}

			if (value.charCodeAt(index) === OPEN_BRACE) {
				set_state('IN_EXPRESSION');

				chomp();
				continue;
			}

			(current_node() as Text).value += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_QUOTED_ATTR_VALUE') {
			// if we meet our matching quote the attribute has ended
			if (value[index] === quote_type) {
				//@ts-ignore
				if (generatePositions) current_node().position.end = place();
				//end
				node_stack.pop();
				quote_type = '';
				chomp();
				pop_state();
				//@ts-ignore
				if (generatePositions) current_node().position.end = place();
				node_stack.pop();

				continue;
			}

			if (value.charCodeAt(index) === OPEN_BRACE) {
				if (generatePositions && current_node().type !== 'blank')
					//@ts-ignore
					current_node().position.end = place();
				node_stack.pop();
				const _n = {
					type: 'svelteExpression',
					value: '',
				};
				(current_node() as Property).value.push(_n as SvelteExpression);
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				node_stack.push(_n);
				set_state('IN_EXPRESSION');
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
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node() as Property).value.push(_n as Text);
				node_stack.push(_n);
				chomp();
				continue;
			}

			if (value.charCodeAt(index - 1) === CLOSE_BRACE) {
				node_stack.pop();
				const _n = { type: 'text', value: value[index] };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node() as Property).value.push(_n as Text);
				node_stack.push(_n);
				chomp();
				continue;
			}

			if (current_node().type === 'blank') {
				node_stack.pop();
				const _n = { type: 'text', value: '' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node() as Property).value.push(_n as Text);
				node_stack.push(_n);
			}

			// capture the token otherwise
			(current_node() as Text).value += value[index];

			chomp();
			continue;
		}

		if (current_state === 'IN_DIRECTIVE_SPECIFIER') {
			if (value.charCodeAt(index) === EQUALS) {
				set_state('IN_ATTR_VALUE', true);
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === PIPE) {
				const _n = { value: '', type: 'modifier' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node() as Directive).modifiers.push(_n as Literal);
				node_stack.push(_n);
				set_state('IN_ATTR_MODIFIER', true);
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
				pop_state();
				node_stack.pop();
				continue;
			}

			(current_node() as Directive).specifier += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_ATTR_MODIFIER') {
			if (value.charCodeAt(index) === PIPE) {
				node_stack.pop();
				const _n = { value: '', type: 'modifier' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node() as Directive).modifiers.push(_n as Literal);
				node_stack.push(_n);
				chomp();
				continue;
			}

			if (value.charCodeAt(index) === EQUALS) {
				set_state('IN_ATTR_VALUE', true);
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
				pop_state();
				continue;
			}
			(current_node() as Literal).value += value[index];
			chomp();
			continue;
		}

		if (current_state == 'IN_SCRIPT_STYLE') {
			if (value.charCodeAt(index) === OPEN_ANGLE_BRACKET) {
				if (RE_SCRIPT_STYLE.test(value.substring(index))) {
					if (generatePositions)
						//@ts-ignore
						current_node().position.end = place();
					node_stack.pop();
					set_state('EXPECT_END_OR_BRANCH', true);
					continue;
				}
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (current_state === 'PARSE_CHILDREN') {
			if (
				current_node().tagName === 'script' ||
				current_node().tagName === 'style'
			) {
				current_node().type = 'svelteTag';
				const _n = {
					type: 'text',
					value: '',
				};
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node() as SvelteTag).children.push(_n as Text);
				node_stack.push(_n);

				set_state('IN_SCRIPT_STYLE', true);
				continue;
			} else {
				const [children, lastPosition, lastIndex] = childParser({
					generatePositions,
					value: value.slice(index),
					currentPosition: position,
					childParser,
				});
				current_node().children = children;
				const _index = position.index + lastIndex;

				position = Object.assign({}, lastPosition) as Point & { index: number };
				position.index = _index;
				index = position.index;
			}

			set_state('EXPECT_END_OR_BRANCH', true);
		}

		if (current_state === 'EXPECT_END_OR_BRANCH') {
			let s;

			if (RE_BLOCK_BRANCH.test(value.substring(index))) {
				set_state('IN_BRANCHING_BLOCK_BRANCH', true);
				const _n = <Text>{
					type: 'text',
					value: '',
				};

				if (generatePositions) {
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				}

				//@ts-ignore
				if (generatePositions) current_node().position.end = place();
				node_stack.push(_n);
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
				chomp();

				if (generatePositions) {
					//@ts-ignore
					current_node().position.end = place();
				}

				let current_node_name = closing_tag_name;

				if (current_node().type === 'svelteTag') {
					current_node_name = current_node_name.replace('svelte:', '');
				}

				if (current_node_name !== current_node().tagName) {
					console.log(
						`Was expecting a closing tag for ${
							current_node().tagName
						} but got ${closing_tag_name}`,
						JSON.stringify(current_node().position)
					);
				}

				break;
			}

			closing_tag_name += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_TEXT') {
			if (
				value.charCodeAt(index) === OPEN_ANGLE_BRACKET ||
				value.charCodeAt(index) === OPEN_BRACE
			) {
				if (generatePositions)
					//@ts-ignore
					current_node().position.end = place();
				break;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_EXPRESSION') {
			if (expr_quote_type === '' && value.charCodeAt(index) === CLOSE_BRACE) {
				if (brace_count === 0) {
					if (
						node_stack.length === 1 ||
						node_stack[0].type === 'svelteVoidBlock'
					) {
						if (generatePositions && node_stack[0].type === 'svelteVoidBlock') {
							//@ts-ignore
							current_node().position.end = place();
							node_stack.pop();
						}

						chomp();

						if (generatePositions) {
							//@ts-ignore
							current_node().position.end = place();
						}
						break;
					} else if (
						node_stack[node_stack.length - 2].type === 'svelteBranch'
					) {
						pop_state();

						if (generatePositions) {
							//@ts-ignore
							current_node().position.end = place();
						}
						// chomp();
						continue;
					} else {
						pop_state();
						chomp();
						if (generatePositions) {
							//@ts-ignore
							current_node().position.end = place();
						}
						continue;
					}
				}
				brace_count--;
			}

			if (expr_quote_type === '' && value.charCodeAt(index) === OPEN_BRACE) {
				brace_count++;
			}

			if (
				expr_quote_type === '' &&
				(value.charCodeAt(index) === APOSTROPHE ||
					value.charCodeAt(index) === QUOTE ||
					value.charCodeAt(index) === BACKTICK)
			) {
				set_state('IN_EXPRESSION_QUOTE');
				expr_quote_type = value[index];
				current_node().value += value[index];
				chomp();
				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		if (current_state === 'IN_EXPRESSION_QUOTE') {
			if (
				value[index] === expr_quote_type &&
				value.charCodeAt(index - 1) !== BACKSLASH
			) {
				expr_quote_type = '';
				current_node().value += value[index];
				chomp();
				pop_state();
				continue;
			}

			current_node().value += value[index];
			chomp();
			continue;
		}

		set_state('IN_TEXT');
		const _n = {
			type: 'text',
			value: '',
		};

		node_stack.push(_n);
		if (generatePositions)
			//@ts-ignore
			_n.position = { start: place(), end: {} };
	}

	return {
		chomped: value.slice(0, index),
		unchomped: value.slice(index),
		parsed: node_stack[0],
		position,
	};
}

function parse_siblings(opts: ParseNodeOptions): [Node[], Point, number] {
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
	let position: Point & { index?: number } = Object.assign({}, currentPosition);
	let parsed;
	let index = 0;
	let result;
	for (;;) {
		result = parseNode({
			generatePositions: opts.generatePositions,
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

	return [children, position, index];
}

export function parse(opts: ParseOptions): Root {
	const lineFeed = '\n';
	const lineBreaksExpression = /\r\n|\r/g;

	const root = <Root>{
		type: 'root',
		children: parse_siblings({
			generatePositions: opts.generatePositions,
			value: opts.value.replace(lineBreaksExpression, lineFeed),
			childParser: parse_siblings,
		})[0],
	};

	if (opts.generatePositions) {
		root.position = {
			start: { column: 1, line: 1, offset: 0 },
			//@ts-ignore
			end: root.children[root.children.length - 1].position.end,
		};
	}

	return root;
}
