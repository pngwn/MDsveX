import { bench, describe, beforeAll } from 'vitest';

let shortInput = '';
let mediumInput = '';
let longInput = '';
let hugeInput = '';

// Positions for extraction (simulating tokens found during parsing)
let shortPositions = [];
let mediumPositions = [];
let longPositions = [];
let hugePositions = [];

beforeAll(() => {
	// Create test documents
	shortInput = makeDocument(1000);
	mediumInput = makeDocument(10000);
	longInput = makeDocument(100000);
	hugeInput = makeDocument(1000000);

	// Generate positions (simulating identified tokens)
	shortPositions = generateTokenPositions(shortInput);
	mediumPositions = generateTokenPositions(mediumInput);
	longPositions = generateTokenPositions(longInput);
	hugePositions = generateTokenPositions(hugeInput);

	// Verify all methods produce same results
	verifyMethods(shortInput, shortPositions);
});

function makeDocument(size) {
	const words = [
		'function',
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
		'default',
		'async',
		'await',
		'try',
		'catch',
		'finally',
		'throw',
		'new',
		'this',
	];
	const result = [];

	for (let i = 0; i < size; i++) {
		if (i % 10 === 0 && i > 0) {
			result.push(' ');
		}
		result.push(words[Math.floor(Math.random() * words.length)]);
		result.push(' ');
	}

	return result.join('');
}

function generateTokenPositions(input) {
	const positions = [];
	let i = 0;

	while (i < input.length) {
		// Skip whitespace
		while (
			i < input.length &&
			(input.charCodeAt(i) === 32 ||
				input.charCodeAt(i) === 9 ||
				input.charCodeAt(i) === 10)
		) {
			i++;
		}

		if (i >= input.length) break;

		// Find word boundary
		let start = i;
		while (
			i < input.length &&
			input.charCodeAt(i) !== 32 &&
			input.charCodeAt(i) !== 9 &&
			input.charCodeAt(i) !== 10
		) {
			i++;
		}

		if (start < i) {
			positions.push({ start, end: i });
		}
	}

	return positions;
}

function verifyMethods(input, positions) {
	const r1 = buildWithSliceConcat(input, positions);
	const r2 = buildWithSubstringConcat(input, positions);
	const r3 = buildWithSubstrConcat(input, positions);
	const r4 = buildWithSliceArray(input, positions);
	const r5 = buildWithCharByChar(input, positions);
	const r6 = buildWithNestedArrays(input, positions);
	const r7 = buildWithPreallocatedString(input, positions);
	const r8 = buildWithArrayPushSlices(input, positions);

	// Verify all produce same results
	const results = [r1, r2, r3, r4, r5, r6, r7, r8];
	for (let i = 1; i < results.length; i++) {
		if (results[i] !== results[0]) {
			console.log('Method 0:', results[0].slice(0, 100));
			console.log(`Method ${i}:`, results[i].slice(0, 100));
			throw new Error(`Method ${i} produces different result`);
		}
	}
}

// Method 1: slice() with += concatenation
function buildWithSliceConcat(input, positions) {
	let result = '';
	for (let i = 0; i < positions.length; i++) {
		result += input.slice(positions[i].start, positions[i].end);
		if (i < positions.length - 1) result += ' '; // Add space between tokens
	}
	return result;
}

// Method 2: substring() with += concatenation
function buildWithSubstringConcat(input, positions) {
	let result = '';
	for (let i = 0; i < positions.length; i++) {
		result += input.substring(positions[i].start, positions[i].end);
		if (i < positions.length - 1) result += ' ';
	}
	return result;
}

// Method 3: substr() with += concatenation
function buildWithSubstrConcat(input, positions) {
	let result = '';
	for (let i = 0; i < positions.length; i++) {
		const length = positions[i].end - positions[i].start;
		result += input.substr(positions[i].start, length);
		if (i < positions.length - 1) result += ' ';
	}
	return result;
}

// Method 4: slice() into array, then join
function buildWithSliceArray(input, positions) {
	const parts = [];
	for (let i = 0; i < positions.length; i++) {
		parts.push(input.slice(positions[i].start, positions[i].end));
	}
	return parts.join(' ');
}

// Method 5: Character-by-character building
function buildWithCharByChar(input, positions) {
	let result = '';
	for (let i = 0; i < positions.length; i++) {
		for (let j = positions[i].start; j < positions[i].end; j++) {
			result += input[j];
		}
		if (i < positions.length - 1) result += ' ';
	}
	return result;
}

// Method 6: Nested arrays (array of char arrays, then join)
function buildWithNestedArrays(input, positions) {
	const tokens = [];
	for (let i = 0; i < positions.length; i++) {
		const chars = [];
		for (let j = positions[i].start; j < positions[i].end; j++) {
			chars.push(input[j]);
		}
		tokens.push(chars.join(''));
	}
	return tokens.join(' ');
}

// Method 7: Pre-calculate total length, use array
function buildWithPreallocatedString(input, positions) {
	// Calculate total length first
	let totalLength = 0;
	for (let i = 0; i < positions.length; i++) {
		totalLength += positions[i].end - positions[i].start;
		if (i < positions.length - 1) totalLength += 1; // space
	}

	// Build with array (can't truly preallocate string in JS)
	const parts = [];
	for (let i = 0; i < positions.length; i++) {
		parts.push(input.slice(positions[i].start, positions[i].end));
	}
	return parts.join(' ');
}

// Method 8: Array.push with slices (most common pattern)
function buildWithArrayPushSlices(input, positions) {
	const result = [];
	for (let i = 0; i < positions.length; i++) {
		result.push(input.slice(positions[i].start, positions[i].end));
		if (i < positions.length - 1) result.push(' ');
	}
	return result.join('');
}

// Method 9: substring() into array
function buildWithSubstringArray(input, positions) {
	const parts = [];
	for (let i = 0; i < positions.length; i++) {
		parts.push(input.substring(positions[i].start, positions[i].end));
	}
	return parts.join(' ');
}

// Method 10: Template literals with slice
function buildWithTemplateLiterals(input, positions) {
	let result = '';
	for (let i = 0; i < positions.length; i++) {
		const token = input.slice(positions[i].start, positions[i].end);
		result = i === 0 ? token : `${result} ${token}`;
	}
	return result;
}

// Benchmarks for different sizes
describe('String building - short (1K chars, ~200 tokens)', () => {
	bench('slice() + concat (+=)', () => {
		buildWithSliceConcat(shortInput, shortPositions);
	});

	bench('substring() + concat (+=)', () => {
		buildWithSubstringConcat(shortInput, shortPositions);
	});

	bench('substr() + concat (+=)', () => {
		buildWithSubstrConcat(shortInput, shortPositions);
	});

	bench('slice() + array.join()', () => {
		buildWithSliceArray(shortInput, shortPositions);
	});

	bench('char-by-char concat', () => {
		buildWithCharByChar(shortInput, shortPositions);
	});

	bench('nested arrays', () => {
		buildWithNestedArrays(shortInput, shortPositions);
	});

	bench('preallocated length', () => {
		buildWithPreallocatedString(shortInput, shortPositions);
	});

	bench('array.push slices', () => {
		buildWithArrayPushSlices(shortInput, shortPositions);
	});

	bench('substring() + array.join()', () => {
		buildWithSubstringArray(shortInput, shortPositions);
	});

	bench('template literals', () => {
		buildWithTemplateLiterals(shortInput, shortPositions);
	});
});

describe('String building - medium (10K chars, ~2K tokens)', () => {
	bench('slice() + concat (+=)', () => {
		buildWithSliceConcat(mediumInput, mediumPositions);
	});

	bench('substring() + concat (+=)', () => {
		buildWithSubstringConcat(mediumInput, mediumPositions);
	});

	bench('substr() + concat (+=)', () => {
		buildWithSubstrConcat(mediumInput, mediumPositions);
	});

	bench('slice() + array.join()', () => {
		buildWithSliceArray(mediumInput, mediumPositions);
	});

	bench('char-by-char concat', () => {
		buildWithCharByChar(mediumInput, mediumPositions);
	});

	bench('nested arrays', () => {
		buildWithNestedArrays(mediumInput, mediumPositions);
	});

	bench('preallocated length', () => {
		buildWithPreallocatedString(mediumInput, mediumPositions);
	});

	bench('array.push slices', () => {
		buildWithArrayPushSlices(mediumInput, mediumPositions);
	});

	bench('substring() + array.join()', () => {
		buildWithSubstringArray(mediumInput, mediumPositions);
	});

	bench('template literals', () => {
		buildWithTemplateLiterals(mediumInput, mediumPositions);
	});
});

describe('String building - long (100K chars, ~20K tokens)', () => {
	bench('slice() + concat (+=)', () => {
		buildWithSliceConcat(longInput, longPositions);
	});

	bench('substring() + concat (+=)', () => {
		buildWithSubstringConcat(longInput, longPositions);
	});

	bench('substr() + concat (+=)', () => {
		buildWithSubstrConcat(longInput, longPositions);
	});

	bench('slice() + array.join()', () => {
		buildWithSliceArray(longInput, longPositions);
	});

	bench('char-by-char concat', () => {
		buildWithCharByChar(longInput, longPositions);
	});

	bench('nested arrays', () => {
		buildWithNestedArrays(longInput, longPositions);
	});

	bench('preallocated length', () => {
		buildWithPreallocatedString(longInput, longPositions);
	});

	bench('array.push slices', () => {
		buildWithArrayPushSlices(longInput, longPositions);
	});

	bench('substring() + array.join()', () => {
		buildWithSubstringArray(longInput, longPositions);
	});

	bench('template literals', () => {
		buildWithTemplateLiterals(longInput, longPositions);
	});
});

describe('String building - huge (1M chars, ~200K tokens)', () => {
	bench('slice() + concat (+=)', () => {
		buildWithSliceConcat(hugeInput, hugePositions);
	});

	bench('substring() + concat (+=)', () => {
		buildWithSubstringConcat(hugeInput, hugePositions);
	});

	bench('substr() + concat (+=)', () => {
		buildWithSubstrConcat(hugeInput, hugePositions);
	});

	bench('slice() + array.join()', () => {
		buildWithSliceArray(hugeInput, hugePositions);
	});

	// Skip char-by-char for huge - it will be too slow
	bench('char-by-char concat', () => {
		buildWithCharByChar(hugeInput, hugePositions);
	});

	bench('nested arrays', () => {
		buildWithNestedArrays(hugeInput, hugePositions);
	});

	bench('preallocated length', () => {
		buildWithPreallocatedString(hugeInput, hugePositions);
	});

	bench('array.push slices', () => {
		buildWithArrayPushSlices(hugeInput, hugePositions);
	});

	bench('substring() + array.join()', () => {
		buildWithSubstringArray(hugeInput, hugePositions);
	});

	bench('template literals', () => {
		buildWithTemplateLiterals(hugeInput, hugePositions);
	});
});

// Special case: building from many tiny tokens
describe('String building - many tiny tokens', () => {
	const tinyDoc =
		'+ - * / = == === != !== < > <= >= && || ! ++ -- += -= *= /= %= ** ?? ; : , . ( ) [ ] { }'.repeat(
			100
		);
	const tinyPositions = generateTokenPositions(tinyDoc);

	bench('slice() + concat (+=) - tiny', () => {
		buildWithSliceConcat(tinyDoc, tinyPositions);
	});

	bench('slice() + array.join() - tiny', () => {
		buildWithSliceArray(tinyDoc, tinyPositions);
	});

	bench('char-by-char - tiny', () => {
		buildWithCharByChar(tinyDoc, tinyPositions);
	});

	bench('array.push slices - tiny', () => {
		buildWithArrayPushSlices(tinyDoc, tinyPositions);
	});
});

// Special case: building from few large tokens
describe('String building - few large tokens', () => {
	const largeDoc = makeDocument(10000);
	// Create positions for large chunks (simulating large text blocks)
	const largePositions = [];
	for (let i = 0; i < largeDoc.length - 1000; i += 1000) {
		largePositions.push({ start: i, end: i + 900 });
	}

	bench('slice() + concat (+=) - large tokens', () => {
		buildWithSliceConcat(largeDoc, largePositions);
	});

	bench('slice() + array.join() - large tokens', () => {
		buildWithSliceArray(largeDoc, largePositions);
	});

	bench('array.push slices - large tokens', () => {
		buildWithArrayPushSlices(largeDoc, largePositions);
	});
	bench('char-by-char concat - large tokens', () => {
		buildWithCharByChar(largeDoc, largePositions);
	});

	bench('substring() + array.join() - large tokens', () => {
		buildWithSubstringArray(largeDoc, largePositions);
	});

	bench('template literals - large tokens', () => {
		buildWithTemplateLiterals(largeDoc, largePositions);
	});
});
