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
import {
	chain_trace,
	mapped_source_lines,
	mappings_to_v3,
	trace_to_decoded,
	trace_to_v3,
} from '@mdsvex/render/sourcemap';
import type { Mapping, MappingData } from '@mdsvex/render/mappings';
import type {
	DecodedSourceMapV3,
	MapTrace,
	SourceMapV3,
} from '@mdsvex/render/sourcemap';
import type { Plugin, PluginOption, Rollup } from 'vite';
import { scan_exports_detail } from './scan_exports';
import type { ScannedExports } from './scan_exports';
import remapping from '@ampproject/remapping';
import {
	FrontmatterError,
	key_line,
	metadata_export,
	parse_frontmatter,
} from './frontmatter';
import type { FrontmatterOptions } from './frontmatter';
import { MANIFEST_VERSION, manifest_writer } from './manifest';
import type {
	ManifestModule,
	ManifestTemplate,
	MdsvexManifest,
} from './manifest';

export type { ParsePlugin } from '@mdsvex/parse';
export type { Mapping, MappingData, SourceMapV3, MapTrace };
export type { ComponentSource };
export {
	scan_exports,
	scan_exports_detail,
	module_script,
} from './scan_exports';
export type { ScanKind, ScannedExports } from './scan_exports';
export type { FrontmatterOptions };
export { FrontmatterError } from './frontmatter';
export { MANIFEST_PATH, MANIFEST_VERSION } from './manifest';
export type {
	ManifestModule,
	ManifestTemplate,
	MdsvexManifest,
} from './manifest';
export { DirectiveError } from '@mdsvex/render/html-cursor';

export interface MdsvexOptions {
	extensions?: string[];
	/** parse plugins that hook into tree construction. */
	parse_plugins?: ParsePlugin[];
	/**
	 * modules whose exports named after an element replace it, lowest
	 * precedence first, each resolves as an import from the vite root would
	 *
	 * @example
	 * components: ['#lib/markdown.ts', new URL('./md.ts', import.meta.url)]
	 */
	components?: string | URL | (string | URL)[];
	component_mode?: ComponentMode;
	frontmatter?: FrontmatterOptions;
	/**
	 * svelte components that wrap documents by name, each resolves as an import
	 * from the vite root would, the default entry wraps documents that pick none,
	 * an element named export of the module script of a template replaces that element
	 *
	 * @example
	 * templates: {
	 *   default: '#lib/templates/Post.svelte',
	 *   blog: new URL('./src/Blog.svelte', import.meta.url),
	 *   // replacements for a template you cannot edit, merged over its own
	 *   theme: { component: '@acme/theme/Layout.svelte', components: '#lib/theme.ts' },
	 * }
	 */
	templates?: Record<string, TemplateSpec>;
	/**
	 * picks the template of a document whose frontmatter has no template key, a
	 * name picks that template, false picks none and undefined the default
	 *
	 * @example
	 * select_template: (id) => (id.includes('/blog/') ? 'blog' : undefined)
	 */
	select_template?: (
		id: string,
		metadata: Record<string, unknown>
	) => string | false | undefined;
}

/** a template module, or one with a module of replacements merged over its own */
export type TemplateSpec =
	| string
	| URL
	| { component: string | URL; components?: string | URL };

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

// plugins keep one components array per config, so its scope is built once
const root_scopes = new WeakMap<ComponentSource[], ComponentScope>();

/** the scope chain for the root fallback, null when nothing is replaced */
function scope_of(
	components: ComponentSource[] | undefined,
	mode?: ComponentMode
): ComponentScope | null {
	if (mode !== undefined && mode !== 'markdown' && mode !== 'all')
		throw new Error(
			`component_mode must be 'markdown' or 'all', got ${JSON.stringify(mode)}`
		);
	if (components === undefined || components.length === 0) return null;
	let scope = root_scopes.get(components);
	if (scope === undefined) {
		scope = new ComponentScope(components, 'G');
		root_scopes.set(components, scope);
	}
	return scope;
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
interface TraceTarget extends MapTrace {
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

interface StoredDocument extends TraceTarget {
	raw: string;
}

/**
 * remapping only reads the html lines the compile map points at, so only those
 * are built
 */
function pfm_map(
	doc: StoredDocument,
	compile_mappings: unknown,
	file: string
): SourceMapV3 | DecodedSourceMapV3 {
	// sourcesContent is replaced by raw after chaining
	const lines = mapped_source_lines(compile_mappings as string);
	if (lines === null) return trace_to_v3(doc, doc.source, doc.html, file);
	return trace_to_decoded(doc, doc.source, doc.html, lines, file);
}

// the map json head when the compile map names no file
const PLAIN_HEAD = '{"version":3,"mappings":"';
const PLAIN_HEAD_BYTES = /* @__PURE__ */ ascii_table(PLAIN_HEAD);

// chars of names resolve-uri keeps as they are when remapping resolves the
// source, 1 for a char a name may start with, 2 for a dot, which may only follow
const PLAIN_CHARS = /* @__PURE__ */ (() => {
	const t = new Uint8Array(128);
	const plain =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-+~@';
	for (let i = 0; i < plain.length; i++) t[plain.charCodeAt(i)] = 1;
	t[46] = 2;
	return t;
})();

/** map_basename(file) when it is a plain name, null otherwise */
function plain_basename(file: string): string | null {
	if (!file) return 'input.md';
	const table = PLAIN_CHARS;
	let k = file.length - 1;
	for (; k >= 0; k--) {
		const c = file.charCodeAt(k);
		if (c === 47 || c === 92) break;
		if (c >= 128 || table[c] === 0) return null;
	}
	const first = k + 1;
	if (first === file.length || table[file.charCodeAt(first)] !== 1) return null;
	return file.slice(first);
}

/**
 * base64 of the inline map json remapping gives for the compile and pfm maps
 * with raw as sourcesContent, null for anything left to remapping
 */
function chained_base64(
	doc: StoredDocument,
	compile: any,
	file: string
): string | null {
	if (compile._decodedMemo) return null;
	const mappings = compile.mappings;
	if (typeof mappings !== 'string') return null;
	const sources = compile.sources;
	if (!Array.isArray(sources) || sources.length > 1) return null;
	if (
		sources.length === 1 &&
		sources[0] != null &&
		typeof sources[0] !== 'string'
	)
		return null;
	const root = compile.sourceRoot;
	if (root != null && typeof root !== 'string') return null;
	const out_file = compile.file;
	if (out_file != null && typeof out_file !== 'string') return null;
	let names = compile.names;
	if (names == null) names = [];
	else if (!Array.isArray(names)) return null;
	for (let i = 0; i < names.length; i++) {
		if (typeof names[i] !== 'string') return null;
	}
	const base = plain_basename(file);
	if (base === null) return null;

	const head = out_file
		? '{"version":3,"file":' + JSON.stringify(out_file) + ',"mappings":"'
		: '';
	let bytes = base64_bytes;
	if (bytes === null || bytes.length < head.length * 3 + MAP_FIXED_BYTES) {
		let size = 1 << 14;
		while (size < head.length * 3 + MAP_FIXED_BYTES) size <<= 1;
		bytes = base64_bytes = new_buffer(size);
		plain_head_kept = false;
	}
	let n: number;
	if (out_file) {
		n = utf8_into(bytes, head, 0);
		plain_head_kept = false;
	} else {
		if (!plain_head_kept) {
			put_table(view_of(bytes), 0, PLAIN_HEAD_BYTES);
			plain_head_kept = true;
		}
		n = PLAIN_HEAD_BYTES.length;
	}

	// chain_trace reads the mappings as utf8 bytes, a byte loop beats charCodeAt
	let map_bytes: Buffer | null = null;
	let map_length = 0;
	if (mappings.length * 3 <= BASE64_KEEP) {
		map_bytes = mappings_stage;
		if (map_bytes === null || map_bytes.length < mappings.length * 3) {
			let size = 1 << 12;
			while (size < mappings.length * 3) size <<= 1;
			map_bytes = mappings_stage = new_buffer(size);
		}
		map_length = utf8_into(map_bytes, mappings, 0);
	}

	// doc.source is normalized raw
	const chained = chain_trace(
		mappings,
		names,
		doc,
		doc.source,
		doc.html,
		true,
		bytes,
		n,
		map_bytes,
		map_length
	);
	if (chained === null) return null;
	const chained_names = chained.names;
	const names_json =
		chained_names === null ? '' : JSON.stringify(chained_names);
	// a well formed raw is escaped from its utf8 bytes, beating JSON.stringify
	const raw = doc.raw;
	const sourced = chained.sourced;
	let escape = false;
	let raw_json = '';
	if (sourced) {
		escape =
			typeof (raw as any).isWellFormed === 'function' &&
			(raw as any).isWellFormed();
		if (!escape) raw_json = JSON.stringify(raw);
	}

	// the ascii mappings stay bytes, every part starts and ends in ascii so the
	// utf8 joins
	const length = chained.length;
	const src = chained.bytes;
	const most =
		MAP_FIXED_BYTES +
		base.length +
		n +
		length +
		(names_json.length + raw_json.length) * 3 +
		(escape ? raw.length * 6 : 0);
	if (most > BASE64_KEEP) {
		const text = Buffer.from(
			src.buffer,
			src.byteOffset + chained.start,
			length
		).toString('latin1');
		let json =
			(out_file ? head : PLAIN_HEAD) +
			text +
			'","names":' +
			(chained_names === null ? '[]' : names_json) +
			',"ignoreList":[],"sources":';
		// a plain basename has no char json escapes, so quoting equals JSON.stringify
		if (sourced)
			json +=
				'["' +
				base +
				'"],"sourcesContent":[' +
				(escape ? JSON.stringify(raw) : raw_json) +
				']}';
		else json += '[],"sourcesContent":[]}';
		return Buffer.from(json).toString('base64');
	}
	n += length;
	if (src !== bytes || bytes.length < most) {
		// chain_trace outgrew the buffer or the rest will, move to a larger one
		let size = 1 << 14;
		while (size < most) size <<= 1;
		const next = new_buffer(size);
		next.set(src.subarray(0, n));
		bytes = base64_bytes = next;
	}
	// word stores beat utf8 writes and byte stores, a table may write three bytes
	// past its end, which the next part overwrites or which lie past the map
	const view = view_of(bytes);
	if (chained_names === null)
		n = put_table(view, n, sourced ? NO_NAMES_OPEN_BYTES : NO_NAMES_BYTES);
	else {
		n = put_table(view, n, NAMES_BYTES);
		n += utf8_into(bytes, names_json, n);
		n = put_table(view, n, AFTER_NAMES_BYTES);
		if (sourced) n = put_table(view, n, SOURCE_OPEN_BYTES);
	}
	if (sourced) {
		// a plain basename is ascii with no char json escapes
		for (let i = 0; i < base.length; i++) bytes[n++] = base.charCodeAt(i);
		n = put_table(view, n, SOURCE_CLOSE_BYTES);
		if (escape) n = write_json_string(raw, bytes, n);
		else n += utf8_into(bytes, raw_json, n);
		bytes[n++] = 93; // ]
		bytes[n++] = 125; // }
	} else n = put_table(view, n, NO_SOURCE_BYTES);
	return base64_of(bytes, n);
}

/** an ascii string as little endian words, the last one zero padded */
interface AsciiTable {
	words: Uint32Array;
	length: number;
}

function ascii_table(s: string): AsciiTable {
	const words = new Uint32Array((s.length + 3) >> 2);
	for (let i = 0; i < s.length; i++)
		words[i >> 2] |= s.charCodeAt(i) << ((i & 3) << 3);
	return { words, length: s.length };
}

const NAMES_BYTES = /* @__PURE__ */ ascii_table('","names":');
const AFTER_NAMES_BYTES = /* @__PURE__ */ ascii_table(
	',"ignoreList":[],"sources":'
);
const NO_NAMES_BYTES = /* @__PURE__ */ ascii_table(
	'","names":[],"ignoreList":[],"sources":'
);
const NO_NAMES_OPEN_BYTES = /* @__PURE__ */ ascii_table(
	'","names":[],"ignoreList":[],"sources":["'
);
const SOURCE_OPEN_BYTES = /* @__PURE__ */ ascii_table('["');
const SOURCE_CLOSE_BYTES = /* @__PURE__ */ ascii_table('"],"sourcesContent":[');
const NO_SOURCE_BYTES = /* @__PURE__ */ ascii_table('[],"sourcesContent":[]}');
// covers every fixed table, three bytes of overrun and the two closing bytes
const MAP_FIXED_BYTES = 128;

function put_table(view: DataView, n: number, table: AsciiTable): number {
	const words = table.words;
	for (let i = 0; i < words.length; i++)
		view.setUint32(n + (i << 2), words[i], true);
	return n + table.length;
}

// node, deno and bun expose utf8Write and base64Slice on Buffer, calling them
// skips the checks in write and toString, set when a reused buffer is made
let buffer_direct = false;

function new_buffer(size: number): Buffer {
	const b: any = Buffer.allocUnsafe(size);
	buffer_direct =
		typeof b.utf8Write === 'function' && typeof b.base64Slice === 'function';
	return b;
}

function utf8_into(b: Buffer, s: string, n: number): number {
	return buffer_direct
		? (b as any).utf8Write(s, n, b.length - n)
		: b.write(s, n, 'utf8');
}

function base64_of(b: Buffer, n: number): string {
	return buffer_direct
		? (b as any).base64Slice(0, n)
		: b.toString('base64', 0, n);
}

// the escape after a backslash for each byte, 0 for none, u for \u00XX
const JSON_ESCAPES = /* @__PURE__ */ (() => {
	const t = new Uint8Array(256);
	for (let c = 0; c < 32; c++) t[c] = 117;
	t[8] = 98; // b
	t[9] = 116; // t
	t[10] = 110; // n
	t[12] = 102; // f
	t[13] = 114; // r
	t[34] = 34; // "
	t[92] = 92; // \
	return t;
})();

// reused across transforms, each view made once per buffer
let json_stage: Buffer | null = null;
let json_stage_view: DataView | null = null;
let json_out: Buffer | null = null;
let json_out_view: DataView | null = null;

function view_of(out: Buffer): DataView {
	if (json_out !== out) {
		json_out = out;
		json_out_view = new DataView(out.buffer, out.byteOffset, out.length);
	}
	return json_out_view!;
}

/**
 * writes the utf8 of JSON.stringify(raw) into out at n and returns the end,
 * raw has no lone surrogate and out holds 6 bytes per unit of raw plus 2
 */
function write_json_string(raw: string, out: Buffer, n: number): number {
	let stage = json_stage;
	if (stage === null || stage.length < raw.length * 3) {
		let size = 1 << 14;
		while (size < raw.length * 3) size <<= 1;
		stage = json_stage = new_buffer(size);
		json_stage_view = new DataView(stage.buffer, stage.byteOffset, size);
	}
	const len = utf8_into(stage, raw, 0);
	const view = json_stage_view!;
	const out_view = view_of(out);
	const escapes = JSON_ESCAPES;
	out[n++] = 34;
	const words = len - 3;
	let i = 0;
	while (i < len) {
		if (i < words) {
			// four bytes at once while none is below 0x20, a quote or a backslash,
			// utf8 bytes past 0x7f have the top bit the checks look at set in ~w
			const w = view.getUint32(i, true);
			const q = w ^ 0x22222222;
			const b = w ^ 0x5c5c5c5c;
			if (
				((((w - 0x20202020) & ~w) |
					((q - 0x01010101) & ~q) |
					((b - 0x01010101) & ~b)) &
					0x80808080) ===
				0
			) {
				out_view.setUint32(n, w, true);
				n += 4;
				i += 4;
				continue;
			}
		}
		const c = stage[i++];
		const e = escapes[c];
		if (e === 0) {
			out[n++] = c;
			continue;
		}
		out[n++] = 92;
		out[n++] = e;
		if (e === 117) {
			const h = c & 15;
			out[n++] = 48;
			out[n++] = 48;
			out[n++] = c < 16 ? 48 : 49;
			out[n++] = h < 10 ? 48 + h : 87 + h;
		}
	}
	out[n++] = 34;
	return n;
}

// utf8 bytes of a map before base64, reused so a large map does not allocate
// an off heap buffer on every transform, bounded so no huge one is pinned
const BASE64_KEEP = 1 << 22;
let base64_bytes: Buffer | null = null;
// whether base64_bytes starts with PLAIN_HEAD
let plain_head_kept = false;
// utf8 of the compile mappings being chained
let mappings_stage: Buffer | null = null;

/** equals Buffer.from(json).toString('base64') */
function base64_utf8(json: string): string {
	// three utf8 bytes per utf16 unit at most
	const most = json.length * 3;
	if (most > BASE64_KEEP) return Buffer.from(json).toString('base64');
	let bytes = base64_bytes;
	if (bytes === null || bytes.length < most) {
		let size = 1 << 14;
		while (size < most) size <<= 1;
		bytes = base64_bytes = new_buffer(size);
	}
	// the json overwrites the kept head
	plain_head_kept = false;
	return base64_of(bytes, utf8_into(bytes, json, 0));
}

/** sveltekit() is async, so its plugins arrive as a promise */
async function flat_plugins(
	options: PluginOption[] | undefined,
	out: Plugin[] = []
): Promise<Plugin[]> {
	if (!options) return out;
	for (const option of options) {
		const resolved = await option;
		if (Array.isArray(resolved)) await flat_plugins(resolved, out);
		else if (resolved) out.push(resolved as Plugin);
	}
	return out;
}

function api_extensions(plugin: Plugin | undefined): string[] | undefined {
	const extensions = plugin?.api?.options?.extensions;
	return Array.isArray(extensions) ? extensions : undefined;
}

// documents import these virtual ids, so output holds no paths and the graph edge is the real file
const COMPONENTS_ID = 'mdsvex:components';
const DIRECTIVES_ID = 'mdsvex:directives';
/** the namespace export of a replacement module that holds its directives */
const DIRECTIVES_EXPORT = 'directives';
const TEMPLATE_ID = 'mdsvex:template/';
const TEMPLATE_DIRECTIVES_ID = 'mdsvex:template-directives/';

/** a URL as a path, a string as written */
async function spec_of(entry: string | URL): Promise<string> {
	const spec = typeof entry === 'string' ? entry : entry.href;
	if (!spec.startsWith('file:')) return spec;
	const url = await import('node:url');
	return url.fileURLToPath(spec);
}

function shown(entry: string | URL): string {
	return JSON.stringify(typeof entry === 'string' ? entry : entry.href);
}

/** the directory documents resolve configured specifiers from */
function importer_in(root: string): string {
	const base = root || (globalThis as any).process?.cwd?.() || '';
	return base.replace(/\/$/, '') + '/vite.config';
}

function clean_id(id: string): string {
	const q = id.indexOf('?');
	return q < 0 ? id : id.slice(0, q);
}

function same_names(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	for (let i = 0; i < b.length; i++) if (!set.has(b[i])) return false;
	return true;
}

type Warn = (message: string) => void;

/**
 * export scans per resolved file and the files each document read names from,
 * any module that supplies replacements scans through here
 */
function export_tracker() {
	const scanned = new Map<string, { code: string; result: ScannedExports }>();
	const doc_files = new Map<string, readonly string[]>();
	/** the timestamp of each file whose export set changed */
	const changed_at = new Map<string, number>();

	return {
		/** scanned again only when the code changed */
		async scan(
			file: string,
			warn: Warn,
			code?: string
		): Promise<ScannedExports> {
			if (code === undefined) {
				const fs = await import('node:fs/promises');
				code = await fs.readFile(file, 'utf8');
			}
			const hit = scanned.get(file);
			if (hit !== undefined && hit.code === code) return hit.result;
			const result = await scan_exports_detail(
				code,
				file.endsWith('.svelte') ? 'svelte' : 'js'
			);
			for (const star of result.stars) {
				warn(
					`${file} re-exports "${star}" with export *, whose names a static ` +
						`scan cannot see. export each replacement by name`
				);
			}
			scanned.set(file, { code, result });
			return result;
		},
		/** note a change the names cannot show, such as a moved directives module */
		mark(file: string, timestamp: number): void {
			changed_at.set(file, timestamp);
		},
		marked(file: string, timestamp: number): boolean {
			return changed_at.get(file) === timestamp;
		},
		/** true when the names differ, or differed at this timestamp, so every environment sees one change */
		changed(
			file: string,
			before: readonly string[],
			after: readonly string[],
			timestamp: number
		): boolean {
			if (!same_names(before, after)) {
				changed_at.set(file, timestamp);
				return true;
			}
			return changed_at.get(file) === timestamp;
		},
		track(doc: string, files: readonly string[]): void {
			doc_files.set(doc, files);
		},
		docs_using(file: string): string[] {
			const docs: string[] = [];
			for (const [doc, files] of doc_files) {
				if (files.includes(file)) docs.push(doc);
			}
			return docs;
		},
	};
}

type ExportTracker = ReturnType<typeof export_tracker>;

interface ComponentModule {
	/** the id documents import */
	virtual: string;
	/** the specifier resolved, a URL as a path */
	spec: string;
	/** the resolved id without its query */
	file: string;
	names: string[];
	/** the module its directives namespace export re-exports */
	directives: DirectiveModule | null;
}

interface DirectiveModule {
	virtual: string;
	/** as written in the owning module, resolved from it */
	spec: string;
	file: string;
	names: string[];
}

/**
 * the element names of a replacement module, and the specifier of its
 * directives namespace, which only export * as directives from can declare
 */
function split_exports(
	file: string,
	scanned: ScannedExports
): { names: string[]; directives: string | null } {
	const at = scanned.names.indexOf(DIRECTIVES_EXPORT);
	if (at < 0) return { names: scanned.names, directives: null };
	const ns = scanned.namespaces.find((n) => n.name === DIRECTIVES_EXPORT);
	if (ns === undefined) {
		throw new Error(
			`[mdsvex] ${file} exports ${DIRECTIVES_EXPORT}, which must be a namespace ` +
				`re-export so its names can be read without running it: ` +
				`export * as ${DIRECTIVES_EXPORT} from './directives.ts'`
		);
	}
	const names = scanned.names.slice();
	names.splice(at, 1);
	return { names, directives: ns.specifier };
}

/**
 * the root components modules and their directives modules resolve and scan
 * once, every document compiles with the same options until an export set changes
 */
function component_registry(
	written: readonly (string | URL)[],
	tracker: ExportTracker
) {
	const many = written.length !== 1;
	const virtual_ids = many
		? written.map((_, i) => COMPONENTS_ID + '/' + i)
		: [COMPONENTS_ID];
	const directive_ids = many
		? written.map((_, i) => DIRECTIVES_ID + '/' + i)
		: [DIRECTIVES_ID];

	let root = '';
	let modules: ComponentModule[] | null = null;
	let loading: Promise<ComponentModule[]> | null = null;
	/** the compile options, replaced whenever an export set changes */
	let sources: ComponentSource[] | undefined;
	let directive_sources: ComponentSource[] | undefined;
	/** kept over a reset, so every environment sees the change that caused it */
	let files: readonly string[] = [];

	function importer(): string {
		return importer_in(root);
	}

	/** the last list published, kept over a reset for the editor manifest */
	let published: ComponentModule[] = [];
	let resolved = false;

	function publish(list: ComponentModule[]): void {
		modules = list;
		published = list;
		resolved = true;
		const all: string[] = [];
		sources = [];
		const directive_list: ComponentSource[] = [];
		for (const m of list) {
			all.push(m.file);
			sources.push({ specifier: m.virtual, names: m.names });
			if (m.directives === null) continue;
			all.push(m.directives.file);
			directive_list.push({
				specifier: m.directives.virtual,
				names: m.directives.names,
			});
		}
		files = all;
		directive_sources =
			directive_list.length === 0 ? undefined : directive_list;
	}

	async function load(ctx: Rollup.PluginContext): Promise<ComponentModule[]> {
		const from = importer();
		const list: ComponentModule[] = [];
		const failed: string[] = [];
		for (let i = 0; i < written.length; i++) {
			const entry = written[i];
			const spec = await spec_of(entry);
			const resolved = await ctx.resolve(spec, from, { skipSelf: true });
			if (resolved === null || resolved.external) {
				failed.push(shown(entry));
				continue;
			}
			list.push({
				virtual: virtual_ids[i],
				spec,
				file: clean_id(resolved.id),
				names: [],
				directives: null,
			});
		}
		if (failed.length !== 0) {
			throw new Error(
				`[mdsvex] could not resolve the components module ${failed.join(', ')} ` +
					`from the vite root ${from.slice(0, -'/vite.config'.length)}`
			);
		}
		const warn = (message: string) => ctx.warn(message);
		for (let i = 0; i < list.length; i++) {
			const m = list[i];
			const own = split_exports(m.file, await tracker.scan(m.file, warn));
			m.names = own.names;
			if (own.directives === null) continue;
			const resolved = await ctx.resolve(own.directives, m.file, {
				skipSelf: true,
			});
			if (resolved === null || resolved.external) {
				throw new Error(
					`[mdsvex] could not resolve the directives module ` +
						`${JSON.stringify(own.directives)} from ${m.file}`
				);
			}
			const file = clean_id(resolved.id);
			m.directives = {
				// a failed resolution threw above, so list lines up with written
				virtual: directive_ids[i],
				spec: own.directives,
				file,
				names: (await tracker.scan(file, warn)).names,
			};
		}
		publish(list);
		return list;
	}

	/** resolves and scans once, a failure is kept so it is reported once */
	function ensure(ctx: Rollup.PluginContext): Promise<ComponentModule[]> {
		if (loading === null) loading = load(ctx);
		return loading;
	}

	function reset(): void {
		loading = null;
		modules = null;
	}

	return {
		set_root(dir: string): void {
			root = dir;
		},
		ensure,
		/** resolve and scan again on the next use, keeping the scans of unchanged code */
		reset,
		ready(): boolean {
			return modules !== null;
		},
		files(): readonly string[] {
			return files;
		},
		/** the compile option */
		sources(): ComponentSource[] | undefined {
			return sources;
		},
		/** the directives compile option */
		directive_sources(): ComponentSource[] | undefined {
			return directive_sources;
		},
		/** true once resolved, a reset keeps it */
		resolved(): boolean {
			return resolved;
		},
		/** the modules for the editor manifest, empty until resolved */
		describe(): { components: ManifestModule[]; directives: ManifestModule[] } {
			const components: ManifestModule[] = [];
			const directives: ManifestModule[] = [];
			for (const m of published) {
				components.push({ id: m.virtual, file: m.file, names: m.names });
				if (m.directives === null) continue;
				const d = m.directives;
				directives.push({ id: d.virtual, file: d.file, names: d.names });
			}
			return { components, directives };
		},
		/** resolved in the environment of ctx, whose conditions may differ */
		async resolve(
			ctx: Rollup.PluginContext,
			id: string
		): Promise<Rollup.ResolvedId | null | undefined> {
			let i = virtual_ids.indexOf(id);
			if (i >= 0) {
				const list = await ensure(ctx);
				return ctx.resolve(list[i].spec, importer(), { skipSelf: true });
			}
			i = directive_ids.indexOf(id);
			if (i < 0) return undefined;
			const list = await ensure(ctx);
			const m = list[i];
			if (m.directives === null) return null;
			return ctx.resolve(m.directives.spec, m.file, { skipSelf: true });
		},
		/** scan a changed file again, true when its export set changed */
		async rescan(
			file: string,
			timestamp: number,
			warn: Warn,
			code: string
		): Promise<boolean> {
			// an earlier environment reset for this change
			if (modules === null) return tracker.marked(file, timestamp);
			const at = modules.findIndex((m) => m.file === file);
			if (at >= 0) {
				const m = modules[at];
				const own = split_exports(file, await tracker.scan(file, warn, code));
				if (own.directives !== (m.directives?.spec ?? null)) {
					// a new directives module resolves in the next transform
					tracker.mark(file, timestamp);
					reset();
					return true;
				}
				if (own.names !== m.names && !same_names(own.names, m.names)) {
					const list = modules.slice();
					list[at] = { ...m, names: own.names };
					publish(list);
				}
				return tracker.changed(file, m.names, own.names, timestamp);
			}
			const owner = modules.findIndex((m) => m.directives?.file === file);
			if (owner < 0) return false;
			const d = modules[owner].directives!;
			const names = (await tracker.scan(file, warn, code)).names;
			if (!same_names(names, d.names)) {
				const list = modules.slice();
				list[owner] = { ...list[owner], directives: { ...d, names } };
				publish(list);
			}
			return tracker.changed(file, d.names, names, timestamp);
		},
	};
}

interface TemplateModule {
	/** the template key */
	name: string;
	/** the specifier of the component resolved, a URL as a path */
	spec: string;
	/** the resolved component id without its query */
	file: string;
	/** the export names of its module script */
	names: string[];
	/** a module of replacements merged over those of the template */
	extra: { spec: string; file: string; names: string[] } | null;
	/** the directives modules of the template and then of extra */
	directives: TemplateDirectives[];
}

interface TemplateDirectives {
	virtual: string;
	/** the template or extra file whose namespace export names spec */
	owner: string;
	spec: string;
	file: string;
	names: string[];
}

/**
 * the templates resolve and scan once, every document compiles with the same
 * option until an export set changes
 */
function template_registry(
	written: Record<string, TemplateSpec>,
	tracker: ExportTracker
) {
	const keys = Object.keys(written);
	let root = '';
	let modules: Map<string, TemplateModule> | null = null;
	let loading: Promise<Map<string, TemplateModule>> | null = null;
	/** the compile option, replaced whenever an export set changes */
	let entries: Record<string, TemplateEntry> = {};
	let files: readonly string[] = [];
	let files_by_name = new Map<string, readonly string[]>();
	/** the directives module of each virtual id */
	let directive_ids = new Map<string, TemplateDirectives>();

	/** the last templates published, kept over a reset for the editor manifest */
	let published = new Map<string, TemplateModule>();
	let resolved = false;

	function publish(list: Map<string, TemplateModule>): void {
		modules = list;
		published = list;
		resolved = true;
		const next: Record<string, TemplateEntry> = {};
		const all: string[] = [];
		files_by_name = new Map();
		directive_ids = new Map();
		for (const m of list.values()) {
			// the extra module wins a shared name, the facade exports its binding
			const names = m.extra === null ? m.names : union(m.names, m.extra.names);
			const entry: TemplateEntry = {
				specifier: TEMPLATE_ID + m.name,
				components: names,
			};
			const own = m.extra === null ? [m.file] : [m.file, m.extra.file];
			if (m.directives.length !== 0) {
				entry.directives = [];
				for (const d of m.directives) {
					entry.directives.push({ specifier: d.virtual, names: d.names });
					directive_ids.set(d.virtual, d);
					own.push(d.file);
				}
			}
			next[m.name] = entry;
			files_by_name.set(m.name, own);
			all.push(...own);
		}
		entries = next;
		files = all;
	}

	/** the directives module the namespace export of owner names, null for none */
	async function directives_of(
		ctx: Rollup.PluginContext,
		owner: string,
		spec: string | null,
		virtual: string,
		warn: Warn
	): Promise<TemplateDirectives | null> {
		if (spec === null) return null;
		const resolved = await ctx.resolve(spec, owner, { skipSelf: true });
		if (resolved === null || resolved.external) {
			throw new Error(
				`[mdsvex] could not resolve the directives module ${JSON.stringify(spec)} from ${owner}`
			);
		}
		const file = clean_id(resolved.id);
		const names = (await tracker.scan(file, warn)).names;
		return { virtual, owner, spec, file, names };
	}

	async function load(ctx: Rollup.PluginContext) {
		const from = importer_in(root);
		const shown_root = from.slice(0, -'/vite.config'.length);
		const list = new Map<string, TemplateModule>();
		const failed: string[] = [];
		const resolve = async (entry: string | URL, what: string) => {
			const spec = await spec_of(entry);
			const resolved = await ctx.resolve(spec, from, { skipSelf: true });
			if (resolved === null || resolved.external) {
				failed.push(
					`[mdsvex] could not resolve ${what} ${shown(entry)} from the vite root ${shown_root}`
				);
				return null;
			}
			return { spec, file: clean_id(resolved.id), names: [] as string[] };
		};
		for (const name of keys) {
			const entry = written[name];
			const pair = typeof entry === 'object' && 'component' in entry;
			const component = pair ? entry.component : entry;
			const extra = pair ? entry.components : undefined;
			const main = await resolve(component, `template "${name}" at`);
			const more =
				extra === undefined
					? null
					: await resolve(extra, `the components of template "${name}" at`);
			if (main === null || (extra !== undefined && more === null)) continue;
			list.set(name, { name, ...main, extra: more, directives: [] });
		}
		if (failed.length !== 0) throw new Error(failed.join('\n'));
		const warn = (message: string) => ctx.warn(message);
		for (const m of list.values()) {
			const own = split_exports(m.file, await tracker.scan(m.file, warn));
			m.names = without_default(own.names);
			const base = TEMPLATE_DIRECTIVES_ID + m.name;
			const mine = await directives_of(ctx, m.file, own.directives, base, warn);
			if (mine !== null) m.directives.push(mine);
			if (m.extra !== null) {
				const more = split_exports(
					m.extra.file,
					await tracker.scan(m.extra.file, warn)
				);
				m.extra.names = without_default(more.names);
				const theirs = await directives_of(
					ctx,
					m.extra.file,
					more.directives,
					base + '/components',
					warn
				);
				if (theirs !== null) m.directives.push(theirs);
			}
		}
		publish(list);
		return list;
	}

	/** resolves and scans once, a failure is kept so it is reported once */
	function ensure(ctx: Rollup.PluginContext) {
		if (loading === null) loading = load(ctx);
		return loading;
	}

	function reset(): void {
		loading = null;
		modules = null;
	}

	/** the current module of a template, a rescan replaces it */
	async function module_of(ctx: Rollup.PluginContext, name: string) {
		await ensure(ctx);
		return modules?.get(name);
	}

	return {
		set_root(dir: string): void {
			root = dir;
		},
		ensure,
		/** resolve and scan again on the next use, keeping the scans of unchanged code */
		reset,
		ready(): boolean {
			return modules !== null;
		},
		/** kept over a reset, so every environment sees the change that caused it */
		files(): readonly string[] {
			return files;
		},
		/** a template directives id resolves to the module the namespace export names */
		async resolve_directives(
			ctx: Rollup.PluginContext,
			id: string
		): Promise<Rollup.ResolvedId | null | undefined> {
			await ensure(ctx);
			const d = directive_ids.get(id);
			if (d === undefined) return undefined;
			return ctx.resolve(d.spec, d.owner, { skipSelf: true });
		},
		/** the files a document wrapped in the named template read names from */
		files_of(name: string | undefined): readonly string[] {
			return name === undefined ? [] : (files_by_name.get(name) ?? []);
		},
		entries(): Record<string, TemplateEntry> {
			return entries;
		},
		/** true once resolved, a reset keeps it */
		resolved(): boolean {
			return resolved;
		},
		/** the templates for the editor manifest, empty until resolved */
		describe(): Record<string, ManifestTemplate> {
			const out: Record<string, ManifestTemplate> = {};
			for (const m of published.values()) {
				out[m.name] = {
					id: TEMPLATE_ID + m.name,
					file: m.file,
					components: m.names,
					extra:
						m.extra === null
							? null
							: {
									id: TEMPLATE_ID + m.name,
									file: m.extra.file,
									names: m.extra.names,
								},
					directives: m.directives.map((d) => ({
						id: d.virtual,
						file: d.file,
						names: d.names,
					})),
				};
			}
			return out;
		},
		/** the templates whose merging module reads names from file */
		names_using(file: string): string[] {
			const out: string[] = [];
			if (modules !== null)
				for (const m of modules.values())
					if (m.extra !== null && (m.file === file || m.extra.file === file))
						out.push(m.name);
			return out;
		},
		/**
		 * a template id resolves to the component, so the graph edge is the real
		 * file, or with extra replacements to a module that merges both
		 */
		async resolve(
			ctx: Rollup.PluginContext,
			id: string
		): Promise<Rollup.ResolvedId | string | null | undefined> {
			const name = id.slice(TEMPLATE_ID.length);
			if (!has_own.call(written, name)) return undefined;
			const m = await module_of(ctx, name);
			if (m === undefined) return undefined;
			if (m.extra !== null) return '\0' + id;
			return ctx.resolve(m.spec, importer_in(root), { skipSelf: true });
		},
		/** the module of a template with extra replacements, resolved in the environment of ctx */
		async load(ctx: Rollup.PluginContext, id: string) {
			const name = id.slice(1 + TEMPLATE_ID.length);
			const m = await module_of(ctx, name);
			if (m === undefined || m.extra === null) return undefined;
			const from = importer_in(root);
			const main = await ctx.resolve(m.spec, from, { skipSelf: true });
			const extra = await ctx.resolve(m.extra.spec, from, { skipSelf: true });
			const a = JSON.stringify(main!.id);
			const b = JSON.stringify(extra!.id);
			// a named export shadows the same name from export *
			let code = `export * from ${a};\nexport { default } from ${a};\n`;
			if (m.extra.names.length !== 0)
				code += `export { ${m.extra.names.map(export_name).join(', ')} } from ${b};\n`;
			return code;
		},
		/** scan a changed file again, true when its export set changed */
		async rescan(
			file: string,
			timestamp: number,
			warn: Warn,
			code: string
		): Promise<boolean> {
			// an earlier environment reset for this change
			if (modules === null) return tracker.marked(file, timestamp);
			if (!files.includes(file)) return false;
			const scanned = await tracker.scan(file, warn, code);
			let before: readonly string[] | null = null;
			let after: readonly string[] = [];
			const list = new Map(modules);
			for (const [name, m] of modules) {
				const main = m.file === file;
				if (main || (m.extra !== null && m.extra.file === file)) {
					const own = split_exports(file, scanned);
					const spec = m.directives.find((d) => d.owner === file)?.spec;
					if (own.directives !== (spec ?? null)) {
						// a new directives module resolves in the next transform
						tracker.mark(file, timestamp);
						reset();
						return true;
					}
					const names = without_default(own.names);
					const cur = list.get(name)!;
					before ??= main ? m.names : m.extra!.names;
					after = names;
					list.set(
						name,
						main
							? { ...cur, names }
							: { ...cur, extra: { ...cur.extra!, names } }
					);
				}
				for (let i = 0; i < m.directives.length; i++) {
					if (m.directives[i].file !== file) continue;
					const cur = list.get(name)!;
					const directives = cur.directives.slice();
					directives[i] = { ...directives[i], names: scanned.names };
					before ??= m.directives[i].names;
					after = scanned.names;
					list.set(name, { ...cur, directives });
				}
			}
			if (before === null) return false;
			if (!same_names(before, after)) publish(list);
			return tracker.changed(file, before, after, timestamp);
		},
	};
}

function check_templates(written: Record<string, TemplateSpec>): void {
	for (const name of Object.keys(written)) {
		const entry = written[name] as unknown;
		const ok =
			typeof entry === 'string' ||
			(typeof entry === 'object' &&
				entry !== null &&
				(typeof (entry as URL).href === 'string' ||
					'component' in (entry as object)));
		if (!ok || name === '')
			throw new Error(
				`[mdsvex] templates.${name} must be a specifier, a URL or { component, components? }`
			);
	}
}

/** the template options of a document, with the import query and the id bound */
function templates_for(
	templates: TemplateRegistry | null,
	select: MdsvexOptions['select_template'],
	id: string
): TemplateOptions {
	const file = clean_id(id);
	return {
		templates: templates === null ? undefined : templates.entries(),
		select_template:
			select === undefined ? undefined : (metadata) => select(file, metadata),
		template: query_template(id),
	};
}

/** ?template=name or ?template=false on the import, undefined without one */
function query_template(id: string): string | false | undefined {
	const q = id.indexOf('?');
	if (q < 0) return undefined;
	const value = new URLSearchParams(id.slice(q + 1)).get('template');
	if (value === null) return undefined;
	return value === 'false' ? false : value;
}

/** a vite-plugin-svelte sub-request of a document, ?svelte&type=style holds its css */
function svelte_request(id: string, q: number): boolean {
	return new URLSearchParams(id.slice(q + 1)).has('svelte');
}

type TemplateRegistry = ReturnType<typeof template_registry>;

function union(a: readonly string[], b: readonly string[]): string[] {
	const out = a.slice();
	for (const name of b) if (!out.includes(name)) out.push(name);
	return out;
}

function without_default(names: string[]): string[] {
	return names.includes('default')
		? names.filter((n) => n !== 'default')
		: names;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

function export_name(name: string): string {
	return IDENTIFIER.test(name) ? name : JSON.stringify(name);
}

/**
 * mdsvex vite plugin. returns a single plugin that:
 *
 * 1. transforms markdown to svelte html (enforce: 'pre')
 * 2. does NOT return a sourcemap to vite (to avoid poisoning the
 *    svelte compiler's own sourcemap via getCombinedSourcemap())
 * 3. after svelte compiles, chains the compiler's JS to HTML map with
 *    our HTML to markdown map using @ampproject/remapping, and injects
 *    the result as an inline sourceMappingURL in the output code.
 */
export function mdsvex(options: MdsvexOptions = {}): Plugin[] {
	const extensions = (options.extensions ?? ['.svx']).map((ext) =>
		ext.startsWith('.') ? ext : '.' + ext
	);

	// vite asks about every module in both transforms, so this allocates
	// nothing when the id has no query
	const only = extensions.length === 1 ? extensions[0] : null;
	function matches(id: string): boolean {
		const q = id.indexOf('?');
		if (q >= 0 && svelte_request(id, q)) return false;
		const clean = q < 0 ? id : id.slice(0, q);
		if (only !== null) return clean.endsWith(only);
		for (let i = 0; i < extensions.length; i++) {
			if (clean.endsWith(extensions[i])) return true;
		}
		return false;
	}

	const stored = new Map<string, StoredDocument>();
	const no_records = new Uint32Array(0);
	const compiler = new CompilerSession();
	if (options.component_mode !== undefined)
		scope_of(undefined, options.component_mode);
	const written = options.components;
	const list =
		written === undefined ? [] : Array.isArray(written) ? written : [written];
	const written_templates = options.templates;
	if (written_templates !== undefined) check_templates(written_templates);
	const select = options.select_template;
	if (select !== undefined && typeof select !== 'function')
		throw new Error('[mdsvex] select_template must be a function');
	const has_templates =
		written_templates !== undefined &&
		Object.keys(written_templates).length !== 0;
	// a config without replacements or templates builds none of their state
	const tracker = list.length === 0 && !has_templates ? null : export_tracker();
	const registry =
		list.length === 0 ? null : component_registry(list, tracker!);
	const templates = has_templates
		? template_registry(written_templates!, tracker!)
		: null;
	let command: 'build' | 'serve' = 'serve';

	const no_templates = templates === null && select === undefined;

	// what select_template picked, only it can not be worked out from the source
	const documents =
		select === undefined ? null : new Map<string, string | null>();
	let log: (message: string) => void = () => {};
	let root = '';
	const manifest = manifest_writer(
		(): MdsvexManifest | null => {
			// a process that resolves the config and never builds, such as vite
			// preview or a test runner, must not replace a manifest with an empty one
			if (registry?.resolved() === false || templates?.resolved() === false)
				return null;
			const root_modules = registry?.describe();
			return {
				version: MANIFEST_VERSION,
				root,
				extensions,
				component_mode: options.component_mode ?? 'markdown',
				frontmatter_parse: options.frontmatter?.parse !== undefined,
				directive_plugins: (options.parse_plugins ?? []).some(
					(p) =>
						p.directive_inline !== undefined ||
						p.directive_leaf !== undefined ||
						p.directive_container !== undefined
				),
				select_template: select !== undefined,
				templates: templates?.describe() ?? {},
				components: root_modules?.components ?? [],
				directives: root_modules?.directives ?? [],
				documents: documents === null ? {} : Object.fromEntries(documents),
			};
		},
		(message) => log(message)
	);

	function compile_doc(
		ctx: Rollup.TransformPluginContext,
		code: string,
		id: string,
		components: ComponentSource[] | undefined,
		directives: ComponentSource[] | undefined
	): { code: string } {
		let doc = stored.get(id);
		if (doc === undefined) {
			doc = {
				raw: '',
				source: '',
				html: '',
				metadata: undefined,
				template: undefined,
				warnings: undefined,
				buf: no_records,
				start: 0,
				split: 0,
				end: 0,
			};
			stored.set(id, doc);
		}
		// raw last, so a compile that throws leaves no document for post
		doc.raw = '';
		compiler.compile_trace_into(
			code,
			options.parse_plugins,
			doc,
			components,
			options.frontmatter?.parse,
			// without templates or a selector a query has nothing to pick
			no_templates ? undefined : templates_for(templates, select, id),
			directives,
			options.component_mode
		);
		doc.raw = code;
		if (doc.warnings !== undefined) {
			for (const w of doc.warnings) ctx.warn(w.message, w.start);
			doc.warnings = undefined;
		}

		// return NO map, avoids poisoning getCombinedSourcemap()
		return { code: doc.html };
	}

	return [
		{
			name: 'mdsvex',
			enforce: 'pre',

			config: {
				order: 'pre',
				async handler(config) {
					// kit passes this same array to vite-plugin-svelte and reads it
					// lazily, so pushing here registers our extensions with both
					const plugins = await flat_plugins(config.plugins);
					const registered = api_extensions(
						plugins.find((p) => p.name === 'vite-plugin-sveltekit-setup')
					);
					if (!registered) return;
					// with no extensions option this is a default shared by every
					// sveltekit() call in the process
					for (const ext of extensions) {
						if (!registered.includes(ext)) registered.push(ext);
					}
				},
			},

			configResolved(config) {
				registry?.set_root(config.root);
				templates?.set_root(config.root);
				command = config.command;
				root = config.root;
				log = (message) => config.logger.warn('[mdsvex] ' + message);
				manifest.set_root(config.root);
				manifest.schedule();
				const svelte = config.plugins.find(
					(p) => p.name === 'vite-plugin-svelte:config'
				);
				if (!svelte) return;
				const registered = api_extensions(svelte) ?? [];
				const missing = extensions.filter((ext) => !registered.includes(ext));
				if (missing.length === 0) return;
				const all = [...registered, ...missing].map((ext) => `'${ext}'`);
				throw new Error(
					`[mdsvex] vite-plugin-svelte does not handle ${missing.join(', ')} files. ` +
						`Add them to the extensions option of sveltekit() or svelte(): extensions: [${all.join(', ')}]`
				);
			},

			async buildStart() {
				// one clear error at startup rather than one per document
				if (registry !== null) await registry.ensure(this);
				if (templates !== null) await templates.ensure(this);
				manifest.schedule();
			},

			async buildEnd() {
				await manifest.flush();
			},

			resolveId(id) {
				if (
					registry !== null &&
					(id.startsWith(COMPONENTS_ID) || id.startsWith(DIRECTIVES_ID))
				)
					return registry.resolve(this, id);
				if (templates !== null && id.startsWith(TEMPLATE_ID))
					return templates.resolve(this, id);
				if (templates !== null && id.startsWith(TEMPLATE_DIRECTIVES_ID))
					return templates.resolve_directives(this, id);
			},

			// only templates with extra replacements load a module
			load:
				templates === null
					? undefined
					: function (id) {
							if (id.startsWith('\0' + TEMPLATE_ID))
								return templates.load(this, id);
						},

			transform(code, id) {
				if (!matches(id)) return;
				if (tracker === null)
					return compile_doc(this, code, id, undefined, undefined);

				const finish = () => {
					// a watch build compiles again when the exports change, in dev the virtual import is the edge
					if (command === 'build') {
						if (registry !== null)
							for (const file of registry.files()) this.addWatchFile(file);
						if (templates !== null)
							for (const file of templates.files()) this.addWatchFile(file);
					}
					const result = compile_doc(
						this,
						code,
						id,
						registry?.sources(),
						registry?.directive_sources()
					);
					const picked = stored.get(id)!.template;
					// a query picks for one import, not for the file
					if (documents !== null && id.indexOf('?') < 0) {
						const now = picked ?? null;
						if (documents.get(id) !== now) {
							documents.set(id, now);
							manifest.schedule();
						}
					}
					const used = templates?.files_of(picked) ?? [];
					const root = registry === null ? [] : registry.files();
					tracker.track(
						id,
						used.length === 0
							? root
							: root.length === 0
								? used
								: [...root, ...used]
					);
					return result;
				};
				const waits: Promise<unknown>[] = [];
				if (registry !== null && !registry.ready())
					waits.push(registry.ensure(this));
				if (templates !== null && !templates.ready())
					waits.push(templates.ensure(this));
				if (waits.length === 0) return finish();
				return Promise.all(waits).then(() => {
					// a reset resolved again, which may have moved a module
					manifest.schedule();
					return finish();
				});
			},

			watchChange(id) {
				// the dev server rescans in hotUpdate instead
				if (command !== 'build') return;
				const file = clean_id(id);
				if (registry !== null && registry.files().includes(file))
					registry.reset();
				if (templates !== null && templates.files().includes(file))
					templates.reset();
			},

			async hotUpdate(update) {
				const file = update.file;
				// files outlive a reset, so a later environment still sees the change
				const in_root = registry !== null && registry.files().includes(file);
				const in_templates =
					templates !== null && templates.files().includes(file);
				if (!in_root && !in_templates) return;
				const warn = (m: string) =>
					this.environment.logger.warn('[mdsvex] ' + m);
				const code = await update.read();
				let changed = false;
				if (in_root)
					changed = await registry!.rescan(file, update.timestamp, warn, code);
				if (in_templates)
					changed =
						(await templates!.rescan(file, update.timestamp, warn, code)) ||
						changed;
				if (!changed) return;
				manifest.schedule();

				// names changed, documents compiled against the old set compile again
				const graph = this.environment.moduleGraph;
				const modules = update.modules.slice();
				if (in_templates) {
					// a merging template module lists the names it exports
					for (const name of templates!.names_using(file)) {
						const mod = graph.getModuleById('\0' + TEMPLATE_ID + name);
						if (mod === undefined) continue;
						graph.invalidateModule(mod, new Set(), update.timestamp, true);
						if (!modules.includes(mod)) modules.push(mod);
					}
				}
				for (const doc of tracker!.docs_using(file)) {
					// the id the document compiled as, an import query picks its template
					const mod = graph.getModuleById(doc);
					const mods =
						mod !== undefined ? [mod] : graph.getModulesByFile(clean_id(doc));
					if (mods === undefined) continue;
					for (const mod of mods) {
						graph.invalidateModule(mod, new Set(), update.timestamp, true);
						if (!modules.includes(mod)) modules.push(mod);
					}
				}
				return modules;
			},
		},
		{
			name: 'mdsvex:sourcemap',
			enforce: 'post',

			transform(code, id) {
				if (!matches(id)) return;
				const doc = stored.get(id);
				if (!doc || !doc.raw) return;
				try {
					const originalSource = doc.raw;

					// get the svelte compiler's JS to HTML map from the chain
					let compileMap: any;
					try {
						compileMap = this.getCombinedSourcemap();
					} catch {
						return;
					}
					if (!compileMap?.mappings) return;

					let mapBase64 = chained_base64(doc, compileMap, id);
					if (mapBase64 === null) {
						const pfmMap = pfm_map(doc, compileMap.mappings, id);

						// chain: JS to HTML (compile) + HTML to markdown (pfm) = JS to markdown
						const chained = remapping([compileMap, pfmMap as any], () => null);

						// override sourcesContent with the original markdown
						if (chained.sourcesContent) {
							chained.sourcesContent = chained.sourcesContent.map(
								() => originalSource
							);
						}
						mapBase64 = base64_utf8(JSON.stringify(chained));
					}

					// inject as inline sourceMappingURL since vite ignores
					// post-transform map return values
					const comment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapBase64}\n`;

					return { code: code + comment, map: { mappings: '' as const } };
				} finally {
					// keep the entry for reuse but drop the document
					doc.raw = '';
					doc.source = '';
					doc.html = '';
					doc.metadata = undefined;
					doc.template = undefined;
					doc.buf = no_records;
					doc.start = 0;
					doc.split = 0;
					doc.end = 0;
				}
			},
		},
	];
}

export { render as compile };
