import { LINEFEED } from './constants';

const lineFeed = '\n';
const lineBreaksExpression = /\r\n|\r/g;

export function parse(
	input: string,
	options: Record<string, unknown>
): { type: string; children: Array<unknown> } {
	const value = input.replace(lineBreaksExpression, lineFeed);
	let index = 0;

	const node = {
		type: 'root',
		children: [],
	};

	const position = {
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

		position.offset++;
		// stay in sync
		position.index = index;
		char = value.charCodeAt(index);
	}

	function place() {
		return {
			line: position.line,
			column: position.column,
			offset: position.offset,
		};
	}

	for (;;) {
		break;
	}

	return node;
}
