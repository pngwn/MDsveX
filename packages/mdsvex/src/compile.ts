// browsers bundle this entry whole, so it never imports vite, the lexer or node builtins

import {
	PFMParser,
	PluginCache,
	PluginDispatcher,
	SourceTextSource,
	has_directive_handlers,
	normalize_newlines,
	raw_offsets,
	take_collapsed,
	take_src,
} from '@mdsvex/parse';
import type {
	DirectiveEntry,
	ParseOptions,
	ParsePlugin,
	SyntaxOptions,
} from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import { take_footnote, take_info, take_math } from '@mdsvex/parse/utils';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import {
	ComponentScope,
	CursorHTMLRenderer,
	K_FRONTMATTER,
	take_plain_math,
} from '@mdsvex/render/html-cursor';
import type { ComponentSource } from '@mdsvex/render/html-cursor';
import { mappings_to_v3 } from '@mdsvex/render/sourcemap';
import type { Mapping, MappingData } from '@mdsvex/render/mappings';
import type { MapTrace, SourceMapV3 } from '@mdsvex/render/sourcemap';
import {
	FrontmatterError,
	key_line,
	metadata_export,
	parse_frontmatter,
} from './frontmatter.js';
import type { FrontmatterOptions } from './frontmatter.js';
import { PLUGIN_DATA_EXPORT, plugin_data_export } from './plugin_data.js';
import type { PluginData, PluginDataContext } from './plugin_data.js';
import { scope_of } from './root_scope.js';
import { highlight_run, plain_run } from './highlight_run.js';
export { highlight_error_at, MathError } from './highlight_run.js';
import type {
	HighlightOption,
	HighlightRun,
	HighlightWarning,
	MathOption,
	MathRenderer,
} from './highlight_run.js';
import { make_heading_ids, slug_of } from './heading_ids.js';
import { footnotes_of } from './footnotes.js';
import type { FootnoteOptions, Footnotes } from './footnotes.js';
import type { HeadingIds } from '@mdsvex/parse';
import type { HeadingOptions, HeadingSlug } from './heading_ids.js';
import { smart_of } from './smart_punctuation.js';
import type { SmartOptions, SmartPunctuation } from './smart_punctuation.js';
import { image_imports } from './image_imports.js';
import type { ImageImports, ImageNeed } from './image_imports.js';
import { link_urls, links_of, with_images } from './link_urls.js';
import type { LinkOptions, Links, Rewrite } from './link_urls.js';
import {
	fence_sources,
	pre_error,
	source_fences,
	sources_met,
} from './fence_sources.js';
import type { Fenced, SourceFences, SourceNeed } from './fence_sources.js';
import type { Snippet, SnippetsOption } from './run_blocks.js';

export type {
	DataChange,
	DirectiveContext,
	DirectiveEntry,
	DirectiveHandler,
	Json,
	NodeView,
	ParsePlugin,
	PluginContext,
	SyntaxOptions,
	TaskContext,
	WrapperView,
} from '@mdsvex/parse';
/**
 * a run of text as the text handler of a sequential plugin gets it
 *
 * @example
 * text(run) { run.replace(0, 6, 'text', 'party') }
 */
export type TextRun = Parameters<NonNullable<ParsePlugin['text']>>[0];
export type { Mapping, MappingData, SourceMapV3, MapTrace };
export type { ComponentSource };
export type { FrontmatterOptions };
export { FrontmatterError } from './frontmatter.js';
export { PluginDataError } from './plugin_data.js';
export { PluginAsyncError, PluginTaskError } from '@mdsvex/parse';
export { fence_meta } from './code_meta.js';
export type { FenceMeta, MetaInfo } from './code_meta.js';
export type { PluginData, PluginDataContext };
export { DirectiveError } from '@mdsvex/render/html-cursor';
export type {
	CodeInfo,
	Highlighter,
	HighlightConfig,
	HighlightOption,
	HighlightWarning,
	MathInfo,
	MathOption,
	MathRenderer,
} from './highlight_run.js';
export {
	HeadingIdError,
	heading_slug,
	make_heading_ids,
} from './heading_ids.js';
export type { ImageNeed } from './image_imports.js';
export { SourceError } from './fence_sources.js';
export { FootnoteError } from './footnotes.js';
export type {
	FootnoteErrorCode,
	FootnoteOptions,
	FootnoteProblemAt,
} from './footnotes.js';
export type { SourceErrorCode, SourceNeed } from './fence_sources.js';
export { RunError } from './run_blocks.js';
export type { RunErrorCode, Snippet, SnippetsOption } from './run_blocks.js';
export type {
	BaseImport,
	LinkOptions,
	Rewrite,
	RewriteContext,
} from './link_urls.js';
export type {
	HeadingIdErrorCode,
	HeadingIdsOptions,
	HeadingInfo,
	HeadingOptions,
	HeadingSlug,
} from './heading_ids.js';
export type {
	SmartOptions,
	SmartPunctuation,
	SmartPunctuationOptions,
} from './smart_punctuation.js';

/**
 * which elements a replacement takes, markdown takes those from markdown
 * syntax and parse plugins, never html the author typed
 *
 * all also takes lowercase elements the author typed, so a warning export
 * replaces <warning>, never svelte tags or capitalised components, an element
 * with a bind, on, use, class, style, transition, in, out, animate or let
 * directive stays an element as a component can not take one, and the
 * compile warns about it, svelte:element is the escape hatch
 *
 * @example
 * <svelte:element this="img" src="/a.png" />
 */
export type ComponentMode = 'markdown' | 'all';

/**
 * element_directive, an element component_mode all kept because a component
 * can not take its directive, the rest come from highlighting, or from a
 * plugin, which picks its own code
 */
export interface CompileWarning {
	code: 'element_directive' | HighlightWarning | (string & {});
	message: string;
	/**
	 * the element, code or node, line from 1 and column from 0, which hold in
	 * the raw source, the start of the document for a plugin warning that
	 * names no node
	 */
	start: { line: number; column: number };
	/** the name of the plugin that reported it with ctx.warn, when it has one */
	plugin?: string;
}

/** tables of bound handlers, each with the name of its plugin */
type BoundTables = NonNullable<ParseOptions['directive_handlers']>;

/** one directive a plugin owns, its handlers run only inside that directive */
export interface BundleDirective extends DirectiveEntry {
	/** reserved for rendering the component at build time, nothing reads it yet */
	static?: boolean;
}

/**
 * a plugin, the directives it owns with the components that render them and
 * the handlers that reshape what is written inside them
 *
 * @example
 * {
 *   name: 'steps',
 *   module: '@acme/steps/directives',
 *   directives: {
 *     steps: { children: { heading(node, ctx) {} } },
 *     step: {},
 *   },
 * }
 */
export interface Bundle {
	name: string;
	/**
	 * the module that exports a component for each key of directives, under
	 * that name, compile emits it verbatim as an import specifier
	 */
	module?: string;
	/** by directive name, an entry with no handlers still names a component */
	directives?: Record<string, BundleDirective>;
	/** handlers for the whole document, as an entry of parse_plugins */
	parse?: ParsePlugin;
	/** element replacements, below those of the components option */
	components?: ComponentSource;
}

export interface CompileOptions
	extends TemplateOptions, SyntaxOptions, HeadingOptions, SmartOptions {
	/**
	 * plugin bundles, lowest precedence first, their directive components sit
	 * below the directives option and their handlers run ahead of parse_plugins
	 */
	plugins?: Bundle[];
	parse_plugins?: ParsePlugin[];
	sourcemap?: boolean;
	/** root fallback replacements, lowest precedence first, each specifier is imported as written */
	components?: ComponentSource[];
	/**
	 * root fallback directive replacements apart from components, lowest
	 * precedence first, the plugin reads them from each components module
	 */
	directives?: ComponentSource[];
	component_mode?: ComponentMode;
	frontmatter?: FrontmatterOptions;
	/**
	 * false renders a directive no component takes as its children rather
	 * than throwing a DirectiveError, as an editor wants while the author types
	 */
	strict_directives?: boolean;
	/**
	 * highlights fences and code spans with a #! hint, create_highlight from
	 * mdsvex/highlight or a highlighter function, false renders code plain,
	 * which is the default
	 */
	highlight?: HighlightOption;
	/**
	 * renders a math fence as display math, load_math from mdsvex/math gives
	 * a renderer for temml or katex, any function from latex to markup is one,
	 * false leaves the fence a code block, which is the default
	 */
	math?: MathOption;
	/**
	 * the accessible names of the footnotes section and of the links back
	 * from it, strict false makes a preview of a document a compile rejects,
	 * a document with no footnote reads none of it
	 *
	 * @example
	 * footnotes: { label: 'Notes', back_label: 'Back to note {n}' }
	 */
	footnotes?: FootnoteOptions;
	/**
	 * imports every image with a relative url and gives the image what the
	 * import gives, so a bundler hashes and optimises the file, ![a](./a.png)
	 * and ![a](a.png) import ./a.png, off by default as it takes a bundler
	 * that imports images, the vite plugin has it on
	 */
	import_images?: boolean;
	/**
	 * called for the url of every markdown link and of every markdown image
	 * that is not imported, after links.routes and before links.base, a string
	 * replaces the url and nothing keeps it, a url with a svelte expression is
	 * never offered, nor is the href or src of an element typed as html
	 *
	 * @example
	 * rewrite: (url) => (url.startsWith('gh:') ? 'https://github.com/' + url.slice(3) : undefined)
	 */
	rewrite?: Rewrite;
	/**
	 * turns relative links to documents into routes and puts the base path in
	 * front of root urls, without a function
	 *
	 * @example
	 * links: { routes: 'src/routes', base: '/docs' }
	 */
	links?: LinkOptions;
	/**
	 * the text of each file a fence shows with src=, by the path the fence
	 * names without its line slice, a fence whose file is not here throws a
	 * SourceError, false leaves src= unread, the fence then renders as written
	 *
	 * @example
	 * compile('```ts src=./math.ts#L1-L2\n```', {
	 *   sources: { './math.ts': 'export const a = 1;\nexport const b = 2;\n' },
	 * });
	 */
	sources?: Readonly<Record<string, string>> | false;
	/**
	 * how a fence marked run is imported, the block is a module and compile
	 * serves none, so without this a block that runs throws a RunError, true
	 * imports each as a sibling of filename, ./name.snippet-hash.extension,
	 * a function gives the specifier, either way the snippets of the result
	 * hold the code to serve, false runs no block, a fence with src= that
	 * runs imports its file and needs none of this
	 *
	 * @example
	 * const { code, snippets } = compile('```svelte run\n<b>hi</b>\n```', {
	 *   filename: 'a.md',
	 *   components: [{ specifier: './md.js', names: ['pre'] }],
	 *   snippets: true,
	 * });
	 * // code imports ./a.md.snippet-0f3c9a1b22.svelte, snippets[0].code is its text
	 */
	snippets?: SnippetsOption;
	/** the document, highlighters, math renderers and their errors see it */
	filename?: string;
	/**
	 * reads a file for ctx.read of a plugin, and with resolve the files fences
	 * show with src= in compile_async, mdsvex/compile has no reader of its own
	 */
	read?: (path: string) => string | Promise<string>;
	/**
	 * resolves a specifier from a file for ctx.resolve of a plugin, null when
	 * nothing matches, compile_async resolves src= files and the template
	 * module with it and reports them in dependencies
	 */
	resolve?: (
		specifier: string,
		importer: string | undefined
	) => string | null | undefined | Promise<string | null | undefined>;
}

/** the sources option once it is known to be on */
type Sources = Readonly<Record<string, string>> | undefined;

/** the import lines and url lookup a render is given, from image imports, rewritten urls or both */
type UrlSwaps = NonNullable<ReturnType<typeof with_images>>;

/**
 * something a parsed document asks for before it renders, a render answers
 * an image itself, with the import, and takes the text of a source from the
 * sources of its inputs
 */
export type Need = ImageNeed | SourceNeed;

/** a svelte component that wraps documents, its replacements chain in front of the root */
export interface TemplateEntry {
	/** emitted verbatim as an import specifier */
	specifier: string;
	/** the element names the template exports from its module script, its replacements */
	components?: string[];
	/** its directives, chained in front of the root directives, lowest precedence first */
	directives?: ComponentSource[];
}

export interface TemplateOptions {
	/** templates by name, a frontmatter template key picks one */
	templates?: Record<string, TemplateEntry>;
	/** the template when neither the frontmatter nor select_template picks one, in place of the default entry */
	default_template?: string;
	/**
	 * called when the frontmatter has no template key, a name picks that
	 * template, false picks none and undefined falls through to the default
	 */
	select_template?: (metadata: Metadata) => string | false | undefined;
	/** the template ahead of the frontmatter, false for none, as an import query asks */
	template?: string | false;
}

/** the frontmatter, exported from the module script as metadata */
type Metadata = Record<string, unknown>;

type FrontmatterParse = FrontmatterOptions['parse'];

export interface CompileResult {
	code: string;
	mappings?: Mapping<MappingData>[];
	/** the parsed frontmatter, undefined when the document has none */
	metadata?: Metadata;
	/** the name of the template the document is wrapped in, undefined for none */
	template?: string;
	/** undefined when there are none */
	warnings?: CompileWarning[];
	/** what plugins left in ctx.data, by plugin name, undefined when none left any */
	data?: PluginData;
	/** the code of the fences that run, one per module the document imports, undefined when none runs */
	snippets?: Snippet[];
	/** the absolute paths the output depends on, each once, undefined for none */
	dependencies?: string[];
}

export interface CompileV3Result {
	code: string;
	/** equals mappings_to_v3 over the compile mappings with raw as source */
	map: SourceMapV3;
	/** the parsed frontmatter, undefined when the document has none */
	metadata?: Metadata;
	/** the name of the template the document is wrapped in, undefined for none */
	template?: string;
	/** undefined when there are none */
	warnings?: CompileWarning[];
	/** what plugins left in ctx.data, by plugin name, undefined when none left any */
	data?: PluginData;
	/** the code of the fences that run, one per module the document imports, undefined when none runs */
	snippets?: Snippet[];
	/** the absolute paths the output depends on, each once, undefined for none */
	dependencies?: string[];
}

export interface CompileTraceResult {
	code: string;
	/** collapsing \r\n keeps every line and column, so its positions hold in raw */
	trace: MapTrace;
	/** the normalized source the trace indexes */
	source: string;
	/** the parsed frontmatter, undefined when the document has none */
	metadata?: Metadata;
	/** the name of the template the document is wrapped in, undefined for none */
	template?: string;
	/** undefined when there are none */
	warnings?: CompileWarning[];
	/** what plugins left in ctx.data, by plugin name, undefined when none left any */
	data?: PluginData;
	/** the code of the fences that run, one per module the document imports, undefined when none runs */
	snippets?: Snippet[];
	/** the absolute paths the output depends on, each once, undefined for none */
	dependencies?: string[];
}

/**
 * what a compile reads apart from the document, made by compile_inputs, a
 * caller with many documents keeps one and stores the fields that change,
 * never while a compile runs
 */
export interface CompileInputs {
	/** unpacked into the four fields below before a compile reads them */
	plugins: Bundle[] | undefined;
	/** handlers bound to directive names, only ever set from plugins */
	directive_handlers: BoundTables | undefined;
	parse_plugins: ParsePlugin[] | undefined;
	components: ComponentSource[] | undefined;
	directives: ComponentSource[] | undefined;
	component_mode: ComponentMode | undefined;
	frontmatter_parse: FrontmatterParse;
	/** undefined when nothing but frontmatter can pick a template */
	templates: TemplateOptions | undefined;
	strict_directives: boolean;
	highlight: HighlightOption | undefined;
	filename: string | undefined;
	/** the parsers take the inputs as their SyntaxOptions */
	unwrap_images: boolean | undefined;
	/** the slug of the heading_ids option, undefined when it is off */
	heading_ids: HeadingSlug | undefined;
	/** the smart_punctuation option, undefined when it is off */
	smart_punctuation: SmartPunctuation | undefined;
	math: MathOption | undefined;
	footnotes: FootnoteOptions | undefined;
	/** true imports relative images, anything else leaves every url */
	import_images: boolean | undefined;
	/** the rewrite and links options, links_of prepares them, undefined when no url changes */
	links: Links | undefined;
	/** the text of the files fences show with src=, by spec, false leaves src= unread */
	sources: Readonly<Record<string, string>> | false | undefined;
	/**
	 * true makes an into compile stop after the parse when sources lacks a
	 * file, the document then waits in the waiting field of its target
	 */
	await_sources: boolean;
	/**
	 * true lets a plugin defer work in an into compile, which then stops
	 * after the parse and waits in the waiting field of its target until the
	 * caller settles it, a parse always may
	 */
	await_plugins: boolean;
	/** how a fence marked run is imported, false runs none, undefined makes one an error */
	snippets: SnippetsOption | undefined;
	/** the read option */
	read: CompileOptions['read'];
	/** the resolve option */
	resolve: CompileOptions['resolve'];
}

/**
 * the inputs of CompilerSession.parse and render, made from the options
 * compile takes, every inputs object comes from here so they share one shape
 */
export function compile_inputs(options?: CompileOptions): CompileInputs {
	const inputs = fresh_inputs();
	return options === undefined
		? inputs
		: Object.assign(inputs, inputs_of(options));
}

function fresh_inputs(): CompileInputs {
	return {
		plugins: undefined,
		directive_handlers: undefined,
		parse_plugins: undefined,
		components: undefined,
		directives: undefined,
		component_mode: undefined,
		frontmatter_parse: undefined,
		templates: undefined,
		strict_directives: true,
		highlight: undefined,
		filename: undefined,
		unwrap_images: undefined,
		heading_ids: undefined,
		smart_punctuation: undefined,
		math: undefined,
		footnotes: undefined,
		import_images: undefined,
		links: undefined,
		sources: undefined,
		await_sources: false,
		await_plugins: false,
		snippets: undefined,
		read: undefined,
		resolve: undefined,
	};
}

// what a compile without options reads, never written
const no_inputs = compile_inputs();

/** the one place compile options become inputs */
function inputs_of(options: CompileOptions): CompileInputs {
	const mode = options.component_mode;
	// a mode that is neither throws before the parse, with or without components
	scope_of(undefined, mode);
	const strict = options.strict_directives;
	const bundles = options.plugins;
	const plugins = options.parse_plugins;
	const components = options.components;
	const directives = options.directives;
	const parse = options.frontmatter?.parse;
	const templates = picks_template(options) ? options : undefined;
	const highlight = options.highlight;
	const filename = options.filename;
	const unwrap_images = options.unwrap_images;
	const heading_ids = options.heading_ids;
	const smart = options.smart_punctuation;
	const math = options.math;
	const footnotes = options.footnotes;
	const import_images = options.import_images;
	const rewrite = options.rewrite;
	const links = options.links;
	const sources = options.sources;
	const snippets = options.snippets;
	const read = options.read;
	const resolve = options.resolve;
	// options that set none need no inputs of their own
	if (
		bundles === undefined &&
		plugins === undefined &&
		components === undefined &&
		directives === undefined &&
		mode === undefined &&
		parse === undefined &&
		templates === undefined &&
		strict === undefined &&
		highlight === undefined &&
		filename === undefined &&
		unwrap_images === undefined &&
		heading_ids === undefined &&
		smart === undefined &&
		math === undefined &&
		footnotes === undefined &&
		import_images === undefined &&
		rewrite === undefined &&
		links === undefined &&
		sources === undefined &&
		snippets === undefined &&
		read === undefined &&
		resolve === undefined
	)
		return no_inputs;
	const inputs = compile_inputs();
	inputs.plugins = bundles;
	inputs.parse_plugins = plugins;
	inputs.components = components;
	inputs.directives = directives;
	inputs.component_mode = mode;
	inputs.frontmatter_parse = parse;
	inputs.templates = templates;
	inputs.strict_directives = strict === undefined ? true : strict;
	inputs.highlight = highlight;
	inputs.filename = filename;
	inputs.unwrap_images = unwrap_images;
	if (heading_ids !== undefined) inputs.heading_ids = slug_of(heading_ids);
	if (smart !== undefined) inputs.smart_punctuation = smart_of(smart);
	inputs.math = math;
	if (footnotes !== undefined) inputs.footnotes = footnotes_option(footnotes);
	inputs.import_images = import_images;
	if (rewrite !== undefined || links !== undefined)
		inputs.links = links_of(rewrite, links);
	inputs.sources = sources;
	inputs.read = read;
	inputs.resolve = resolve;
	inputs.snippets = snippets;
	return inputs;
}

/** throws unless the footnotes option is one a compile takes */
export function footnotes_option(written: FootnoteOptions): FootnoteOptions {
	if (typeof written !== 'object' || written === null)
		throw new TypeError(
			'[mdsvex] footnotes must be an object with label, back_label or strict'
		);
	for (const key of ['label', 'back_label'] as const) {
		const value = written[key];
		if (value !== undefined && typeof value !== 'string')
			throw new TypeError(`[mdsvex] footnotes.${key} must be a string`);
	}
	if (written.strict !== undefined && typeof written.strict !== 'boolean')
		throw new TypeError('[mdsvex] footnotes.strict must be true or false');
	return written;
}

/** the options the positional entry points take as one trailing object */
type PositionalOptions = SyntaxOptions &
	HeadingOptions &
	SmartOptions &
	Pick<CompileOptions, 'import_images' | 'footnotes'>;

/** inputs for the positional entry points, which are always strict */
function inputs_from(
	parse_plugins: ParsePlugin[] | undefined,
	components: ComponentSource[] | undefined,
	parse: FrontmatterParse,
	templates: TemplateOptions | undefined,
	directives: ComponentSource[] | undefined,
	mode: ComponentMode | undefined,
	highlight: HighlightOption | undefined,
	filename: string | undefined,
	syntax: PositionalOptions | undefined
): CompileInputs {
	const inputs = compile_inputs();
	inputs.parse_plugins = parse_plugins;
	inputs.components = components;
	inputs.directives = directives;
	inputs.component_mode = mode;
	inputs.frontmatter_parse = parse;
	inputs.templates = templates;
	inputs.highlight = highlight;
	inputs.filename = filename;
	if (syntax !== undefined) {
		inputs.unwrap_images = syntax.unwrap_images;
		inputs.heading_ids = slug_of(syntax.heading_ids);
		inputs.smart_punctuation = smart_of(syntax.smart_punctuation);
		inputs.import_images = syntax.import_images;
		if (syntax.footnotes !== undefined)
			inputs.footnotes = footnotes_option(syntax.footnotes);
	}
	return inputs;
}

/** the root scope, the positional entry points check the mode only beside components */
function root_scope(inputs: CompileInputs): ComponentScope | null {
	const components = inputs.components;
	return components === undefined
		? null
		: scope_of(components, inputs.component_mode);
}

const index_of = String.prototype.indexOf;

/**
 * normalize_newlines starts with the same check, made here it keeps the
 * splitter out of what v8 inlines into every compile
 */
function normalized(raw: string): string {
	return index_of.call(raw, '\r') === -1 ? raw : normalize_newlines(raw);
}

/**
 * the sources or plugins of the bundles ahead of the array an option gives,
 * so the option wins a name and its handlers run last, the result is the
 * same array for the same given array, as every cache is keyed by it
 */
class Merge<T> {
	private own: T[];
	private given: T[] | undefined = undefined;
	private merged: T[] | undefined = undefined;

	constructor(own: T[]) {
		this.own = own;
	}

	with(given: T[] | undefined): T[] | undefined {
		const own = this.own;
		if (given === undefined || given.length === 0)
			return own.length === 0 ? given : own;
		if (own.length === 0) return given;
		if (this.given !== given) {
			this.given = given;
			this.merged = own.concat(given);
		}
		return this.merged;
	}
}

/** what one plugins array holds, built once, so the arrays keep their identity */
interface Unpacked {
	/** the directives of each bundle with its name, undefined when none binds a handler */
	handlers: BoundTables | undefined;
	/** the directive components of each bundle that has any */
	directives: Merge<ComponentSource>;
	components: Merge<ComponentSource>;
	/** the document wide plugin of each bundle that has one */
	parse: Merge<ParsePlugin>;
}

const unpacked = new WeakMap<Bundle[], Unpacked>();

function bundle_error(i: number, bundle: unknown, message: string): Error {
	const name =
		typeof bundle === 'object' && bundle !== null
			? (bundle as { name?: unknown }).name
			: undefined;
	return new Error(
		`[mdsvex] plugins[${i}]` +
			(typeof name === 'string' ? ` (${name})` : '') +
			' ' +
			message
	);
}

function is_record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * bundles are unpacked before anything reaches the parser, which skips a
 * plugin key that is no node kind without a word
 */
function unpack(bundles: Bundle[]): Unpacked {
	const hit = unpacked.get(bundles);
	if (hit !== undefined) return hit;
	if (!Array.isArray(bundles))
		throw new Error('[mdsvex] plugins must be an array of plugins');
	const tables: BoundTables = [];
	const directives: ComponentSource[] = [];
	const components: ComponentSource[] = [];
	const parse: ParsePlugin[] = [];
	for (let i = 0; i < bundles.length; i++) {
		const bundle = bundles[i];
		if (!is_record(bundle))
			throw bundle_error(i, bundle, 'must be an object, call the plugin');
		if (typeof bundle.name !== 'string' || bundle.name === '')
			throw bundle_error(i, bundle, 'needs a name');
		const own = bundle.directives;
		if (own !== undefined) {
			if (!is_record(own))
				throw bundle_error(
					i,
					bundle,
					'directives must be an object keyed by directive name'
				);
			const names = Object.keys(own);
			for (const name of names) {
				if (!is_record(own[name]))
					throw bundle_error(i, bundle, `directives.${name} must be an object`);
			}
			if (names.length !== 0) {
				if (typeof bundle.module !== 'string' || bundle.module === '')
					throw bundle_error(
						i,
						bundle,
						'needs a module, the specifier its directive components are exported from'
					);
				directives.push({ specifier: bundle.module, names });
				// the parser reads children, descendants and parse and ignores the
				// rest, the name keys what the handlers write to ctx.data
				tables.push({ name: bundle.name, directives: own });
			}
		}
		const replaced = bundle.components;
		if (replaced !== undefined) {
			if (
				!is_record(replaced) ||
				typeof replaced.specifier !== 'string' ||
				!Array.isArray(replaced.names)
			)
				throw bundle_error(
					i,
					bundle,
					'components must be { specifier, names }'
				);
			components.push(replaced);
		}
		if (bundle.parse !== undefined) {
			if (!is_record(bundle.parse))
				throw bundle_error(i, bundle, 'parse must be a parse plugin');
			// under the name of its bundle, so ctx.data is one object for both
			parse.push(
				bundle.parse.name === bundle.name
					? bundle.parse
					: { ...bundle.parse, name: bundle.name }
			);
		}
	}
	const out: Unpacked = {
		handlers: has_directive_handlers(tables) ? tables : undefined,
		directives: new Merge(directives),
		components: new Merge(components),
		parse: new Merge(parse),
	};
	unpacked.set(bundles, out);
	return out;
}

/** @internal throws for a malformed plugin, so a config fails before its first document */
export function check_plugins(bundles: Bundle[]): void {
	unpack(bundles);
}

/**
 * the inputs with their plugins unpacked into the fields a compile reads, a
 * copy as the caller keeps its own
 */
function unbundled(inputs: CompileInputs): CompileInputs {
	const u = unpack(inputs.plugins!);
	// assigned over a fresh one so the shape holds and a new field comes along
	const out = Object.assign(compile_inputs(), inputs);
	out.plugins = undefined;
	out.directive_handlers = u.handlers;
	out.directives = u.directives.with(inputs.directives);
	out.components = u.components.with(inputs.components);
	out.parse_plugins = u.parse.with(inputs.parse_plugins);
	return out;
}

const directive_scopes = new WeakMap<ComponentSource[], ComponentScope>();

/** the scope chain for root directives, its locals apart from the elements */
function directive_scope_of(
	directives: ComponentSource[] | undefined
): ComponentScope | null {
	if (directives === undefined || directives.length === 0) return null;
	let scope = directive_scopes.get(directives);
	if (scope === undefined) {
		scope = new ComponentScope(directives, 'D_G');
		directive_scopes.set(directives, scope);
	}
	return scope;
}

const DIRECTIVE_KINDS = [
	'directive_inline',
	'directive_leaf',
	'directive_container',
] as const;

const guarded = new WeakMap<
	ParsePlugin[],
	{ scope: ComponentScope; plugins: ParsePlugin[] }
>();

/** a directive a component replaces never reaches the directive handlers of a plugin */
function guard_plugins(
	plugins: ParsePlugin[],
	scope: ComponentScope | null
): ParsePlugin[] {
	if (scope === null) return plugins;
	const hit = guarded.get(plugins);
	if (hit !== undefined && hit.scope === scope) return hit.plugins;
	let out = plugins;
	for (let i = 0; i < plugins.length; i++) {
		const plugin = plugins[i];
		let copy: ParsePlugin | null = null;
		for (const kind of DIRECTIVE_KINDS) {
			const entry = plugin[kind];
			if (typeof entry !== 'object' || typeof entry.parse !== 'function')
				continue;
			const parse = entry.parse;
			copy ??= { ...plugin };
			copy[kind] = {
				parse(node, ctx) {
					// the open handlers of a directive run once it has its name
					const name = node.attrs.name;
					return typeof name === 'string' && scope.get(name) !== undefined
						? undefined
						: parse(node, ctx);
				},
			};
		}
		if (copy !== null) {
			if (out === plugins) out = plugins.slice();
			out[i] = copy;
		}
	}
	guarded.set(plugins, { scope, plugins: out });
	return out;
}

const has_own = Object.prototype.hasOwnProperty;

/** false when nothing but frontmatter can pick a template */
function picks_template(options: TemplateOptions | undefined): boolean {
	return (
		options !== undefined &&
		(options.templates !== undefined ||
			options.template !== undefined ||
			options.select_template !== undefined ||
			options.default_template !== undefined)
	);
}

/** the name of the template a document is wrapped in, undefined for none */
function template_of(
	metadata: Metadata | undefined,
	options: TemplateOptions | undefined,
	nodes: NodeBuffer,
	source: string
): string | undefined {
	const in_frontmatter =
		metadata !== undefined && has_own.call(metadata, 'template');
	if (options === undefined) {
		if (!in_frontmatter) return undefined;
		options = {};
	}
	let name: unknown = options.template;
	let from = 'the template option';
	if (name === undefined && in_frontmatter) {
		name = metadata!.template;
		from = 'frontmatter';
		if (name !== false && typeof name !== 'string') {
			throw frontmatter_error(
				nodes,
				source,
				'template',
				`template must be the name of a template or false, got ${JSON.stringify(name)}`
			);
		}
	}
	if (name === undefined && options.select_template !== undefined) {
		name = options.select_template(metadata ?? {});
		from = 'select_template';
		if (name !== undefined && name !== false && typeof name !== 'string') {
			throw new Error(
				`[mdsvex] select_template must return a template name, false or undefined, it returned ${JSON.stringify(name)}`
			);
		}
	}
	const templates = options.templates;
	if (name === undefined) {
		if (options.default_template !== undefined) {
			name = options.default_template;
			from = 'default_template';
		} else if (templates !== undefined && has_own.call(templates, 'default'))
			name = 'default';
		else return undefined;
	}
	if (name === false) return undefined;

	const entry =
		templates !== undefined && has_own.call(templates, name as string)
			? templates[name as string]
			: undefined;
	if (entry === undefined) {
		const known = templates === undefined ? [] : Object.keys(templates);
		const message =
			`Unknown template ${JSON.stringify(name)} from ${from}. ` +
			(known.length === 0
				? 'No templates are configured'
				: `Known templates: ${known.join(', ')}`);
		if (from === 'frontmatter')
			throw frontmatter_error(nodes, source, 'template', message);
		throw new Error('[mdsvex] ' + message);
	}
	if (metadata !== undefined && has_own.call(metadata, 'children')) {
		throw frontmatter_error(
			nodes,
			source,
			'children',
			`The frontmatter key children collides with the children of template ${JSON.stringify(name)}, rename it`
		);
	}
	return name as string;
}

/** an error at the line of a frontmatter key */
function frontmatter_error(
	nodes: NodeBuffer,
	source: string,
	key: string,
	message: string
): FrontmatterError {
	const fm = nodes.first_child_at(0);
	const line = key_line(
		source,
		nodes.value_start_at(fm),
		nodes.value_end_at(fm),
		key
	);
	return new FrontmatterError(`${message} (frontmatter line ${line})`, line, 1);
}

// keyed by the entry and then its parent, plugins keep both per config
const template_scopes = new WeakMap<
	TemplateEntry,
	{ parent: ComponentScope | null; scope: ComponentScope }
>();

/** the template replacements chained in front of the root scope */
function template_scope(
	entry: TemplateEntry,
	root: ComponentScope | null
): ComponentScope | null {
	const names = entry.components;
	if (names === undefined || names.length === 0) return root;
	const hit = template_scopes.get(entry);
	if (hit !== undefined && hit.parent === root) return hit.scope;
	const scope = new ComponentScope(
		[{ specifier: entry.specifier, names }],
		'T',
		root
	);
	template_scopes.set(entry, { parent: root, scope });
	return scope;
}

const template_directive_scopes = new WeakMap<
	TemplateEntry,
	{ parent: ComponentScope | null; scope: ComponentScope }
>();

/** the template directives chained in front of the root directives */
function template_directives(
	entry: TemplateEntry,
	root: ComponentScope | null
): ComponentScope | null {
	const sources = entry.directives;
	if (sources === undefined || sources.length === 0) return root;
	const hit = template_directive_scopes.get(entry);
	if (hit !== undefined && hit.parent === root) return hit.scope;
	const scope = new ComponentScope(sources, 'D_T', root);
	template_directive_scopes.set(entry, { parent: root, scope });
	return scope;
}

const reserved_scopes = new WeakMap<
	Record<string, TemplateEntry>,
	{ root: ComponentScope | null; scope: ComponentScope | null }
>();

/**
 * every directive name the root or any template registers, the template is
 * picked after the parse so plugins never see a name one of them could render
 */
function reserved_directives(
	root: ComponentScope | null,
	options: TemplateOptions | undefined
): ComponentScope | null {
	const templates = options?.templates;
	if (templates === undefined) return root;
	const hit = reserved_scopes.get(templates);
	if (hit !== undefined && hit.root === root) return hit.scope;
	const sources: ComponentSource[] = [];
	for (const name in templates) {
		const own = templates[name].directives;
		if (own !== undefined) sources.push(...own);
	}
	const scope =
		sources.length === 0 ? root : new ComponentScope(sources, 'R', root);
	reserved_scopes.set(templates, { root, scope });
	return scope;
}

/** sets the scope and the template a document renders with, returns the template name */
function prepare(
	renderer: CursorHTMLRenderer,
	root: ComponentScope | null,
	metadata: Metadata | undefined,
	options: TemplateOptions | undefined,
	nodes: NodeBuffer,
	source: string
): string | undefined {
	const name = template_of(metadata, options, nodes, source);
	if (name === undefined) {
		renderer.scope = root;
		return undefined;
	}
	const entry = options!.templates![name];
	renderer.scope = template_scope(entry, root);
	renderer.directives = template_directives(entry, renderer.directives);
	renderer.template = {
		specifier: entry.specifier,
		metadata: metadata !== undefined,
	};
	return name;
}

// null while taken, so a compile inside a plugin makes its own
let spare_parser: PFMParser | null = null;
/** the footnote ids the heading ids of the last parse with them moved, see HeadingIds.moved */
let moved_ids: Map<string, string> | null = null;

function take_moved(): Map<string, string> | null {
	const moved = moved_ids;
	moved_ids = null;
	return moved;
}

/** heading ids a one shot parse lends out, a compile a plugin handler starts finds none and makes its own */
let spare_ids: HeadingIds | null = null;
let spare_renderer: CursorHTMLRenderer | null = null;

function take_renderer(): CursorHTMLRenderer {
	const renderer = spare_renderer;
	if (renderer === null) return new CursorHTMLRenderer({ cache: false });
	spare_renderer = null;
	return renderer;
}

/** results hold no reference into the renderer, so it can serve the next compile */
function give_renderer(renderer: CursorHTMLRenderer): void {
	renderer.release();
	spare_renderer = renderer;
}

/**
 * what the handlers of a document read through their context and what they
 * left for its result, one per dispatcher, which takes it as its document
 */
class PluginHost {
	readonly dispatcher: PluginDispatcher;
	filename: string | undefined = undefined;
	/** the dispatcher calls it bare, when a handler reads ctx.frontmatter */
	readonly frontmatter: () => Metadata | undefined;
	/** the tree the dispatcher builds into, set by whoever made it */
	tree: TreeBuilder | null = null;
	/** the reader and resolver of the document, its handlers call them later */
	read: CompileOptions['read'] = undefined;
	resolve: CompileOptions['resolve'] = undefined;
	/** what ctx.cached keeps, that of the session */
	cache: PluginCache | undefined = undefined;
	/**
	 * the deferred tasks and document hooks the document still waits for,
	 * null when everything ran during the parse
	 */
	pending: Promise<void> | null = null;
	private source = '';
	private parse: FrontmatterParse = undefined;
	private parsed_frontmatter = false;
	private metadata: Metadata | undefined = undefined;
	/** the export of what the handlers left, undefined when they left nothing */
	private exported: string | undefined = undefined;

	constructor(dispatcher: PluginDispatcher) {
		this.dispatcher = dispatcher;
		this.frontmatter = () => this.read_frontmatter();
	}

	/**
	 * before each parse, after a reset, which makes the dispatcher forget its
	 * document, awaits when the caller settles what the plugins defer
	 */
	start(source: string, inputs: CompileInputs, awaits: boolean): void {
		const dispatcher = this.dispatcher;
		dispatcher.allow_async = awaits;
		dispatcher.async_hint = ASYNC_HINT;
		this.read = inputs.read;
		this.resolve = inputs.resolve;
		this.pending = null;
		this.source = source;
		this.filename = inputs.filename;
		this.parse = inputs.frontmatter_parse;
		this.parsed_frontmatter = false;
		this.metadata = undefined;
		this.exported = undefined;
		this.dispatcher.set_document(this);
	}

	/** parsed once, for the first handler that asks or for the compile after the parse */
	private read_frontmatter(): Metadata | undefined {
		if (this.parsed_frontmatter) return this.metadata;
		const nodes = this.tree!.get_buffer();
		// frontmatter can only be the first node, and only its own open
		// handler runs before it has an end
		const first = nodes.first_child_at(0);
		if (
			first === NONE ||
			(nodes.kind_at(first) as number) !== K_FRONTMATTER ||
			nodes.end_at(first) === NONE
		)
			return undefined;
		const metadata = parse_frontmatter(
			this.source,
			nodes.value_start_at(first),
			nodes.value_end_at(first),
			this.parse
		);
		this.parsed_frontmatter = true;
		return (this.metadata = metadata);
	}

	/**
	 * before a render, what the handlers left becomes an export of the module
	 * script and a prop of the template, a throw leaves the renderer no template
	 */
	share(renderer: CursorHTMLRenderer, metadata: Metadata | undefined): void {
		const data = this.dispatcher.data();
		if (data === undefined) return;
		const wrapper = renderer.template;
		try {
			this.exported = plugin_data_export(data);
			// what a component reads the data from, as Node.svelte gives it while streaming
			add_lines(renderer, DATA_CONTEXT);
			if (wrapper === undefined) return;
			if (metadata !== undefined && has_own.call(metadata, PLUGIN_DATA_EXPORT))
				throw frontmatter_error(
					this.tree!.get_buffer(),
					this.source,
					PLUGIN_DATA_EXPORT,
					`The frontmatter key ${PLUGIN_DATA_EXPORT} collides with the prop a template takes what plugins left as, rename it`
				);
			wrapper.data = PLUGIN_DATA_EXPORT;
		} catch (e) {
			renderer.template = undefined;
			throw e;
		}
	}

	/** the module code of a document share ran for */
	module_code(metadata: Metadata | undefined): string | undefined {
		const exported = this.exported;
		if (metadata === undefined) return exported;
		const code = metadata_export(metadata);
		return exported === undefined ? code : code + '\n' + exported;
	}

	/**
	 * after the sequential passes, the deferred tasks and then the document
	 * hooks, what waits is kept for settle, a promise is never left unheard
	 */
	finish(nodes: NodeBuffer): void {
		const pending = this.dispatcher.finish(nodes);
		if (pending === undefined) return;
		pending.catch(() => {});
		this.pending = pending;
	}

	/** a document that waits for its render, the dispatcher holds what they left until then */
	wait(parsed: Parsed, inputs: CompileInputs): void {
		parsed._host = this;
		parsed.data = this.dispatcher.data();
		parsed.dependencies = this.dispatcher.dependencies();
		// what settle applies can add images and fences, they are looked for again
		if (this.pending !== null) parsed._scan = scan_of(inputs);
	}

	/**
	 * gives a result what the handlers left, their warnings ahead of those of
	 * the render, a target that is kept loses the data of its last document
	 */
	leave(
		result: {
			warnings?: CompileWarning[];
			data?: PluginData;
			dependencies?: string[];
		},
		kept: boolean
	): void {
		const data = this.dispatcher.data();
		if (data !== undefined || kept) result.data = data;
		const deps = this.dispatcher.dependencies();
		if (deps !== undefined || kept) result.dependencies = deps;
		const warned = this.dispatcher.warnings;
		if (warned === undefined) return;
		const source = this.source;
		const warnings: CompileWarning[] = [];
		for (const { plugin, code, message, start } of warned) {
			// one that names no node points at the start of the document
			const w: CompileWarning =
				start === undefined
					? { code, message, start: { line: 1, column: 0 } }
					: warning(code, message, start, source);
			if (plugin !== undefined) w.plugin = plugin;
			warnings.push(w);
		}
		const rendered = result.warnings;
		result.warnings =
			rendered === undefined ? warnings : warnings.concat(rendered);
	}
}

function need_images(parsed: Parsed, images: ImageImports | null): void {
	if (images === null) return;
	parsed._images = images;
	parsed.needs = images.needs;
}

function need_sources(parsed: Parsed, shown: SourceFences | null): void {
	if (shown === null) return;
	parsed._sources = shown;
	if (shown.math) parsed.math = true;
	if (shown.snippets !== null) parsed.snippets = shown.snippets;
	// a document that only runs blocks asks for nothing
	if (shown.needs.length === 0) return;
	const needs = parsed.needs;
	parsed.needs = needs === undefined ? shown.needs : [...needs, ...shown.needs];
}

/** a Parsed whose plugins deferred work renders once it settled */
function unsettled(host: PluginHost, parsed: Parsed): void {
	if (host.pending === null) return;
	parsed._nodes = null;
	throw new Error(
		'[mdsvex] the plugins of this document deferred work, wait for settle(parsed) before its render'
	);
}

const ASYNC_HINT =
	'compile() is synchronous, use compile_async() for a document whose plugins wait';

/** the host of a parse outside any session, null when no handler can run */
function host_once(
	source: string,
	plugins: ParsePlugin[] | undefined,
	bound: BoundTables | undefined,
	directives: ComponentScope | null
): PluginHost | null {
	const plugged = plugins !== undefined && plugins.length > 0;
	if (!plugged && bound === undefined) return null;
	// bound handlers go unguarded, they are how a plugin reaches its own directives
	return new PluginHost(
		new PluginDispatcher(
			plugged ? guard_plugins(plugins, directives) : undefined,
			new SourceTextSource(source),
			bound
		)
	);
}

function parse_once(
	source: string,
	host: PluginHost | null,
	inputs: CompileInputs,
	awaits: boolean
): NodeBuffer {
	// short documents are denser in nodes and a small buffer is only a slab
	// carve, so size generously to skip a resize
	const len = source.length;
	const tree = new TreeBuilder(
		len < 512 ? (len >> 2) + 16 : len >> 3,
		host === null ? undefined : host.dispatcher
	);
	if (host !== null) {
		host.tree = tree;
		host.start(source, inputs, awaits);
	}
	const slug = inputs.heading_ids;
	const headings = slug === undefined ? null : lend_ids(tree, slug, source);
	let parser = spare_parser;
	if (parser === null) parser = new PFMParser(tree);
	else {
		spare_parser = null;
		parser.bind(tree);
	}
	parser.set_options(inputs);
	parser.parse_normalized(source);
	// a throw above drops the parser, it may be half written
	parser.release();
	spare_parser = parser;

	const nodes = tree.get_buffer();
	// sequential plugins read the ids, every heading has its own by now
	if (headings !== null) {
		headings.finish(nodes);
		moved_ids = headings.moved;
		spare_ids = headings;
	}
	if (host !== null) {
		host.dispatcher.run_sequential(nodes);
		host.finish(nodes);
	}
	nodes.trim();
	return nodes;
}

/** the spare heading ids for a one shot parse, given back after it, a throw drops them */
function lend_ids(
	tree: TreeBuilder,
	slug: HeadingSlug,
	source: string
): HeadingIds {
	let headings = spare_ids;
	if (headings === null || headings.slug !== slug)
		headings = make_heading_ids(slug);
	else spare_ids = null;
	tree.set_headings(headings);
	headings.start(source);
	return headings;
}

/**
 * heading ids for a kept builder, kept by it from one document to the next
 * while the slug is the same, null and none on the builder without the option
 */
function ids_for(
	tree: TreeBuilder,
	slug: HeadingSlug | undefined,
	source: string
): HeadingIds | null {
	if (slug === undefined) {
		tree.set_headings(null);
		return null;
	}
	let headings = tree.get_headings();
	if (headings === null || headings.slug !== slug) {
		headings = make_heading_ids(slug);
		tree.set_headings(headings);
	}
	headings.start(source);
	return headings;
}

// must equal NONE in @mdsvex/parse
const NONE = 0xffffffff;

/** undefined without frontmatter */
function metadata_of(
	nodes: NodeBuffer,
	source: string,
	parse: FrontmatterParse
): Metadata | undefined {
	// frontmatter can only be the first node
	const first = nodes.first_child_at(0);
	if (first === NONE || (nodes.kind_at(first) as number) !== K_FRONTMATTER)
		return undefined;
	return parse_frontmatter(
		source,
		nodes.value_start_at(first),
		nodes.value_end_at(first),
		parse
	);
}

function warning(
	code: CompileWarning['code'],
	message: string,
	start: number,
	source: string
): CompileWarning {
	const line_start = source.lastIndexOf('\n', start - 1) + 1;
	let line = 1;
	for (
		let i = source.indexOf('\n');
		i !== -1 && i < start;
		i = source.indexOf('\n', i + 1)
	)
		line++;
	return { code, message, start: { line, column: start - line_start } };
}

/**
 * the one place inputs reach the renderer, it stores every field it owns so
 * a kept renderer carries nothing over, returns the name of the template
 */
function bind(
	renderer: CursorHTMLRenderer,
	inputs: CompileInputs,
	scope: ComponentScope | null,
	directives: ComponentScope | null,
	metadata: Metadata | undefined,
	nodes: NodeBuffer,
	source: string
): string | undefined {
	renderer.scope = scope;
	renderer.directives = directives;
	renderer.strict_directives = inputs.strict_directives;
	const templates = inputs.templates;
	// only options or frontmatter pick a template
	const template =
		templates === undefined && metadata === undefined
			? undefined
			: prepare(renderer, scope, metadata, templates, nodes, source);
	// the scope prepare left decides, so a template scope replaces typed html
	// too, a render without one stores nothing
	if (renderer.scope !== null)
		renderer.replace_typed = inputs.component_mode === 'all';
	const filename = inputs.filename;
	const highlight = inputs.highlight;
	// highlight_run gives null for both too, unasked it stays out of the code
	// v8 inlines here, which keeps bind small enough to inline into run
	let run =
		highlight === undefined || highlight === false
			? null
			: highlight_run(highlight, filename, source);
	renderer.highlight = run;
	// a replaced pre reads the meta conventions without a highlighter too
	if (run === null && renderer.scope?.get('pre') !== undefined)
		run = plain_run(filename, source);
	renderer.pre_meta = run;
	return template;
}

/**
 * drops the run bind made and gives the result its warnings, the scopes
 * stay for the next bind or a release, only a render with a scope sets
 * renderer warnings
 */
function unbind(
	result: { warnings?: CompileWarning[] },
	renderer: CursorHTMLRenderer,
	source: string
): void {
	// bind left the run here, null when no code needs one
	const run = renderer.pre_meta as HighlightRun | null;
	if (run !== null) {
		renderer.highlight = null;
		renderer.pre_meta = null;
	}
	const scope = renderer.scope;
	const list = scope === null || scope.size === 0 ? null : renderer.warnings;
	const highlights = run === null ? null : run.warnings;
	if (
		(list === null || list.length === 0) &&
		(highlights === null || highlights.length === 0)
	)
		return;
	result.warnings = warnings_of(list, highlights, source);
}

/** the footnote warnings of a document go out with its result, after those of the render */
function footnote_warnings(
	result: { warnings?: CompileWarning[] },
	notes: Footnotes,
	source: string
): void {
	const found = notes.warnings;
	if (found === null) return;
	const out = result.warnings ?? (result.warnings = []);
	for (const { code, message, start } of found)
		out.push(warning(code, message, start, source));
}

/**
 * apart from unbind, which most documents leave before here, so unbind stays
 * small enough to inline, the offsets index source
 */
function warnings_of(
	list: CursorHTMLRenderer['warnings'] | null,
	highlights: HighlightRun['warnings'] | null,
	source: string
): CompileWarning[] {
	const out: CompileWarning[] = [];
	if (list !== null)
		for (const { tag, directive, start } of list)
			out.push(
				warning(
					'element_directive',
					`<${tag}> stays an element, a component can't take ${directive}`,
					start,
					source
				)
			);
	if (highlights !== null)
		for (const { code, message, start } of highlights)
			out.push(warning(code, message, start, source));
	return out;
}

/**
 * with no run a document renders plain first, a math fence that came out
 * as code says it has math, so one without math pays for neither a run nor
 * a search, this gives the renderer a run for math to render again with,
 * a document with inline math gets it before the first render as the parser
 * noted the span
 */
function math_run(
	renderer: CursorHTMLRenderer,
	math: MathRenderer,
	filename: string | undefined,
	source: string
): true {
	const run = plain_run(filename, source).with_math(math);
	renderer.highlight = run;
	renderer.pre_meta = run;
	return true;
}

function module_code_of(
	metadata: Metadata | undefined,
	host: PluginHost | null
): string | undefined {
	if (host !== null) return host.module_code(metadata);
	return metadata === undefined ? undefined : metadata_export(metadata);
}

function render_once(raw: string, options?: CompileOptions): CompileResult {
	let inputs = options === undefined ? no_inputs : inputs_of(options);
	if (inputs.plugins !== undefined) inputs = unbundled(inputs);
	// parser offsets index the normalized string, so render and plugins read it too
	const source = normalized(raw);
	const scope = root_scope(inputs);
	const directives = directive_scope_of(inputs.directives);
	const host = host_once(
		source,
		inputs.parse_plugins,
		inputs.directive_handlers,
		reserved_directives(directives, inputs.templates)
	);
	const nodes = parse_once(source, host, inputs, false);
	const spans = take_math();
	// only a document the parser noted a footnote in is looked through
	const notes = take_footnote()
		? footnotes_of(
				nodes,
				source,
				inputs.footnotes,
				inputs.filename,
				inputs.heading_ids === undefined ? null : take_moved()
			)
		: null;
	// a handler that read the frontmatter already parsed it
	const metadata =
		host === null
			? metadata_of(nodes, source, inputs.frontmatter_parse)
			: host.frontmatter();
	let images: UrlSwaps | null =
		inputs.import_images === true &&
		(take_src() ||
			inputs.parse_plugins !== undefined ||
			inputs.directive_handlers !== undefined)
			? image_imports(nodes, source)
			: null;
	const linked = inputs.links;
	if (linked !== undefined)
		images = with_images(
			images,
			link_urls(
				linked,
				nodes,
				source,
				inputs.filename,
				images === null ? null : images.lookup
			)
		);
	const given = inputs.sources;
	const shown =
		(given !== false || inputs.snippets !== false) &&
		(take_info(source, 'src=', 'run') ||
			inputs.parse_plugins !== undefined ||
			inputs.directive_handlers !== undefined)
			? fences_of(nodes, source, inputs)
			: null;
	const fenced =
		shown === null
			? null
			: fence_sources(
					shown,
					given as Sources,
					source,
					inputs.filename,
					inputs.snippets
				);
	const renderer = take_renderer();
	const math = inputs.math;
	const mathy = math !== undefined && math !== false;
	let template: string | undefined;
	try {
		template = bind(
			renderer,
			inputs,
			scope,
			directives,
			metadata,
			nodes,
			source
		);
		if (host !== null) host.share(renderer, metadata);
	} catch (e) {
		give_renderer(renderer);
		throw e;
	}
	if (mathy) {
		if (renderer.highlight !== null)
			(renderer.highlight as HighlightRun).with_math(math);
		else if (spans) math_run(renderer, math, inputs.filename, source);
	}
	// give_renderer clears these, a throw drops the renderer
	if (images !== null) {
		add_lines(renderer, images.lines);
		renderer.urls = images.lookup;
	}
	if (fenced !== null) {
		try {
			give_fences(renderer, fenced, inputs.filename, source);
		} catch (e) {
			give_renderer(renderer);
			throw e;
		}
	}
	const smart = inputs.smart_punctuation;
	if (smart !== undefined) renderer.smart_punctuation = smart;
	if (notes !== null) renderer.footnotes = notes;

	if (options?.sourcemap) {
		let result;
		do {
			// only a collapsed \r\n changes length, without one raw needs no \r\n scan
			result = renderer.update_mapped(
				nodes,
				source,
				source.length === raw.length ? null : collapsed_of(raw),
				module_code_of(metadata, host)
			);
		} while (
			mathy &&
			renderer.highlight === null &&
			take_plain_math() &&
			math_run(renderer, math, inputs.filename, source)
		);
		const done: CompileResult = {
			code: renderer.html,
			mappings: result.mappings,
			metadata,
			template,
		};
		if (fenced !== null) done.snippets = fenced.snippets;
		unbind(done, renderer, source);
		if (notes !== null) footnote_warnings(done, notes, source);
		if (host !== null) host.leave(done, false);
		give_renderer(renderer);
		return done;
	}

	do renderer.update(nodes, source, module_code_of(metadata, host));
	while (
		mathy &&
		renderer.highlight === null &&
		take_plain_math() &&
		math_run(renderer, math, inputs.filename, source)
	);
	const done: CompileResult = { code: renderer.html, metadata, template };
	if (fenced !== null) done.snippets = fenced.snippets;
	unbind(done, renderer, source);
	if (notes !== null) footnote_warnings(done, notes, source);
	if (host !== null) host.leave(done, false);
	give_renderer(renderer);
	return done;
}

/** the walk for src= and the run flag, with what the inputs turn off */
function fences_of(
	nodes: NodeBuffer,
	source: string,
	inputs: CompileInputs
): SourceFences | null {
	return source_fences(
		nodes,
		source,
		inputs.filename,
		inputs.sources !== false,
		inputs.snippets !== false
	);
}

/**
 * gives a bound renderer the fences of its document and the imports of the
 * blocks that run, after any the urls brought, a block that runs needs a
 * component for pre, which only the scope bind left can say
 */
function give_fences(
	renderer: CursorHTMLRenderer,
	fenced: Fenced,
	filename: string | undefined,
	source: string
): void {
	if (fenced.runs !== -1 && renderer.scope?.get('pre') === undefined)
		throw pre_error(filename, source, fenced.runs);
	renderer.fences = fenced.fences;
	add_lines(renderer, fenced.lines);
}

/** lines for the instance script of the next render, after those it has */
function add_lines(
	renderer: CursorHTMLRenderer,
	lines: readonly string[] | undefined
): void {
	if (lines === undefined) return;
	const before = renderer.imports;
	renderer.imports =
		before === undefined || before.length === 0 ? lines : before.concat(lines);
}

/**
 * a document with plugin data gives it to its components in the context, under
 * the key @mdsvex/render/stream reads, current is the data and never changes
 */
const DATA_CONTEXT: readonly string[] = [
	"import { setContext as set_context_MDSVEX } from 'svelte';",
	`set_context_MDSVEX(Symbol.for('mdsvex.plugin_data'), { current: ${PLUGIN_DATA_EXPORT} });`,
];

/** true when handlers of a plugin may run, which keeps a document off a shared session */
function has_plugins(options: CompileOptions): boolean {
	const plugins = options.parse_plugins;
	if (plugins !== undefined && plugins.length > 0) return true;
	const bundles = options.plugins;
	return bundles !== undefined && bundles.length > 0;
}

// what a session compile hands back, local so the cases of run build to literals
const enum Kind {
	PLAIN,
	MAPPED,
	V3,
	TRACE,
	INTO,
	/** stops after the parse and hands back a Parsed */
	PARSE,
}

/** the tree, parser and dispatcher a session keeps for one plugins array */
interface PluginArena {
	plugins: ParsePlugin[] | undefined;
	/** the bound handlers the dispatcher was built with */
	bound: BoundTables | undefined;
	/** the reserved directives the plugins were guarded with */
	reserved: ComponentScope | null;
	text: SourceTextSource;
	dispatcher: PluginDispatcher;
	tree: TreeBuilder;
	parser: PFMParser;
	host: PluginHost;
}

/**
 * a document between its parse and its render, it owns its nodes, so the
 * session compiles other documents while this one waits, a render uses it up
 *
 * the host contract: parse, then settle what plugins deferred, then read
 * needs and fetch what they name, then render with it
 */
export class Parsed {
	/** the document as it was given */
	readonly raw: string;
	/** raw with its newlines normalized, the string every offset indexes */
	readonly source: string;
	/** the parsed frontmatter, undefined when the document has none */
	readonly metadata: Metadata | undefined;
	/**
	 * what the document asks for before it renders, images and then sources,
	 * each in document order, undefined for nothing, only what the inputs of
	 * the parse turned on is looked for, complete once settle resolved, as
	 * what the plugins deferred can add an image or a src=
	 */
	needs: readonly Need[] | undefined = undefined;
	/** @internal what settle looks for again once it applied, null when nothing waits */
	_scan: Scan | null = null;
	/** @internal the imports the needs of type image render with */
	_images: ImageImports | null = null;
	/** @internal the fences the needs of type source are for, and those that run */
	_sources: SourceFences | null = null;
	/** the code of the fences that run their own, one per module, undefined when none does */
	snippets: readonly Snippet[] | undefined = undefined;
	/** true when the document has inline math, or shows a file and has a math fence, a caller that loads the math renderer late loads it first */
	math = false;
	/** @internal the parser noted inline math, so the render starts with a math run */
	_spans = false;
	/** @internal the footnotes of the document, null for one with none */
	_notes: Footnotes | null = null;
	/** @internal null once a render took them */
	_nodes: NodeBuffer | null;
	/** @internal the plain arena of the session, lent until the render */
	_tree: TreeBuilder | null = null;
	/** @internal the plugin arena of the session, lent until the render */
	_arena: PluginArena | null = null;
	/**
	 * what plugins wrote with ctx.set and ctx.add, by plugin name, undefined
	 * when none wrote any, complete once settle resolved
	 */
	data: PluginData | undefined = undefined;
	/** the absolute paths its plugins depend on, complete once settle resolved */
	dependencies: string[] | undefined = undefined;
	/** @internal what its plugin handlers left, null when none could run and once a render took it */
	_host: PluginHost | null = null;

	/** @internal */
	constructor(
		raw: string,
		source: string,
		metadata: Metadata | undefined,
		nodes: NodeBuffer
	) {
		this.raw = raw;
		this.source = source;
		this.metadata = metadata;
		this._nodes = nodes;
	}
}

/**
 * reusable compiler for sequential documents
 *
 * the arena stays private so a reset never mutates an ast a caller holds,
 * documents with parse plugins get an arena of their own that is kept while
 * parse_plugins is the same array, the plugins are read when it is built, a
 * NodeView a plugin keeps throws once the session starts the next document
 *
 * parse and render split a compile in two for a caller that has to fetch
 * something between them, the arena goes with the Parsed and comes back when
 * it renders, so documents that take turns still share one
 */
export class CompilerSession {
	private tree: TreeBuilder | null = null;
	/** what ctx.cached keeps for the documents of this session */
	private cache = new PluginCache();
	private parser: PFMParser | null = null;
	private renderer = new CursorHTMLRenderer({ cache: false });
	// release already reset the arena, so the next compile can skip it
	private released = false;
	/** the parser noted inline math in the document the session parsed last */
	private spans = false;
	/** the footnotes of the document the session parsed last */
	private notes: Footnotes | null = null;
	// apart from the plain arena, so a compile without plugins started in a
	// plugin handler never meets a parser that is mid document
	private plugin_arena: PluginArena | null = null;
	// true while plugin handlers can run, a compile they start uses render_once
	private plugin_busy = false;

	/** @internal */
	get capacity(): number {
		return this.tree === null ? 0 : this.tree.get_buffer()._capacity;
	}

	// the parser is kept, so every document sets the syntax options again
	private parse_plain(source: string, inputs: CompileInputs): NodeBuffer {
		let tree = this.tree;
		if (tree === null) tree = this.plant(source);
		else if (!this.released) tree.reset();
		this.released = false;

		const slug = inputs.heading_ids;
		// one call that a document without the option never makes
		const headings =
			slug === undefined && tree.get_headings() === null
				? null
				: ids_for(tree, slug, source);
		this.parser!.set_options(inputs);
		this.parser!.parse_normalized(source);
		const nodes = tree.get_buffer();
		if (headings !== null) {
			headings.finish(nodes);
			moved_ids = headings.moved;
		}
		return nodes;
	}

	/**
	 * a plain arena for a session without one, the parser stays when a Parsed
	 * took the last, kept out of parse_plain so v8 still inlines that into run
	 */
	private plant(source: string): TreeBuilder {
		const tree = (this.tree = new TreeBuilder(source.length >> 3 || 16));
		if (this.parser === null) this.parser = new PFMParser(tree);
		else this.parser.bind(tree);
		return tree;
	}

	/** callers check plugin_busy first, the arena holds one document at a time */
	private parse_plugged(
		source: string,
		plugins: ParsePlugin[] | undefined,
		bound: BoundTables | undefined,
		reserved: ComponentScope | null,
		inputs: CompileInputs,
		awaits: boolean
	): NodeBuffer {
		let arena = this.plugin_arena;
		if (
			arena === null ||
			arena.plugins !== plugins ||
			arena.bound !== bound ||
			arena.reserved !== reserved
		) {
			const text = new SourceTextSource(source);
			const dispatcher = new PluginDispatcher(
				plugins !== undefined && plugins.length > 0
					? guard_plugins(plugins, reserved)
					: undefined,
				text,
				bound
			);
			const tree = new TreeBuilder(source.length >> 3 || 16, dispatcher);
			const host = new PluginHost(dispatcher);
			host.tree = tree;
			// the parser outlives the plugins, options that alternate rebuild often
			let parser: PFMParser;
			if (arena === null) parser = new PFMParser(tree);
			else {
				parser = arena.parser;
				parser.bind(tree);
			}
			arena = this.plugin_arena = {
				plugins,
				bound,
				reserved,
				text,
				dispatcher,
				tree,
				parser,
				host,
			};
		} else {
			arena.text.set_source(source);
			arena.tree.reset();
		}
		arena.host.start(source, inputs, awaits);
		arena.host.cache = this.cache;
		const slug = inputs.heading_ids;
		// one call that a document without the option never makes
		const headings =
			slug === undefined && arena.tree.get_headings() === null
				? null
				: ids_for(arena.tree, slug, source);

		this.plugin_busy = true;
		let done = false;
		try {
			arena.parser.set_options(inputs);
			arena.parser.parse_normalized(source);
			const nodes = arena.tree.get_buffer();
			if (headings !== null) {
				headings.finish(nodes);
				moved_ids = headings.moved;
			}
			arena.dispatcher.run_sequential(nodes);
			arena.host.finish(nodes);
			done = true;
			return nodes;
		} finally {
			this.plugin_busy = false;
			// a throw can leave the parser or the dispatcher half written
			if (!done) this.plugin_arena = null;
		}
	}

	compile(raw: string, options?: CompileOptions): CompileResult {
		if (options === undefined)
			return this.run(raw, no_inputs, Kind.PLAIN, undefined, undefined);
		// started in a plugin handler, the session holds the outer document
		if (this.plugin_busy && has_plugins(options)) {
			return render_once(raw, options);
		}
		return this.run(
			raw,
			inputs_of(options),
			options.sourcemap ? Kind.MAPPED : Kind.PLAIN,
			undefined,
			undefined
		);
	}

	/**
	 * the first half of a compile, the parse plugins and syntax options of
	 * inputs apply here, the document then waits in the Parsed while its
	 * caller settles what plugins deferred and fetches what the render needs,
	 * inputs come from compile_inputs
	 *
	 * @example
	 * const parsed = session.parse(raw, inputs);
	 * await session.settle(parsed);
	 * for (const need of parsed.needs ?? []) ...
	 * const { code } = session.render(parsed, inputs);
	 */
	parse(raw: string, inputs: CompileInputs): Parsed {
		return this.run(raw, inputs, Kind.PARSE, undefined, undefined);
	}

	/**
	 * waits for what the plugins of a parsed document deferred and applies
	 * it, undefined when there is nothing to wait for, so a document without
	 * deferred work stays synchronous, a task that rejected rejects it with a
	 * PluginTaskError, a document whose plugins deferred renders only after it
	 */
	settle(parsed: Parsed): Promise<void> | undefined {
		const host = parsed._host;
		if (host === null || host.pending === null) return undefined;
		return settle_plugins(host, host.pending, parsed);
	}

	/**
	 * drops what ctx.cached keeps under these paths, a host that watches
	 * calls it before it compiles the documents that depend on them again
	 */
	invalidate(paths: Iterable<string>): void {
		this.cache.invalidate(paths);
	}

	/** @internal the plugins a parsed document still waits for, for a warning */
	waiting_for(parsed: Parsed): string[] {
		const host = parsed._host;
		return host === null ? [] : host.dispatcher.waiting();
	}

	/**
	 * the second half, inputs are read again, so a caller that shares one
	 * inputs object between documents stores the fields of this document
	 * before it calls, as it does before a compile
	 */
	render(
		parsed: Parsed,
		inputs: CompileInputs,
		sourcemap?: boolean
	): CompileResult {
		return this.run(
			parsed.raw,
			inputs,
			sourcemap ? Kind.MAPPED : Kind.PLAIN,
			undefined,
			parsed
		);
	}

	/** @internal render as compile_into gives it */
	render_into(parsed: Parsed, inputs: CompileInputs, out: TraceTarget): void {
		this.run(parsed.raw, inputs, Kind.INTO, out, parsed);
	}

	/**
	 * @internal the document the compile that just returned parsed, as a
	 * Parsed, for a caller that learned from the render what it lacked, raw
	 * and inputs are what that compile was given and metadata what it gave,
	 * nothing else may run on the session in between
	 */
	keep(
		raw: string,
		inputs: CompileInputs,
		metadata: Metadata | undefined
	): Parsed {
		if (inputs.plugins !== undefined) inputs = unbundled(inputs);
		const plugins = inputs.parse_plugins;
		const plugged =
			(plugins !== undefined && plugins.length > 0) ||
			inputs.directive_handlers !== undefined;
		const tree = plugged
			? this.plugin_arena?.tree
			: this.released
				? null
				: this.tree;
		// a compile a plugin handler started parsed outside the session
		if (tree == null)
			throw new Error('[mdsvex] the session holds no document to keep');
		const source = normalized(raw);
		const nodes = tree.get_buffer();
		const parsed = new Parsed(raw, source, metadata, nodes);
		parsed.math = parsed._spans = this.spans;
		parsed._notes = this.notes;
		if (plugged) this.plugin_arena!.host.wait(parsed, inputs);
		if (inputs.import_images === true)
			need_images(parsed, image_imports(nodes, source));
		if (inputs.sources !== false || inputs.snippets !== false)
			need_sources(parsed, fences_of(nodes, source, inputs));
		return this.lend(parsed, plugged);
	}

	/** the arena that holds the document goes to its Parsed, the next parse builds one or gets one back */
	private lend(parsed: Parsed, plugged: boolean): Parsed {
		if (plugged) {
			parsed._arena = this.plugin_arena;
			this.plugin_arena = null;
		} else {
			parsed._tree = this.tree;
			this.tree = null;
		}
		return parsed;
	}

	/** @internal a Parsed that will never render gives its arena back */
	drop(parsed: Parsed): void {
		parsed._nodes = null;
		parsed._host = null;
		this.take_back(parsed);
	}

	/** a rendered Parsed returns its arena unless the session built another meanwhile */
	private take_back(parsed: Parsed): void {
		const tree = parsed._tree;
		if (tree !== null) {
			parsed._tree = null;
			if (this.tree === null) {
				this.tree = tree;
				this.parser!.bind(tree);
				// it holds the document that just rendered
				this.released = false;
			}
		}
		const arena = parsed._arena;
		if (arena !== null) {
			parsed._arena = null;
			if (this.plugin_arena === null) this.plugin_arena = arena;
		}
	}

	/** @internal keeps only typed arrays so an idle session holds no document */
	release(): void {
		if (this.tree !== null) {
			this.tree.reset();
			this.parser!.release();
			this.released = true;
		}
		// its dispatcher holds the last source and what the plugins left on it
		if (this.plugin_arena !== null) this.plugin_arena = null;
		this.renderer.release();
	}

	/** @internal the map equals mappings_to_v3 over compile mappings with raw as source */
	compile_v3(
		raw: string,
		file?: string,
		parse_plugins?: ParsePlugin[],
		components?: ComponentSource[],
		parse?: FrontmatterParse,
		templates?: TemplateOptions,
		directive_sources?: ComponentSource[],
		mode?: ComponentMode,
		highlight?: HighlightOption,
		syntax?: PositionalOptions
	): CompileV3Result {
		return this.run(
			raw,
			inputs_from(
				parse_plugins,
				components,
				parse,
				templates,
				directive_sources,
				mode,
				highlight,
				file,
				syntax
			),
			Kind.V3,
			undefined,
			undefined
		);
	}

	/**
	 * defers the map, the vite plugin builds only the lines the svelte compiler
	 * map points at
	 * @internal
	 */
	compile_trace(
		raw: string,
		parse_plugins?: ParsePlugin[],
		components?: ComponentSource[],
		parse?: FrontmatterParse,
		templates?: TemplateOptions,
		directive_sources?: ComponentSource[],
		mode?: ComponentMode,
		highlight?: HighlightOption,
		syntax?: PositionalOptions
	): CompileTraceResult {
		return this.run(
			raw,
			// a trace names no file, so the highlighter sees none
			inputs_from(
				parse_plugins,
				components,
				parse,
				templates,
				directive_sources,
				mode,
				highlight,
				undefined,
				syntax
			),
			Kind.TRACE,
			undefined,
			undefined
		);
	}

	/**
	 * compile_trace without result objects, the trace goes into out, the vite
	 * plugin keeps one inputs object for every document
	 * @internal
	 */
	compile_into(raw: string, inputs: CompileInputs, out: TraceTarget): void {
		this.run(raw, inputs, Kind.INTO, out, undefined);
	}

	/**
	 * compile_into with its inputs spelled out
	 * @internal
	 */
	compile_trace_into(
		raw: string,
		parse_plugins: ParsePlugin[] | undefined,
		out: TraceTarget,
		components?: ComponentSource[],
		parse?: FrontmatterParse,
		templates?: TemplateOptions,
		directive_sources?: ComponentSource[],
		mode?: ComponentMode,
		highlight?: HighlightOption,
		filename?: string,
		syntax?: PositionalOptions
	): void {
		this.run(
			raw,
			inputs_from(
				parse_plugins,
				components,
				parse,
				templates,
				directive_sources,
				mode,
				highlight,
				filename,
				syntax
			),
			Kind.INTO,
			out,
			undefined
		);
	}

	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.PLAIN | Kind.MAPPED,
		out: undefined,
		parsed: Parsed | undefined
	): CompileResult;
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.V3,
		out: undefined,
		parsed: undefined
	): CompileV3Result;
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.TRACE,
		out: undefined,
		parsed: undefined
	): CompileTraceResult;
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.INTO,
		out: TraceTarget,
		parsed: Parsed | undefined
	): TraceTarget;
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.PARSE,
		out: undefined,
		parsed: undefined
	): Parsed;
	/**
	 * every compile of the session, kind picks the render and what comes
	 * back, out takes an into compile, parsed is a document that already has
	 * its parse, at this size v8 never inlines it, so its inline budget goes to
	 * the parse and bind calls and the entry points above inline into their
	 * callers
	 */
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind,
		out: TraceTarget | undefined,
		parsed: Parsed | undefined
	):
		| CompileResult
		| CompileV3Result
		| CompileTraceResult
		| TraceTarget
		| Parsed {
		if (inputs.plugins !== undefined) inputs = unbundled(inputs);
		const scope = root_scope(inputs);
		// asked here and for the frontmatter below, a document with neither
		// then calls neither function, which leaves v8 their share of what it
		// inlines into run for the parse and the bind
		const written = inputs.directives;
		const directives =
			written === undefined ? null : directive_scope_of(written);
		let renderer = this.renderer;
		let source: string;
		let nodes: NodeBuffer;
		let metadata: Metadata | undefined;
		let images: ImageImports | null = null;
		let shown: SourceFences | null = null;
		let spans = false;
		let notes: Footnotes | null = null;
		// set when plugin handlers could run, a document without plugins never has one
		let host: PluginHost | null = null;
		if (parsed === undefined) {
			// parser offsets index the normalized string, so render and plugins read it too
			source = normalized(raw);
			const plugins = inputs.parse_plugins;
			const bound = inputs.directive_handlers;
			const plugged =
				(plugins !== undefined && plugins.length > 0) || bound !== undefined;
			if (plugged) {
				const reserved = reserved_directives(directives, inputs.templates);
				// a caller that gets a Parsed settles it, an into compile may wait
				const awaits = kind === Kind.PARSE || inputs.await_plugins;
				if (this.plugin_busy) {
					// started in a plugin handler, the session holds the outer document
					host = host_once(source, plugins, bound, reserved)!;
					nodes = parse_once(source, host, inputs, awaits);
					renderer = new CursorHTMLRenderer({ cache: false });
				} else {
					nodes = this.parse_plugged(
						source,
						plugins,
						bound,
						reserved,
						inputs,
						awaits
					);
					host = this.plugin_arena!.host;
				}
				// a handler that read the frontmatter already parsed it
				metadata = host.frontmatter();
			} else {
				nodes = this.parse_plain(source, inputs);
				// frontmatter can only be the first node
				const first = nodes.first_child_at(0);
				metadata =
					first === NONE || (nodes.kind_at(first) as number) !== K_FRONTMATTER
						? undefined
						: metadata_of(nodes, source, inputs.frontmatter_parse);
			}
			spans = this.spans = take_math();
			// only a document the parser noted a footnote in is looked through
			notes = this.notes = take_footnote()
				? footnotes_of(
						nodes,
						source,
						inputs.footnotes,
						inputs.filename,
						inputs.heading_ids === undefined ? null : take_moved()
					)
				: null;
			// the parser notes each image it makes, so only a document with one
			// is walked, with plugins the walk decides, they make images unseen
			// and a compile a handler starts takes the note
			if (inputs.import_images === true && (take_src() || plugged))
				images = image_imports(nodes, source);
			// the parser notes where the info strings are, only a document with
			// src= or the run flag in one is walked
			const given = inputs.sources;
			if (
				(given !== false || inputs.snippets !== false) &&
				(take_info(source, 'src=', 'run') || plugged)
			)
				shown = fences_of(nodes, source, inputs);
			if (
				kind === Kind.PARSE ||
				(shown !== null &&
					out !== undefined &&
					inputs.await_sources &&
					!sources_met(shown, given as Sources)) ||
				(host !== null && out !== undefined && host.pending !== null)
			) {
				const waiting = new Parsed(raw, source, metadata, nodes);
				waiting.math = waiting._spans = spans;
				waiting._notes = notes;
				if (host !== null) host.wait(waiting, inputs);
				need_images(waiting, images);
				need_sources(waiting, shown);
				// parse_once made its own nodes, no arena of the session holds them
				if (renderer === this.renderer) this.lend(waiting, plugged);
				if (kind === Kind.PARSE) return waiting;
				out!.waiting = waiting;
				return out!;
			}
		} else {
			const waited = parsed._nodes;
			if (waited === null)
				throw new Error('[mdsvex] a parsed document renders once');
			// taken first, so a render that throws leaves no half used document
			parsed._nodes = null;
			nodes = waited;
			source = parsed.source;
			metadata = parsed.metadata;
			images = parsed._images;
			shown = parsed._sources;
			spans = parsed._spans;
			notes = parsed._notes;
			// the next document of the session resets it
			host = parsed._host;
			if (host !== null) unsettled(host, parsed);
			parsed._host = null;
			// a plugin handler renders it, the session renderer has the outer document to come
			if (this.plugin_busy) renderer = new CursorHTMLRenderer({ cache: false });
		}
		let swaps: UrlSwaps | null = images;
		const linked = inputs.links;
		// after the parse of both halves, the filename is that of the render
		if (linked !== undefined)
			swaps = with_images(
				images,
				link_urls(
					linked,
					nodes,
					source,
					inputs.filename,
					images === null ? null : images.lookup
				)
			);
		// a source that is missing or too short throws here, before the renderer is bound
		const fenced =
			shown === null
				? null
				: fence_sources(
						shown,
						inputs.sources as Sources,
						source,
						inputs.filename,
						inputs.snippets
					);
		if (out !== undefined) out.metadata = metadata;
		const template = bind(
			renderer,
			inputs,
			scope,
			directives,
			metadata,
			nodes,
			source
		);
		if (host !== null) host.share(renderer, metadata);

		const math = inputs.math;
		const mathy = math !== undefined && math !== false;
		// the run of a highlighter renders math too, with none a document the
		// parser noted inline math in gets one, a fence alone renders first
		if (mathy) {
			if (renderer.highlight !== null)
				(renderer.highlight as HighlightRun).with_math(math);
			else if (spans) math_run(renderer, math, inputs.filename, source);
		}

		let done:
			| CompileResult
			| CompileV3Result
			| CompileTraceResult
			| TraceTarget;
		if (swaps !== null) {
			add_lines(renderer, swaps.lines);
			renderer.urls = swaps.lookup;
		}
		const smart = inputs.smart_punctuation;
		if (smart !== undefined) renderer.smart_punctuation = smart;
		if (notes !== null) renderer.footnotes = notes;
		// the session keeps its renderer, a render that throws must not leave
		// the imports of this document for the next
		try {
			if (fenced !== null)
				give_fences(renderer, fenced, inputs.filename, source);
			// again only when a math fence rendered as code for want of a run
			do {
				switch (kind) {
					case Kind.INTO: {
						out!.template = template;
						renderer.update_trace_into(
							nodes,
							source,
							out!,
							module_code_of(metadata, host)
						);
						out!.source = source;
						out!.html = renderer.html;
						// the caller clears warnings it took
						done = out!;
						break;
					}
					case Kind.MAPPED: {
						// only a collapsed \r\n changes length, without one raw needs no \r\n scan
						const result = renderer.update_mapped(
							nodes,
							source,
							source.length === raw.length ? null : collapsed_of(raw),
							module_code_of(metadata, host)
						);
						done = {
							code: renderer.html,
							mappings: result.mappings,
							metadata,
							template,
						};
						break;
					}
					case Kind.V3: {
						const file = inputs.filename;
						const module_code = module_code_of(metadata, host);
						// without a collapsed \r\n the records index raw
						if (source.length === raw.length) {
							const map = renderer.update_v3(
								nodes,
								source,
								raw,
								file,
								module_code
							);
							done = { code: renderer.html, map, metadata, template };
							break;
						}
						const result = renderer.update_mapped(
							nodes,
							source,
							collapsed_of(raw),
							module_code
						);
						const code = renderer.html;
						done = {
							code,
							map: mappings_to_v3(result.mappings, raw, code, file),
							metadata,
							template,
						};
						break;
					}
					case Kind.TRACE: {
						const trace = renderer.update_trace(
							nodes,
							source,
							module_code_of(metadata, host)
						);
						done = { code: renderer.html, trace, source, metadata, template };
						break;
					}
					default:
						renderer.update(nodes, source, module_code_of(metadata, host));
						done = { code: renderer.html, metadata, template };
				}
			} while (
				mathy &&
				renderer.highlight === null &&
				take_plain_math() &&
				math_run(renderer, math, inputs.filename, source)
			);
		} finally {
			if (swaps !== null) {
				renderer.imports = undefined;
				renderer.urls = undefined;
			}
			if (fenced !== null) {
				renderer.fences = undefined;
				renderer.imports = undefined;
			}
			// share gave the lines of the data context
			if (host !== null) renderer.imports = undefined;
			if (smart !== undefined) renderer.smart_punctuation = undefined;
			if (notes !== null) renderer.footnotes = undefined;
		}
		if (fenced !== null) done!.snippets = fenced.snippets;
		// one call site for every kind, each more is another callee to inline
		unbind(done!, renderer, source);
		if (notes !== null) footnote_warnings(done!, notes, source);
		if (host !== null) host.leave(done!, out !== undefined);
		if (parsed !== undefined) this.take_back(parsed);
		return done;
	}
}

/** source is the normalized raw the trace and html come from */
export interface TraceTarget extends MapTrace {
	source: string;
	html: string;
	metadata: Metadata | undefined;
	template: string | undefined;
	warnings: CompileWarning[] | undefined;
	/** what plugins left in ctx.data, set by every compile that has plugins */
	data?: PluginData;
	/**
	 * the document when the compile stopped after its parse for want of a
	 * source, see await_sources, nothing else of the target is written then
	 */
	waiting?: Parsed;
	/** the code of the fences that run, set by every compile that has fences to look at */
	snippets?: Snippet[];
	/** what plugins depend on, set by every compile that has plugins */
	dependencies?: string[];
}

// a session keeps its arena at its largest document size, so large documents
// skip the shared session and one whose tree outgrew the cap drops it
const SHARED_SOURCE_CAP = 1 << 19;
const SHARED_CAPACITY_CAP = 1 << 16;

let shared_session: CompilerSession | null = null;
let shared_session_busy = false;

/**
 * without plugins a result holds no reference into the arena, parser or
 * renderer, so small documents can share one session
 */
function render(source: string, options?: CompileOptions): CompileResult {
	if (
		shared_session_busy ||
		source.length > SHARED_SOURCE_CAP ||
		(options !== undefined && has_plugins(options))
	) {
		return render_once(source, options);
	}

	shared_session_busy = true;
	let keep = false;
	try {
		if (shared_session === null) shared_session = new CompilerSession();
		const result = shared_session.compile(source, options);
		keep = shared_session.capacity <= SHARED_CAPACITY_CAP;
		return result;
	} finally {
		// a throw can leave the arena or parser half written, start over
		if (keep) shared_session!.release();
		else shared_session = null;
		shared_session_busy = false;
	}
}

/** a session for each plugins array, what ctx.cached keeps lasts as long as the array */
const async_sessions = new WeakMap<object, CompilerSession>();

function async_session(options: CompileOptions): CompilerSession {
	const key = (options.plugins ?? options.parse_plugins) as object | undefined;
	if (key === undefined) return new CompilerSession();
	let session = async_sessions.get(key);
	if (session === undefined) {
		session = new CompilerSession();
		async_sessions.set(key, session);
	}
	return session;
}

/** settle out of line, the data of the document is whole once the tasks applied */
async function settle_plugins(
	host: PluginHost,
	pending: Promise<void>,
	parsed: Parsed
): Promise<void> {
	await pending;
	host.pending = null;
	parsed.data = host.dispatcher.data();
	parsed.dependencies = host.dispatcher.dependencies();
	rescan(parsed);
}

/** the inputs of a waiting parse, copied as a caller may change them before it settles */
interface Scan {
	images: boolean;
	shows: boolean;
	runs: boolean;
	filename: string | undefined;
}

/** null when the parse looked for nothing settle could add */
function scan_of(inputs: CompileInputs): Scan | null {
	const images = inputs.import_images === true;
	const shows = inputs.sources !== false;
	const runs = inputs.snippets !== false;
	if (!images && !shows && !runs) return null;
	return { images, shows, runs, filename: inputs.filename };
}

/**
 * the images and fences of a settled document, a task or a document hook
 * may have added, changed or removed one, so its needs are made again whole
 */
function rescan(parsed: Parsed): void {
	const scan = parsed._scan;
	const nodes = parsed._nodes;
	parsed._scan = null;
	// dropped while it waited
	if (scan === null || nodes === null) return;
	const source = parsed.source;
	parsed.needs = undefined;
	parsed.snippets = undefined;
	parsed.math = parsed._spans;
	parsed._images = null;
	parsed._sources = null;
	if (scan.images) need_images(parsed, image_imports(nodes, source));
	if (scan.shows || scan.runs)
		need_sources(
			parsed,
			source_fences(nodes, source, scan.filename, scan.shows, scan.runs)
		);
}

/**
 * compile for a document whose plugins wait, for work they defer, the same
 * result as compile once that work applied, a document whose plugins defer
 * nothing compiles as compile does, safe in a browser
 *
 * session holds what ctx.cached loads, a host that watches passes its own and
 * calls its invalidate when a dependency changes, without one the loads are
 * kept for as long as the plugins array is
 *
 * @example
 * const { code, data } = await compile_async(source, { plugins: [citations()] });
 * session.invalidate(changed);
 * await compile_async(source, options, session);
 */
export async function compile_async(
	source: string,
	options?: CompileOptions,
	session?: CompilerSession
): Promise<CompileResult> {
	if (
		options === undefined ||
		(!has_plugins(options) &&
			(options.read === undefined || options.resolve === undefined))
	)
		return render(source, options);
	session ??= async_session(options);
	const inputs = inputs_of(options);
	const parsed = session.parse(source, inputs);
	let read: string[] | undefined;
	try {
		await session.settle(parsed);
		// with a reader and a resolver the files fences show are read here
		if (options.read !== undefined && options.resolve !== undefined)
			read = await read_sources(parsed, inputs, options);
	} catch (e) {
		session.drop(parsed);
		throw e;
	}
	const result = session.render(parsed, inputs, options.sourcemap);
	if (options.resolve !== undefined)
		await own_dependencies(result, read, options);
	return result;
}

/** reads each file a fence shows that sources lacks, the paths it read */
async function read_sources(
	parsed: Parsed,
	inputs: CompileInputs,
	options: CompileOptions
): Promise<string[] | undefined> {
	const given = options.sources;
	const needs = parsed.needs;
	if (given === false || needs === undefined) return undefined;
	const resolve = options.resolve!;
	const read = options.read!;
	const sources: Record<string, string> = { ...given };
	const paths: string[] = [];
	await Promise.all(
		needs.map(async (need) => {
			if (need.type !== 'source' || need.spec in sources) return;
			const path = await resolve(need.spec, options.filename);
			// a file it can not find throws the SourceError of the render
			if (path == null) return;
			sources[need.spec] = await read(path);
			paths.push(path);
		})
	);
	if (paths.length === 0) return undefined;
	inputs.sources = sources;
	return paths;
}

/** the files the compile read and the module of its template join what plugins depend on */
async function own_dependencies(
	result: CompileResult,
	read: string[] | undefined,
	options: CompileOptions
): Promise<void> {
	const deps = new Set(result.dependencies);
	if (read !== undefined) for (const path of read) deps.add(path);
	const name = result.template;
	const entry = name === undefined ? undefined : options.templates?.[name];
	if (entry !== undefined) {
		const path = await options.resolve!(entry.specifier, options.filename);
		if (path != null) deps.add(path);
	}
	if (deps.size !== 0) result.dependencies = [...deps];
}

/** @internal for tests */
export function _shared_session(): CompilerSession | null {
	return shared_session;
}

/** normalized offsets of each \n that was \r\n in raw, null when none */
function collapsed_of(raw: string): number[] | null {
	// normalize_newlines just split raw, its lines give the offsets
	const taken = take_collapsed(raw);
	if (taken !== undefined) return taken;
	const offsets = raw_offsets(raw);
	return offsets === null ? null : offsets.collapsed;
}

export { render as compile };
