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
	Parent,
	SvelteComponent,
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

export function parseNode(opts: ParseNodeOptions): Result | undefined {
	let index = 0;
	let quote_type = '';
	let expr_quote_type = '';
	let closing_tag_name = '';
	let brace_count = 0;

	const node_stack: Node[] = [];
	const state: State[] = [];

	const { value, block = true, childParser, generatePositions = true } = opts;

	let position = opts.currentPosition || {
		line: 1,
		column: 1,
		offset: 0,
		index,
	};

	let char = value.charCodeAt(index);

	function chomp() {
		// newline means new line
		if (char === LINEFEED) {
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
		char = value.charCodeAt(index);
	}

	function place() {
		const _p = Object.assign({}, position);
		delete _p.index;
		return _p;
	}

	let current_state: State | undefined;

	function pop_state() {
		state.pop();
		current_state = state[state.length - 1];
	}

	function set_state(name: State, toPop?: boolean) {
		if (toPop) state.pop();
		state.push((current_state = name));
	}

	let current_node: Node | undefined;

	function push_node(node: Node) {
		node_stack.push((current_node = node));
	}

	function pop_node() {
		node_stack.pop();
		current_node = node_stack[node_stack.length - 1];
	}

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
				const _n = <Comment>{
					type: 'comment',
					value: '',
				};

				//@ts-ignore
				if (generatePositions) _n.position = { start: place(), end: {} };

				push_node(_n);
				set_state(State.IN_COMMENT);
				chomp();
				chomp();
				chomp();
				chomp();
				continue;
			}
			// "{" => tag
			if (char === OPEN_BRACE) {
				push_node(<SvelteExpression>{
					type: 'svelteExpression',
					value: '',
				});
				if (generatePositions) {
					//@ts-ignore
					current_node.position = { start: place(), end: {} };
				}
				set_state(State.MAYBE_IN_EXPRESSION);
				chomp();
				continue;
			}

			if (char === OPEN_ANGLE_BRACKET) {
				set_state(State.IN_START_TAG);
				push_node(<BaseSvelteTag<''>>{
					type: '',
					tagName: '',
					properties: [],
					selfClosing: false,
					children: [],
				});
				if (generatePositions)
					//@ts-ignore
					current_node.position = { start: place(), end: {} };

				chomp();
				continue;
			}
		}

		if (current_state === State.IN_COMMENT) {
			if (RE_COMMENT_END.test(value.substring(index))) {
				chomp();
				chomp();
				chomp();

				//@ts-ignore
				if (generatePositions) current_node.position.end = place();
				break;
			}

			(current_node as Comment).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.MAYBE_IN_EXPRESSION) {
			if (char === SPACE || char === LINEFEED || char === TAB) {
				chomp();
				continue;
			}

			if (char === AT) {
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
					_n.position = Object.assign({}, current_node.position);
				}

				pop_node();
				push_node(_n);

				set_state(State.IN_VOID_BLOCK, true);
				chomp();
				continue;
			}

			if (char === OCTOTHERP) {
				set_state(State.IN_BRANCHING_BLOCK, true);
				set_state(State.IN_BRANCHING_BLOCK_NAME);
				chomp();
				continue;
			}

			set_state(State.IN_EXPRESSION, true);

			continue;
		}

		if (current_state === State.IN_BRANCHING_BLOCK_NAME) {
			if (char === CLOSE_BRACE) {
				// each
				pop_state();

				continue;
			}

			if (char === SPACE) {
				const _n = <BranchingBlock>{
					type: 'svelteBranchingBlock',
					name: (current_node as SvelteExpression).value,
					branches: [],
				};
				const _n2 = <Branch>{
					type: 'svelteBranch',
					name: (current_node as SvelteExpression).value,
					expression: {
						type: 'svelteExpression',
						value: '',
					},
					children: [],
				};
				if (generatePositions) {
					_n.position = Object.assign(
						{},
						(current_node as SvelteExpression).position
					);
					_n2.position = Object.assign(
						{},
						(current_node as SvelteExpression).position
					);
				}

				pop_node();
				push_node(_n);
				push_node(_n2);

				push_node(_n2.expression);
				_n.branches.push(_n2);
				pop_state();

				continue;
			}

			(current_node as SvelteExpression).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_BRANCHING_BLOCK_END) {
			if (char === SPACE || char === LINEFEED || char === TAB) {
				// ERROR - NAME AFTER CLOSING BLOCK SLASH
			}

			if (char === CLOSE_BRACE) {
				pop_node();
				chomp();
				if (generatePositions)
					//@ts-ignore
					current_node.position.end = place();
				if (closing_tag_name !== (current_node as BranchingBlock).name) {
					// ERROR SHOULD BE A MATCHING NAME (current_node.name)
				}

				break;
			}

			closing_tag_name += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_BRANCHING_BLOCK_BRANCH_NAME) {
			if (
				(char === SPACE &&
					value.substring(index - 4, index + 3) !== 'else if') ||
				char === CLOSE_BRACE
			) {
				const _n2 = <Branch>{
					type: 'svelteBranch',
					name: (current_node as SvelteExpression).value,
					expression: {
						type: 'svelteExpression',
						value: '',
					},
					children: [],
				};
				if (generatePositions) {
					_n2.position = Object.assign(
						{},
						(current_node as SvelteExpression).position
					);
				}
				pop_node();
				pop_node();
				(current_node as BranchingBlock).branches.push(_n2);
				push_node(_n2);
				push_node(_n2.expression);

				pop_state();
				continue;
			}

			(current_node as SvelteExpression).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_BRANCHING_BLOCK) {
			if (char === CLOSE_BRACE) {
				chomp();
				pop_node();
				set_state(State.PARSE_CHILDREN);
				continue;
			}

			if (char === SPACE) {
				set_state(State.IN_EXPRESSION);
				chomp();

				if (generatePositions)
					//@ts-ignore
					current_node.position = { start: place(), end: {} };

				continue;
			}
		}

		if (current_state === State.IN_BRANCHING_BLOCK_BRANCH) {
			if (char === COLON) {
				set_state(State.IN_BRANCHING_BLOCK_BRANCH_NAME, true);

				chomp();
				continue;
			}

			if (char === SLASH) {
				closing_tag_name = '';
				pop_node();
				set_state(State.IN_BRANCHING_BLOCK_END, true);
				chomp();
				continue;
			}

			if (char === SPACE || char === LINEFEED || char === TAB) {
				chomp();
				continue;
			}
		}

		if (current_state === State.IN_VOID_BLOCK) {
			if (char === SPACE) {
				push_node((current_node as VoidBlock).expression);
				set_state(State.IN_EXPRESSION);
				chomp();
				if (generatePositions)
					//@ts-ignore
					current_node.position = { start: place(), end: {} };
				continue;
			}

			if (char === CLOSE_BRACE) {
				if (generatePositions)
					//@ts-ignore
					(current_node as VoidBlock).expression.position = {
						start: place(),
						end: place(),
					};

				chomp();
				if (generatePositions)
					//@ts-ignore
					current_node.position.end = place();

				break;
			}

			(current_node as VoidBlock).name += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_START_TAG) {
			if (char === SLASH) return;
			// lowercase characters for element names
			if (is_lower_alpha(char)) {
				(current_node as BaseSvelteTag<'svelteElement'>).type = 'svelteElement';
				set_state(State.IN_TAG_NAME);
				continue;
			}

			// uppercase characters for Component names
			if (is_upper_alpha(char)) {
				(current_node as BaseSvelteTag<'svelteComponent'>).type =
					'svelteComponent';
				set_state(State.IN_TAG_NAME);
				continue;
			}

			if (char === SPACE || char === TAB || char === LINEFEED) {
				chomp();
				continue;
			}
		}

		// we are inside a tags name
		if (current_state === State.IN_TAG_NAME) {
			if (
				char === SLASH ||
				(char === CLOSE_ANGLE_BRACKET &&
					//@ts-ignore
					void_els[current_node.tagName] !== void 0)
			) {
				set_state(State.IN_CLOSING_SLASH, true);
				(current_node as SvelteElement).selfClosing = true;
				if (char === SLASH) chomp();
				continue;
			}
			// space or linefeed put us into the tag body
			if (char === SPACE || char === TAB || char === LINEFEED) {
				set_state(State.IN_TAG_BODY, true);
				chomp();
				continue;
			}

			if (char === COLON) {
				(current_node as SvelteTag).type = 'svelteTag';
				(current_node as SvelteTag).tagName = '';
				chomp();
				continue;
			}

			if (char === CLOSE_ANGLE_BRACKET) {
				set_state(State.IN_TAG_BODY, true);
				continue;
			}

			(current_node as SvelteTag).tagName += value[index];
			chomp();
			continue;
		}

		// we are inside a start tag after the name
		if (current_state === State.IN_TAG_BODY) {
			if (char === OPEN_BRACE) {
				set_state(State.IN_SHORTHAND_ATTR);
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

				(current_node as BaseSvelteTag<''>).properties.push(_node as Property);
				push_node(_node);
				if (generatePositions)
					//@ts-ignore
					current_node.position = { start: place(), end: {} };
				chomp();
				continue;
			}
			// letters mean we've hit an attribute
			if (is_lower_alpha(char) || is_upper_alpha(char)) {
				set_state(State.IN_ATTR_NAME);
				const _node = <Property>{
					type: 'svelteProperty',
					name: '',
					value: [],
					modifiers: [],
					shorthand: 'none',
				};

				(current_node as BaseSvelteTag<''>).properties.push(_node as Property);
				push_node(_node);
				if (generatePositions)
					//@ts-ignore
					current_node.position = { start: place(), end: {} };
				continue;
			}

			// "/" or  ">" (for void tags) put us in a terminal state
			if (
				char === SLASH ||
				(char === CLOSE_ANGLE_BRACKET &&
					//@ts-ignore
					void_els[current_node.tagName] !== void 0)
			) {
				set_state(State.IN_CLOSING_SLASH, true);
				(current_node as BaseSvelteTag<''>).selfClosing = true;
				if (char === SLASH) chomp();
				continue;
			}

			if (char === CLOSE_ANGLE_BRACKET) {
				set_state(State.PARSE_CHILDREN, true);
				chomp();
				//@ts-ignore
				if (generatePositions) current_node.position.end = place();
				continue;
			}

			if (char === SPACE || char === TAB || char === LINEFEED) {
				chomp();
				continue;
			}
		}

		if (current_state === State.IN_SHORTHAND_ATTR) {
			if (char === CLOSE_BRACE) {
				(current_node as Property).value[0].value = (current_node as Property).name;
				pop_state();
				pop_node();
				chomp();
				continue;
			}

			(current_node as Property).name += value[index];
			chomp();
			continue;
		}

		// we are expecting the tag to close completely here
		if (current_state === State.IN_CLOSING_SLASH) {
			// ignore ws
			if (char === SPACE || char === TAB || char === LINEFEED) {
				chomp();
				continue;
			}
			// we closed successfully, end the parse
			if (char === CLOSE_ANGLE_BRACKET) {
				chomp();
				// @ts-ignore
				if (generatePositions) current_node.position.end = place();
				break;
			}

			// DANGER ZONE - something went wrong
		}

		// we are parsing a property name
		if (current_state === State.IN_ATTR_NAME) {
			// " ", "\n", "/" or ">" => shorthand boolean attr

			if (
				char === SPACE ||
				char === TAB ||
				char === LINEFEED ||
				char === SLASH ||
				char === CLOSE_ANGLE_BRACKET
			) {
				(current_node as Property).shorthand = 'boolean';
				pop_state();
				pop_node();
				continue;
			}

			// ":" => directive
			if (char === COLON) {
				//@ts-ignore
				(current_node as Directive).type = 'svelteDirective';
				(current_node as Directive).specifier = '';
				set_state(State.IN_DIRECTIVE_SPECIFIER, true);
				chomp();
				continue;
			}

			if (char === PIPE) {
				chomp();
				const _n = { value: '', type: 'modifier' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: [] };
				(current_node as Directive).modifiers.push(_n as Literal);
				push_node(_n);
				set_state(State.IN_ATTR_MODIFIER, true);
				continue;
			}

			if (char === EQUALS) {
				set_state(State.IN_ATTR_VALUE, true);
				chomp();
				continue;
			}

			// process the token and chomp, everything is good
			(current_node as Property).name += value[index];
			chomp();
			continue;
		}

		// att values can be quoted or unquoted
		if (current_state === State.IN_ATTR_VALUE) {
			// ignore whitespace it is valid after `=`

			if (char === SPACE || char === TAB || char === LINEFEED) {
				chomp();
				continue;
			}

			// quoted attr

			if (char === QUOTE || char === APOSTROPHE) {
				set_state(State.IN_QUOTED_ATTR_VALUE, true);
				quote_type = value[index];

				push_node({ type: 'blank' });
				chomp();
				continue;
			}

			if (char === OPEN_BRACE) {
				set_state(State.IN_UNQUOTED_ATTR_VALUE, true);

				const _n = <SvelteExpression>{ type: 'svelteExpression', value: '' };
				(current_node as Property).value.push(_n as SvelteExpression);
				push_node(_n);
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				continue;
			} else {
				set_state(State.IN_UNQUOTED_ATTR_VALUE, true);
				const _n = { type: 'text', value: '' };
				(current_node as Property).value.push(_n as Text);
				push_node(_n);
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };

				continue;
			}

			// unquoted
		}

		if (current_state === State.IN_UNQUOTED_ATTR_VALUE) {
			// " ", "\n", "/" or ">" => ends the whole thing
			if (
				char === SPACE ||
				char === TAB ||
				char === LINEFEED ||
				char === CLOSE_ANGLE_BRACKET ||
				/^\/\s*>/.test(value.substring(index))
			) {
				pop_state();
				if (generatePositions)
					//@ts-ignore
					current_node.position.end = place();
				pop_node();
				if (generatePositions)
					//@ts-ignore
					current_node.position.end = place();
				pop_node();
				continue;
			}

			if (char === OPEN_BRACE) {
				set_state(State.IN_EXPRESSION);

				chomp();
				continue;
			}

			(current_node as Text).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_QUOTED_ATTR_VALUE) {
			// if we meet our matching quote the attribute has ended
			if (value[index] === quote_type) {
				//@ts-ignore
				if (generatePositions) current_node.position.end = place();
				//end
				pop_node();
				quote_type = '';
				chomp();
				pop_state();
				//@ts-ignore
				if (generatePositions) current_node.position.end = place();
				pop_node();

				continue;
			}

			if (char === OPEN_BRACE) {
				//@ts-ignore
				if (generatePositions && current_node.type !== 'blank')
					//@ts-ignore
					current_node.position.end = place();
				pop_node();
				const _n = {
					type: 'svelteExpression',
					value: '',
				};
				(current_node as Property).value.push(_n as SvelteExpression);
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				push_node(_n);
				set_state(State.IN_EXPRESSION);
				chomp();
				continue;
			}

			if (char === CLOSE_BRACE) {
				chomp();
				continue;
			}

			// " ", "\n" => still in the attribute value but make a new node
			if (char === SPACE || char === TAB || char === LINEFEED) {
				const _c = current_node as Text | SvelteExpression;
				if (_c.type === 'text' && _c.value === '') {
					chomp();
					continue;
				}
				pop_node();
				const _n = { type: 'text', value: '' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node as Property).value.push(_n as Text);
				push_node(_n);
				chomp();
				continue;
			}

			if (value.charCodeAt(index - 1) === CLOSE_BRACE) {
				pop_node();
				const _n = { type: 'text', value: value[index] };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node as Property).value.push(_n as Text);
				push_node(_n);
				chomp();
				continue;
			}

			//@ts-ignore
			if (current_node.type === 'blank') {
				pop_node();
				const _n = { type: 'text', value: '' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node as Property).value.push(_n as Text);
				push_node(_n);
			}

			// capture the token otherwise
			(current_node as Text).value += value[index];

			chomp();
			continue;
		}

		if (current_state === State.IN_DIRECTIVE_SPECIFIER) {
			if (char === EQUALS) {
				set_state(State.IN_ATTR_VALUE, true);
				chomp();
				continue;
			}

			if (char === PIPE) {
				const _n = { value: '', type: 'modifier' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node as Directive).modifiers.push(_n as Literal);
				push_node(_n);
				set_state(State.IN_ATTR_MODIFIER, true);
				chomp();
				continue;
			}

			// " ", "\n", "/" or ">" => ends the whole thing
			if (
				char === SPACE ||
				char === TAB ||
				char === LINEFEED ||
				char === SLASH ||
				char === CLOSE_ANGLE_BRACKET
			) {
				pop_state();
				pop_node();
				continue;
			}

			(current_node as Directive).specifier += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_ATTR_MODIFIER) {
			if (char === PIPE) {
				pop_node();
				const _n = { value: '', type: 'modifier' };
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node as Directive).modifiers.push(_n as Literal);
				push_node(_n);
				chomp();
				continue;
			}

			if (char === EQUALS) {
				set_state(State.IN_ATTR_VALUE, true);
				pop_node();
				chomp();
				continue;
			}

			if (char === SPACE || char === TAB || char === LINEFEED) {
				chomp();
				continue;
			}

			if (char === SLASH || char === CLOSE_ANGLE_BRACKET) {
				pop_node();
				pop_node();
				pop_state();
				continue;
			}
			(current_node as Literal).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_SCRIPT_STYLE) {
			if (char === OPEN_ANGLE_BRACKET) {
				if (RE_SCRIPT_STYLE.test(value.substring(index))) {
					if (generatePositions)
						//@ts-ignore
						current_node.position.end = place();
					pop_node();
					set_state(State.EXPECT_END_OR_BRANCH, true);
					continue;
				}
			}

			(current_node as SvelteTag).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.PARSE_CHILDREN) {
			if (
				(current_node as SvelteElement | SvelteTag).tagName === 'script' ||
				(current_node as SvelteElement | SvelteTag).tagName === 'style'
			) {
				(current_node as SvelteElement | SvelteTag).type = 'svelteTag';
				const _n = {
					type: 'text',
					value: '',
				};
				if (generatePositions)
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				(current_node as SvelteTag).children.push(_n as Text);
				push_node(_n);

				set_state(State.IN_SCRIPT_STYLE, true);
				continue;
			} else {
				const result = childParser({
					generatePositions,
					value: value.substring(index),
					currentPosition: position,
					childParser,
				});

				(current_node as Parent).children = result[0];
				//@ts-ignore
				const _index = position.index + result[2];

				position = Object.assign({}, result[1]) as Point & { index: number };
				position.index = _index;
				index = position.index;
				char = value.charCodeAt(index);
			}

			set_state(State.EXPECT_END_OR_BRANCH, true);
		}

		if (current_state === State.EXPECT_END_OR_BRANCH) {
			if (RE_BLOCK_BRANCH.test(value.substring(index))) {
				set_state(State.IN_BRANCHING_BLOCK_BRANCH, true);
				const _n = <Text>{
					type: 'text',
					value: '',
				};

				if (generatePositions) {
					//@ts-ignore
					_n.position = { start: place(), end: {} };
				}

				//@ts-ignore
				if (generatePositions) current_node.position.end = place();
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

				let current_node_name = closing_tag_name;

				if ((current_node as Node).type === 'svelteTag') {
					current_node_name = current_node_name.replace('svelte:', '');
				}

				if (
					current_node_name !==
					(current_node as SvelteTag | SvelteComponent | SvelteElement).tagName
				) {
					console.log(
						`Was expecting a closing tag for ${
							(current_node as SvelteTag | SvelteComponent | SvelteElement)
								.tagName
						} but got ${closing_tag_name}`,
						//@ts-ignore
						JSON.stringify(current_node.position)
					);
				}

				break;
			}

			closing_tag_name += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_TEXT) {
			if (char === OPEN_ANGLE_BRACKET || char === OPEN_BRACE) {
				if (generatePositions)
					//@ts-ignore
					current_node.position.end = place();
				break;
			}

			(current_node as Text).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_EXPRESSION) {
			if (expr_quote_type === '' && char === CLOSE_BRACE) {
				if (brace_count === 0) {
					if (
						node_stack.length === 1 ||
						node_stack[0].type === 'svelteVoidBlock'
					) {
						if (generatePositions && node_stack[0].type === 'svelteVoidBlock') {
							//@ts-ignore
							current_node.position.end = place();
							pop_node();
						}

						chomp();

						if (generatePositions) {
							//@ts-ignore
							current_node.position.end = place();
						}
						break;
					} else if (
						node_stack[node_stack.length - 2].type === 'svelteBranch'
					) {
						pop_state();

						if (generatePositions) {
							//@ts-ignore
							current_node.position.end = place();
						}
						continue;
					} else {
						pop_state();
						chomp();
						if (generatePositions) {
							//@ts-ignore
							current_node.position.end = place();
						}
						continue;
					}
				}
				brace_count--;
			}

			if (expr_quote_type === '' && char === OPEN_BRACE) {
				brace_count++;
			}

			if (
				expr_quote_type === '' &&
				(char === APOSTROPHE || char === QUOTE || char === BACKTICK)
			) {
				set_state(State.IN_EXPRESSION_QUOTE);
				expr_quote_type = value[index];
				(current_node as SvelteExpression).value += value[index];
				chomp();
				continue;
			}

			(current_node as SvelteExpression).value += value[index];
			chomp();
			continue;
		}

		if (current_state === State.IN_EXPRESSION_QUOTE) {
			if (
				value[index] === expr_quote_type &&
				value.charCodeAt(index - 1) !== BACKSLASH
			) {
				expr_quote_type = '';
				(current_node as SvelteExpression).value += value[index];
				chomp();
				pop_state();
				continue;
			}

			(current_node as SvelteExpression).value += value[index];
			chomp();
			continue;
		}

		set_state(State.IN_TEXT);
		const _n = {
			type: 'text',
			value: '',
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
		position = result.position;
		unchomped = result.unchomped;
		parsed = result.parsed;
		//@ts-ignore

		index += position.index;

		children.push(parsed);
		if (unchomped.trim().length === 0) break;
	}

	return [children, position, index];
}

const lineFeed = '\n';
const lineBreaksExpression = /\r\n|\r/g;

export function parse(opts: ParseOptions): Root {
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
