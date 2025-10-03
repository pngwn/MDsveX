import { bench, describe } from 'vitest';

class JitFriendlyTokenizer {
	constructor() {
		this.tokens = [];
		this.reset();
	}

	reset() {
		this.tokens.length = 0;
		this.position = 0;
	}

	addToken(type, start, end, value) {
		this.tokens.push({ type, start, end, value });
	}

	scanIdentifier(input, pos) {
		const start = pos;
		while (pos < input.length && this.isAlphaNum(input.charCodeAt(pos))) {
			pos++;
		}
		return { type: 1, start, end: pos, value: input.slice(start, pos) };
	}

	scanNumber(input, pos) {
		const start = pos;
		while (pos < input.length && this.isDigit(input.charCodeAt(pos))) {
			pos++;
		}
		return { type: 2, start, end: pos, value: input.slice(start, pos) };
	}

	isAlphaNum(code) {
		return (
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			(code >= 48 && code <= 57)
		);
	}

	isDigit(code) {
		return code >= 48 && code <= 57;
	}
}

class JitHostileTokenizer {
	constructor() {
		this.tokens = [];
		this.toggle = 0;
	}

	reset() {
		this.tokens = [];
		this.toggle = 0;
	}

	addToken(tokenData) {
		if (this.toggle++ % 2 === 0) {
			tokenData.metadata = { processed: true };
		}
		this.tokens.push(tokenData);
	}

	scan(input, pos, type) {
		const handlers = {
			identifier: (inp, p) => this.handleGeneric(inp, p, /[a-zA-Z0-9]/),
			number: (inp, p) => this.handleGeneric(inp, p, /[0-9]/),
		};
		return handlers[type](input, pos);
	}

	handleGeneric(input, pos, regex) {
		const start = pos;
		while (pos < input.length && regex.test(input[pos])) {
			pos++;
		}
		const result = { start, end: pos };
		if (pos - start > 5) {
			result.isLong = true;
			result.extra = 'data';
		}
		return result;
	}
}

function processMonomorphic(items) {
	let sum = 0;
	for (const item of items) {
		sum += processNumber(item.value);
	}
	return sum;
}

function processNumber(value) {
	return value * 2 + 1;
}

function processPolymorphic(items) {
	let sum = 0;
	for (const item of items) {
		const processors = [(v) => v * 2 + 1, (v) => v * 3 + 2, (v) => v * 4 + 3];
		const processor = processors[item.type % processors.length];
		sum += processor(item.value);
	}
	return sum;
}

const testInput = 'hello123 world456 test789 '.repeat(100);
const friendlyTokenizer = new JitFriendlyTokenizer();
const hostileTokenizer = new JitHostileTokenizer();

function runFriendlyTokenizer() {
	friendlyTokenizer.reset();
	let pos = 0;
	while (pos < testInput.length) {
		const code = testInput.charCodeAt(pos);
		if (friendlyTokenizer.isDigit(code)) {
			const token = friendlyTokenizer.scanNumber(testInput, pos);
			friendlyTokenizer.addToken(
				token.type,
				token.start,
				token.end,
				token.value
			);
			pos = token.end;
		} else if (friendlyTokenizer.isAlphaNum(code)) {
			const token = friendlyTokenizer.scanIdentifier(testInput, pos);
			friendlyTokenizer.addToken(
				token.type,
				token.start,
				token.end,
				token.value
			);
			pos = token.end;
		} else {
			pos++;
		}
	}
}

function runHostileTokenizer() {
	hostileTokenizer.reset();
	let pos = 0;
	while (pos < testInput.length) {
		const char = testInput[pos];
		if (/[a-zA-Z]/.test(char)) {
			const token = hostileTokenizer.scan(testInput, pos, 'identifier');
			hostileTokenizer.addToken(token);
			pos = token.end;
		} else if (/[0-9]/.test(char)) {
			const token = hostileTokenizer.scan(testInput, pos, 'number');
			hostileTokenizer.addToken(token);
			pos = token.end;
		} else {
			pos++;
		}
	}
}

const monomorphicData = Array.from({ length: 1000 }, (_, i) => ({
	value: i,
	type: 0,
}));
const polymorphicData = Array.from({ length: 1000 }, (_, i) => ({
	value: i,
	type: i % 3,
}));

describe('JIT-friendly vs JIT-hostile patterns', () => {
	bench('Tokenizer with monomorphic calls', () => {
		runFriendlyTokenizer();
	});

	bench('Tokenizer with polymorphic calls', () => {
		runHostileTokenizer();
	});

	bench('Monomorphic numeric processing', () => {
		processMonomorphic(monomorphicData);
	});

	bench('Polymorphic numeric processing', () => {
		processPolymorphic(polymorphicData);
	});
});
