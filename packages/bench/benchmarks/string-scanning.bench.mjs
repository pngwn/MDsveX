import { bench, describe } from 'vitest';

const jsCode = `
function processData(items, options = {}) {
	const results = [];
	const maxItems = options.limit || 100;
	
	for (let i = 0; i < items.length && i < maxItems; i++) {
		const item = items[i];
		// Process each item
		if (item.value > 0 && item.active) {
			results.push({
				id: item.id,
				value: item.value * 2.5,
				name: \`Item #\${i + 1}\`,
				tags: ['processed', 'valid']
			});
		}
	}
	
	return results.filter(r => r.value < 1000);
}`.trim();

describe('Character Scanning vs Regex', () => {
	// Pre-compiled regexes
	const patterns = [
		/^\s+/,
		/^\/\/.*/,
		/^\/\*[\s\S]*?\*\//,
		/^"(?:[^"\\]|\\.)*"/,
		/^'(?:[^'\\]|\\.)*'/,
		/^`(?:[^`\\]|\\.)*`/,
		/^\d+(\.\d+)?/,
		/^[a-zA-Z_$][a-zA-Z0-9_$]*/,
		/^[(){}\[\]]/,
		/^[+\-*/%=<>!&|^~?:]/,
		/^[,;.]/,
	];

	bench('Character Scanning', () => {
		const tokens = [];
		let i = 0;

		while (i < jsCode.length) {
			const char = jsCode.charCodeAt(i);

			// Whitespace
			if (char === 32 || char === 9 || char === 10 || char === 13) {
				const start = i;
				while (i < jsCode.length) {
					const c = jsCode.charCodeAt(i);
					if (c !== 32 && c !== 9 && c !== 10 && c !== 13) break;
					i++;
				}
				tokens.push({ type: 'whitespace', start, end: i });
				continue;
			}

			// Numbers
			if (char >= 48 && char <= 57) {
				const start = i;
				while (
					i < jsCode.length &&
					jsCode.charCodeAt(i) >= 48 &&
					jsCode.charCodeAt(i) <= 57
				) {
					i++;
				}
				if (i < jsCode.length && jsCode.charCodeAt(i) === 46) {
					i++;
					while (
						i < jsCode.length &&
						jsCode.charCodeAt(i) >= 48 &&
						jsCode.charCodeAt(i) <= 57
					) {
						i++;
					}
				}
				tokens.push({ type: 'number', start, end: i });
				continue;
			}

			// Identifiers
			if (
				(char >= 65 && char <= 90) ||
				(char >= 97 && char <= 122) ||
				char === 95 ||
				char === 36
			) {
				const start = i;
				while (i < jsCode.length) {
					const c = jsCode.charCodeAt(i);
					if (
						!(
							(c >= 65 && c <= 90) ||
							(c >= 97 && c <= 122) ||
							(c >= 48 && c <= 57) ||
							c === 95 ||
							c === 36
						)
					) {
						break;
					}
					i++;
				}
				tokens.push({ type: 'identifier', start, end: i });
				continue;
			}

			// Single character tokens
			tokens.push({ type: 'punctuation', start: i, end: ++i });
		}

		return tokens;
	});

	bench('Regex with Slicing', () => {
		const tokens = [];
		let remaining = jsCode;
		let position = 0;

		while (remaining.length > 0) {
			let matched = false;

			for (const pattern of patterns) {
				const match = remaining.match(pattern);
				if (match) {
					tokens.push({
						type: 'token',
						start: position,
						end: position + match[0].length,
					});
					position += match[0].length;
					remaining = remaining.slice(match[0].length);
					matched = true;
					break;
				}
			}

			if (!matched) {
				tokens.push({ type: 'unknown', start: position, end: position + 1 });
				position++;
				remaining = remaining.slice(1);
			}
		}

		return tokens;
	});
});

describe('String Context Handling', () => {
	const stringHeavyCode = `
const message = "This is a longer string with some content that needs escaping: \\"quotes\\" and \\n newlines";
const template = \`
	Multi-line template literal
	with \${interpolation} and more text
	spanning several lines
\`;
const single = 'Single quoted string with \\'escapes\\' inside';
`.trim();

	bench('Character Chomping', () => {
		const tokens = [];
		let i = 0;

		while (i < stringHeavyCode.length) {
			// Check for strings
			if (stringHeavyCode.charCodeAt(i) === 34) {
				// "
				const start = i++;
				while (i < stringHeavyCode.length) {
					const char = stringHeavyCode.charCodeAt(i);
					if (char === 92) {
						// backslash
						i += 2; // skip escape
					} else if (char === 34) {
						// closing quote
						i++;
						break;
					} else {
						i++;
					}
				}
				tokens.push({ type: 'string', start, end: i });
				continue;
			}

			if (stringHeavyCode.charCodeAt(i) === 39) {
				// '
				const start = i++;
				while (i < stringHeavyCode.length) {
					const char = stringHeavyCode.charCodeAt(i);
					if (char === 92) {
						// backslash
						i += 2;
					} else if (char === 39) {
						// closing quote
						i++;
						break;
					} else {
						i++;
					}
				}
				tokens.push({ type: 'string', start, end: i });
				continue;
			}

			if (stringHeavyCode.charCodeAt(i) === 96) {
				// `
				const start = i++;
				while (i < stringHeavyCode.length) {
					const char = stringHeavyCode.charCodeAt(i);
					if (char === 92) {
						// backslash
						i += 2;
					} else if (char === 96) {
						// closing backtick
						i++;
						break;
					} else {
						i++;
					}
				}
				tokens.push({ type: 'template', start, end: i });
				continue;
			}

			// Skip other characters
			i++;
		}

		return tokens;
	});

	bench('Regex String Matching', () => {
		const tokens = [];
		const stringPattern =
			/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/;
		let remaining = stringHeavyCode;
		let position = 0;

		while (remaining.length > 0) {
			const match = remaining.match(stringPattern);
			if (match) {
				tokens.push({
					type: 'string',
					start: position,
					end: position + match[0].length,
				});
				position += match[0].length;
				remaining = remaining.slice(match[0].length);
			} else {
				position++;
				remaining = remaining.slice(1);
			}
		}

		return tokens;
	});
});

describe('Identifier and Keyword Detection', () => {
	const keywords = new Set([
		'function',
		'const',
		'let',
		'var',
		'if',
		'else',
		'for',
		'while',
		'return',
		'class',
		'async',
		'await',
		'new',
		'this',
		'super',
	]);

	const identifierCode =
		'function processData const results async transform return filter class DataProcessor';

	bench('Scan + Set Lookup', () => {
		const tokens = [];
		let i = 0;

		while (i < identifierCode.length) {
			const char = identifierCode.charCodeAt(i);

			// Skip whitespace
			if (char === 32) {
				i++;
				continue;
			}

			// Identifier
			if ((char >= 65 && char <= 90) || (char >= 97 && char <= 122)) {
				const start = i;
				while (i < identifierCode.length) {
					const c = identifierCode.charCodeAt(i);
					if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) {
						break;
					}
					i++;
				}

				const word = identifierCode.slice(start, i);
				tokens.push({
					type: keywords.has(word) ? 'keyword' : 'identifier',
					start,
					end: i,
				});
				continue;
			}

			i++;
		}

		return tokens;
	});

	bench('Regex + Array Search', () => {
		const tokens = [];
		const keywordList = Array.from(keywords);
		const identPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*/;
		let remaining = identifierCode;
		let position = 0;

		while (remaining.length > 0) {
			if (remaining[0] === ' ') {
				position++;
				remaining = remaining.slice(1);
				continue;
			}

			const match = remaining.match(identPattern);
			if (match) {
				const word = match[0];
				tokens.push({
					type: keywordList.includes(word) ? 'keyword' : 'identifier',
					start: position,
					end: position + word.length,
				});
				position += word.length;
				remaining = remaining.slice(word.length);
			} else {
				position++;
				remaining = remaining.slice(1);
			}
		}

		return tokens;
	});
});

describe('Failed Match Performance', () => {
	// Code with many tokens that won't match initial patterns
	const complexCode = '>>>===<<<???.?.?.***&&&|||^^^~~~';

	bench('Character Scanning (predictable)', () => {
		const tokens = [];
		let i = 0;

		while (i < complexCode.length) {
			const char = complexCode.charCodeAt(i);
			const start = i;

			// Try multi-char operators
			if (char === 62) {
				// >
				if (
					i + 1 < complexCode.length &&
					complexCode.charCodeAt(i + 1) === 62
				) {
					if (
						i + 2 < complexCode.length &&
						complexCode.charCodeAt(i + 2) === 62
					) {
						tokens.push({ type: '>>>', start, end: i + 3 });
						i += 3;
						continue;
					}
				}
			}

			if (char === 61) {
				// =
				if (
					i + 1 < complexCode.length &&
					complexCode.charCodeAt(i + 1) === 61
				) {
					if (
						i + 2 < complexCode.length &&
						complexCode.charCodeAt(i + 2) === 61
					) {
						tokens.push({ type: '===', start, end: i + 3 });
						i += 3;
						continue;
					}
				}
			}

			// Default single char
			tokens.push({ type: 'operator', start, end: ++i });
		}

		return tokens;
	});

	bench('Regex (multiple attempts)', () => {
		const tokens = [];
		const patterns = [
			/^>>>/,
			/^===/,
			/^<<</,
			/^\?\?\?/,
			/^\.\.\./,
			/^\*\*\*/,
			/^&&&/,
			/^\|\|\|/,
			/^\^\^\^/,
			/^~~~/,
			/^./, // fallback
		];

		let remaining = complexCode;
		let position = 0;

		while (remaining.length > 0) {
			for (const pattern of patterns) {
				const match = remaining.match(pattern);
				if (match) {
					tokens.push({
						type: 'operator',
						start: position,
						end: position + match[0].length,
					});
					position += match[0].length;
					remaining = remaining.slice(match[0].length);
					break;
				}
			}
		}

		return tokens;
	});
});
