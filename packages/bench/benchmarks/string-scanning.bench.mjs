import { bench, beforeAll, describe } from 'vitest';

const fenceNeedle = '```';
const htmlDirectiveNeedle = '{@html';
const htmlDirectiveCodes = Array.from(htmlDirectiveNeedle, (char) =>
	char.charCodeAt(0)
);
const backtickCode = '`'.charCodeAt(0);
const openBraceCode = '{'.charCodeAt(0);
const closeBraceCode = '}'.charCodeAt(0);
const newlineCode = '\n'.charCodeAt(0);

const whitespaceSet = new Set([' ', '\t', '\r', '\n']);
const asciiWhitespaceLookup = (() => {
	const table = new Uint8Array(128);
	table['\t'.charCodeAt(0)] = 1;
	table['\n'.charCodeAt(0)] = 1;
	table['\v'.charCodeAt(0)] = 1;
	table['\f'.charCodeAt(0)] = 1;
	table['\r'.charCodeAt(0)] = 1;
	table[' '.charCodeAt(0)] = 1;
	return table;
})();

let markdownDocument;
let baselineTokens;
let baselineTokenCount = 0;
let baselineWhitespaceCount = 0;

function buildMarkdownSample() {
	const sections = [
		'---',
		'title: Sample Post',
		'description: Testing different scanning strategies',
		'---',
		'',
		'# Introduction',
		'This document emulates a realistic Markdown payload with Svelte constructs.',
		'Expect fence blocks, inline code, HTML, and {@html} directives.',
		'```svelte',
		'<script>',
		'  let count = 0;',
		'  const items = ["alpha", "beta", "gamma"];',
		'</script>',
		'',
		'<ul>',
		'  {#each items as item}',
		'    <li>{item}</li>',
		'  {/each}',
		'</ul>',
		'```',
		'',
		'Some inline `code` and more prose to keep the sample dense.',
		'',
		'```js',
		'function load() {',
		"  return fetch('/api/data').then((response) => response.json());",
		'}',
		'```',
		'',
		'<section>',
		'  <p>{@html content}</p>',
		'  <slot />',
		'</section>',
		'',
		'> A blockquote with enough text to avoid trivial loops.',
		'',
		'```md',
		'# Nested markdown',
		'',
		'Some content with {@html more} directives and `inline code`.',
		'```',
	];

	const snippet = sections.join('\n');
	return new Array(80).fill(snippet).join('\n');
}

function createParserState() {
	return {
		index: 0,
		line: 1,
		column: 1,
		textStart: -1,
		textLine: 1,
		textColumn: 1,
	};
}

function beginText(state) {
	if (state.textStart === -1) {
		state.textStart = state.index;
		state.textLine = state.line;
		state.textColumn = state.column;
	}
}

function flushText(tokens, state) {
	if (state.textStart !== -1 && state.index > state.textStart) {
		tokens.push({
			type: 'text',
			start: state.textStart,
			end: state.index,
			line: state.textLine,
			column: state.textColumn,
		});
	}
	state.textStart = -1;
}

function advanceChar(code, state) {
	state.index += 1;
	if (code === newlineCode) {
		state.line += 1;
		state.column = 1;
	} else {
		state.column += 1;
	}
}

function advanceBySlice(input, state, targetIndex) {
	const limit = Math.min(targetIndex, input.length);
	while (state.index < limit) {
		const code = input.charCodeAt(state.index);
		advanceChar(code, state);
	}
}

function tokenizeCharacterStream(input) {
	const tokens = [];
	const state = createParserState();
	const limit = input.length;

	while (state.index < limit) {
		const code = input.charCodeAt(state.index);

		if (
			code === backtickCode &&
			input.charCodeAt(state.index + 1) === backtickCode &&
			input.charCodeAt(state.index + 2) === backtickCode
		) {
			flushText(tokens, state);
			const start = state.index;
			const startLine = state.line;
			const startColumn = state.column;

			advanceChar(backtickCode, state);
			advanceChar(backtickCode, state);
			advanceChar(backtickCode, state);

			while (state.index < limit) {
				const inner = input.charCodeAt(state.index);
				if (
					inner === backtickCode &&
					input.charCodeAt(state.index + 1) === backtickCode &&
					input.charCodeAt(state.index + 2) === backtickCode
				) {
					advanceChar(backtickCode, state);
					advanceChar(backtickCode, state);
					advanceChar(backtickCode, state);
					break;
				}
				advanceChar(inner, state);
			}

			tokens.push({
				type: 'fence',
				start,
				end: state.index,
				line: startLine,
				column: startColumn,
			});
			continue;
		}

		if (code === openBraceCode) {
			let matches = true;
			for (let i = 1; i < htmlDirectiveCodes.length; i++) {
				if (input.charCodeAt(state.index + i) !== htmlDirectiveCodes[i]) {
					matches = false;
					break;
				}
			}

			if (matches) {
				flushText(tokens, state);
				const start = state.index;
				const startLine = state.line;
				const startColumn = state.column;

				for (let i = 0; i < htmlDirectiveCodes.length; i++) {
					const directiveCode = input.charCodeAt(state.index);
					advanceChar(directiveCode, state);
				}

				while (state.index < limit) {
					const directiveCode = input.charCodeAt(state.index);
					advanceChar(directiveCode, state);
					if (directiveCode === closeBraceCode) {
						break;
					}
				}

				tokens.push({
					type: 'directive',
					start,
					end: state.index,
					line: startLine,
					column: startColumn,
				});
				continue;
			}
		}

		beginText(state);
		advanceChar(code, state);
	}

	flushText(tokens, state);
	return tokens;
}

function tokenizeWithChompLoops(input) {
	const tokens = [];
	const state = createParserState();
	const limit = input.length;

	while (state.index < limit) {
		if (input.startsWith(fenceNeedle, state.index)) {
			flushText(tokens, state);
			const start = state.index;
			const startLine = state.line;
			const startColumn = state.column;

			const closing = input.indexOf(
				fenceNeedle,
				state.index + fenceNeedle.length
			);
			const sliceEnd = closing === -1 ? limit : closing + fenceNeedle.length;
			advanceBySlice(input, state, sliceEnd);

			tokens.push({
				type: 'fence',
				start,
				end: state.index,
				line: startLine,
				column: startColumn,
			});
			continue;
		}

		if (input.startsWith(htmlDirectiveNeedle, state.index)) {
			flushText(tokens, state);
			const start = state.index;
			const startLine = state.line;
			const startColumn = state.column;

			const closing = input.indexOf(
				'}',
				state.index + htmlDirectiveNeedle.length
			);
			const sliceEnd = closing === -1 ? limit : closing + 1;
			advanceBySlice(input, state, sliceEnd);

			tokens.push({
				type: 'directive',
				start,
				end: state.index,
				line: startLine,
				column: startColumn,
			});
			continue;
		}

		beginText(state);

		const nextFence = input.indexOf(fenceNeedle, state.index + 1);
		const nextDirective = input.indexOf(htmlDirectiveNeedle, state.index + 1);
		let nextBreak = limit;
		if (nextFence !== -1 && nextFence < nextBreak) nextBreak = nextFence;
		if (nextDirective !== -1 && nextDirective < nextBreak)
			nextBreak = nextDirective;

		if (nextBreak === state.index) {
			const code = input.charCodeAt(state.index);
			advanceChar(code, state);
		} else {
			advanceBySlice(input, state, nextBreak);
		}
	}

	flushText(tokens, state);
	return tokens;
}

function tokenizeHandInlined(input) {
	const tokens = [];
	const limit = input.length;
	let index = 0;
	let line = 1;
	let column = 1;
	let textStart = -1;
	let textLine = 1;
	let textColumn = 1;

	while (index < limit) {
		const code = input.charCodeAt(index);

		if (
			code === backtickCode &&
			input.charCodeAt(index + 1) === backtickCode &&
			input.charCodeAt(index + 2) === backtickCode
		) {
			if (textStart !== -1 && index > textStart) {
				tokens.push({
					type: 'text',
					start: textStart,
					end: index,
					line: textLine,
					column: textColumn,
				});
				textStart = -1;
			}

			const start = index;
			const startLine = line;
			const startColumn = column;

			index += fenceNeedle.length;
			column += fenceNeedle.length;

			while (index < limit) {
				const inner = input.charCodeAt(index);
				if (
					inner === backtickCode &&
					input.charCodeAt(index + 1) === backtickCode &&
					input.charCodeAt(index + 2) === backtickCode
				) {
					index += fenceNeedle.length;
					column += fenceNeedle.length;
					break;
				}

				if (inner === newlineCode) {
					index += 1;
					line += 1;
					column = 1;
				} else {
					index += 1;
					column += 1;
				}
			}

			tokens.push({
				type: 'fence',
				start,
				end: index,
				line: startLine,
				column: startColumn,
			});
			continue;
		}

		if (
			code === openBraceCode &&
			input.startsWith(htmlDirectiveNeedle, index)
		) {
			if (textStart !== -1 && index > textStart) {
				tokens.push({
					type: 'text',
					start: textStart,
					end: index,
					line: textLine,
					column: textColumn,
				});
				textStart = -1;
			}

			const start = index;
			const startLine = line;
			const startColumn = column;
			const needleLength = htmlDirectiveNeedle.length;

			for (let i = 0; i < needleLength; i++) {
				const directiveCode = input.charCodeAt(index);
				if (directiveCode === newlineCode) {
					index += 1;
					line += 1;
					column = 1;
				} else {
					index += 1;
					column += 1;
				}
			}

			while (index < limit) {
				const directiveCode = input.charCodeAt(index);
				if (directiveCode === newlineCode) {
					index += 1;
					line += 1;
					column = 1;
				} else {
					index += 1;
					column += 1;
				}
				if (directiveCode === closeBraceCode) {
					break;
				}
			}

			tokens.push({
				type: 'directive',
				start,
				end: index,
				line: startLine,
				column: startColumn,
			});
			continue;
		}

		if (textStart === -1) {
			textStart = index;
			textLine = line;
			textColumn = column;
		}

		if (code === newlineCode) {
			index += 1;
			line += 1;
			column = 1;
		} else {
			index += 1;
			column += 1;
		}
	}

	if (textStart !== -1 && index > textStart) {
		tokens.push({
			type: 'text',
			start: textStart,
			end: index,
			line: textLine,
			column: textColumn,
		});
	}

	return tokens;
}

function tokenizeRegexPipeline(input) {
	const tokens = [];
	const state = createParserState();
	const pattern = /```[\s\S]*?```|{@html[^}]*}|[^`{]+|[`{]/g;
	let match = pattern.exec(input);

	while (match) {
		if (match.index > state.index) {
			beginText(state);
			advanceBySlice(input, state, match.index);
		}

		const segment = match[0];

		if (segment.startsWith(fenceNeedle)) {
			flushText(tokens, state);
			const start = state.index;
			const startLine = state.line;
			const startColumn = state.column;

			advanceBySlice(input, state, state.index + segment.length);
			tokens.push({
				type: 'fence',
				start,
				end: state.index,
				line: startLine,
				column: startColumn,
			});
		} else if (segment.startsWith(htmlDirectiveNeedle)) {
			flushText(tokens, state);
			const start = state.index;
			const startLine = state.line;
			const startColumn = state.column;

			advanceBySlice(input, state, state.index + segment.length);
			tokens.push({
				type: 'directive',
				start,
				end: state.index,
				line: startLine,
				column: startColumn,
			});
		} else {
			beginText(state);
			advanceBySlice(input, state, state.index + segment.length);
		}

		match = pattern.exec(input);
	}

	if (state.index < input.length) {
		beginText(state);
		advanceBySlice(input, state, input.length);
	}

	flushText(tokens, state);
	return tokens;
}

function ensureSameTokens(expected, actual, label) {
	if (expected.length !== actual.length) {
		throw new Error(
			`${label} produced ${actual.length} tokens, expected ${expected.length}`
		);
	}

	for (let i = 0; i < expected.length; i++) {
		const baseline = expected[i];
		const candidate = actual[i];

		if (
			baseline.type !== candidate.type ||
			baseline.start !== candidate.start ||
			baseline.end !== candidate.end ||
			baseline.line !== candidate.line ||
			baseline.column !== candidate.column
		) {
			throw new Error(`${label} token mismatch at index ${i}`);
		}
	}
}

function countWhitespaceSet(input) {
	let count = 0;
	for (let i = 0; i < input.length; i++) {
		if (whitespaceSet.has(input[i])) {
			count++;
		}
	}
	return count;
}

function countWhitespaceLookup(input) {
	let count = 0;
	for (let i = 0; i < input.length; i++) {
		const code = input.charCodeAt(i);
		if (
			code < asciiWhitespaceLookup.length &&
			asciiWhitespaceLookup[code] === 1
		) {
			count++;
		}
	}
	return count;
}

function countWhitespaceDirect(input) {
	let count = 0;
	for (let i = 0; i < input.length; i++) {
		const code = input.charCodeAt(i);
		if (
			code === 32 ||
			code === 9 ||
			code === 10 ||
			code === 11 ||
			code === 12 ||
			code === 13
		) {
			count++;
		}
	}
	return count;
}

function countWhitespaceRegex(input) {
	const matches = input.match(/\s/g);
	return matches ? matches.length : 0;
}

beforeAll(() => {
	markdownDocument = buildMarkdownSample();

	baselineTokens = tokenizeCharacterStream(markdownDocument);
	baselineTokenCount = baselineTokens.length;

	const chompTokens = tokenizeWithChompLoops(markdownDocument);
	ensureSameTokens(baselineTokens, chompTokens, 'chomp-loop tokenizer');

	const inlineTokens = tokenizeHandInlined(markdownDocument);
	ensureSameTokens(baselineTokens, inlineTokens, 'hand-inlined tokenizer');

	const regexTokens = tokenizeRegexPipeline(markdownDocument);
	ensureSameTokens(baselineTokens, regexTokens, 'regex tokenizer');

	baselineWhitespaceCount = countWhitespaceDirect(markdownDocument);
	if (countWhitespaceSet(markdownDocument) !== baselineWhitespaceCount) {
		throw new Error(
			'Set-based whitespace classifier returned inconsistent count'
		);
	}
	if (countWhitespaceLookup(markdownDocument) !== baselineWhitespaceCount) {
		throw new Error(
			'ASCII lookup whitespace classifier returned inconsistent count'
		);
	}
	if (countWhitespaceRegex(markdownDocument) !== baselineWhitespaceCount) {
		throw new Error('Regex whitespace classifier returned inconsistent count');
	}
});

describe('Tokenizer hot loop strategies', () => {
	bench('character stream tokenizer', () => {
		const tokens = tokenizeCharacterStream(markdownDocument);
		if (tokens.length !== baselineTokenCount) {
			throw new Error(
				'character stream tokenizer returned inconsistent token count'
			);
		}
		return tokens.length;
	});

	bench('chomp-loop tokenizer', () => {
		const tokens = tokenizeWithChompLoops(markdownDocument);
		if (tokens.length !== baselineTokenCount) {
			throw new Error('chomp-loop tokenizer returned inconsistent token count');
		}
		return tokens.length;
	});

	bench('hand-inlined tokenizer', () => {
		const tokens = tokenizeHandInlined(markdownDocument);
		if (tokens.length !== baselineTokenCount) {
			throw new Error(
				'hand-inlined tokenizer returned inconsistent token count'
			);
		}
		return tokens.length;
	});

	bench('regex pipeline tokenizer', () => {
		const tokens = tokenizeRegexPipeline(markdownDocument);
		if (tokens.length !== baselineTokenCount) {
			throw new Error(
				'regex pipeline tokenizer returned inconsistent token count'
			);
		}
		return tokens.length;
	});
});

describe('Whitespace classification strategies', () => {
	bench('direct charCode checks', () => {
		const count = countWhitespaceDirect(markdownDocument);
		if (count !== baselineWhitespaceCount) {
			throw new Error('direct classification returned inconsistent count');
		}
		return count;
	});

	bench('ASCII lookup table', () => {
		const count = countWhitespaceLookup(markdownDocument);
		if (count !== baselineWhitespaceCount) {
			throw new Error(
				'ASCII lookup classification returned inconsistent count'
			);
		}
		return count;
	});

	bench('Set membership', () => {
		const count = countWhitespaceSet(markdownDocument);
		if (count !== baselineWhitespaceCount) {
			throw new Error('Set-based classification returned inconsistent count');
		}
		return count;
	});

	bench('regex global match', () => {
		const count = countWhitespaceRegex(markdownDocument);
		if (count !== baselineWhitespaceCount) {
			throw new Error('regex classification returned inconsistent count');
		}
		return count;
	});
});
