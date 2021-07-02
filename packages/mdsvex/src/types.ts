import type { VFileMessage } from 'vfile-message';
import type { Node } from 'unist';
import type { Element } from 'hast';
import type { Text } from 'mdast';
import type { Plugin, Settings } from 'unified';

export type LayoutMode = 'named' | 'single';

export type parser_frontmatter_options = {
	parse: (
		fm: string,
		messages: VFileMessage[]
	) => undefined | Record<string, unknown>;
	type: string;
};

export interface FrontMatterNode extends Node {
	type: string;
	value: string;
}

/**
 * The mdsvex fragments after parsing the svelte bit
 */
export interface Parts {
	special: Node[];
	html: Array<Element | Text | (Node & { type: 'raw' })>;
	instance: Node[];
	module: Node[];
	css: Node[];
}

/**
 * Prismjs representation of a language
 */
export interface PrismLanguage {
	require?: string[];
	peerDependencies?: string[];
	alias?: string[];
}

/**
 * mdsvex representation of a language
 */
export interface MdsvexLanguage {
	aliases: Set<unknown>;
	name: string;
	path: string;
	deps: Set<string>;
}

/**
 * Prismjs meta information about language definitions
 */
export interface PrismMeta {
	path: string;
	noCSS: boolean;
	examplesPath: string;
	addCheckAll: boolean;
}

/**
 * Extended `NodeJS.Process` to inlcude `browser` field
 */
export interface RollupProcess extends NodeJS.Process {
	browser: boolean;
}

// Public(ish) configuration options for mdsvex
interface FrontmatterOptions {
	/**
	 * **parse** - defines a custom parse function for frontmatter. The function receives the frontmatter string and an errors array as arguments and must return either `undefined` or an object of options containing the frontmatter data. Errors or warnings can be pushed to the messages array and will be printed to the user, they should take the shape of a {@link https://github.com/vfile/vfile-message vfile message}. The default frontmatter parser only handles `yaml`.
	 *
	 * *example:*
	 * ```js
	 * parse(frontmatter, messages) {
	 *   try {
	 *     return parse(frontmatter);
	 *   } catch(e) {
	 *     messages.push(new Message(e.message));
	 *   }
	 * }
	 * ```
	 */
	parse: (
		fm: string,
		messages: VFileMessage[]
	) => undefined | Record<string, unknown>;
	/**
	 * **type** - a string describing the language of your frontmatter. Default: `yaml`.
	 *
	 * *example:*
	 * ```js
	 * type: "toml"
	 * ```
	 */
	type: string;
	/**
	 * **marker** - a character describing the fence that should be used for frontmatter. Passing `"+"` allows the use of `+++`. Default: `"-"`.
	 *
	 * *example:*
	 * ```js
	 * marker: "+"
	 * ```
	 */
	marker: string;
}

interface SmartypantsOptions {
	/**
	 * **quotes** - Converts straight double and single quotes to fancy curly double or single quotes. Default: `true`.
	 *
	 *  *example:*
	 * ```js
	 * quotes: false // to disable
	 * ```
	 */
	quotes?: boolean;
	/**
	 * **ellipses** - Converts three dots (`...`) to a real ellipsis character. Default: `true`.
	 *
	 *  *example:*
	 * ```js
	 * ellipses: true // to disable
	 * ```
	 */
	ellipses?: boolean;
	/**
	 * **backticks** - When `true`, converts double back-ticks into an opening curly double quote, and double straight single quotes into a closing curly double quote. When `"all"` it also converts single back-ticks into a single opening quote, and a single straight quote into a closing single, curly quote. Default: `true`.
	 *
	 * Note: Quotes can not be `true` when backticks is `'all'`;
	 *
	 *  *example:*
	 * ```js
	 * backticks: "all" // to disable
	 * ```
	 */
	backticks?: boolean | 'all';
	/**
	 * **dashes** - When `true`, converts two dashes into an em-dash character. When `'oldschool'`, converts two dashes into an en-dash, and three dashes into an em-dash. When `'inverted'`, converts two dashes into an em-dash, and three dashes into an en-dash. Default: `true`.
	 *
	 * *example:*
	 * ```js
	 * dashes: "oldschool"
	 * ```
	 */
	dashes?: boolean | 'oldschool' | 'inverted';
}

export type LayoutMeta = { components: string[]; path: string };
export type Layout = Record<string, LayoutMeta>;

export type Highlighter = (
	code: string,
	lang: string | undefined,
	metastring: string | undefined
) => string | Promise<string>;
interface HighlightOptions {
	/**
	 * **highlighter** - A custom highlight function for syntax highlighting. Two arguments are passed, both strings: the code to highlight and the language (if one is provided). It must return a string that will be injected into the document.
	 *
	 *  *example:*
	 * ```js
	 * highlighter(code, lang = "") {
	 *  return `<pre class="${lang}"><code>${code}</code></pre>`;
	 * }
	 * ```
	 */
	highlighter?: Highlighter;
	/**
	 * **alias** - An object of aliases for standard language names. This allow you to map arbitrary names to standard names.
	 *
	 *  *example:*
	 * ```js
	 * alias: {
	 *   yavascript: 'javascript'
	 * }
	 * ```
	 */
	alias?: Record<string, string>;
}

export type UnifiedPlugins = Array<[Plugin, Settings] | Plugin>;

export interface TransformOptions {
	remarkPlugins?: UnifiedPlugins;
	rehypePlugins?: UnifiedPlugins;
	frontmatter?: FrontmatterOptions;
	smartypants?: boolean | SmartypantsOptions;
	layout?: Layout;
	highlight?: HighlightOptions | false;
	layout_mode: LayoutMode;
}

/**
 * The mdsvex options object
 */
export interface MdsvexOptions {
	/**
	 * **remarkPlugins** - an array with each element being either a {@link https://github.com/remarkjs/remark/blob/HEAD/doc/plugins.md#list-of-plugins remark plugin} or a tuple of `plugin` and `pluginOptions`. Default: `[ ]`. {@link https://mdsvex.com/docs#remarkplugins--rehypeplugins More details.}
	 *
	 * *examples:*
	 * ```js
	 * remarkPlugins: [ plugin1, plugin2 ]
	 * ```
	 * ```js
	 * remarkPlugins: [ [ plugin, options], [ plugin2, options2 ] ]
	 * ```
	 * ```js
	 * remarkPlugins: [ plugin, [ plugin2, options2 ] ]
	 * ```
	 */
	remarkPlugins?: Array<[Plugin, Settings] | Plugin>;
	/**
	 * **rehypePlugins** - an array with each element being either a {@link https://github.com/rehypejs/rehype/blob/HEAD/doc/plugins.md#list-of-plugins rehype plugin} or a tuple of `plugin` and `pluginOptions`. Default: `[ ]`. {@link https://mdsvex.com/docs#remarkplugins--rehypeplugins More details.}
	 *
	 * *examples:*
	 * ```js
	 * rehypePlugins: [ plugin1, plugin2 ]
	 * ```
	 * ```js
	 * rehypePlugins: [ [ plugin, options], [ plugin2, options2 ] ]
	 * ```
	 * ```js
	 * rehypePlugins: [ plugin, [ plugin2, options2 ] ]
	 * ```
	 */
	rehypePlugins?: Array<[Plugin, Settings] | Plugin>;
	/**
	 * **frontmatter** - an object of frontmatter options. {@link https://mdsvex.com/docs#frontmatter More details.}
	 *  - `parse` - a custom frontmatter parser.
	 *  - `type` - the name of your frontmatter language.
	 *  - `marker` - a character describing the fence to be used for frontmatter.
	 */
	frontmatter?: FrontmatterOptions;
	/**
	 * **smartypants** - smartypants transforms ASCII punctuation into fancy typography, this property configures it with an object of options. all are optional. It can be disabled by passing `false`. {@link https://mdsvex.com/docs#smartypants More details.}
	 *
	 * - `quotes` - converts stright quotes to curly quotes.
	 * - `ellipses` - converts three dots into an ellipsis.
	 * - `backticks` - converts backtick and stright quote combinations into curly quotes.
	 * - `dashes` - converts hyphens into en and em dashes.
	 */
	smartypants?: SmartypantsOptions | boolean;
	/**
	 * **highlight** - Configures the syntax highlighting in mdsvex documents. Can be either `false` (to disable highlighting) or take an options object with following properties. {@link https://mdsvex.com/docs#highlight More details.}
	 *
	 * - `highlighter` - A custom highlight function.
	 * - `alias` - map language arbitrary names to standard language names
	 */
	highlight?: HighlightOptions | false;
	/**
	 * **extension** - the extension to use for mdsvex files. Default: `".svx"`. {@link https://mdsvex.com/docs#extension More details.}
	 *
	 * **DEPRECATED:** use {@link MdsvexOptions.extensions } instead.
	 */
	extension?: string;
	/**
	 * **extensions** - the extensions to use for mdsvex files. {@link https://mdsvex.com/docs#extensions More details.}
	 *
	 *  *example:*
	 * ```js
	 * extensions: [".svexy"],
	 * ```
	 */
	extensions?: string[];
	/**
	 * **layout** - A string defining a single layout to use for everything or an object of named layouts. When using names layouts, a key of `_` will define the fallback layout. Default: `undefined` (no layouts). {@link https://mdsvex.com/docs#layouts More details.}
	 *
	 *  *examples:*
	 * ```js
	 * layout: "/path/to/layout.svelte"
	 * ```
	 * ```js
	 * layout: {
	 *   blog: "/path/to/layout/blog.svelte",
	 *   _: "/path/to/layout/default.svelte"
	 * }
	 * ```
	 */
	layout?: string | Record<string, string>;
}

/**
 * The svelte preprocessor for use with svelte.preprocess
 *
 * **options** - An options object with the following properties, all are optional.
 *
 * - `extension` - The extension to use for mdsvex files
 * - `layout` - Layouts to apply to mdsvex documents
 * - `frontmatter` - frontmatter options for documents
 * - `highlight` - syntax highlighting options
 * - `smartypants` - smart typography options
 * - `remarkPlugins` - remark plugins to apply to the markdown
 * - `rehypePlugins` - rehype plugins to apply to the rendered html
 *
 */
export interface MdsvexCompileOptions extends MdsvexOptions {
	filename?: string;
}

export type PreprocessorReturn = Promise<
	| {
			code: string;
			data?: Record<string, unknown>;
			map?: string;
	  }
	| undefined
>;

export interface Preprocessor {
	markup: (args: { content: string; filename: string }) => PreprocessorReturn;
}
