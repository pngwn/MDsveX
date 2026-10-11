// math renderers for the math compile option, neither library is imported
// until load_math asks for it, so this entry is as small as compile

import type { Options as TemmlOptions } from 'temml';
import type { MathInfo, MathRenderer } from './highlight_run';

export type { MathInfo, MathRenderer, TemmlOptions };

/**
 * katex options, loose as katex is an optional peer whose types may not be
 * installed, see https://katex.org/docs/options
 */
export type KatexOptions = Record<string, unknown>;

/**
 * which library renders math and the options it takes, mdsvex sets
 * displayMode itself and makes both throw on latex they can not render
 *
 * @example
 * { renderer: 'katex', options: { macros: { '\\RR': '\\mathbb{R}' } } }
 */
export type MathOptions =
	| {
			/** mathml with no runtime, the default */
			renderer?: 'temml';
			/** see https://temml.org/docs/en/administration#options */
			options?: TemmlOptions;
	  }
	| {
			/** html and mathml, katex is yours to install */
			renderer: 'katex';
			options?: KatexOptions;
	  };

/** the part of temml or katex a renderer calls, the default export of either */
export interface MathLibrary<O> {
	renderToString(latex: string, options?: O): string;
}

function adapt<O extends { macros?: unknown }>(
	library: MathLibrary<O>,
	written: O | undefined
): MathRenderer {
	if (typeof library?.renderToString !== 'function')
		throw new TypeError(
			'[mdsvex] a math library must have renderToString, pass the default export of temml or katex'
		);
	// temml draws a failure in red unless told to throw, a build should fail
	const base = { throwOnError: true, ...written };
	const macros = base.macros;
	const shared = typeof macros === 'object' && macros !== null;
	return (latex: string, info: MathInfo) =>
		library.renderToString(latex, {
			...base,
			// both libraries keep a \gdef in the macros they are given, a copy
			// ends it with its fence, so the order documents compile in never shows
			...(shared ? { macros: { ...macros } } : null),
			displayMode: info.display,
		} as unknown as O);
}

/**
 * a math renderer from temml, for a compile that can not await load_math
 *
 * @example
 * import temml from 'temml';
 * compile(source, { math: temml_math(temml, { annotate: true }) });
 */
export function temml_math(
	temml: MathLibrary<TemmlOptions>,
	options?: TemmlOptions
): MathRenderer {
	return adapt(temml, options);
}

/**
 * a math renderer from katex, for a compile that can not await load_math
 *
 * @example
 * import katex from 'katex';
 * compile(source, { math: katex_math(katex) });
 */
export function katex_math(
	katex: MathLibrary<KatexOptions>,
	options?: KatexOptions
): MathRenderer {
	return adapt(katex, options);
}

const ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
};

/**
 * renders math as its latex in a <code>, it never fails, for an editor or
 * a playground that has no math library
 */
export const source_math: MathRenderer = (latex) =>
	'<code class="language-math">' +
	latex.replace(/[&<>]/g, (ch) => ESCAPES[ch]) +
	'</code>';

// a variable, so a bundler given this entry never looks for a package that
// may not be installed
const KATEX: string = 'katex';

async function import_library<T>(
	load: () => Promise<{ default: T }>,
	name: string,
	why: string
): Promise<T> {
	try {
		return (await load()).default;
	} catch (e) {
		const error = new Error(
			`[mdsvex] ${why} needs ${name}, add it to your dependencies`
		);
		(error as { cause?: unknown }).cause = e;
		throw error;
	}
}

/**
 * imports the library the options name and gives its renderer, temml comes
 * with mdsvex and katex is an optional peer, the one async step of math
 *
 * @example
 * const math = await load_math({ options: { macros: { '\\RR': '\\mathbb{R}' } } });
 * compile(source, { math });
 */
export async function load_math(
	options: MathOptions = {}
): Promise<MathRenderer> {
	if (typeof options !== 'object' || options === null)
		throw new TypeError('[mdsvex] math options must be an object');
	const renderer = options.renderer ?? 'temml';
	if (renderer === 'katex')
		return katex_math(
			await import_library<MathLibrary<KatexOptions>>(
				() => import(/* @vite-ignore */ KATEX),
				'katex',
				"math.renderer 'katex'"
			),
			options.options as KatexOptions | undefined
		);
	if (renderer !== 'temml')
		throw new TypeError(
			`[mdsvex] math.renderer must be 'temml' or 'katex', it is ${JSON.stringify(renderer)}`
		);
	return temml_math(
		await import_library(() => import('temml'), 'temml', 'math'),
		options.options as TemmlOptions | undefined
	);
}
