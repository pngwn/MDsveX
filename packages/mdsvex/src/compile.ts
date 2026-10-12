// browsers bundle this entry whole, so it never imports vite, the lexer or node builtins

import {
	PFMParser,
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
import { take_info } from '@mdsvex/parse/utils';
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
} from './frontmatter';
import type { FrontmatterOptions } from './frontmatter';
import { PLUGIN_DATA_EXPORT, plugin_data_export } from './plugin_data';
import type { PluginData } from './plugin_data';
import { scope_of } from './root_scope';
import { highlight_run, plain_run } from './highlight_run';
export { highlight_error_at, MathError } from './highlight_run';
import type {
	HighlightOption,
	HighlightRun,
	HighlightWarning,
	MathOption,
	MathRenderer,
} from './highlight_run';
import { assign_heading_ids, slug_of } from './heading_ids';
import type { HeadingOptions, HeadingSlug } from './heading_ids';
import { image_imports } from './image_imports';
import type { ImageImports, ImageNeed } from './image_imports';
import { link_urls, links_of, with_images } from './link_urls';
import type { LinkOptions, Links, Rewrite } from './link_urls';
import { fence_sources, source_fences, sources_met } from './fence_sources';
import type { SourceFences, SourceNeed } from './fence_sources';

export type {
	DirectiveContext,
	DirectiveEntry,
	DirectiveHandler,
	NodeView,
	ParsePlugin,
	PluginContext,
	SyntaxOptions,
	WrapperView,
} from '@mdsvex/parse';
export type { Mapping, MappingData, SourceMapV3, MapTrace };
export type { ComponentSource };
export type { FrontmatterOptions };
export { FrontmatterError } from './frontmatter';
export { PluginDataError } from './plugin_data';
export { fence_meta } from './code_meta';
export type { FenceMeta, MetaInfo } from './code_meta';
export type { PluginData };
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
} from './highlight_run';
export { heading_slug } from './heading_ids';
export type { ImageNeed } from './image_imports';
export { SourceError } from './fence_sources';
export type { SourceErrorCode, SourceNeed } from './fence_sources';
export type {
	BaseImport,
	LinkOptions,
	Rewrite,
	RewriteContext,
} from './link_urls';
export type {
	HeadingIdsOptions,
	HeadingInfo,
	HeadingOptions,
	HeadingSlug,
} from './heading_ids';

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
	extends TemplateOptions, SyntaxOptions, HeadingOptions {
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
	/** the document, highlighters, math renderers and their errors see it */
	filename?: string;
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
}

/**
 * @internal what a compile reads apart from the document, a caller with
 * many documents keeps one and stores the fields that change, never while
 * a compile runs
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
	math: MathOption | undefined;
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
}

/** @internal every inputs object comes from here, so they share one shape */
export function compile_inputs(): CompileInputs {
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
		math: undefined,
		import_images: undefined,
		links: undefined,
		sources: undefined,
		await_sources: false,
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
	const math = options.math;
	const import_images = options.import_images;
	const rewrite = options.rewrite;
	const links = options.links;
	const sources = options.sources;
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
		math === undefined &&
		import_images === undefined &&
		rewrite === undefined &&
		links === undefined &&
		sources === undefined
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
	inputs.math = math;
	inputs.import_images = import_images;
	if (rewrite !== undefined || links !== undefined)
		inputs.links = links_of(rewrite, links);
	inputs.sources = sources;
	return inputs;
}

/** the options the positional entry points take as one trailing object */
type PositionalOptions = SyntaxOptions &
	HeadingOptions &
	Pick<CompileOptions, 'import_images'>;

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
		inputs.import_images = syntax.import_images;
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
	private source = '';
	private parse: FrontmatterParse = undefined;
	private read = false;
	private metadata: Metadata | undefined = undefined;
	/** the export of what the handlers left, undefined when they left nothing */
	private exported: string | undefined = undefined;

	constructor(dispatcher: PluginDispatcher) {
		this.dispatcher = dispatcher;
		this.frontmatter = () => this.read_frontmatter();
	}

	/** before each parse, after a reset, which makes the dispatcher forget its document */
	start(source: string, inputs: CompileInputs): void {
		this.source = source;
		this.filename = inputs.filename;
		this.parse = inputs.frontmatter_parse;
		this.read = false;
		this.metadata = undefined;
		this.exported = undefined;
		this.dispatcher.set_document(this);
	}

	/** parsed once, for the first handler that asks or for the compile after the parse */
	private read_frontmatter(): Metadata | undefined {
		if (this.read) return this.metadata;
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
		this.read = true;
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

	/** a document that waits for its render, the dispatcher holds what they left until then */
	wait(parsed: Parsed): void {
		parsed._host = this;
		parsed.data = this.dispatcher.data();
	}

	/**
	 * gives a result what the handlers left, their warnings ahead of those of
	 * the render, a target that is kept loses the data of its last document
	 */
	leave(
		result: { warnings?: CompileWarning[]; data?: PluginData },
		kept: boolean
	): void {
		const data = this.dispatcher.data();
		if (data !== undefined || kept) result.data = data;
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
	inputs: CompileInputs
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
		host.start(source, inputs);
	}
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
	// fused plugins set their ids before this, sequential ones read them after
	const slug = inputs.heading_ids;
	if (slug !== undefined) assign_heading_ids(nodes, source, slug);
	if (host !== null) {
		host.dispatcher.run_sequential(nodes);
	}
	nodes.trim();
	return nodes;
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
 * a search, this gives the renderer a run for math to render again with
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
	const nodes = parse_once(source, host, inputs);
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
		given !== false &&
		(take_info(source, 'src=') ||
			inputs.parse_plugins !== undefined ||
			inputs.directive_handlers !== undefined)
			? source_fences(nodes, source, inputs.filename)
			: null;
	const fenced =
		shown === null
			? null
			: fence_sources(shown, given as Sources, source, inputs.filename);
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
	if (mathy && renderer.highlight !== null)
		(renderer.highlight as HighlightRun).with_math(math);
	// give_renderer clears these, a throw drops the renderer
	if (images !== null) {
		renderer.imports = images.lines;
		renderer.urls = images.lookup;
	}
	if (fenced !== null) renderer.fences = fenced;

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
		unbind(done, renderer, source);
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
	unbind(done, renderer, source);
	if (host !== null) host.leave(done, false);
	give_renderer(renderer);
	return done;
}

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
 * @internal a document between its parse and its render, it owns its nodes,
 * so the session compiles other documents while this one waits, a render
 * uses it up
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
	 * the parse turned on is looked for
	 */
	needs: readonly Need[] | undefined = undefined;
	/** @internal the imports the needs of type image render with */
	_images: ImageImports | null = null;
	/** @internal the fences the needs of type source are for */
	_sources: SourceFences | null = null;
	/** true when the document shows a file and has a math fence, a caller that loads the math renderer late loads it first */
	math = false;
	/** @internal null once a render took them */
	_nodes: NodeBuffer | null;
	/** @internal the plain arena of the session, lent until the render */
	_tree: TreeBuilder | null = null;
	/** @internal the plugin arena of the session, lent until the render */
	_arena: PluginArena | null = null;
	/** what plugins left in ctx.data, by plugin name, undefined when none left any */
	data: PluginData | undefined = undefined;
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
	private parser: PFMParser | null = null;
	private renderer = new CursorHTMLRenderer({ cache: false });
	// release already reset the arena, so the next compile can skip it
	private released = false;
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

		this.parser!.set_options(inputs);
		this.parser!.parse_normalized(source);
		const nodes = tree.get_buffer();
		const slug = inputs.heading_ids;
		if (slug !== undefined) assign_heading_ids(nodes, source, slug);
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
		inputs: CompileInputs
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
		arena.host.start(source, inputs);

		this.plugin_busy = true;
		let done = false;
		try {
			arena.parser.set_options(inputs);
			arena.parser.parse_normalized(source);
			const nodes = arena.tree.get_buffer();
			const slug = inputs.heading_ids;
			if (slug !== undefined) assign_heading_ids(nodes, source, slug);
			arena.dispatcher.run_sequential(nodes);
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
	 * @internal the first half of a compile, the parse plugins and syntax
	 * options of inputs apply here, the document then waits in the Parsed
	 * while its caller fetches what the render needs
	 */
	parse(raw: string, inputs: CompileInputs): Parsed {
		return this.run(raw, inputs, Kind.PARSE, undefined, undefined);
	}

	/**
	 * @internal the second half, inputs are read again, so a caller that
	 * shares one inputs object between documents stores the fields of this
	 * document before it calls, as it does before a compile
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
		if (plugged) this.plugin_arena!.host.wait(parsed);
		if (inputs.import_images === true)
			this.need_images(parsed, image_imports(nodes, source));
		if (inputs.sources !== false)
			this.need_sources(parsed, source_fences(nodes, source, inputs.filename));
		return this.lend(parsed, plugged);
	}

	private need_images(parsed: Parsed, images: ImageImports | null): void {
		if (images === null) return;
		parsed._images = images;
		parsed.needs = images.needs;
	}

	private need_sources(parsed: Parsed, shown: SourceFences | null): void {
		if (shown === null) return;
		parsed._sources = shown;
		parsed.math = shown.math;
		const needs = parsed.needs;
		parsed.needs =
			needs === undefined ? shown.needs : [...needs, ...shown.needs];
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
				if (this.plugin_busy) {
					// started in a plugin handler, the session holds the outer document
					host = host_once(source, plugins, bound, reserved)!;
					nodes = parse_once(source, host, inputs);
					renderer = new CursorHTMLRenderer({ cache: false });
				} else {
					nodes = this.parse_plugged(source, plugins, bound, reserved, inputs);
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
			// the parser notes each image it makes, so only a document with one
			// is walked, with plugins the walk decides, they make images unseen
			// and a compile a handler starts takes the note
			if (inputs.import_images === true && (take_src() || plugged))
				images = image_imports(nodes, source);
			// the parser notes where the info strings are, only a document with
			// src= in one is walked
			const given = inputs.sources;
			if (given !== false && (take_info(source, 'src=') || plugged))
				shown = source_fences(nodes, source, inputs.filename);
			if (
				kind === Kind.PARSE ||
				(shown !== null &&
					out !== undefined &&
					inputs.await_sources &&
					!sources_met(shown, given as Sources))
			) {
				const waiting = new Parsed(raw, source, metadata, nodes);
				if (host !== null) host.wait(waiting);
				this.need_images(waiting, images);
				this.need_sources(waiting, shown);
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
			// the next document of the session resets it
			host = parsed._host;
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
						inputs.filename
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
		// the run of a highlighter renders math fences too
		if (mathy && renderer.highlight !== null)
			(renderer.highlight as HighlightRun).with_math(math);

		let done:
			| CompileResult
			| CompileV3Result
			| CompileTraceResult
			| TraceTarget;
		if (swaps !== null) {
			renderer.imports = swaps.lines;
			renderer.urls = swaps.lookup;
		}
		if (fenced !== null) renderer.fences = fenced;
		// the session keeps its renderer, a render that throws must not leave
		// the imports of this document for the next
		try {
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
			if (fenced !== null) renderer.fences = undefined;
		}
		// one call site for every kind, each more is another callee to inline
		unbind(done!, renderer, source);
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
