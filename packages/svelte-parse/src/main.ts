import { Point, Node } from 'svast';

import type { ParserOptions, Result } from './types_and_things';

function default_eat(value: string) {
	return function apply(node: Node): Node {
		return node;
	};
}

const pos: Point = {
	line: 1,
	column: 1,
	offset: 0,
};

export function parseNode(opts: ParserOptions): Result {
	const {
		value,
		currentPosition = pos,
		block = true,
		childParser = parseNode,
	} = opts;

	return {
		chomped: 'asd',
		unchomped: 'asd',
		parsed: { type: 'hi', children: [] },
		position: currentPosition,
	};
}
