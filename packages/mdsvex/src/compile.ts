// browsers bundle this entry whole, so it never imports vite, the lexer or node builtins

import {
	PFMParser,
	PluginDispatcher,
	SourceTextSource,
	normalize_newlines,
	raw_offsets,
	take_collapsed,
} from '@mdsvex/parse';
import type { ParsePlugin } from '@mdsvex/parse';
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

export type { ParsePlugin } from '@mdsvex/parse';
export type { Mapping, MappingData, SourceMapV3, MapTrace };
export type { ComponentSource };
export type { FrontmatterOptions };
export { FrontmatterError } from './frontmatter';
export { DirectiveError } from '@mdsvex/render/html-cursor';

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

/** an element component_mode all kept because a component can not take its directive */
export interface CompileWarning {
	code: 'element_directive';
	message: string;
	/** the element, line from 1 and column from 0, which hold in the raw source */
	start: { line: number; column: number };
}

export interface CompileOptions extends TemplateOptions {
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

/** a compile renders every directive as a component or throws, unless strict is false */
function bind_scopes(
	renderer: CursorHTMLRenderer,
	scope: ComponentScope | null,
	directives: ComponentScope | null,
	strict = true
): void {
	renderer.scope = scope;
	renderer.directives = directives;
	renderer.strict_directives = strict;
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
	directives: ComponentScope | null
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

/**
 * the scope prepare left decides, so a template scope replaces typed html too,
 * a render without one stores nothing
 */
function arm(renderer: CursorHTMLRenderer, mode: ComponentMode | undefined) {
	if (renderer.scope !== null) renderer.replace_typed = mode === 'all';
}

/** only a render with a scope sets renderer warnings, the offsets index source */
function add_warnings(
	result: { warnings?: CompileWarning[] },
	renderer: CursorHTMLRenderer,
	source: string
): void {
	const scope = renderer.scope;
	if (scope === null || scope.size === 0) return;
	const list = renderer.warnings;
	if (list.length === 0) return;
	result.warnings = list.map(({ tag, directive, start }) => {
		const line_start = source.lastIndexOf('\n', start - 1) + 1;
		let line = 1;
		for (
			let i = source.indexOf('\n');
			i !== -1 && i < start;
			i = source.indexOf('\n', i + 1)
		)
			line++;
		return {
			code: 'element_directive',
			message: `<${tag}> stays an element, a component can't take ${directive}`,
			start: { line, column: start - line_start },
		};
	});
}

function module_code_of(metadata: Metadata | undefined): string | undefined {
	return metadata === undefined ? undefined : metadata_export(metadata);
}

function render_once(raw: string, options?: CompileOptions): CompileResult {
	// parser offsets index the normalized string, so render and plugins read it too
	const source = normalize_newlines(raw);
	const scope = scope_of(options?.components, options?.component_mode);
	const directives = directive_scope_of(options?.directives);
	const nodes = parse_once(
		source,
		options?.parse_plugins,
		reserved_directives(directives, options)
	);
	const metadata = metadata_of(nodes, source, options?.frontmatter?.parse);
	const renderer = take_renderer();
	bind_scopes(renderer, scope, directives, options?.strict_directives);
	let template: string | undefined;
	if (metadata !== undefined || picks_template(options)) {
		try {
			template = prepare(renderer, scope, metadata, options, nodes, source);
		} catch (e) {
			give_renderer(renderer);
			throw e;
		}
	}
	arm(renderer, options?.component_mode);

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
		add_warnings(done, renderer, source);
		give_renderer(renderer);
		return done;
	}

	renderer.update(nodes, source, module_code_of(metadata));
	const done: CompileResult = { code: renderer.html, metadata, template };
	add_warnings(done, renderer, source);
	give_renderer(renderer);
	return done;
}

function render_v3(
	renderer: CursorHTMLRenderer,
	nodes: NodeBuffer,
	source: string,
	raw: string,
	file: string | undefined,
	parse: FrontmatterParse,
	scope: ComponentScope | null,
	directives: ComponentScope | null,
	templates: TemplateOptions | undefined,
	mode: ComponentMode | undefined
): CompileV3Result {
	const metadata = metadata_of(nodes, source, parse);
	bind_scopes(renderer, scope, directives);
	const template = prepare(renderer, scope, metadata, templates, nodes, source);
	arm(renderer, mode);
	const module_code = module_code_of(metadata);
	// only a collapsed \r\n changes length, without one the records index raw
	if (source.length === raw.length) {
		const map = renderer.update_v3(nodes, source, raw, file, module_code);
		const done: CompileV3Result = {
			code: renderer.html,
			map,
			metadata,
			template,
		};
		add_warnings(done, renderer, source);
		return done;
	}
	const result = renderer.update_mapped(
		nodes,
		source,
		collapsed_of(raw),
		module_code
	);
	const code = renderer.html;
	const done: CompileV3Result = {
		code,
		map: mappings_to_v3(result.mappings, raw, code, file),
		metadata,
		template,
	};
	add_warnings(done, renderer, source);
	return done;
}

function render_trace(
	renderer: CursorHTMLRenderer,
	nodes: NodeBuffer,
	source: string,
	parse: FrontmatterParse,
	scope: ComponentScope | null,
	directives: ComponentScope | null,
	templates: TemplateOptions | undefined,
	mode: ComponentMode | undefined
): CompileTraceResult {
	const metadata = metadata_of(nodes, source, parse);
	bind_scopes(renderer, scope, directives);
	const template = prepare(renderer, scope, metadata, templates, nodes, source);
	arm(renderer, mode);
	const trace = renderer.update_trace(nodes, source, module_code_of(metadata));
	const done: CompileTraceResult = {
		code: renderer.html,
		trace,
		source,
		metadata,
		template,
	};
	add_warnings(done, renderer, source);
	return done;
}

/**
 * Reusable no-plugin compiler for sequential documents.
 *
 * The arena remains private so resetting it can never mutate an AST held by a
 * caller. Parse plugins retain the one-shot path because their dispatcher owns
 * a source-specific text view.
 */
export class CompilerSession {
	private tree: TreeBuilder | null = null;
	private parser: PFMParser | null = null;
	private renderer = new CursorHTMLRenderer({ cache: false });
	// release already reset the arena, so the next compile can skip it
	private released = false;

	/** @internal */
	get capacity(): number {
		return this.tree === null ? 0 : this.tree.get_buffer()._capacity;
	}

	private parse(source: string): NodeBuffer {
		if (this.tree === null) {
			this.tree = new TreeBuilder(source.length >> 3 || 16);
			this.parser = new PFMParser(this.tree);
		} else if (!this.released) {
			this.tree.reset();
		}
		this.released = false;

		this.parser!.parse_normalized(source);
		return this.tree.get_buffer();
	}

	compile(raw: string, options?: CompileOptions): CompileResult {
		if (options?.parse_plugins && options.parse_plugins.length > 0) {
			return render_once(raw, options);
		}

		const scope = scope_of(options?.components, options?.component_mode);
		const directives = directive_scope_of(options?.directives);
		const source = normalize_newlines(raw);
		const nodes = this.parse(source);
		const metadata = metadata_of(nodes, source, options?.frontmatter?.parse);
		bind_scopes(this.renderer, scope, directives, options?.strict_directives);
		const template =
			metadata === undefined && !picks_template(options)
				? undefined
				: prepare(this.renderer, scope, metadata, options, nodes, source);
		arm(this.renderer, options?.component_mode);
		if (options?.sourcemap) {
			const result = this.renderer.update_mapped(
				nodes,
				source,
				source.length === raw.length ? null : collapsed_of(raw),
				module_code_of(metadata)
			);
			const done: CompileResult = {
				code: this.renderer.html,
				mappings: result.mappings,
				metadata,
				template,
			};
			add_warnings(done, this.renderer, source);
			return done;
		}

		this.renderer.update(nodes, source, module_code_of(metadata));
		const done: CompileResult = {
			code: this.renderer.html,
			metadata,
			template,
		};
		add_warnings(done, this.renderer, source);
		return done;
	}

	/** @internal keeps only typed arrays so an idle session holds no document */
	release(): void {
		if (this.tree !== null) {
			this.tree.reset();
			this.parser!.release();
			this.released = true;
		}
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
		mode?: ComponentMode
	): CompileV3Result {
		const scope = components === undefined ? null : scope_of(components, mode);
		const directives = directive_scope_of(directive_sources);
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			// the dispatcher holds this source, so plugins get their own tree
			const nodes = parse_once(
				source,
				parse_plugins,
				reserved_directives(directives, templates)
			);
			const renderer = new CursorHTMLRenderer({ cache: false });
			return render_v3(
				renderer,
				nodes,
				source,
				raw,
				file,
				parse,
				scope,
				directives,
				templates,
				mode
			);
		}
		const nodes = this.parse(source);
		return render_v3(
			this.renderer,
			nodes,
			source,
			raw,
			file,
			parse,
			scope,
			directives,
			templates,
			mode
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
		mode?: ComponentMode
	): CompileTraceResult {
		const scope = components === undefined ? null : scope_of(components, mode);
		const directives = directive_scope_of(directive_sources);
		const source = normalize_newlines(raw);
		if (parse_plugins && parse_plugins.length > 0) {
			const nodes = parse_once(
				source,
				parse_plugins,
				reserved_directives(directives, templates)
			);
			const renderer = new CursorHTMLRenderer({ cache: false });
			return render_trace(
				renderer,
				nodes,
				source,
				parse,
				scope,
				directives,
				templates,
				mode
			);
		}
		const nodes = this.parse(source);
		return render_trace(
			this.renderer,
			nodes,
			source,
			parse,
			scope,
			directives,
			templates,
			mode
		);
	}

	/**
	 * compile_trace without result objects, the trace goes into out
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
		mode?: ComponentMode
	): void {
		const scope = components === undefined ? null : scope_of(components, mode);
		const directives = directive_scope_of(directive_sources);
		const source = normalize_newlines(raw);
		let renderer = this.renderer;
		let nodes: NodeBuffer;
		if (parse_plugins && parse_plugins.length > 0) {
			nodes = parse_once(
				source,
				parse_plugins,
				reserved_directives(directives, templates)
			);
			renderer = new CursorHTMLRenderer({ cache: false });
		} else {
			nodes = this.parse(source);
		}
		const metadata = metadata_of(nodes, source, parse);
		out.metadata = metadata;
		bind_scopes(renderer, scope, directives);
		// only options or frontmatter pick a template
		out.template =
			templates === undefined && metadata === undefined
				? undefined
				: prepare(renderer, scope, metadata, templates, nodes, source);
		arm(renderer, mode);
		renderer.update_trace_into(nodes, source, out, module_code_of(metadata));
		out.source = source;
		out.html = renderer.html;
		// the caller clears warnings it took
		add_warnings(out, renderer, source);
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
