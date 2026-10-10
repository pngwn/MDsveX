// browsers bundle this entry whole, so it never imports vite, the lexer or node builtins

import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	normalize_newlines,
	raw_offsets,
	take_collapsed,
} from '@mdsvex/parse';
import type { ParsePlugin, SyntaxOptions } from '@mdsvex/parse';
import { TreeBuilder } from '@mdsvex/parse/tree-builder';
import type { NodeBuffer } from '@mdsvex/parse/utils';
import {
	ComponentScope,
	CursorHTMLRenderer,
	K_FRONTMATTER,
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
import { scope_of } from './root_scope';
import { highlight_run, plain_run } from './highlight_run';
export { highlight_error_at } from './highlight_run';
import type {
	HighlightOption,
	HighlightRun,
	HighlightWarning,
} from './highlight_run';

export type { ParsePlugin, SyntaxOptions } from '@mdsvex/parse';
export type { Mapping, MappingData, SourceMapV3, MapTrace };
export type { ComponentSource };
export type { FrontmatterOptions };
export { FrontmatterError } from './frontmatter';
export { DirectiveError } from '@mdsvex/render/html-cursor';
export type {
	CodeInfo,
	Highlighter,
	HighlightConfig,
	HighlightOption,
	HighlightWarning,
} from './highlight_run';

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
 * can not take its directive, the rest come from highlighting
 */
export interface CompileWarning {
	code: 'element_directive' | HighlightWarning;
	message: string;
	/** the element or code, line from 1 and column from 0, which hold in the raw source */
	start: { line: number; column: number };
}

export interface CompileOptions extends TemplateOptions, SyntaxOptions {
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
	/** the document, highlighters and highlight errors see it */
	filename?: string;
}

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
}

/**
 * @internal what a compile reads apart from the document, a caller with
 * many documents keeps one and stores the fields that change, never while
 * a compile runs
 */
export interface CompileInputs {
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
}

/** @internal every inputs object comes from here, so they share one shape */
export function compile_inputs(): CompileInputs {
	return {
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
	const plugins = options.parse_plugins;
	const components = options.components;
	const directives = options.directives;
	const parse = options.frontmatter?.parse;
	const templates = picks_template(options) ? options : undefined;
	const highlight = options.highlight;
	const filename = options.filename;
	const unwrap_images = options.unwrap_images;
	// options that set none need no inputs of their own
	if (
		plugins === undefined &&
		components === undefined &&
		directives === undefined &&
		mode === undefined &&
		parse === undefined &&
		templates === undefined &&
		strict === undefined &&
		highlight === undefined &&
		filename === undefined &&
		unwrap_images === undefined
	)
		return no_inputs;
	const inputs = compile_inputs();
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
	return inputs;
}

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
	syntax: SyntaxOptions | undefined
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
	if (syntax !== undefined) inputs.unwrap_images = syntax.unwrap_images;
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

/**
 * a directive a component replaces never reaches the directive handlers of
 * a plugin, which then run at the close where the parser has set the name
 */
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
					const name = node.attrs.name;
					if (typeof name === 'string')
						return scope.get(name) === undefined ? parse(node, ctx) : undefined;
					// the parser sets the name after the open, the close sees it
					return () => {
						if (scope.get(node.attrs.name) !== undefined) return;
						const close = parse(node, ctx);
						if (close) close();
					};
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

function parse_once(
	source: string,
	plugins: ParsePlugin[] | undefined,
	directives: ComponentScope | null,
	syntax: SyntaxOptions | undefined
): NodeBuffer {
	let dispatcher: PluginDispatcher | undefined;
	if (plugins && plugins.length > 0) {
		const text_source = new SourceTextSource(source);
		dispatcher = new PluginDispatcher(
			guard_plugins(plugins, directives),
			text_source
		);
	}

	// short documents are denser in nodes and a small buffer is only a slab
	// carve, so size generously to skip a resize
	const len = source.length;
	const tree = new TreeBuilder(
		len < 512 ? (len >> 2) + 16 : len >> 3,
		dispatcher
	);
	let parser = spare_parser;
	if (parser === null) parser = new PFMParser(tree);
	else {
		spare_parser = null;
		parser.bind(tree);
	}
	parser.set_options(syntax);
	parser.parse_normalized(source);
	// a throw above drops the parser, it may be half written
	parser.release();
	spare_parser = parser;

	const nodes = tree.get_buffer();
	if (dispatcher) {
		dispatcher.run_sequential(nodes);
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

function module_code_of(metadata: Metadata | undefined): string | undefined {
	return metadata === undefined ? undefined : metadata_export(metadata);
}

function render_once(raw: string, options?: CompileOptions): CompileResult {
	const inputs = options === undefined ? no_inputs : inputs_of(options);
	// parser offsets index the normalized string, so render and plugins read it too
	const source = normalized(raw);
	const scope = root_scope(inputs);
	const directives = directive_scope_of(inputs.directives);
	const nodes = parse_once(
		source,
		inputs.parse_plugins,
		reserved_directives(directives, inputs.templates),
		inputs
	);
	const metadata = metadata_of(nodes, source, inputs.frontmatter_parse);
	const renderer = take_renderer();
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
	} catch (e) {
		give_renderer(renderer);
		throw e;
	}

	if (options?.sourcemap) {
		// only a collapsed \r\n changes length, without one raw needs no \r\n scan
		const result = renderer.update_mapped(
			nodes,
			source,
			source.length === raw.length ? null : collapsed_of(raw),
			module_code_of(metadata)
		);
		const done: CompileResult = {
			code: renderer.html,
			mappings: result.mappings,
			metadata,
			template,
		};
		unbind(done, renderer, source);
		give_renderer(renderer);
		return done;
	}

	renderer.update(nodes, source, module_code_of(metadata));
	const done: CompileResult = { code: renderer.html, metadata, template };
	unbind(done, renderer, source);
	give_renderer(renderer);
	return done;
}

// what a session compile hands back, local so the cases of run build to literals
const enum Kind {
	PLAIN,
	MAPPED,
	V3,
	TRACE,
	INTO,
}

/** the tree, parser and dispatcher a session keeps for one plugins array */
interface PluginArena {
	plugins: ParsePlugin[];
	/** the reserved directives the plugins were guarded with */
	reserved: ComponentScope | null;
	text: SourceTextSource;
	dispatcher: PluginDispatcher;
	tree: TreeBuilder;
	parser: PFMParser;
}

/**
 * reusable compiler for sequential documents
 *
 * the arena stays private so a reset never mutates an ast a caller holds,
 * documents with parse plugins get an arena of their own that is kept while
 * parse_plugins is the same array, the plugins are read when it is built, a
 * NodeView a plugin keeps throws once the session starts the next document
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
	private parse(source: string, syntax: SyntaxOptions | undefined): NodeBuffer {
		if (this.tree === null) {
			this.tree = new TreeBuilder(source.length >> 3 || 16);
			this.parser = new PFMParser(this.tree);
		} else if (!this.released) {
			this.tree.reset();
		}
		this.released = false;

		this.parser!.set_options(syntax);
		this.parser!.parse_normalized(source);
		return this.tree.get_buffer();
	}

	/** callers check plugin_busy first, the arena holds one document at a time */
	private parse_plugged(
		source: string,
		plugins: ParsePlugin[],
		reserved: ComponentScope | null,
		syntax: SyntaxOptions | undefined
	): NodeBuffer {
		let arena = this.plugin_arena;
		if (
			arena === null ||
			arena.plugins !== plugins ||
			arena.reserved !== reserved
		) {
			const text = new SourceTextSource(source);
			const dispatcher = new PluginDispatcher(
				guard_plugins(plugins, reserved),
				text
			);
			const tree = new TreeBuilder(source.length >> 3 || 16, dispatcher);
			// the parser outlives the plugins, options that alternate rebuild often
			let parser: PFMParser;
			if (arena === null) parser = new PFMParser(tree);
			else {
				parser = arena.parser;
				parser.bind(tree);
			}
			arena = this.plugin_arena = {
				plugins,
				reserved,
				text,
				dispatcher,
				tree,
				parser,
			};
		} else {
			arena.text.set_source(source);
			arena.tree.reset();
		}

		this.plugin_busy = true;
		let done = false;
		try {
			arena.parser.set_options(syntax);
			arena.parser.parse_normalized(source);
			const nodes = arena.tree.get_buffer();
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
			return this.run(raw, no_inputs, Kind.PLAIN, undefined);
		const plugins = options.parse_plugins;
		// started in a plugin handler, the session holds the outer document
		if (this.plugin_busy && plugins && plugins.length > 0) {
			return render_once(raw, options);
		}
		return this.run(
			raw,
			inputs_of(options),
			options.sourcemap ? Kind.MAPPED : Kind.PLAIN,
			undefined
		);
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
		syntax?: SyntaxOptions
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
		syntax?: SyntaxOptions
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
			undefined
		);
	}

	/**
	 * compile_trace without result objects, the trace goes into out, the vite
	 * plugin keeps one inputs object for every document
	 * @internal
	 */
	compile_into(raw: string, inputs: CompileInputs, out: TraceTarget): void {
		this.run(raw, inputs, Kind.INTO, out);
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
		syntax?: SyntaxOptions
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
			out
		);
	}

	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.PLAIN | Kind.MAPPED,
		out: undefined
	): CompileResult;
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.V3,
		out: undefined
	): CompileV3Result;
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.TRACE,
		out: undefined
	): CompileTraceResult;
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind.INTO,
		out: TraceTarget
	): TraceTarget;
	/**
	 * every compile of the session, kind picks the render and what comes
	 * back, out takes an into compile, at this size v8 never inlines it, so
	 * its inline budget goes to the parse and bind calls and the entry points
	 * above inline into their callers
	 */
	private run(
		raw: string,
		inputs: CompileInputs,
		kind: Kind,
		out: TraceTarget | undefined
	): CompileResult | CompileV3Result | CompileTraceResult | TraceTarget {
		const scope = root_scope(inputs);
		const directives = directive_scope_of(inputs.directives);
		// parser offsets index the normalized string, so render and plugins read it too
		const source = normalized(raw);
		const plugins = inputs.parse_plugins;
		let renderer = this.renderer;
		let nodes: NodeBuffer;
		if (plugins && plugins.length > 0) {
			const reserved = reserved_directives(directives, inputs.templates);
			if (this.plugin_busy) {
				// started in a plugin handler, the session holds the outer document
				nodes = parse_once(source, plugins, reserved, inputs);
				renderer = new CursorHTMLRenderer({ cache: false });
			} else nodes = this.parse_plugged(source, plugins, reserved, inputs);
		} else {
			nodes = this.parse(source, inputs);
		}
		const metadata = metadata_of(nodes, source, inputs.frontmatter_parse);
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

		let done:
			| CompileResult
			| CompileV3Result
			| CompileTraceResult
			| TraceTarget;
		switch (kind) {
			case Kind.INTO: {
				out!.template = template;
				renderer.update_trace_into(
					nodes,
					source,
					out!,
					module_code_of(metadata)
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
					module_code_of(metadata)
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
				const module_code = module_code_of(metadata);
				// without a collapsed \r\n the records index raw
				if (source.length === raw.length) {
					const map = renderer.update_v3(nodes, source, raw, file, module_code);
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
					module_code_of(metadata)
				);
				done = { code: renderer.html, trace, source, metadata, template };
				break;
			}
			default:
				renderer.update(nodes, source, module_code_of(metadata));
				done = { code: renderer.html, metadata, template };
		}
		// one call site for every kind, each more is another callee to inline
		unbind(done, renderer, source);
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
		(options?.parse_plugins && options.parse_plugins.length > 0)
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
