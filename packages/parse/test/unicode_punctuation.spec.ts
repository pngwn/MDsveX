import { describe, expect, test } from 'vitest';

import { is_unicode_punctuation } from '../src/unicode_punctuation';

describe('unicode punctuation table', () => {
	// an older node sees new code points as unassigned and skips them, a newer one fails here
	// until scripts/unicode_punctuation.mjs is run with it
	test('matches general categories p and s across the bmp', () => {
		const punctuation = /[\p{P}\p{S}]/u;
		const unassigned = /\p{Cn}/u;
		const wrong: string[] = [];

		for (let code = 0x80; code <= 0xffff; code += 1) {
			if (code >= 0xd800 && code <= 0xdfff) continue;
			const char = String.fromCharCode(code);
			if (unassigned.test(char)) continue;
			if (punctuation.test(char) !== is_unicode_punctuation(code)) {
				wrong.push(code.toString(16));
			}
		}

		expect(wrong).toEqual([]);
	});

	test('surrogates are not punctuation', () => {
		expect(is_unicode_punctuation(0xd83d)).toBe(false);
		expect(is_unicode_punctuation(0xde00)).toBe(false);
	});

	test.each([
		['left double quote', '“', true],
		['em dash', '—', true],
		['ellipsis', '…', true],
		['guillemet', '«', true],
		['ideographic full stop', '。', true],
		['corner bracket', '「', true],
		['fullwidth exclamation mark', '！', true],
		['euro sign', '€', true],
		['e acute', 'é', false],
		['cyrillic', 'я', false],
		['han', '重', false],
		['hiragana', 'は', false],
		['prolonged sound mark', 'ー', false],
		['fullwidth digit', '１', false],
	])('%s', (_, char, expected) => {
		expect(is_unicode_punctuation(char.charCodeAt(0))).toBe(expected);
	});
});
