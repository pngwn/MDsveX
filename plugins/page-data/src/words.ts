// the rule of the reading-time package, which remark-reading-time counts with

/** hiragana, the unified ideographs, hangul syllables and the ideograph extensions */
function is_cjk(code: number): boolean {
	return (
		(code >= 0x3040 && code <= 0x309f) ||
		(code >= 0x4e00 && code <= 0x9fff) ||
		(code >= 0xac00 && code <= 0xd7a3) ||
		(code >= 0x20000 && code <= 0x2ebe0)
	);
}

/** ascii punctuation, cjk punctuation and the full width forms */
function is_punctuation(code: number): boolean {
	return (
		(code >= 0x21 && code <= 0x2f) ||
		(code >= 0x3a && code <= 0x40) ||
		(code >= 0x5b && code <= 0x60) ||
		(code >= 0x7b && code <= 0x7e) ||
		(code >= 0x3000 && code <= 0x303f) ||
		(code >= 0xff00 && code <= 0xffef)
	);
}

const SPACE = /\s/;

/**
 * the words of a text, a run of characters between spaces is one word, and
 * so is each cjk character, which is written without spaces, the punctuation
 * after a cjk character is no word
 *
 * @example
 * count_words('Hello world'); // 2
 * count_words('こんにちは、世界'); // 7
 */
export function count_words(text: string): number {
	let words = 0;
	let in_word = false;
	let after_cjk = false;
	for (const char of text) {
		const code = char.codePointAt(0)!;
		if (is_cjk(code)) {
			words++;
			in_word = false;
			after_cjk = true;
		} else if (SPACE.test(char)) {
			in_word = false;
		} else if (after_cjk && is_punctuation(code)) {
			continue;
		} else {
			after_cjk = false;
			if (!in_word) {
				words++;
				in_word = true;
			}
		}
	}
	return words;
}
