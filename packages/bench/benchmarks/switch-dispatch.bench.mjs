import { bench, describe } from 'vitest';

const TOKEN_STRING = 1;
const TOKEN_NUMBER = 2;
const TOKEN_BOOLEAN = 3;
const TOKEN_ARRAY = 4;
const TOKEN_OBJECT = 5;

function parseTokenSwitch(type, value) {
	switch (type) {
		case TOKEN_STRING:
			return value.length;
		case TOKEN_NUMBER:
			return parseFloat(value);
		case TOKEN_BOOLEAN:
			return value === 'true';
		case TOKEN_ARRAY:
			return value.split(',').length;
		case TOKEN_OBJECT:
			return value.charCodeAt(0);
		default:
			return null;
	}
}

const tokenHandlers = {
	[TOKEN_STRING]: (value) => value.length,
	[TOKEN_NUMBER]: (value) => parseFloat(value),
	[TOKEN_BOOLEAN]: (value) => value === 'true',
	[TOKEN_ARRAY]: (value) => value.split(',').length,
	[TOKEN_OBJECT]: (value) => value.charCodeAt(0),
};

function parseTokenDynamic(type, value) {
	const handler = tokenHandlers[type];
	return handler ? handler(value) : null;
}

const simpleTokens = Array.from({ length: 2000 }, (_, i) => [
	(i % 5) + 1,
	i % 2 === 0 ? `${i},${i + 1}` : `${i}`,
]);

const largeHandlers = Array.from(
	{ length: 50 },
	(_, i) => (value) => value * i + i
);

function processLargeSwitch(tokens) {
	let result = 0;
	for (const [type, value] of tokens) {
		switch (type) {
			case 0:
				result += value;
				break;
			case 1:
				result += value * 2 + 1;
				break;
			case 2:
				result += value * 3 + 2;
				break;
			case 3:
				result += value * 4 + 3;
				break;
			case 4:
				result += value * 5 + 4;
				break;
			default:
				result += value * type + type;
				break;
		}
	}
	return result;
}

function processLargeDispatch(tokens) {
	let result = 0;
	for (const [type, value] of tokens) {
		result += largeHandlers[type](value);
	}
	return result;
}

const largeTokens = Array.from({ length: 5000 }, (_, i) => [
	i % largeHandlers.length,
	i,
]);

describe('Switch statements vs dynamic dispatch', () => {
	bench('Switch dispatch (small token set)', () => {
		for (const [type, value] of simpleTokens) {
			parseTokenSwitch(type, value);
		}
	});

	bench('Dynamic dispatch (small token set)', () => {
		for (const [type, value] of simpleTokens) {
			parseTokenDynamic(type, value);
		}
	});

	bench('Large switch with inlined math', () => {
		processLargeSwitch(largeTokens);
	});

	bench('Function table dispatch', () => {
		processLargeDispatch(largeTokens);
	});
});
