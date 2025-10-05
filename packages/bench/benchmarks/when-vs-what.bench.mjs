// import { bench, beforeAll, describe } from 'vitest';

// // Global regex for finding triple backticks
// const FENCE_REGEX = /```/g;
// const FENCE_STRING = '```';

// let document = '';

// beforeAll(() => {
// 	document = make_document();

// 	const interleaved = parse_with_interleaved(document);
// 	const independent = parse_with_independent_passes(document);

// 	if (Object.keys(interleaved).length !== Object.keys(independent).length) {
// 		throw new Error(
// 			'Interleaved and independent passes produce different results'
// 		);
// 	}

// 	for (let i = 0; i < Object.keys(interleaved).length; i++) {
// 		if (
// 			interleaved[Object.keys(interleaved)[i]].length !==
// 			independent[Object.keys(independent)[i]].length
// 		) {
// 			throw new Error(`Mismatch at index ${Object.keys(interleaved)[i]}`);
// 		}

// 		for (let j = 0; j < interleaved[Object.keys(interleaved)[i]].length; j++) {
// 			if (
// 				interleaved[Object.keys(interleaved)[i]][j] !==
// 				independent[Object.keys(independent)[i]][j]
// 			) {
// 				throw new Error(
// 					`Mismatch at index ${Object.keys(interleaved)[i]}[${j}]`
// 				);
// 			}
// 		}
// 	}
// });

// describe('realistic document parsing', () => {
// 	bench('interleaved', () => {
// 		parse_with_interleaved(document);
// 	});

// 	bench('independent passes', () => {
// 		parse_with_independent_passes(document);
// 	});
// });

// const BACKTICK = 96;
// const BACKSLASH = 92;
// const A = 65;
// const Z = 90;
// const a = 97;
// const z = 122;
// const SPACE = 32;
// const TAB = 9;

// const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz \t`\\';

// function parse_with_independent_passes(input) {
// 	// character count
// 	let pointer = 0;
// 	let counts = {
// 		backtick: [],
// 		backslash: [],
// 		letter: [],
// 		space: [],
// 		tab: [],
// 	};
// 	while (pointer < input.length) {
// 		if (input.charCodeAt(pointer) === BACKTICK) {
// 			counts.backtick.push(pointer);
// 		} else if (input.charCodeAt(pointer) === BACKSLASH) {
// 			counts.backslash.push(pointer);
// 		} else if (
// 			input.charCodeAt(pointer) >= A &&
// 			input.charCodeAt(pointer) <= Z
// 		) {
// 			counts.letter.push(pointer);
// 		} else if (
// 			input.charCodeAt(pointer) >= a &&
// 			input.charCodeAt(pointer) <= z
// 		) {
// 			counts.letter.push(pointer);
// 		} else if (input.charCodeAt(pointer) === SPACE) {
// 			counts.space.push(pointer);
// 		} else if (input.charCodeAt(pointer) === TAB) {
// 			counts.tab.push(pointer);
// 		}
// 		pointer++;
// 	}

// 	// character slice
// 	let slice = {
// 		backtick: counts.backtick.map((count) => {
// 			return input.slice(count, count + 1);
// 		}),
// 		backslash: counts.backslash.map((count) => {
// 			return input.slice(count, count + 1);
// 		}),
// 		letter: counts.letter.map((count) => {
// 			return input.slice(count, count + 1);
// 		}),
// 		space: counts.space.map((count) => {
// 			return input.slice(count, count + 1);
// 		}),
// 		tab: counts.tab.map((count) => {
// 			return input.slice(count, count + 1);
// 		}),
// 	};

// 	return slice;
// }

// function parse_with_interleaved(input) {
// 	let pointer = 0;

// 	let counts = {
// 		backtick: [],
// 		backslash: [],
// 		letter: [],
// 		space: [],
// 		tab: [],
// 	};

// 	let slice = {
// 		backtick: [],
// 		backslash: [],
// 		letter: [],
// 		space: [],
// 		tab: [],
// 	};
// 	while (pointer < input.length) {
// 		if (input.charCodeAt(pointer) === BACKTICK) {
// 			counts.backtick.push(pointer);
// 			slice.backtick.push(input.slice(pointer, pointer + 1));
// 		} else if (input.charCodeAt(pointer) === BACKSLASH) {
// 			counts.backslash.push(pointer);
// 			slice.backslash.push(input.slice(pointer, pointer + 1));
// 		} else if (
// 			input.charCodeAt(pointer) >= A &&
// 			input.charCodeAt(pointer) <= Z
// 		) {
// 			counts.letter.push(pointer);
// 			slice.letter.push(input.slice(pointer, pointer + 1));
// 		} else if (
// 			input.charCodeAt(pointer) >= a &&
// 			input.charCodeAt(pointer) <= z
// 		) {
// 			counts.letter.push(pointer);
// 			slice.letter.push(input.slice(pointer, pointer + 1));
// 		} else if (input.charCodeAt(pointer) === SPACE) {
// 			counts.space.push(pointer);
// 			slice.space.push(input.slice(pointer, pointer + 1));
// 		} else if (input.charCodeAt(pointer) === TAB) {
// 			counts.tab.push(pointer);
// 			slice.tab.push(input.slice(pointer, pointer + 1));
// 		}
// 		pointer++;
// 	}

// 	// iterate as if visiting each character
// 	const keys = Object.keys(slice);
// 	for (let i = 0; i < keys.length; i++) {
// 		const key = keys[i];
// 		for (let j = 0; j < slice[key].length; j++) {}
// 	}

// 	return slice;
// }

// function make_document() {
// 	const _document = [];
// 	for (let i = 0; i < 10000000; i++) {
// 		_document.push(letters[Math.floor(Math.random() * letters.length)]);
// 	}
// 	return _document.join('\n\n');
// }
import { bench, beforeAll, describe } from 'vitest';

let document = [];

beforeAll(() => {
	document = [
		make_document(10000),
		make_document(100000),
		make_document(1000000),
		make_document(10000000),
	];

	// Verify both approaches produce equivalent ASTs
	const ast1 = parse_with_interleaved_slicing(document[0]);
	const ast2 = parse_with_deferred_slicing(document[0]);

	if (ast1.nodes.length !== ast2.nodes.length) {
		throw new Error(
			`AST length mismatch: ${ast1.nodes.length} vs ${ast2.nodes.length}`
		);
	}

	// Verify equivalence
	for (let i = 0; i < ast1.nodes.length; i++) {
		if (
			ast1.nodes[i].type !== ast2.nodes[i].type ||
			ast1.nodes[i].value !== ast2.nodes[i].value
		) {
			throw new Error(`AST node mismatch at index ${i}`);
		}
	}
});

describe('Parser with AST building: interleaved vs deferred slicing - small', () => {
	bench('slice during tokenization', () => {
		parse_with_interleaved_slicing(document[0]);
	});

	bench('slice during AST building', () => {
		parse_with_deferred_slicing(document[0]);
	});
});

describe('Parser with AST building: interleaved vs deferred slicing - medium', () => {
	bench('slice during tokenization', () => {
		parse_with_interleaved_slicing(document[1]);
	});

	bench('slice during AST building', () => {
		parse_with_deferred_slicing(document[1]);
	});
});

describe('Parser with AST building: interleaved vs deferred slicing - large', () => {
	bench('slice during tokenization', () => {
		parse_with_interleaved_slicing(document[2]);
	});

	bench('slice during AST building', () => {
		parse_with_deferred_slicing(document[2]);
	});
});

describe('Parser with AST building: interleaved vs deferred slicing - huge', () => {
	bench('slice during tokenization', () => {
		parse_with_interleaved_slicing(document[3]);
	});

	bench('slice during AST building', () => {
		parse_with_deferred_slicing(document[3]);
	});
});

const BACKTICK = 96;
const BACKSLASH = 92;
const A = 65;
const Z = 90;
const a = 97;
const z = 122;
const SPACE = 32;
const TAB = 9;
const NEWLINE = 10;
const ZERO = 48;
const NINE = 57;

// Approach 1: Slice during tokenization, then build AST
function parse_with_interleaved_slicing(input) {
	// Pass 1: Tokenize with immediate slicing
	const tokens = [];
	let i = 0;

	while (i < input.length) {
		const charCode = input.charCodeAt(i);

		// Identifier
		if ((charCode >= A && charCode <= Z) || (charCode >= a && charCode <= z)) {
			let start = i;
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (
					(c >= A && c <= Z) ||
					(c >= a && c <= z) ||
					(c >= ZERO && c <= NINE)
				) {
					i++;
				} else {
					break;
				}
			}
			// Slicing happens here in hot loop
			tokens.push({
				type: 'identifier',
				value: input.slice(start, i),
				start: start,
				end: i,
			});
		}
		// Number
		else if (charCode >= ZERO && charCode <= NINE) {
			let start = i;
			while (
				i < input.length &&
				input.charCodeAt(i) >= ZERO &&
				input.charCodeAt(i) <= NINE
			) {
				i++;
			}
			// Slicing happens here in hot loop
			tokens.push({
				type: 'number',
				value: input.slice(start, i),
				start: start,
				end: i,
			});
		}
		// Code fence
		else if (
			charCode === BACKTICK &&
			i + 2 < input.length &&
			input.charCodeAt(i + 1) === BACKTICK &&
			input.charCodeAt(i + 2) === BACKTICK
		) {
			tokens.push({
				type: 'fence',
				value: '```',
				start: i,
				end: i + 3,
			});
			i += 3;
		}
		// Whitespace
		else if (charCode === SPACE || charCode === TAB || charCode === NEWLINE) {
			let start = i;
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (c === SPACE || c === TAB || c === NEWLINE) {
					i++;
				} else {
					break;
				}
			}
			// Slicing happens here in hot loop
			tokens.push({
				type: 'whitespace',
				value: input.slice(start, i),
				start: start,
				end: i,
			});
		}
		// Other
		else {
			tokens.push({
				type: 'char',
				value: input.slice(i, i + 1),
				start: i,
				end: i + 1,
			});
			i++;
		}
	}

	// Pass 2: Build AST from tokens (always needed)
	const ast = { nodes: [] };
	for (let j = 0; j < tokens.length; j++) {
		const token = tokens[j];

		// Simulate some AST building logic
		if (token.type === 'identifier') {
			ast.nodes.push({
				type: 'Identifier',
				value: token.value,
				span: { start: token.start, end: token.end },
			});
		} else if (token.type === 'number') {
			ast.nodes.push({
				type: 'NumericLiteral',
				value: token.value,
				parsed: parseInt(token.value, 10),
				span: { start: token.start, end: token.end },
			});
		} else if (token.type === 'fence') {
			ast.nodes.push({
				type: 'CodeFence',
				value: token.value,
				span: { start: token.start, end: token.end },
			});
		} else if (token.type === 'whitespace') {
			// Process whitespace (might affect next node)
			if (token.value.includes('\n')) {
				ast.nodes.push({
					type: 'LineBreak',
					value: token.value,
					count: (token.value.match(/\n/g) || []).length,
					span: { start: token.start, end: token.end },
				});
			}
		}
		// Other tokens might not make it to AST
	}

	return ast;
}

// Approach 2: Collect positions during tokenization, slice during AST building
function parse_with_deferred_slicing(input) {
	// Pass 1: Tokenize collecting only positions
	const tokens = [];
	let i = 0;

	while (i < input.length) {
		const charCode = input.charCodeAt(i);

		// Identifier
		if ((charCode >= A && charCode <= Z) || (charCode >= a && charCode <= z)) {
			let start = i;
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (
					(c >= A && c <= Z) ||
					(c >= a && c <= z) ||
					(c >= ZERO && c <= NINE)
				) {
					i++;
				} else {
					break;
				}
			}
			// No slicing here - just positions
			tokens.push({
				type: 'identifier',
				start: start,
				end: i,
			});
		}
		// Number
		else if (charCode >= ZERO && charCode <= NINE) {
			let start = i;
			while (
				i < input.length &&
				input.charCodeAt(i) >= ZERO &&
				input.charCodeAt(i) <= NINE
			) {
				i++;
			}
			// No slicing here - just positions
			tokens.push({
				type: 'number',
				start: start,
				end: i,
			});
		}
		// Code fence
		else if (
			charCode === BACKTICK &&
			i + 2 < input.length &&
			input.charCodeAt(i + 1) === BACKTICK &&
			input.charCodeAt(i + 2) === BACKTICK
		) {
			tokens.push({
				type: 'fence',
				start: i,
				end: i + 3,
			});
			i += 3;
		}
		// Whitespace
		else if (charCode === SPACE || charCode === TAB || charCode === NEWLINE) {
			let start = i;
			while (i < input.length) {
				const c = input.charCodeAt(i);
				if (c === SPACE || c === TAB || c === NEWLINE) {
					i++;
				} else {
					break;
				}
			}
			// No slicing here - just positions
			tokens.push({
				type: 'whitespace',
				start: start,
				end: i,
			});
		}
		// Other
		else {
			tokens.push({
				type: 'char',
				start: i,
				end: i + 1,
			});
			i++;
		}
	}

	// Pass 2: Build AST and slice as needed
	const ast = { nodes: [] };
	for (let j = 0; j < tokens.length; j++) {
		const token = tokens[j];

		// Slicing happens here during AST building
		if (token.type === 'identifier') {
			ast.nodes.push({
				type: 'Identifier',
				value: input.slice(token.start, token.end), // Slice here
				span: { start: token.start, end: token.end },
			});
		} else if (token.type === 'number') {
			const value = input.slice(token.start, token.end); // Slice here
			ast.nodes.push({
				type: 'NumericLiteral',
				value: value,
				parsed: parseInt(value, 10),
				span: { start: token.start, end: token.end },
			});
		} else if (token.type === 'fence') {
			ast.nodes.push({
				type: 'CodeFence',
				value: '```', // Known value, could slice if needed
				span: { start: token.start, end: token.end },
			});
		} else if (token.type === 'whitespace') {
			const value = input.slice(token.start, token.end); // Slice here
			if (value.includes('\n')) {
				ast.nodes.push({
					type: 'LineBreak',
					value: value,
					count: (value.match(/\n/g) || []).length,
					span: { start: token.start, end: token.end },
				});
			}
		}
		// Other tokens might not make it to AST
	}

	return ast;
}

function make_document(length) {
	// More realistic document with identifiers, numbers, whitespace
	const parts = [
		'function',
		'parse',
		'document',
		'const',
		'let',
		'var',
		'return',
		'if',
		'else',
		'while',
		'for',
		'class',
		'extends',
		'import',
		'export',
		'123',
		'456',
		'789',
		'42',
		'0',
		'1',
		' ',
		'\t',
		'\n',
		'  ',
		'\n\n',
		'```',
		'{',
		'}',
		'(',
		')',
		';',
		'=',
		'+',
		'-',
		'*',
		'/',
	];

	const result = [];
	for (let i = 0; i < length; i++) {
		result.push(parts[Math.floor(Math.random() * parts.length)]);
	}

	return result.join('');
}
