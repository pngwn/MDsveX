import type {
	SmartPunctuation,
	SmartPunctuationOptions,
} from '@mdsvex/render/html-cursor';

export type { SmartPunctuation, SmartPunctuationOptions };

export interface SmartOptions {
	/**
	 * curls quotes and makes dashes and ellipses in prose, two hyphens are an
	 * en dash, three an em dash and three dots an ellipsis, an object turns a
	 * kind off or gives the four quote strings of another language, the double
	 * pair then the single pair, code, urls, attributes, expressions, alt and
	 * title text stay as written, as does a flag such as --name, off by default
	 *
	 * @example
	 * smart_punctuation: { quotes: ['«\u00a0', '\u00a0»', '“', '”'], dashes: false }
	 */
	smart_punctuation?: SmartPunctuation;
}

const SHAPE =
	'[mdsvex] smart_punctuation must be true, false or an object with quotes, dashes and ellipses';

function flag(value: unknown): boolean {
	return value === undefined || typeof value === 'boolean';
}

/** the option a renderer takes, undefined when it is off */
export function smart_of(option: unknown): SmartPunctuation | undefined {
	if (option === undefined || option === false) return undefined;
	if (option === true) return true;
	if (typeof option !== 'object' || option === null || Array.isArray(option))
		throw new Error(SHAPE);
	const { quotes, dashes, ellipses } = option as SmartPunctuationOptions;
	if (!flag(dashes) || !flag(ellipses)) throw new Error(SHAPE);
	if (!flag(quotes)) {
		if (
			!Array.isArray(quotes) ||
			quotes.length !== 4 ||
			quotes.some((q) => typeof q !== 'string')
		)
			throw new Error(
				'[mdsvex] smart_punctuation.quotes must be true, false or four strings'
			);
	}
	// every kind off is the option off
	if (quotes === false && dashes === false && ellipses === false)
		return undefined;
	return option as SmartPunctuationOptions;
}
