import type { HtmlHighlighter } from './highlight';
import type { HighlightConfig } from './highlight_run';
import type { PluginHighlightOptions } from './main';

/** a twoslash highlighter built on its first fence, each builds a typescript environment */
function lazy_highlighter(make: () => HtmlHighlighter): HtmlHighlighter {
	let made: HtmlHighlighter | null = null;
	return (code, render) => (made ??= make())(code, render);
}

async function import_twoslash<T>(
	load: () => Promise<T>,
	name: string
): Promise<T> {
	try {
		return await load();
	} catch (e) {
		const error = new Error(
			`[mdsvex] highlight.twoslash needs ${name}, add it to your dependencies`
		);
		(error as { cause?: unknown }).cause = e;
		throw error;
	}
}

/** twinkleplop with every language, the async setup compile can not do */
export async function plugin_highlight(
	options: PluginHighlightOptions
): Promise<HighlightConfig> {
	const { create_highlight, load_default_languages } =
		await import('./highlight');
	const languages = {
		...(await load_default_languages()),
		...options.languages,
	};
	let twoslash: Record<string, HtmlHighlighter> | false = false;
	if (options.twoslash) {
		const ts = await import_twoslash(
			() => import('@twinkleplop/twoslash'),
			'@twinkleplop/twoslash'
		);
		twoslash = {
			typescript: lazy_highlighter(() => ts.create_highlighter({ lang: 'ts' })),
			javascript: lazy_highlighter(() => ts.create_highlighter({ lang: 'js' })),
			tsx: lazy_highlighter(() => ts.create_highlighter({ lang: 'tsx' })),
		};
		if (typeof options.twoslash === 'object' && options.twoslash.svelte) {
			const svelte = await import_twoslash(
				() => import('@twinkleplop/twoslash-svelte'),
				'@twinkleplop/twoslash-svelte'
			);
			twoslash.svelte = lazy_highlighter(() => svelte.create_highlighter());
		}
	}
	return create_highlight({ ...options, languages, twoslash });
}

/** true when a document may hold a fence or a code span with a #! hint */
export function has_code(code: string): boolean {
	return code.includes('```') || code.includes('~~~') || code.includes('`#!');
}
