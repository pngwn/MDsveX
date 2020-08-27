import {
	Point,
	Node,
	BaseSvelteTag,
	SvelteTag,
	Property,
	SvelteElement,
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

export function parseNode(opts: ParserOptions): Result {
	let index = 0;

	const {
		value,
		currentPosition = pos,
		block = true,
		childParser = parseNode,
	} = opts;

	const position = Object.assign(currentPosition, { index, offset: 0 });

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

		position.offset++;
		// stay in sync
		position.index = index;
	}

	let done;
	let error;
	let node: Node = {
		type: '',
	};
	const state: State[] = [];

	function get_state() {
		return state[state.length - 1];
	}

	while (!done && !error) {
		// console.log(value[position.index], state);
		if (!value[position.index]) break;

		// right at the start
		if (!get_state()) {
			// "<" => tag
			if (value.charCodeAt(position.index) === OPEN_ANGLE_BRACKET) {
				state.push('IN_START_TAG');
				node = <BaseSvelteTag>{
					type: '',
					tagName: '',
					properties: [],
					selfClosing: false,
					children: [],
				};
				chomp();
				continue;
			}

			// "{" => expression or block
			if (value.charCodeAt(position.index) === OPEN_BRACE) {
				chomp();
				// expression or svelte block
				// state.push('IN_EXPRESSION');
			}
		}

		if (get_state() === 'IN_START_TAG') {
			// lowercase characters for element names
			if (is_lower_alpha(value.charCodeAt(position.index))) {
				(node as BaseSvelteTag).type = 'svelteElement';
				state.push('IN_TAG_NAME');
				continue;
			}

			// uppercase characters for Component names
			if (is_upper_alpha(value.charCodeAt(position.index))) {
				(node as BaseSvelteTag).type = 'svelteComponent';
				state.push('IN_TAG_NAME');
				continue;
			}
		}

		// we are inside a tags name
		if (get_state() === 'IN_TAG_NAME') {
			// space or linefeed put us into the tag body
			if (
				value.charCodeAt(position.index) === SPACE ||
				value.charCodeAt(position.index) === LINEFEED
			) {
				state.pop();
				state.push('IN_TAG_BODY');
				chomp();
				continue;
			}

			(node as SvelteTag).tagName += value[position.index];
			chomp();
			continue;
		}

		// we are inside a start tag after the name
		if (get_state() === 'IN_TAG_BODY') {
			// letters mean we've hit an attribute
			if (
				is_lower_alpha(value.charCodeAt(position.index)) ||
				is_upper_alpha(value.charCodeAt(position.index))
			) {
				state.push('IN_ATTR_NAME');
				(node as BaseSvelteTag).properties.push(<Property>{
					type: 'svelteProperty',
					name: '',
					value: [],
					modifiers: [],
					shorthand: 'none',
				});

				continue;
			}

			// "/" or  ">" (for void tags) put us in a terminal state
			if (
				value.charCodeAt(position.index) === SLASH ||
				(value.charCodeAt(position.index) === CLOSE_ANGLE_BRACKET &&
					is_void_element((node as SvelteElement).tagName))
			) {
				state.pop();
				state.push('IN_CLOSING_SLASH');
				(node as BaseSvelteTag).selfClosing = true;
				chomp();
				continue;
			}

			if (value.charCodeAt(position.index) === SPACE) {
				chomp();
				continue;
			}
		}

		// we are expecting the tag to close completely here
		if (get_state() === 'IN_CLOSING_SLASH') {
			// ignore ws
			if (
				value.charCodeAt(position.index) === SPACE ||
				value.charCodeAt(position.index) === LINEFEED
			) {
				chomp();
				continue;
			}
			// we closed successfully, end the parse
			if (value.charCodeAt(position.index) === CLOSE_ANGLE_BRACKET) {
				chomp();
				done = true;
				break;
			}

			// DANGER ZONE - something went wrong
		}

		// we are parsing an property name
		if (get_state() === 'IN_ATTR_NAME') {
			let s;
			// " ", "\n", "/" or ">" => shorthand boolean attr
			if (
				(s = value.charCodeAt(position.index)) === SPACE ||
				s === LINEFEED ||
				s === SLASH ||
				s === CLOSE_ANGLE_BRACKET
			) {
				(node as BaseSvelteTag).properties[
					(node as BaseSvelteTag).properties.length - 1
				].shorthand = 'boolean';
				state.pop();
				continue;
			}

			// ":" => directive
			if (value.charCodeAt(position.index) === COLON) {
				// this is a directive - change state
			}

			if (value.charCodeAt(position.index) === EQUALS) {
				state.pop();
				state.push('IN_ATTR_VALUE');
				chomp();
				continue;
			}

			// process the token and chomp, everything is good
			(node as BaseSvelteTag).properties[
				(node as BaseSvelteTag).properties.length - 1
			].name += value[position.index];
			chomp();
			continue;
		}

		if (get_state() === 'IN_ATTR_VALUE') {
			//
			if (
				value.charCodeAt(position.index) === QUOTE ||
				value.charCodeAt(position.index) === APOSTROPHE
			) {
				// quote attr
			}
			state.pop();
			state.push('IN_UNQUOTED_ATTR_VALUE');
			(node as BaseSvelteTag).properties[
				(node as BaseSvelteTag).properties.length - 1
			].value.push({ type: 'text', value: '' });

			continue;
		}

		if (get_state() === 'IN_UNQUOTED_ATTR_VALUE') {
			let s;
			// " ", "\n", "/" or ">" => shorthand boolean attr
			if (
				(s = value.charCodeAt(position.index)) === SPACE ||
				s === LINEFEED ||
				s === SLASH ||
				s === CLOSE_ANGLE_BRACKET
			) {
				state.pop();
				continue;
			}
			const prop = (node as BaseSvelteTag).properties.length - 1;
			const val = (node as BaseSvelteTag).properties[prop].value.length - 1;

			(node as BaseSvelteTag).properties[prop].value[val].value +=
				value[position.index];
			chomp();
			continue;
		}
	}

	return {
		chomped: 'asd',
		unchomped: 'asd',
		parsed: node,
		position: currentPosition,
	};
}
