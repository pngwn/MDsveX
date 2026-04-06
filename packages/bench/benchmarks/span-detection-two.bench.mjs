import { bench, beforeAll, describe } from 'vitest';

// Global regex for finding triple backticks
const FENCE_REGEX = /```/g;
const FENCE_STRING = '```';

let documents = [];

beforeAll(() => {
	// Generate test documents of varying sizes
	documents = [
		generateDocument(10, 'small'), // ~10 code blocks
		generateDocument(50, 'medium'), // ~50 code blocks
		generateDocument(100, 'large'), // ~100 code blocks
	];

	// Verify all approaches produce same results
	for (const doc of documents) {
		const scanResult = parseWithScan(doc.content);
		const regexResult = parseWithRegex(doc.content);
		const indexOfResult = parseWithIndexOf(doc.content);

		if (
			scanResult.length !== regexResult.length ||
			scanResult.length !== indexOfResult.length
		) {
			throw new Error(
				`Result mismatch for ${doc.label}: scan=${scanResult.length}, regex=${regexResult.length}, indexOf=${indexOfResult.length}`
			);
		}
		for (let i = 0; i < scanResult.length; i++) {
			if (
				scanResult[i].start !== regexResult[i].start ||
				scanResult[i].end !== regexResult[i].end ||
				scanResult[i].start !== indexOfResult[i].start ||
				scanResult[i].end !== indexOfResult[i].end
			) {
				throw new Error(`Block mismatch at index ${i} for ${doc.label}`);
			}
		}
	}
});

describe('realistic document parsing', () => {
	bench('scan for delimiters', () => {
		let sink = 0;
		for (const doc of documents) {
			const blocks = parseWithScan(doc.content);
			sink ^= blocks.length;
			sink ^= blocks[blocks.length - 1]?.end || 0;
		}
		return sink;
	});

	bench('regex for delimiters', () => {
		let sink = 0;
		for (const doc of documents) {
			const blocks = parseWithRegex(doc.content);
			sink ^= blocks.length;
			sink ^= blocks[blocks.length - 1]?.end || 0;
		}
		return sink;
	});

	bench('indexOf for delimiters', () => {
		let sink = 0;
		for (const doc of documents) {
			const blocks = parseWithIndexOf(doc.content);
			sink ^= blocks.length;
			sink ^= blocks[blocks.length - 1]?.end || 0;
		}
		return sink;
	});
});

describe('large document parsing', () => {
	bench('scan (large doc only)', () => {
		const doc = documents[2]; // largest doc
		return parseWithScan(doc.content);
	});

	bench('regex (large doc only)', () => {
		const doc = documents[2]; // largest doc
		return parseWithRegex(doc.content);
	});

	bench('indexOf (large doc only)', () => {
		const doc = documents[2]; // largest doc
		return parseWithIndexOf(doc.content);
	});
});

// Just finding the delimiter (pure performance comparison)
describe('pure delimiter finding', () => {
	const testString =
		'x'.repeat(1000) + '```' + 'y'.repeat(1000) + '```' + 'z'.repeat(1000);

	bench('character scanning', () => {
		let index = 0;
		let count = 0;
		const BACKTICK = 96;
		while (index < testString.length - 2) {
			if (
				testString.charCodeAt(index) === BACKTICK &&
				testString.charCodeAt(index + 1) === BACKTICK &&
				testString.charCodeAt(index + 2) === BACKTICK
			) {
				count++;
				index += 3;
			} else {
				index++;
			}
		}
		return count;
	});

	bench('regex exec', () => {
		let count = 0;
		FENCE_REGEX.lastIndex = 0;
		let match;
		while ((match = FENCE_REGEX.exec(testString)) !== null) {
			count++;
		}
		FENCE_REGEX.lastIndex = 0;
		return count;
	});

	bench('indexOf', () => {
		let count = 0;
		let index = 0;
		while ((index = testString.indexOf(FENCE_STRING, index)) !== -1) {
			count++;
			index += 3;
		}
		return count;
	});
});

function parseWithScan(content) {
	const blocks = [];
	let index = 0;
	const length = content.length;
	const BACKTICK = 96; // charCode for `

	while (index < length - 2) {
		// Scan for opening triple backtick
		if (
			content.charCodeAt(index) === BACKTICK &&
			content.charCodeAt(index + 1) === BACKTICK &&
			content.charCodeAt(index + 2) === BACKTICK
		) {
			const blockStart = index;
			index += 3;

			// Skip to end of line (language specifier)
			while (index < length && content.charCodeAt(index) !== 10) {
				index++;
			}
			index++; // skip newline

			// Scan for closing triple backtick
			let found = false;
			while (index < length - 2) {
				if (
					content.charCodeAt(index) === BACKTICK &&
					content.charCodeAt(index + 1) === BACKTICK &&
					content.charCodeAt(index + 2) === BACKTICK
				) {
					index += 3;
					blocks.push({ start: blockStart, end: index });
					found = true;
					break;
				}
				index++;
			}

			if (!found) {
				break; // Unclosed block
			}
		} else {
			index++;
		}
	}

	return blocks;
}

function parseWithRegex(content) {
	const blocks = [];
	let index = 0;
	const length = content.length;
	const BACKTICK = 96; // charCode for `

	while (index < length - 2) {
		// Scan for opening triple backtick (still using scan for this part)
		if (
			content.charCodeAt(index) === BACKTICK &&
			content.charCodeAt(index + 1) === BACKTICK &&
			content.charCodeAt(index + 2) === BACKTICK
		) {
			const blockStart = index;
			index += 3;

			// Skip to end of line (language specifier)
			while (index < length && content.charCodeAt(index) !== 10) {
				index++;
			}
			index++; // skip newline

			// Use regex to find closing fence
			FENCE_REGEX.lastIndex = index;
			const match = FENCE_REGEX.exec(content);

			if (match) {
				index = match.index + 3;
				blocks.push({ start: blockStart, end: index });
			} else {
				break; // Unclosed block
			}
		} else {
			index++;
		}
	}

	FENCE_REGEX.lastIndex = 0; // Reset for next use
	return blocks;
}

function parseWithIndexOf(content) {
	const blocks = [];
	let index = 0;
	const length = content.length;
	const BACKTICK = 96; // charCode for `

	while (index < length - 2) {
		// Scan for opening triple backtick (still using scan for this part)
		if (
			content.charCodeAt(index) === BACKTICK &&
			content.charCodeAt(index + 1) === BACKTICK &&
			content.charCodeAt(index + 2) === BACKTICK
		) {
			const blockStart = index;
			index += 3;

			// Skip to end of line (language specifier)
			while (index < length && content.charCodeAt(index) !== 10) {
				index++;
			}
			index++; // skip newline

			// Use indexOf to find closing fence
			const closeIndex = content.indexOf(FENCE_STRING, index);

			if (closeIndex !== -1) {
				index = closeIndex + 3;
				blocks.push({ start: blockStart, end: index });
			} else {
				break; // Unclosed block
			}
		} else {
			index++;
		}
	}

	return blocks;
}

function generateDocument(blockCount, label) {
	const parts = [];
	const languages = ['javascript', 'typescript', 'python', 'rust', 'go', ''];
	const contentSamples = [
		'# Introduction\n\nThis is some markdown content with various elements.\n\n',
		'## Section Header\n\nHere we discuss important topics:\n- First point\n- Second point\n\n',
		'Regular paragraph text that contains `inline code` and **bold text**.\n\n',
		'> A blockquote with some wisdom about programming.\n> It spans multiple lines.\n\n',
		"### Implementation Details\n\nLet's look at the following code:\n\n",
	];

	let rng = 12345; // Simple RNG for reproducible content
	const random = () => {
		rng = (rng * 1103515245 + 12345) & 0x7fffffff;
		return rng / 0x7fffffff;
	};

	for (let i = 0; i < blockCount; i++) {
		// Add some markdown content between code blocks
		const contentCount = 1 + Math.floor(random() * 3);
		for (let j = 0; j < contentCount; j++) {
			parts.push(contentSamples[Math.floor(random() * contentSamples.length)]);
		}

		// Add code block
		const lang = languages[Math.floor(random() * languages.length)];
		parts.push('```' + lang + '\n');

		// Generate code content
		const lineCount = 5 + Math.floor(random() * 20);
		for (let j = 0; j < lineCount; j++) {
			if (lang === 'python') {
				parts.push(
					`def function_${i}_${j}():\n    return ${Math.floor(
						random() * 1000
					)}\n`
				);
			} else {
				parts.push(`const value_${i}_${j} = ${Math.floor(random() * 1000)};\n`);
			}
		}

		parts.push('```\n\n');
	}

	// Add trailing content
	parts.push('## Conclusion\n\nThat concludes our document.\n');

	return {
		label,
		content: parts.join(''),
		expectedBlocks: blockCount,
	};
}
