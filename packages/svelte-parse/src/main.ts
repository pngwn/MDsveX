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
			position.column++;
		}

		index++;

		position.offset++;
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

		if (!get_state()) {
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

			if (value.charCodeAt(position.index) === OPEN_BRACE) {
				chomp();
				// expression or svelte block
				// state.push('IN_EXPRESSION');
			}
		}

		if (get_state() === 'IN_START_TAG') {
			if (is_lower_alpha(value.charCodeAt(position.index))) {
				(node as BaseSvelteTag).type = 'svelteElement';
				state.push('IN_TAG_NAME');
				continue;
			}

			if (is_upper_alpha(value.charCodeAt(position.index))) {
				(node as BaseSvelteTag).type = 'svelteComponent';
				state.push('IN_TAG_NAME');
				continue;
			}
		}

		if (get_state() === 'IN_TAG_NAME') {
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

		if (get_state() === 'IN_TAG_BODY') {
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
					shorthandExpression: false,
				});

				continue;
			}

			if (
				value.charCodeAt(position.index) === SLASH ||
				is_void_element((node as SvelteElement).tagName)
			) {
				state.pop();
				state.push('IN_CLOSING_SLASH');
				(node as BaseSvelteTag).selfClosing = true;
				chomp();
				continue;
			}
		}

		if (get_state() === 'IN_CLOSING_SLASH') {
			if (
				value.charCodeAt(position.index) === SPACE ||
				value.charCodeAt(position.index) === LINEFEED
			) {
				chomp();
				continue;
			}

			if (value.charCodeAt(position.index) === CLOSE_ANGLE_BRACKET) {
				chomp();
				done = true;
				break;
			}
		}
	}

	return {
		chomped: 'asd',
		unchomped: 'asd',
		parsed: node,
		position: currentPosition,
	};
}
