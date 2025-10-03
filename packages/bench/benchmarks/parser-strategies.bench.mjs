// import { bench, beforeAll, describe } from 'vitest';

// const backtickCode = '`'.charCodeAt(0);
// const openBraceCode = '{'.charCodeAt(0);
// const closeBraceCode = '}'.charCodeAt(0);
// const atCode = '@'.charCodeAt(0);
// const hashCode = '#'.charCodeAt(0);
// const slashCode = '/'.charCodeAt(0);
// const colonCode = ':'.charCodeAt(0);
// const newlineCode = '\n'.charCodeAt(0);
// const spaceCode = ' '.charCodeAt(0);
// const nonBreakingSpace = '\u00A0';

// const PROBE_BITS = {
// 	html: 1,
// 	blockOpen: 2,
// 	blockClose: 4,
// 	blockElse: 8,
// 	expression: 16,
// };

// const PROBE_LABELS = [
// 	'html',
// 	'block-open',
// 	'block-close',
// 	'block-else',
// 	'expression',
// ];
// const reusableProbeOptions = new Set();
// const WARMUP_ITERATIONS = 3;

// let markdownSample;
// let ambiguousSample;
// let asciiWhitespaceLookup;
// let whitespaceSet;

// beforeAll(() => {
// 	markdownSample = buildMarkdownPayload();
// 	ambiguousSample = buildAmbiguousPayload();
// 	asciiWhitespaceLookup = createAsciiWhitespaceLookup();
// 	whitespaceSet = createWhitespaceSet();

// 	const tokenizerBaseline = tokenizeInline(markdownSample);
// 	ensureTokensMatch(
// 		tokenizerBaseline,
// 		tokenizeWithHelpers(markdownSample),
// 		'helper tokenizer mismatch'
// 	);
// 	ensureTokensMatch(
// 		tokenizerBaseline,
// 		tokenizeWithRegex(markdownSample),
// 		'regex tokenizer mismatch'
// 	);
// 	ensureTokensMatch(
// 		tokenizerBaseline,
// 		tokenizeWithChomp(markdownSample),
// 		'chomp tokenizer mismatch'
// 	);

// 	const ambiguityBaseline = resolveAmbiguityDirect(ambiguousSample);
// 	ensureTokensMatch(
// 		ambiguityBaseline,
// 		resolveAmbiguityWithMask(ambiguousSample),
// 		'mask resolver mismatch'
// 	);
// 	ensureTokensMatch(
// 		ambiguityBaseline,
// 		resolveAmbiguityWithProbes(ambiguousSample),
// 		'probe resolver mismatch'
// 	);

// 	const whitespaceBaseline = countWhitespaceWithLookup(
// 		markdownSample,
// 		asciiWhitespaceLookup
// 	);
// 	if (
// 		whitespaceBaseline !==
// 			countWhitespaceWithSet(markdownSample, whitespaceSet) ||
// 		whitespaceBaseline !== countWhitespaceWithComparisons(markdownSample)
// 	) {
// 		throw new Error('Whitespace strategies disagree on baseline count');
// 	}

// 	warmupImplementations();
// });

// describe('Tokenizer Loop Strategies', () => {
// 	bench('inline char loop', () => {
// 		consume(tokenizeInline(markdownSample).length);
// 	});

// 	bench('helper-driven char loop', () => {
// 		consume(tokenizeWithHelpers(markdownSample).length);
// 	});

// 	bench('regex slicing pipeline', () => {
// 		consume(tokenizeWithRegex(markdownSample).length);
// 	});

// 	bench('chomp traversal', () => {
// 		consume(tokenizeWithChomp(markdownSample).length);
// 	});
// });

// describe('Ambiguity Resolution', () => {
// 	bench('direct scanner resolution', () => {
// 		consume(resolveAmbiguityDirect(ambiguousSample).length);
// 	});

// 	bench('typed mask probe', () => {
// 		consume(resolveAmbiguityWithMask(ambiguousSample).length);
// 	});

// 	bench('probe mode Set traversal', () => {
// 		consume(resolveAmbiguityWithProbes(ambiguousSample).length);
// 	});
// });

// describe('Character Classification', () => {
// 	bench('Uint8Array lookup', () => {
// 		consume(countWhitespaceWithLookup(markdownSample, asciiWhitespaceLookup));
// 	});

// 	bench('Set membership', () => {
// 		consume(countWhitespaceWithSet(markdownSample, whitespaceSet));
// 	});

// 	bench('comparison chain', () => {
// 		consume(countWhitespaceWithComparisons(markdownSample));
// 	});
// });

// function buildMarkdownPayload() {
// 	const sections = [
// 		'---',
// 		'title: Parser Strategy Showdown {block}',
// 		'description: Benchmarking tokenizer approaches for block {block}',
// 		'---',
// 		'',
// 		'# Intro {block}',
// 		'We evaluate character scanning, ambiguity probes, and classification for run {block}.',
// 		'```svelte',
// 		'<script>',
// 		'  export let value = {block};',
// 		'  const phrases = ["one", "two", "three", "four"];',
// 		'</script>',
// 		'```',
// 		'',
// 		'The renderer consumes {@html snippet} blocks and fenced code.',
// 		'```js',
// 		'export async function load{block}() {',
// 		'  const response = await fetch(`/api/data?block={block}&tick=${Date.now()}`);',
// 		'  return response.json();',
// 		'}',
// 		'```',
// 		'',
// 		'Text nodes can span many lines and include \u00A0 non-breaking spaces.',
// 		'{#if value > 0}',
// 		'  {@html snippet}',
// 		'{:else}',
// 		'  Plain text fallback {block}',
// 		'{/if}',
// 		'',
// 		'> Benchmark payload {block} mixes prose, directives, and embedded expressions.',
// 	];

// 	const variations = [
// 		'## Section {index}\nThis variant mixes `{inline}` code and {@debug notes}.',
// 		'1. Item {index}\n2. Another item\n3. Final bullet',
// 		'<Component bind:value={value} data-id="section-{index}" />',
// 		'```md\n# Nested heading {index}\n- list\n- values\n```',
// 		'<!-- comment {index} ensures irregular spacing -->',
// 		'{#await promise{index}}\n  <p>loading {index}</p>\n{:then result}\n  <p>{result.title}</p>\n{:catch error}\n  <p class="error">{error.message}</p>\n{/await}',
// 	];

// 	const blocks = [];
// 	const blockCount = 12;

// 	for (let block = 0; block < blockCount; block += 1) {
// 		const blockValue = String(block);
// 		const blockLines = sections.map((line) =>
// 			line.replaceAll('{block}', blockValue)
// 		);
// 		blocks.push(blockLines.join('\n'));

// 		const startIndex = block * variations.length;
// 		const variationLines = variations.map((template, offset) =>
// 			template.replaceAll('{index}', String(startIndex + offset))
// 		);
// 		blocks.push(variationLines.join('\n'));
// 	}

// 	return blocks.join('\n\n');
// }

// function buildAmbiguousPayload() {
// 	const templates = [
// 		'{#if condition{index}}',
// 		'  <div>{@html snippet{index}}</div>',
// 		'{:else if other{index}}',
// 		'  <p>{value{index}}</p>',
// 		'{/if}',
// 		'',
// 		'{#each list{index} as item{index}}',
// 		'  <slot name="summary-{index}" />',
// 		'  <p class={item{index}.className}>{item{index}.label}</p>',
// 		'{/each}',
// 		'',
// 		'{@debug info{index}}',
// 		'{@html fallback{index}}',
// 		'',
// 		'{@:attribute attr{index}}',
// 	];

// 	const blocks = [];
// 	for (let index = 0; index < 64; index += 1) {
// 		for (const template of templates) {
// 			blocks.push(template.replaceAll('{index}', String(index)));
// 		}
// 	}

// 	return blocks.join('\n');
// }

// function createAsciiWhitespaceLookup() {
// 	const table = new Uint8Array(128);
// 	table[' '.charCodeAt(0)] = 1;
// 	table['\t'.charCodeAt(0)] = 1;
// 	table['\n'.charCodeAt(0)] = 1;
// 	table['\r'.charCodeAt(0)] = 1;
// 	table['\f'.charCodeAt(0)] = 1;
// 	return table;
// }

// function createWhitespaceSet() {
// 	return new Set([' ', '\t', '\n', '\r', '\f', nonBreakingSpace]);
// }

// function tokenizeInline(input) {
// 	const tokens = [];
// 	const limit = input.length;
// 	let index = 0;
// 	let textStart = 0;

// 	while (index < limit) {
// 		if (isFenceAt(input, index, limit)) {
// 			if (textStart < index) {
// 				tokens.push(createTextToken(textStart, index));
// 			}
// 			const closing = scanFenceEnd(input, index + 3, limit);
// 			tokens.push(createFenceToken(index, closing));
// 			index = closing;
// 			textStart = index;
// 			continue;
// 		}

// 		if (isDirectiveAt(input, index, limit)) {
// 			if (textStart < index) {
// 				tokens.push(createTextToken(textStart, index));
// 			}
// 			const closing = scanDirectiveEnd(input, index + 2, limit);
// 			tokens.push(createDirectiveToken(index, closing));
// 			index = closing;
// 			textStart = index;
// 			continue;
// 		}

// 		index += 1;
// 	}

// 	if (textStart < limit) {
// 		tokens.push(createTextToken(textStart, limit));
// 	}

// 	return tokens;
// }

// function tokenizeWithHelpers(input) {
// 	const tokens = [];
// 	const state = createScanState();
// 	const limit = input.length;

// 	while (state.index < limit) {
// 		const code = input.charCodeAt(state.index);
// 		beginTextSegment(state);

// 		if (isFenceAt(input, state.index, limit)) {
// 			flushTextSegment(tokens, state);
// 			const start = state.index;
// 			advanceIndex(state, 3);
// 			const closing = scanFenceEnd(input, state.index, limit);
// 			state.index = closing;
// 			tokens.push(createFenceToken(start, closing));
// 			state.textStart = closing;
// 			continue;
// 		}

// 		if (code === openBraceCode && isDirectiveAt(input, state.index, limit)) {
// 			flushTextSegment(tokens, state);
// 			const start = state.index;
// 			advanceIndex(state, 2);
// 			const closing = scanDirectiveEnd(input, state.index, limit);
// 			state.index = closing;
// 			tokens.push(createDirectiveToken(start, closing));
// 			state.textStart = closing;
// 			continue;
// 		}

// 		advanceIndex(state, 1);
// 	}

// 	flushTextSegment(tokens, state);
// 	return tokens;
// }

// function tokenizeWithRegex(input) {
// 	const tokens = [];
// 	const pattern = /```[\s\S]*?```|{@[^}]*}/g;
// 	let lastIndex = 0;
// 	let match;

// 	while ((match = pattern.exec(input)) !== null) {
// 		if (match.index > lastIndex) {
// 			tokens.push(createTextToken(lastIndex, match.index));
// 		}
// 		const isFence = match[0].charCodeAt(0) === backtickCode;
// 		tokens.push({
// 			type: isFence ? 'fence' : 'directive',
// 			start: match.index,
// 			end: match.index + match[0].length,
// 		});
// 		lastIndex = pattern.lastIndex;
// 	}

// 	if (lastIndex < input.length) {
// 		tokens.push(createTextToken(lastIndex, input.length));
// 	}

// 	return tokens;
// }

// function tokenizeWithChomp(input) {
// 	const tokens = [];
// 	const limit = input.length;
// 	let cursor = 0;

// 	while (cursor < limit) {
// 		const nextFence = input.indexOf('```', cursor);
// 		const nextDirective = input.indexOf('{@', cursor);
// 		const nearest = selectNearest(nextFence, nextDirective);

// 		if (nearest === -1) {
// 			tokens.push(createTextToken(cursor, limit));
// 			break;
// 		}

// 		if (cursor < nearest) {
// 			tokens.push(createTextToken(cursor, nearest));
// 		}

// 		if (nearest === nextFence) {
// 			const closing = scanFenceEnd(input, nextFence + 3, limit);
// 			tokens.push(createFenceToken(nearest, closing));
// 			cursor = closing;
// 			continue;
// 		}

// 		const closing = scanDirectiveEnd(input, nextDirective + 2, limit);
// 		tokens.push(createDirectiveToken(nearest, closing));
// 		cursor = closing;
// 	}

// 	return tokens;
// }

// function resolveAmbiguityDirect(input) {
// 	const tokens = [];
// 	const limit = input.length;
// 	let index = 0;

// 	while (index < limit) {
// 		if (input.charCodeAt(index) === openBraceCode) {
// 			const next = input.charCodeAt(index + 1);
// 			const tokenType = classifyDirectiveDirect(next);
// 			const end = advanceToBraceClose(input, index + 1);
// 			tokens.push({ type: tokenType, start: index, end });
// 			index = end;
// 			continue;
// 		}
// 		index += 1;
// 	}

// 	return tokens;
// }

// function resolveAmbiguityWithMask(input) {
// 	const tokens = [];
// 	const limit = input.length;
// 	let index = 0;

// 	while (index < limit) {
// 		if (input.charCodeAt(index) === openBraceCode) {
// 			const next = input.charCodeAt(index + 1);
// 			let mask =
// 				PROBE_BITS.html |
// 				PROBE_BITS.blockOpen |
// 				PROBE_BITS.blockClose |
// 				PROBE_BITS.blockElse |
// 				PROBE_BITS.expression;
// 			mask &= maskForProbeChar(next);
// 			const tokenType = resolveMask(mask);
// 			const end = advanceToBraceClose(input, index + 1);
// 			tokens.push({ type: tokenType, start: index, end });
// 			index = end;
// 			continue;
// 		}
// 		index += 1;
// 	}

// 	return tokens;
// }

// function resolveAmbiguityWithProbes(input) {
// 	const tokens = [];
// 	const limit = input.length;
// 	let index = 0;
// 	const options = reusableProbeOptions;

// 	while (index < limit) {
// 		if (input.charCodeAt(index) === openBraceCode) {
// 			initProbeOptions(options, input.charCodeAt(index + 1));
// 			let cursor = index + 2;
// 			while (cursor < limit && !isBraceTerminator(input.charCodeAt(cursor))) {
// 				narrowProbeOptions(options, input.charCodeAt(cursor));
// 				cursor += 1;
// 			}
// 			const tokenType = finalizeProbeType(options);
// 			const end = advanceToBraceClose(input, index + 1);
// 			tokens.push({ type: tokenType, start: index, end });
// 			index = end;
// 			continue;
// 		}
// 		index += 1;
// 	}

// 	return tokens;
// }

// function countWhitespaceWithLookup(input, lookup) {
// 	let count = 0;
// 	const limit = input.length;
// 	for (let index = 0; index < limit; index += 1) {
// 		const code = input.charCodeAt(index);
// 		if (code < 128) {
// 			count += lookup[code];
// 		} else if (code === nonBreakingSpace.charCodeAt(0)) {
// 			count += 1;
// 		}
// 	}
// 	return count;
// }

// function countWhitespaceWithSet(input, set) {
// 	let count = 0;
// 	const limit = input.length;
// 	for (let index = 0; index < limit; index += 1) {
// 		if (set.has(input[index])) {
// 			count += 1;
// 		}
// 	}
// 	return count;
// }

// function countWhitespaceWithComparisons(input) {
// 	let count = 0;
// 	const limit = input.length;
// 	for (let index = 0; index < limit; index += 1) {
// 		const char = input[index];
// 		if (
// 			char === ' ' ||
// 			char === '\n' ||
// 			char === '\t' ||
// 			char === '\r' ||
// 			char === '\f' ||
// 			char === nonBreakingSpace
// 		) {
// 			count += 1;
// 		}
// 	}
// 	return count;
// }

// function warmupImplementations() {
// 	const tokenizers = [
// 		tokenizeInline,
// 		tokenizeWithHelpers,
// 		tokenizeWithRegex,
// 		tokenizeWithChomp,
// 	];
// 	const resolvers = [
// 		resolveAmbiguityDirect,
// 		resolveAmbiguityWithMask,
// 		resolveAmbiguityWithProbes,
// 	];
// 	const classifiers = [
// 		(input) => countWhitespaceWithLookup(input, asciiWhitespaceLookup),
// 		(input) => countWhitespaceWithSet(input, whitespaceSet),
// 		countWhitespaceWithComparisons,
// 	];

// 	for (let iteration = 0; iteration < WARMUP_ITERATIONS; iteration += 1) {
// 		for (const tokenizer of tokenizers) {
// 			consume(tokenizer(markdownSample).length);
// 		}
// 		for (const resolver of resolvers) {
// 			consume(resolver(ambiguousSample).length);
// 		}
// 		for (const classifier of classifiers) {
// 			consume(classifier(markdownSample));
// 		}
// 	}
// }

// function isFenceAt(input, index, limit) {
// 	return (
// 		index + 2 < limit &&
// 		input.charCodeAt(index) === backtickCode &&
// 		input.charCodeAt(index + 1) === backtickCode &&
// 		input.charCodeAt(index + 2) === backtickCode
// 	);
// }

// function isDirectiveAt(input, index, limit) {
// 	return (
// 		index + 1 < limit &&
// 		input.charCodeAt(index) === openBraceCode &&
// 		input.charCodeAt(index + 1) === atCode
// 	);
// }

// function scanFenceEnd(input, start, limit) {
// 	let cursor = start;
// 	while (cursor < limit - 2) {
// 		if (isFenceAt(input, cursor, limit)) {
// 			return cursor + 3;
// 		}
// 		cursor += 1;
// 	}
// 	return limit;
// }

// function scanDirectiveEnd(input, start, limit) {
// 	let cursor = start;
// 	while (cursor < limit && input.charCodeAt(cursor) !== closeBraceCode) {
// 		cursor += 1;
// 	}
// 	return cursor < limit ? cursor + 1 : cursor;
// }

// function createScanState() {
// 	return {
// 		index: 0,
// 		textStart: -1,
// 	};
// }

// function beginTextSegment(state) {
// 	if (state.textStart === -1) {
// 		state.textStart = state.index;
// 	}
// }

// function flushTextSegment(tokens, state) {
// 	if (state.textStart !== -1 && state.index > state.textStart) {
// 		tokens.push(createTextToken(state.textStart, state.index));
// 	}
// 	state.textStart = -1;
// }

// function advanceIndex(state, amount) {
// 	state.index += amount;
// }

// function createTextToken(start, end) {
// 	return { type: 'text', start, end };
// }

// function createFenceToken(start, end) {
// 	return { type: 'fence', start, end };
// }

// function createDirectiveToken(start, end) {
// 	return { type: 'directive', start, end };
// }

// function classifyDirectiveDirect(nextCode) {
// 	if (nextCode === atCode) {
// 		return 'html';
// 	}
// 	if (nextCode === hashCode) {
// 		return 'block-open';
// 	}
// 	if (nextCode === slashCode) {
// 		return 'block-close';
// 	}
// 	if (nextCode === colonCode) {
// 		return 'block-else';
// 	}
// 	return 'expression';
// }

// function resolveMask(mask) {
// 	if (mask & PROBE_BITS.html) {
// 		return 'html';
// 	}
// 	if (mask & PROBE_BITS.blockOpen) {
// 		return 'block-open';
// 	}
// 	if (mask & PROBE_BITS.blockClose) {
// 		return 'block-close';
// 	}
// 	if (mask & PROBE_BITS.blockElse) {
// 		return 'block-else';
// 	}
// 	return 'expression';
// }

// function maskForProbeChar(code) {
// 	if (code === atCode) {
// 		return PROBE_BITS.html;
// 	}
// 	if (code === hashCode) {
// 		return PROBE_BITS.blockOpen;
// 	}
// 	if (code === slashCode) {
// 		return PROBE_BITS.blockClose;
// 	}
// 	if (code === colonCode) {
// 		return PROBE_BITS.blockElse;
// 	}
// 	return PROBE_BITS.expression;
// }

// function initProbeOptions(options, code) {
// 	options.clear();
// 	if (code === atCode) {
// 		options.add('html');
// 		return;
// 	}
// 	if (code === hashCode) {
// 		options.add('block-open');
// 		return;
// 	}
// 	if (code === slashCode) {
// 		options.add('block-close');
// 		return;
// 	}
// 	if (code === colonCode) {
// 		options.add('block-else');
// 		return;
// 	}
// 	for (const label of PROBE_LABELS) {
// 		options.add(label);
// 	}
// }

// function narrowProbeOptions(options, code) {
// 	if (options.size <= 1) {
// 		return;
// 	}
// 	if (code === atCode) {
// 		options.delete('block-open');
// 		options.delete('block-close');
// 		options.delete('block-else');
// 		options.delete('expression');
// 	} else if (code === hashCode) {
// 		options.delete('html');
// 		options.delete('block-close');
// 		options.delete('block-else');
// 		options.delete('expression');
// 	} else if (code === slashCode) {
// 		options.delete('html');
// 		options.delete('block-open');
// 		options.delete('block-else');
// 		options.delete('expression');
// 	} else if (code === colonCode) {
// 		options.delete('html');
// 		options.delete('block-open');
// 		options.delete('block-close');
// 		options.delete('expression');
// 	}
// }

// function finalizeProbeType(options) {
// 	if (options.size > 1 && options.has('expression')) {
// 		return 'expression';
// 	}
// 	if (options.has('html')) {
// 		return 'html';
// 	}
// 	if (options.has('block-open')) {
// 		return 'block-open';
// 	}
// 	if (options.has('block-close')) {
// 		return 'block-close';
// 	}
// 	if (options.has('block-else')) {
// 		return 'block-else';
// 	}
// 	return 'expression';
// }

// function advanceToBraceClose(input, start) {
// 	const limit = input.length;
// 	let cursor = start;
// 	while (cursor < limit && input.charCodeAt(cursor) !== closeBraceCode) {
// 		cursor += 1;
// 	}
// 	return cursor < limit ? cursor + 1 : cursor;
// }

// function isBraceTerminator(code) {
// 	return code === closeBraceCode || code === newlineCode || code === spaceCode;
// }

// function selectNearest(first, second) {
// 	if (first === -1) {
// 		return second;
// 	}
// 	if (second === -1) {
// 		return first;
// 	}
// 	return Math.min(first, second);
// }

// function ensureTokensMatch(expected, actual, label) {
// 	console.log(label, expected.length, actual.length);
// 	if (expected.length !== actual.length) {
// 		throw new Error(`${label} (length)`);
// 	}
// 	for (let index = 0; index < expected.length; index += 1) {
// 		const left = expected[index];
// 		const right = actual[index];
// 		if (
// 			left.type !== right.type ||
// 			left.start !== right.start ||
// 			left.end !== right.end
// 		) {
// 			throw new Error(`${label} (entry ${index})`);
// 		}
// 	}
// }

// function consume(value) {
// 	if (value === -1) {
// 		throw new Error('unreachable');
// 	}
// }

import { bench, beforeAll, describe } from 'vitest';

// A more realistic parsing scenario:
// - Single chars: {, }, <, >, =, :, ;
// - Multi-char entities: identifiers, keywords, strings, numbers
// - Must maintain position and build token stream

const KEYWORDS = new Set([
	'if',
	'else',
	'for',
	'while',
	'function',
	'return',
	'const',
	'let',
	'var',
]);

// ============================================
// Approach 1: Manual scanning with lookahead
// ============================================
function parseManual(input) {
	const tokens = [];
	const len = input.length;
	let pos = 0;

	while (pos < len) {
		const char = input[pos];

		// Skip whitespace
		if (char === ' ' || char === '\n' || char === '\t') {
			pos++;
			continue;
		}

		// Single character tokens
		if (
			char === '{' ||
			char === '}' ||
			char === '(' ||
			char === ')' ||
			char === ';' ||
			char === ',' ||
			char === ':'
		) {
			tokens.push({ type: 'punct', value: char, pos });
			pos++;
			continue;
		}

		// Operators (could be single or double)
		if (char === '=' || char === '!' || char === '<' || char === '>') {
			if (pos + 1 < len && input[pos + 1] === '=') {
				tokens.push({ type: 'op', value: char + '=', pos });
				pos += 2;
			} else {
				tokens.push({ type: 'op', value: char, pos });
				pos++;
			}
			continue;
		}

		// String literals
		if (char === '"' || char === "'") {
			const quote = char;
			let end = pos + 1;
			while (end < len && input[end] !== quote) {
				if (input[end] === '\\') end++; // Skip escaped chars
				end++;
			}
			tokens.push({
				type: 'string',
				value: input.substring(pos, end + 1),
				pos,
			});
			pos = end + 1;
			continue;
		}

		// Numbers
		if (char >= '0' && char <= '9') {
			let end = pos + 1;
			while (end < len && input[end] >= '0' && input[end] <= '9') {
				end++;
			}
			if (end < len && input[end] === '.') {
				end++;
				while (end < len && input[end] >= '0' && input[end] <= '9') {
					end++;
				}
			}
			tokens.push({
				type: 'number',
				value: input.substring(pos, end),
				pos,
			});
			pos = end;
			continue;
		}

		// Identifiers and keywords
		if (
			(char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			char === '_'
		) {
			let end = pos + 1;
			while (end < len) {
				const c = input[end];
				if (
					(c >= 'a' && c <= 'z') ||
					(c >= 'A' && c <= 'Z') ||
					(c >= '0' && c <= '9') ||
					c === '_'
				) {
					end++;
				} else {
					break;
				}
			}
			const value = input.substring(pos, end);
			tokens.push({
				type: KEYWORDS.has(value) ? 'keyword' : 'ident',
				value,
				pos,
			});
			pos = end;
			continue;
		}

		// Unknown character, skip
		pos++;
	}

	return tokens;
}

// ============================================
// Approach 2: Regex-assisted progressive parsing
// ============================================
function parseRegexAssisted(input) {
	const tokens = [];
	let pos = 0;

	// Pre-compiled patterns starting from current position
	const patterns = {
		whitespace: /^[ \n\t]+/,
		punct: /^[{}();,:]/,
		op: /^(==|!=|<=|>=|=|!|<|>)/,
		string: /^(["'])((?:\\.|(?!\1).)*)\1/,
		number: /^(\d+\.?\d*|\d*\.\d+)/,
		ident: /^[a-zA-Z_][a-zA-Z0-9_]*/,
	};

	while (pos < input.length) {
		const remaining = input.slice(pos);
		let matched = false;

		// Try each pattern
		for (const [type, pattern] of Object.entries(patterns)) {
			const match = remaining.match(pattern);
			if (match) {
				if (type !== 'whitespace') {
					const value = match[0];
					const tokenType =
						type === 'ident' && KEYWORDS.has(value) ? 'keyword' : type;
					tokens.push({
						type: tokenType,
						value,
						pos,
					});
				}
				pos += match[0].length;
				matched = true;
				break;
			}
		}

		// Skip unknown characters
		if (!matched) {
			pos++;
		}
	}

	return tokens;
}

// ============================================
// Approach 3: Hybrid - manual for simple, regex for complex
// ============================================
function parseHybrid(input) {
	const tokens = [];
	const len = input.length;
	let pos = 0;

	// Pre-compile only complex patterns
	const stringPattern = /^(["'])((?:\\.|(?!\1).)*)\1/;
	const identPattern = /^[a-zA-Z_][a-zA-Z0-9_]*/;

	while (pos < len) {
		const char = input[pos];

		// Skip whitespace (manual - simple)
		if (char === ' ' || char === '\n' || char === '\t') {
			pos++;
			continue;
		}

		// Single chars (manual - simple)
		if (
			char === '{' ||
			char === '}' ||
			char === '(' ||
			char === ')' ||
			char === ';' ||
			char === ',' ||
			char === ':'
		) {
			tokens.push({ type: 'punct', value: char, pos });
			pos++;
			continue;
		}

		// Operators (manual - predictable)
		if (char === '=' || char === '!' || char === '<' || char === '>') {
			if (pos + 1 < len && input[pos + 1] === '=') {
				tokens.push({ type: 'op', value: char + '=', pos });
				pos += 2;
			} else {
				tokens.push({ type: 'op', value: char, pos });
				pos++;
			}
			continue;
		}

		// Strings (regex - complex escaping)
		if (char === '"' || char === "'") {
			const match = input.slice(pos).match(stringPattern);
			if (match) {
				tokens.push({ type: 'string', value: match[0], pos });
				pos += match[0].length;
				continue;
			}
		}

		// Numbers (manual - simple)
		if (char >= '0' && char <= '9') {
			let end = pos + 1;
			while (end < len && input[end] >= '0' && input[end] <= '9') {
				end++;
			}
			if (end < len && input[end] === '.') {
				end++;
				while (end < len && input[end] >= '0' && input[end] <= '9') {
					end++;
				}
			}
			tokens.push({ type: 'number', value: input.substring(pos, end), pos });
			pos = end;
			continue;
		}

		// Identifiers (regex - cleaner than manual)
		if (
			(char >= 'a' && char <= 'z') ||
			(char >= 'A' && char <= 'Z') ||
			char === '_'
		) {
			const match = input.slice(pos).match(identPattern);
			if (match) {
				const value = match[0];
				tokens.push({
					type: KEYWORDS.has(value) ? 'keyword' : 'ident',
					value,
					pos,
				});
				pos += value.length;
				continue;
			}
		}

		pos++;
	}

	return tokens;
}

// ============================================
// Approach 4: Character-code based (optimized manual)
// ============================================
function parseCharCodes(input) {
	const tokens = [];
	const len = input.length;
	let pos = 0;

	const CHAR_0 = 48,
		CHAR_9 = 57;
	const CHAR_A = 65,
		CHAR_Z = 90;
	const CHAR_a = 97,
		CHAR_z = 122;
	const CHAR_UNDERSCORE = 95;
	const CHAR_SPACE = 32,
		CHAR_TAB = 9,
		CHAR_NEWLINE = 10;
	const CHAR_QUOTE = 34,
		CHAR_APOSTROPHE = 39;

	while (pos < len) {
		const code = input.charCodeAt(pos);

		// Skip whitespace
		if (code === CHAR_SPACE || code === CHAR_NEWLINE || code === CHAR_TAB) {
			pos++;
			continue;
		}

		// Single character tokens (using charCodeAt)
		if (
			code === 123 ||
			code === 125 ||
			code === 40 ||
			code === 41 ||
			code === 59 ||
			code === 44 ||
			code === 58
		) {
			tokens.push({ type: 'punct', value: input[pos], pos });
			pos++;
			continue;
		}

		// Operators
		if (code === 61 || code === 33 || code === 60 || code === 62) {
			if (pos + 1 < len && input.charCodeAt(pos + 1) === 61) {
				tokens.push({ type: 'op', value: input.substr(pos, 2), pos });
				pos += 2;
			} else {
				tokens.push({ type: 'op', value: input[pos], pos });
				pos++;
			}
			continue;
		}

		// String literals
		if (code === CHAR_QUOTE || code === CHAR_APOSTROPHE) {
			const quote = code;
			let end = pos + 1;
			while (end < len && input.charCodeAt(end) !== quote) {
				if (input.charCodeAt(end) === 92) end++; // backslash
				end++;
			}
			tokens.push({
				type: 'string',
				value: input.substring(pos, end + 1),
				pos,
			});
			pos = end + 1;
			continue;
		}

		// Numbers
		if (code >= CHAR_0 && code <= CHAR_9) {
			let end = pos + 1;
			while (end < len) {
				const c = input.charCodeAt(end);
				if (c >= CHAR_0 && c <= CHAR_9) {
					end++;
				} else if (c === 46 && end + 1 < len) {
					// period
					end++;
					while (
						end < len &&
						input.charCodeAt(end) >= CHAR_0 &&
						input.charCodeAt(end) <= CHAR_9
					) {
						end++;
					}
					break;
				} else {
					break;
				}
			}
			tokens.push({
				type: 'number',
				value: input.substring(pos, end),
				pos,
			});
			pos = end;
			continue;
		}

		// Identifiers and keywords
		if (
			(code >= CHAR_a && code <= CHAR_z) ||
			(code >= CHAR_A && code <= CHAR_Z) ||
			code === CHAR_UNDERSCORE
		) {
			let end = pos + 1;
			while (end < len) {
				const c = input.charCodeAt(end);
				if (
					(c >= CHAR_a && c <= CHAR_z) ||
					(c >= CHAR_A && c <= CHAR_Z) ||
					(c >= CHAR_0 && c <= CHAR_9) ||
					c === CHAR_UNDERSCORE
				) {
					end++;
				} else {
					break;
				}
			}
			const value = input.substring(pos, end);
			tokens.push({
				type: KEYWORDS.has(value) ? 'keyword' : 'ident',
				value,
				pos,
			});
			pos = end;
			continue;
		}

		pos++;
	}

	return tokens;
}

// Test data generator
function generateTestInput() {
	const snippets = [
		'function calculate(x, y) {',
		'  const result = x + y;',
		'  if (result > 100) {',
		'    return "large";',
		'  } else if (result < 0) {',
		'    return "negative";',
		'  }',
		'  return result.toString();',
		'}',
		'',
		'const data = {',
		'  name: "test",',
		'  value: 42.5,',
		'  items: [1, 2, 3],',
		'  check: value >= 10',
		'};',
		'',
		'for (let i = 0; i < data.items.length; i++) {',
		'  if (data.items[i] !== null) {',
		'    console.log(`Item ${i}: ${data.items[i]}`);',
		'  }',
		'}',
	];

	// Create a larger, more realistic input
	const repeated = [];
	for (let i = 0; i < 50; i++) {
		repeated.push(...snippets);
		repeated.push(`// Comment block ${i}`);
		repeated.push(`const var${i} = "string with ${i} interpolation";`);
	}

	return repeated.join('\n');
}

let testInput;
let baseline;

beforeAll(() => {
	testInput = generateTestInput();
	console.log(`Test input size: ${testInput.length} characters`);

	// Verify all parsers produce equivalent output
	baseline = parseManual(testInput);
	const regexResult = parseRegexAssisted(testInput);
	const hybridResult = parseHybrid(testInput);
	const charCodeResult = parseCharCodes(testInput);

	// Basic equivalence check (you might want more thorough validation)
	if (
		baseline.length !== regexResult.length ||
		baseline.length !== hybridResult.length ||
		baseline.length !== charCodeResult.length
	) {
		throw new Error('Parsers produced different token counts!');
	}

	console.log(`Tokens generated: ${baseline.length}`);
});

describe('Realistic Parser Benchmark', () => {
	bench('Manual scanning', () => {
		parseManual(testInput);
	});

	bench('Regex-assisted', () => {
		parseRegexAssisted(testInput);
	});

	bench('Hybrid approach', () => {
		parseHybrid(testInput);
	});

	bench('CharCode optimized', () => {
		parseCharCodes(testInput);
	});
});
