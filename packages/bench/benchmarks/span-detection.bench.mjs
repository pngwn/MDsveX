import { bench, beforeAll, describe } from 'vitest';

let spanCases = [];

beforeAll(() => {
	spanCases = buildSpanCases();
	for (let i = 0; i < spanCases.length; i += 1) {
		const scenario = spanCases[i];
		const scanEnd = findSpanEndByScan(scenario);
		if (scanEnd !== scenario.targetEnd) {
			throw new Error(`scan mismatch for ${scenario.label}`);
		}
		const regexEnd = findSpanEndByRegex(scenario);
		if (regexEnd !== scenario.targetEnd) {
			throw new Error(`regex mismatch for ${scenario.label}`);
		}
	}
});

describe('span detection strategies', () => {
	bench('charCode scanning', () => {
		let sink = 0x9e3779b1;
		const cases = spanCases;
		for (let i = 0; i < cases.length; i += 1) {
			const scenario = cases[i];
			const pointer = findSpanEndByScan(scenario);
			sink ^= (pointer + scenario.mask) >>> 0;
			sink = (sink << 7) | (sink >>> 25);
		}
		return sink;
	});

	bench('regex sticky search', () => {
		let sink = 0x85ebca77;
		const cases = spanCases;
		for (let i = 0; i < cases.length; i += 1) {
			const scenario = cases[i];
			const pointer = findSpanEndByRegex(scenario);
			sink ^= (pointer + scenario.mask) >>> 0;
			sink = (sink << 7) | (sink >>> 25);
		}
		return sink;
	});
});

function findSpanEndByScan(scenario) {
	const input = scenario.input;
	const endCodes = scenario.endCodes;
	const endLength = endCodes.length;
	const firstCode = endCodes[0];
	let index = scenario.fromIndex;
	const limit = input.length - endLength + 1;

	while (index < limit) {
		if (input.charCodeAt(index) === firstCode) {
			let match = true;
			for (let offset = 1; offset < endLength; offset += 1) {
				if (input.charCodeAt(index + offset) !== endCodes[offset]) {
					match = false;
					break;
				}
			}
			if (match) {
				return index + endLength;
			}
		}
		index += 1;
	}

	return -1;
}

function findSpanEndByRegex(scenario) {
	const regex = scenario.regex;
	regex.lastIndex = scenario.fromIndex;
	const match = regex.exec(scenario.input);
	if (match === null) {
		regex.lastIndex = 0;
		return -1;
	}
	return regex.lastIndex;
}

function buildSpanCases() {
	const cases = [];
	for (let seed = 0; seed < 36; seed += 1) {
		cases.push(buildFenceCase(seed));
		cases.push(buildScriptCase(seed));
	}
	return cases;
}

const fenceLanguages = Object.freeze([
	'svelte',
	'js',
	'ts',
	'md',
	'svx',
	'html',
]);
const scriptAttributes = Object.freeze([
	' type="module"',
	' defer',
	' async',
	' nomodule',
	'',
]);
const fillerWords = Object.freeze([
	'alpine',
	'cinder',
	'delta',
	'ember',
	'flint',
	'gamut',
	'halcyon',
	'ion',
	'jovial',
	'kinetic',
	'lumen',
	'mistral',
	'nebula',
	'onyx',
	'plasma',
	'quartz',
	'rift',
	'solace',
	'tempest',
	'umbra',
	'vortex',
	'whisper',
	'xenon',
	'yonder',
	'zephyr',
]);

function buildFenceCase(seed) {
	const language = fenceLanguages[seed % fenceLanguages.length];
	const header = `section-${seed} fences\n\n`;
	const open = '```' + language + '\n';
	const body = buildFenceBody(seed, language);
	const close = '```';
	const trailing = `\n<!-- fence tail ${seed * 17} -->\n`;
	const input = header + open + body + '\n' + close + trailing;
	const fromIndex = header.length + open.length;
	const closingIndex = input.indexOf(close, fromIndex);
	const targetEnd = closingIndex + close.length;
	return createScenario({
		label: `fence-${seed}`,
		input,
		fromIndex,
		endNeedle: close,
		targetEnd,
		seed,
	});
}

function buildFenceBody(seed, language) {
	const lineCount = 80 + ((seed * 7) % 60);
	const lines = new Array(lineCount);
	let state = ((seed + 1) * 0x9e3779b1) >>> 0;
	for (let i = 0; i < lineCount; i += 1) {
		state = xorshift32(state);
		const word = fillerWords[(state + i) % fillerWords.length];
		const value = (state >>> 3) % 100000;
		lines[i] = `${language} line ${i}: const ${word}${seed}_${i} = ${value};`;
	}
	return lines.join('\n');
}

function buildScriptCase(seed) {
	const attr = scriptAttributes[seed % scriptAttributes.length];
	const prefix = `<div data-block="${seed}">\n  <p>${
		fillerWords[seed % fillerWords.length]
	} span ${seed}</p>\n`;
	const open = `<script${attr}>\n`;
	const body = buildScriptBody(seed);
	const close = '</script>';
	const suffix = `\n</div>`;
	const input = prefix + open + body + '\n' + close + suffix;
	const fromIndex = prefix.length + open.length;
	const closingIndex = input.indexOf(close, fromIndex);
	const targetEnd = closingIndex + close.length;
	return createScenario({
		label: `script-${seed}`,
		input,
		fromIndex,
		endNeedle: close,
		targetEnd,
		seed: seed + 97,
	});
}

function buildScriptBody(seed) {
	const lineCount = 96 + ((seed * 5) % 80);
	const lines = new Array(lineCount);
	let state = ((seed + 11) * 0x85ebca77) >>> 0;
	for (let i = 0; i < lineCount; i += 1) {
		state = xorshift32(state);
		const word = fillerWords[(state + seed + i) % fillerWords.length];
		const indent = (i & 1) === 0 ? '  ' : '    ';
		const value = (state >>> 2) % 2048;
		lines[i] = `${indent}buffer${seed}_${i} = (${word}.length ^ ${value});`;
	}
	return lines.join('\n');
}

function createScenario({
	label,
	input,
	fromIndex,
	endNeedle,
	targetEnd,
	seed,
}) {
	if (targetEnd <= fromIndex) {
		throw new Error(`invalid target span for ${label}`);
	}
	const endCodes = toCharCodes(endNeedle);
	const regex = new RegExp(escapeRegExp(endNeedle), 'g');
	const mask = ((targetEnd ^ (seed * 0x9e3779b1)) >>> 0) | 1;
	return Object.freeze({
		label,
		input,
		fromIndex,
		endCodes,
		regex,
		targetEnd,
		mask,
	});
}

function toCharCodes(value) {
	const length = value.length;
	const codes = new Uint16Array(length);
	for (let i = 0; i < length; i += 1) {
		codes[i] = value.charCodeAt(i);
	}
	return codes;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function xorshift32(seed) {
	let value = seed >>> 0;
	value ^= value << 13;
	value ^= value >>> 17;
	value ^= value << 5;
	return value >>> 0;
}
