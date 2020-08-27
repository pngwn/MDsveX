import { Point, Node, BaseSvelteTag, SvelteTag } from 'svast';

import type { ParserOptions, Result, State } from './types_and_things';
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
	return is_in_range(code, LOWERCASE_Z, LOWERCASE_Z);
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
		// newline means newline
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
	let node = {};
	const state: State[] = [];

	function get_state() {
		return state[state.length - 1];
	}

	while (!done && !error) {
		if (!value[position.index]) break;

		if (!get_state()) {
			if (value.charCodeAt(position.index) === OPEN_ANGLE_BRACKET) {
				chomp();
				state.push('IN_START_TAG');
				node = <BaseSvelteTag>{
					type: '',
					tagName: '',
					properties: [],
					selfClosing: false,
					children: [],
				};
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
		}

		if (get_state() === 'IN_TAG_BODY') {
			if (
				is_lower_alpha(value.charCodeAt(position.index)) ||
				is_upper_alpha(value.charCodeAt(position.index))
			) {
				(node as BaseSvelteTag).type = 'svelteElement';
				state.push('IN_TAG_NAME');
				continue;
			}
		}
	}

	return {
		chomped: 'asd',
		unchomped: 'asd',
		parsed: { type: 'hi', children: [] },
		position: currentPosition,
	};
}
