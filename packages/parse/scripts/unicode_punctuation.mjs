// writes src/unicode_punctuation.ts from the unicode data of the node that runs it
// node packages/parse/scripts/unicode_punctuation.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const punctuation = /[\p{P}\p{S}]/u;
const ranges = [];
let first = -1;

for (let code = 0x80; code <= 0x10000; code += 1) {
	const hit =
		code < 0x10000 &&
		(code < 0xd800 || code > 0xdfff) &&
		punctuation.test(String.fromCharCode(code));
	if (hit && first === -1) first = code;
	if (!hit && first !== -1) {
		ranges.push([first, code - 1]);
		first = -1;
	}
}

const hex = (code) => `0x${code.toString(16).padStart(4, '0')}`;
const lines = [];
for (let i = 0; i < ranges.length; i += 4) {
	const pairs = ranges.slice(i, i + 4).map(([a, b]) => `${hex(a)}, ${hex(b)},`);
	lines.push(`\t${pairs.join(' ')}`);
}

const out = `// written by scripts/unicode_punctuation.mjs from unicode ${process.versions.unicode}, edit that instead

// the bmp code points above ascii in the general categories p and s, as sorted first and last pairs
// prettier-ignore
const RANGES = new Uint16Array([
${lines.join('\n')}
]);

const RANGE_COUNT = RANGES.length >> 1;

/**
 * unicode punctuation as commonmark has it, general category p or s, for a code unit above
 * ascii, a surrogate is never punctuation so astral code points are not covered
 */
export const is_unicode_punctuation = (code: number): boolean => {
	// the first range that ends at or after the code
	let low = 0;
	let high = RANGE_COUNT;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (code > RANGES[(mid << 1) + 1]) low = mid + 1;
		else high = mid;
	}
	return low < RANGE_COUNT && code >= RANGES[low << 1];
};
`;

writeFileSync(
	fileURLToPath(new URL('../src/unicode_punctuation.ts', import.meta.url)),
	out
);
