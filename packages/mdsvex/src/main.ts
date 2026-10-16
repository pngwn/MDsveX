import type { ParsePlugin, SyntaxOptions } from '@mdsvex/parse';
import type { Plugin, PluginOption, Rollup } from 'vite';
import remapping from '@ampproject/remapping';
// ahead of compile, so @mdsvex/render/sourcemap stays first in the chunk they share
import { base64_utf8, chained_base64, pfm_map } from './sourcemap_chain';
import type { StoredDocument } from './sourcemap_chain';
import {
	CompilerSession,
	check_plugins,
	compile,
	compile_inputs,
	footnotes_option,
} from './compile';
import type {
	Bundle,
	CompileInputs,
	ComponentMode,
	FootnoteOptions,
	Parsed,
} from './compile';
import { slug_of } from './heading_ids';
import type { HeadingOptions } from './heading_ids';
import { smart_of } from './smart_punctuation';
import type { SmartOptions } from './smart_punctuation';
import type { FrontmatterOptions } from './frontmatter';
import { MANIFEST_VERSION, manifest_writer } from './manifest';
import type { MdsvexManifest } from './manifest';
import { scope_of } from './root_scope';
import type { Highlighter, MathRenderer } from './highlight_run';
import type { MathOptions } from './math';
import type { HighlightOptions } from './highlight';
import {
	COMPONENTS_ID,
	DIRECTIVES_ID,
	PLUGIN_COMPONENTS_ID,
	PLUGIN_ID,
	TEMPLATE_DIRECTIVES_ID,
	TEMPLATE_ID,
	VITE_QUERY,
	clean_id,
	svelte_request,
} from './ids';
import { export_tracker } from './export_tracker';
import type { DocumentSource } from './export_tracker';
import { component_registry } from './component_registry';
import { plugin_registry } from './plugin_registry';
import {
	check_templates,
	template_registry,
	templates_for,
} from './template_registry';
import { has_code, plugin_highlight } from './plugin_highlight';
import { check_math, manifest_math } from './plugin_math';
import {
	data_module,
	data_query,
	metadata_query,
	read_metadata,
} from './metadata_query';
import type { MetadataDev, ResolveImport } from './metadata_query';
import { links_of } from './link_urls';
import type { BaseImport, Rewrite } from './link_urls';
import { need_error } from './fence_sources';
import { slashed, source_files } from './source_files';
import {
	SNIPPET_MARK,
	dir_of,
	joined,
	missing_module,
	snippet_code,
	snippet_id,
	snippet_map,
	snippet_modules,
} from './snippet_modules';
import type { SnippetId, SnippetModule } from './snippet_modules';

export * from './compile';
export {
	scan_exports,
	scan_exports_detail,
	module_script,
} from './scan_exports';
export type { ScanKind, ScannedExports } from './scan_exports';
export { MANIFEST_PATH, MANIFEST_VERSION } from './manifest';
export type {
	ManifestMath,
	ManifestModule,
	ManifestPlugin,
	ManifestTemplate,
	MdsvexManifest,
} from './manifest';
export type { MathOptions } from './math';

export interface MdsvexOptions
	extends SyntaxOptions, HeadingOptions, SmartOptions {
	extensions?: string[];
	/**
	 * plugins, each brings directives with the components that render them and
	 * the handlers that reshape what is written inside them, lowest precedence
	 * first, a module resolves as an import from the vite root would, an export
	 * of the same name from a components module replaces a plugin component
	 *
	 * @example
	 * plugins: [steps()]
	 */
	plugins?: Bundle[];
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
	 * an element named export of the module script of a template replaces that
	 * element, a template may be a document, which no template wraps in turn
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
	/**
	 * twinkleplop options, every twinkleplop language is loaded the first time
	 * a document has code, a highlighter function, or false for plain code,
	 * import a theme stylesheet such as @twinkleplop/theme-github yourself
	 *
	 * @example
	 * highlight: { languages: { dockerfile: 'bash' }, twoslash: true }
	 */
	highlight?: PluginHighlightOptions | Highlighter | false;
	/**
	 * how a math fence renders, temml by default, which is loaded the first
	 * time a document has one, { renderer: 'katex' } needs katex installed,
	 * options go to the renderer, a function is a renderer of your own and
	 * false leaves the fence a code block, import the stylesheet of the
	 * renderer yourself, temml/dist/Temml-Local.css or katex/dist/katex.min.css
	 *
	 * @example
	 * math: { options: { macros: { '\\RR': '\\mathbb{R}' } } }
	 */
	math?: MathOptions | MathRenderer | false;
	/**
	 * the accessible names of the footnotes section and of the links back
	 * from it, strict false builds a document whose footnote reference has no
	 * definition, with a warning in place of the error
	 *
	 * @example
	 * footnotes: { label: 'Notes', back_label: 'Back to note {n}' }
	 */
	footnotes?: FootnoteOptions;
	/**
	 * imports every markdown image with a relative url, so vite hashes and
	 * optimises the file and a missing one fails the build, on by default,
	 * ./a.png, ../a.png and a.png are relative to the document, $lib/a.png,
	 * #lib/a.png, @/a.png and ~/a.png go to vite as written, a query stays on
	 * the import, /a.png, a url with a scheme and a src with a svelte
	 * expression are never imported, false leaves every url as written
	 *
	 * @example
	 * ![a diagram](./diagram.png?url)
	 */
	import_images?: boolean;
	/**
	 * called for the url of every markdown link and of every markdown image
	 * that is not imported, after links.routes and before links.base, a string
	 * replaces the url and nothing keeps it, a url with a svelte expression is
	 * never offered, nor is the href or src of an element typed as html
	 *
	 * @example
	 * rewrite: (url, { type }) => (type === 'link' && url.startsWith('/') ? url + '/' : undefined)
	 */
	rewrite?: Rewrite;
	/**
	 * turns relative links to documents into routes and puts the base path in
	 * front of root urls, without a function
	 *
	 * @example
	 * links: { routes: 'src/routes', base: { import: 'resolve', from: '$app/paths' } }
	 */
	links?: PluginLinkOptions;
}

export interface PluginLinkOptions {
	/**
	 * the directory whose files are served by path, relative to the vite root,
	 * a relative link to a document in it becomes the route of that document,
	 * the extension goes, as do a last index or +page and any (group), the
	 * query and fragment stay, the extensions option says which files are documents
	 *
	 * @example
	 * // in src/routes/guide/+page.svx, [setup](../setup/+page.svx#install) links to /setup#install
	 * links: { routes: 'src/routes' }
	 */
	routes?: string;
	/**
	 * goes in front of every url that starts with one slash, of links and of
	 * images, true is the base of vite, a string is a fixed prefix,
	 * { import, from } names a function that adds it where the page renders
	 *
	 * @example
	 * links: { base: true }
	 * @example
	 * links: { base: { import: 'resolve', from: '$app/paths' } }
	 */
	base?: true | string | BaseImport;
}

const ABSOLUTE = /^(?:[\\/]|[a-zA-Z]:[\\/])/;
const ROOTED = /^(?:\/|[a-zA-Z][a-zA-Z0-9+.-]*:)/;
const DRIVE = /^[a-zA-Z]:\//;

export interface PluginHighlightOptions extends Omit<
	HighlightOptions,
	'twoslash'
> {
	/**
	 * route ts, tsx, js and jsx fences marked twoslash through
	 * @twinkleplop/twoslash, and svelte ones through
	 * @twinkleplop/twoslash-svelte with { svelte: true }, install them yourself
	 */
	twoslash?: boolean | { svelte?: boolean };
}

/** what a transform gives, later when it had to load the math renderer first */
type Compiled = { code: string } | Promise<{ code: string }>;

/** a template module, or one with a module of replacements merged over its own */
export type TemplateSpec =
	| string
	| URL
	| { component: string | URL; components?: string | URL };

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
		// only the query is tested, a path may hold an ampersand
		if (q >= 0 && (svelte_request(id, q) || VITE_QUERY.test(id.slice(q))))
			return false;
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
	// one for every document, only the fields a document can change are stored again
	const inputs = compile_inputs();
	const written_plugins = options.plugins;
	// one clear error when the plugin is made rather than one per document
	if (written_plugins !== undefined) check_plugins(written_plugins);
	const plugins =
		written_plugins === undefined || written_plugins.length === 0
			? null
			: plugin_registry(written_plugins);
	// the same array for every document, compile keys what it derives by it
	if (plugins !== null) inputs.plugins = plugins.bundles;
	inputs.parse_plugins = options.parse_plugins;
	inputs.component_mode = options.component_mode;
	inputs.frontmatter_parse = options.frontmatter?.parse;
	inputs.unwrap_images = options.unwrap_images;
	// throws here for a value that is neither, not at the first document
	inputs.heading_ids = slug_of(options.heading_ids);
	inputs.smart_punctuation = smart_of(options.smart_punctuation);
	if (options.footnotes !== undefined)
		inputs.footnotes = footnotes_option(options.footnotes);
	if (
		options.import_images !== undefined &&
		typeof options.import_images !== 'boolean'
	)
		throw new Error('[mdsvex] import_images must be true or false');
	inputs.import_images = options.import_images !== false;
	// a document that shows a file with src= stops after its parse, the
	// plugin reads the file and the document renders with it
	inputs.await_sources = true;
	// a document whose plugins defer work stops after its parse too, the
	// plugin waits for that work in the same gap and then renders it
	inputs.await_plugins = true;
	// ctx.read of a plugin, a dependency of the document it reads for
	inputs.read = async (path) => {
		const fs = await import('node:fs/promises');
		return fs.readFile(path, 'utf8');
	};
	/** ctx.resolve of a plugin, as an import from the document would resolve */
	const resolver =
		(resolve: ResolveImport, file: string): CompileInputs['resolve'] =>
		(spec, from) =>
			resolve
				.resolve(spec, from ?? file)
				.then((found) =>
					found === null || found.external ? null : slashed(clean_id(found.id))
				);
	/** a build watches what plugins read, the dev server asks hotUpdate, ctx is none when an edit is compared */
	function track_dependencies(
		ctx: Rollup.PluginContext | undefined,
		file: string,
		deps: readonly string[] | undefined
	): void {
		shown.depend(file, deps);
		if (deps === undefined) return;
		for (const path of deps) {
			if (command === 'build') ctx?.addWatchFile(path);
			else dev?.watch(path);
		}
	}
	const shown = source_files();
	const fetched = new WeakMap<Parsed, Record<string, string>>();
	// a fence marked run is a module, a fake sibling of its document, which
	// resolveId and load serve from what the compile of the document gave
	inputs.snippets = true;
	const modules = snippet_modules();
	const written_links = options.links;
	if (
		written_links !== undefined &&
		(typeof written_links !== 'object' || written_links === null)
	)
		throw new Error('[mdsvex] links must be an object');
	/** routes is read from the vite root and base: true is the base of vite */
	function set_links(root: string, base: string): void {
		const routes = written_links?.routes;
		const based = written_links?.base;
		inputs.links = links_of(
			options.rewrite,
			written_links === undefined
				? undefined
				: {
						routes:
							typeof routes !== 'string' ||
							routes === '' ||
							ABSOLUTE.test(routes)
								? routes
								: root + '/' + routes,
						extensions,
						// a relative base says nothing about where the site is served
						base: based === true ? (ROOTED.test(base) ? base : '') : based,
					}
		);
	}
	// throws here for an option of the wrong type, not at the first document
	set_links('', '');

	const written_highlight = options.highlight;
	if (
		written_highlight !== undefined &&
		written_highlight !== false &&
		typeof written_highlight !== 'function' &&
		(typeof written_highlight !== 'object' || written_highlight === null)
	)
		throw new Error(
			'[mdsvex] highlight must be twinkleplop options, a highlighter function or false'
		);
	// twinkleplop loads with the first document that has code
	if (typeof written_highlight === 'function' || written_highlight === false)
		inputs.highlight = written_highlight;
	let highlight_loading: Promise<void> | null = null;
	function load_highlight(): Promise<void> {
		return (highlight_loading ??= plugin_highlight(
			(written_highlight as PluginHighlightOptions | undefined) ?? {}
		).then(
			(config) => {
				inputs.highlight = config;
			},
			(e) => {
				highlight_loading = null;
				throw e;
			}
		));
	}
	const written_math = options.math;
	check_math(written_math);
	// the renderer loads with the first math fence a compile meets, until
	// then one that only says so stands in, no document is searched for math
	let math_needed = false;
	const math_pending: MathRenderer = () => {
		math_needed = true;
		return '';
	};
	inputs.math =
		written_math === false || typeof written_math === 'function'
			? written_math
			: math_pending;
	let math_loading: Promise<void> | null = null;
	/** loads the renderer, then renders what met a math fence without it again */
	function load_math(compile: () => Compiled): Promise<{ code: string }> {
		math_needed = false;
		return (math_loading ??= import('./math')
			.then((m) => m.load_math(written_math as MathOptions | undefined))
			.then(
				(renderer) => {
					inputs.math = renderer;
				},
				(e) => {
					math_loading = null;
					throw e;
				}
			)).then(compile);
	}
	// a language goes unknown once per file, not once per compile of it
	const unknown_warned = new Set<string>();
	if (options.component_mode !== undefined)
		scope_of(undefined, options.component_mode);
	// the parser only takes true, anything else would be off without a word
	if (
		options.unwrap_images !== undefined &&
		typeof options.unwrap_images !== 'boolean'
	)
		throw new Error('[mdsvex] unwrap_images must be true or false');
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
	// a plain compile, none of these options change the module script of a document
	const scanned_document: DocumentSource = (file, code) => {
		if (!matches(file)) return null;
		const result = compile(code, {
			filename: file,
			frontmatter: options.frontmatter,
			parse_plugins: options.parse_plugins,
			template: false,
			strict_directives: false,
			highlight: false,
			math: false,
			import_images: false,
			sources: false,
			snippets: false,
		});
		return { code: result.code, frontmatter: result.metadata !== undefined };
	};
	// a config without replacements or templates builds none of their state
	const tracker =
		list.length === 0 && !has_templates
			? null
			: export_tracker(scanned_document);
	const registry =
		list.length === 0 ? null : component_registry(list, tracker!);
	const templates = has_templates
		? template_registry(written_templates!, tracker!, matches)
		: null;
	let command: 'build' | 'serve' = 'serve';
	/** true when the handlers of a plugin run for a document */
	const can_plug =
		plugins !== null ||
		(options.parse_plugins !== undefined && options.parse_plugins.length !== 0);

	const no_templates = templates === null && select === undefined;
	/** the handlers of a plugin are guarded by the directives the config registers */
	function plugs_ready(
		ctx: Rollup.PluginContext
	): Promise<unknown> | undefined {
		const waits: Promise<unknown>[] = [];
		if (registry !== null && !registry.ready())
			waits.push(registry.ensure(ctx));
		if (templates !== null && !templates.ready())
			waits.push(templates.ensure(ctx));
		return waits.length === 0 ? undefined : Promise.all(waits);
	}
	/** the inputs of a parse that no render follows, it asks for nothing a render would need */
	function parsing_inputs(file: string, resolve: ResolveImport) {
		const parsing = Object.assign(compile_inputs(), inputs);
		parsing.filename = file;
		parsing.resolve = resolver(resolve, file);
		if (!no_templates)
			parsing.templates = templates_for(templates, select, file);
		parsing.directives = registry?.directive_sources();
		parsing.import_images = false;
		parsing.sources = false;
		parsing.await_sources = false;
		parsing.links = undefined;
		parsing.snippets = false;
		return parsing;
	}
	const metadata = metadata_query(extensions, options.frontmatter?.parse);
	const queried_data = data_query(extensions, {
		ready: plugs_ready,
		settled: () =>
			(registry === null || registry.ready()) &&
			(templates === null || templates.ready()),
		module(raw, file, resolve, ctx) {
			// no handler can run, so the frontmatter is all there is
			if (!can_plug)
				return data_module(
					read_metadata(raw, options.frontmatter?.parse),
					undefined
				);
			const parsed = compiler.parse(raw, parsing_inputs(file, resolve));
			const settled = compiler.settle(parsed);
			const done = () => {
				track_dependencies(ctx, file, parsed.dependencies);
				return data_module(parsed.metadata, parsed.data);
			};
			if (settled === undefined) {
				compiler.drop(parsed);
				return done();
			}
			// what the plugins deferred is in the data, nothing renders
			return settled.then(done).finally(() => compiler.drop(parsed));
		},
	});
	let dev: MetadataDev | null = null;

	// what select_template picked, only it can not be worked out from the source
	const documents =
		select === undefined ? null : new Map<string, string | null>();
	let log: (message: string) => void = () => {};
	let root = '';
	const manifest = manifest_writer(
		(): MdsvexManifest | null => {
			// a process that resolves the config and never builds, such as vite
			// preview or a test runner, must not replace a manifest with an empty one
			if (
				registry?.resolved() === false ||
				templates?.resolved() === false ||
				plugins?.resolved() === false
			)
				return null;
			const root_modules = registry?.describe();
			const out: MdsvexManifest = {
				version: MANIFEST_VERSION,
				root,
				extensions,
				component_mode: options.component_mode ?? 'markdown',
				frontmatter_parse: options.frontmatter?.parse !== undefined,
				directive_plugins:
					plugins?.handles_directives === true ||
					(options.parse_plugins ?? []).some(
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
				highlight:
					written_highlight === false
						? false
						: typeof written_highlight === 'function'
							? 'custom'
							: 'twinkleplop',
			};
			// left out when off, as a manifest from before the option has it
			if (options.unwrap_images === true) out.unwrap_images = true;
			// on by default, so the editor types a src as the import it is
			if (inputs.import_images === true) out.import_images = true;
			if (plugins !== null) {
				const described = plugins.describe();
				if (described.length !== 0) out.plugins = described;
			}
			// a slug function can not be written, an editor slugs as the default does
			if (inputs.heading_ids !== undefined) out.heading_ids = true;
			if (inputs.smart_punctuation !== undefined)
				out.smart_punctuation = inputs.smart_punctuation;
			// handlers do not run in an editor, which declares the export they may add
			if (can_plug) out.plugin_data = true;
			// left out for temml without options, the default
			const math = manifest_math(written_math);
			if (math !== undefined) out.math = math;
			return out;
		},
		(message) => log(message)
	);

	/**
	 * parsed is a document that only has to render, null when the document
	 * stopped after its parse for the files it shows, show_sources renders it
	 */
	function compile_doc(
		ctx: Rollup.TransformPluginContext,
		code: string,
		id: string,
		parsed: Parsed | undefined
	): { code: string } | null {
		let doc = stored.get(id);
		if (doc === undefined) {
			doc = {
				raw: '',
				source: '',
				html: '',
				metadata: undefined,
				template: undefined,
				warnings: undefined,
				data: undefined,
				buf: no_records,
				start: 0,
				split: 0,
				end: 0,
				waiting: undefined,
				snippets: undefined,
			};
			stored.set(id, doc);
		}
		// raw last, so a compile that throws leaves no document for post
		doc.raw = '';
		// without templates or a selector a query has nothing to pick
		if (!no_templates) inputs.templates = templates_for(templates, select, id);
		inputs.filename = clean_id(id);
		inputs.resolve = resolver(ctx, clean_id(id));
		if (parsed === undefined) {
			compiler.compile_into(code, inputs, doc);
			if (doc.waiting !== undefined) return null;
			// it shows no file, or no longer
			if (!shown.empty) shown.drop(clean_id(id));
		} else {
			const sources = fetched.get(parsed);
			if (sources === undefined) compiler.render_into(parsed, inputs, doc);
			else {
				inputs.sources = sources;
				try {
					compiler.render_into(parsed, inputs, doc);
				} finally {
					inputs.sources = undefined;
				}
			}
		}
		doc.raw = code;
		track_dependencies(ctx, clean_id(id), doc.dependencies);
		const made = doc.snippets;
		if (made !== undefined) {
			doc.snippets = undefined;
			modules.set(clean_id(id), code, made);
		}
		// it runs no block, or no longer
		else if (!modules.empty) modules.drop(clean_id(id));
		if (doc.warnings !== undefined) {
			// a document that met math without its renderer renders again and warns then
			if (!math_needed)
				for (const w of doc.warnings) {
					if (w.code === 'unknown_language') {
						const key = clean_id(id) + '\0' + w.message;
						if (unknown_warned.has(key)) continue;
						unknown_warned.add(key);
					}
					ctx.warn(w.message, w.start);
				}
			doc.warnings = undefined;
		}

		// return NO map, avoids poisoning getCombinedSourcemap()
		return { code: doc.html };
	}

	/**
	 * for a document that met a math fence before the renderer was loaded,
	 * called straight after its compile, so the session still holds its parse,
	 * which is kept and renders again once the renderer is there
	 */
	function rerender(
		code: string,
		id: string,
		again: (parsed: Parsed) => Compiled
	): Promise<{ code: string }> {
		const parsed = compiler.keep(code, inputs, stored.get(id)!.metadata);
		return load_math(() => again(parsed));
	}

	/** rerender for a config without replacements or templates */
	function recompile(
		ctx: Rollup.TransformPluginContext,
		code: string,
		id: string
	): Promise<{ code: string }> {
		return rerender(code, id, (parsed) => compile_doc(ctx, code, id, parsed)!);
	}

	/**
	 * for a document that stopped after its parse, called straight after its
	 * compile, waits for what its plugins deferred, resolves each file its
	 * fences show as an import from the document would, reads it, and renders
	 * the document with the text, a document with math first loads the
	 * renderer it would meet unloaded
	 */
	async function show_sources(
		ctx: Rollup.TransformPluginContext,
		id: string,
		again: (parsed: Parsed) => Compiled
	): Promise<{ code: string }> {
		const doc = stored.get(id)!;
		const parsed = doc.waiting!;
		doc.waiting = undefined;
		const settled = compiler.settle(parsed);
		if (settled !== undefined) {
			// a plugin that waits on something slow is named, there is no time limit
			const slow =
				command === 'serve'
					? setTimeout(() => {
							const plugins = compiler
								.waiting_for(parsed)
								.map((name) => `"${name}"`)
								.join(', ');
							ctx.warn(
								`${clean_id(id)} has waited 5 seconds for plugin ${plugins}`
							);
						}, 5000)
					: undefined;
			try {
				await settled;
			} catch (e) {
				compiler.drop(parsed);
				throw e;
			} finally {
				clearTimeout(slow);
			}
		}
		const needs = parsed.needs;
		// it waited for its plugins alone
		if (needs === undefined || !needs.some((need) => need.type === 'source')) {
			if (!shown.empty) shown.drop(clean_id(id));
			if (parsed.math && inputs.math === math_pending)
				return load_math(() => again(parsed));
			return again(parsed);
		}
		const file = clean_id(id);
		const fs = await import('node:fs/promises');
		const sources: Record<string, string> = {};
		const files: string[] = [];
		await Promise.all(
			needs.map(async (need) => {
				if (need.type !== 'source') return;
				const resolved = await ctx.resolve(need.spec, file);
				if (resolved === null || resolved.external)
					throw need_error(
						need,
						`Could not resolve "${need.spec}" from "${file}"`,
						file
					);
				const path = slashed(clean_id(resolved.id));
				let text: string;
				try {
					text = await fs.readFile(path, 'utf8');
				} catch {
					throw need_error(
						need,
						`Could not read "${path}", the file src=${need.spec} names`,
						file
					);
				}
				sources[need.spec] = text;
				files.push(path);
			})
		);
		shown.track(file, files);
		for (const path of files) {
			// a watch build compiles again when the file changes, the dev server asks hotUpdate
			if (command === 'build') ctx.addWatchFile(path);
			else dev?.watch(path);
		}
		fetched.set(parsed, sources);
		if (parsed.math && inputs.math === math_pending)
			return load_math(() => again(parsed));
		return again(parsed);
	}

	/** show_sources for a config without replacements or templates */
	function reshow(
		ctx: Rollup.TransformPluginContext,
		code: string,
		id: string
	): Promise<{ code: string }> {
		return show_sources(
			ctx,
			id,
			(parsed) => compile_doc(ctx, code, id, parsed)!
		);
	}

	/**
	 * the id of a snippet, the path of its document with the hash and the
	 * extension after it, from the specifier a document imports it by or
	 * from the url a browser asks for, undefined for any other id
	 */
	function resolve_snippet(
		id: string,
		importer: string | undefined
	): string | Promise<string> | undefined {
		const q = id.indexOf('?');
		// the style of a svelte block is a request of vite-plugin-svelte
		if (q >= 0 && svelte_request(id, q)) return;
		const path = slashed(q < 0 ? id : id.slice(0, q));
		const at = snippet_id(path);
		if (at === null || !matches(at.doc)) return;
		const query = q < 0 ? '' : id.slice(q);
		if (path.charCodeAt(0) === 46) {
			if (importer === undefined) return;
			return joined(dir_of(slashed(clean_id(importer))), path) + query;
		}
		if (!ABSOLUTE.test(path)) return;
		if (path.startsWith('/@fs/')) {
			const file = path.slice(5);
			return (DRIVE.test(file) ? file : '/' + file) + query;
		}
		const base = root.replace(/\/$/, '');
		if (base === '' || path.startsWith(base + '/')) return path + query;
		// a url is a path from the root, an id is a path of the file system
		return import('node:fs').then((fs) =>
			!fs.existsSync(at.doc) && fs.existsSync(base + at.doc)
				? base + path + query
				: path + query
		);
	}

	function snippet_loaded(at: SnippetId, hit: SnippetModule) {
		return {
			code: snippet_code(hit.snippet),
			map: snippet_map(at.doc, hit.raw, hit.snippet),
		};
	}

	/**
	 * the code of a snippet for an environment that asks before it compiled
	 * the document, a server render, a cold start or a build worker, the
	 * document is read and parsed again and the block found by its hash, a
	 * hash the document no longer has is an empty module that warns
	 */
	async function snippet_from_disk(ctx: Rollup.PluginContext, at: SnippetId) {
		const fs = await import('node:fs/promises');
		let raw: string | undefined;
		try {
			raw = await fs.readFile(at.doc, 'utf8');
		} catch {
			// no document, no block
		}
		if (raw !== undefined) {
			await plugs_ready(ctx);
			const parsing = parsing_inputs(at.doc, ctx);
			parsing.snippets = true;
			try {
				const parsed = compiler.parse(raw, parsing);
				try {
					// a block a plugin added waits for what it deferred
					await compiler.settle(parsed);
				} finally {
					compiler.drop(parsed);
				}
				const found = parsed.snippets;
				if (found !== undefined) modules.add(at.doc, raw, found);
			} catch {
				// the compile of the document reports what is wrong with it
			}
			const hit = modules.get(at.doc, at.hash);
			if (hit !== undefined) return snippet_loaded(at, hit);
		}
		const message = `[mdsvex] ${at.doc} has no block that runs with the hash ${at.hash}, the document changed since it was imported`;
		// only a dev server serves a document that changes under its imports
		if (command === 'build') ctx.error(message);
		ctx.warn(message);
		return {
			code: missing_module(at.extension, message),
			map: { mappings: '' as const },
		};
	}

	/** undefined for an id that is no snippet, sub requests of one are not it either */
	function load_snippet(ctx: Rollup.PluginContext, id: string) {
		if (id.indexOf('?') !== -1) return;
		const at = snippet_id(slashed(id));
		if (at === null || !matches(at.doc)) return;
		const hit = modules.get(at.doc, at.hash);
		return hit !== undefined
			? snippet_loaded(at, hit)
			: snippet_from_disk(ctx, at);
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
				plugins?.set_root(config.root);
				command = config.command;
				root = config.root;
				set_links(config.root, config.base);
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

			configureServer(server) {
				dev = {
					config: server.config,
					// vite watches a file outside the root once it is a module, a document read for its metadata never is
					watch(file) {
						if (!file.startsWith(root.replace(/\/$/, '') + '/'))
							server.watcher.add(file);
					},
				};
			},

			async buildStart() {
				// one clear error at startup rather than one per document
				if (registry !== null) await registry.ensure(this);
				if (templates !== null) await templates.ensure(this);
				if (plugins !== null) await plugins.ensure(this);
				manifest.schedule();
			},

			async buildEnd() {
				await manifest.flush();
			},

			resolveId(id, importer) {
				if (id.indexOf(SNIPPET_MARK) !== -1) {
					const snippet = resolve_snippet(id, importer);
					if (snippet !== undefined) return snippet;
				}
				const queried =
					metadata.resolve(this, id, importer) ??
					queried_data.resolve(this, id, importer);
				if (queried !== undefined) return queried;
				if (
					registry !== null &&
					(id.startsWith(COMPONENTS_ID) || id.startsWith(DIRECTIVES_ID))
				)
					return registry.resolve(this, id);
				if (templates !== null && id.startsWith(TEMPLATE_ID))
					return templates.resolve(this, id);
				if (templates !== null && id.startsWith(TEMPLATE_DIRECTIVES_ID))
					return templates.resolve_directives(this, id);
				if (
					plugins !== null &&
					(id.startsWith(PLUGIN_ID) || id.startsWith(PLUGIN_COMPONENTS_ID))
				)
					return plugins.resolve(this, id);
			},

			load(id) {
				if (id.indexOf(SNIPPET_MARK) !== -1) {
					const snippet = load_snippet(this, id);
					if (snippet !== undefined) return snippet;
				}
				if (metadata.is(id)) return metadata.load(this, id, dev);
				if (queried_data.is(id)) return queried_data.load(this, id, dev);
				// only templates with extra replacements load a module
				if (templates !== null && id.startsWith('\0' + TEMPLATE_ID))
					return templates.load(this, id);
			},

			transform(code, id) {
				if (!matches(id)) return;
				const waits: Promise<unknown>[] = [];
				if (inputs.highlight === undefined && has_code(code))
					waits.push(load_highlight());
				if (tracker === null) {
					if (waits.length === 0) {
						const result = compile_doc(this, code, id, undefined);
						if (result === null) return reshow(this, code, id);
						return math_needed ? recompile(this, code, id) : result;
					}
					return Promise.all(waits).then(() => {
						const result = compile_doc(this, code, id, undefined);
						if (result === null) return reshow(this, code, id);
						return math_needed ? recompile(this, code, id) : result;
					});
				}

				const finish = (parsed?: Parsed): Compiled => {
					// a watch build compiles again when the exports change, in dev the virtual import is the edge
					if (command === 'build') {
						if (registry !== null)
							for (const file of registry.files()) this.addWatchFile(file);
						if (templates !== null)
							for (const file of templates.files()) this.addWatchFile(file);
					}
					// the registry gives new arrays when a module changes its exports
					inputs.components = registry?.sources();
					inputs.directives = registry?.directive_sources();
					const result = compile_doc(this, code, id, parsed);
					// it shows files, which are read before it renders
					if (result === null) return show_sources(this, id, finish);
					// it met a math fence before the renderer was loaded
					if (math_needed) return rerender(code, id, finish);
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
				// a document that read it compiles again with what it reads now
				compiler.invalidate([slashed(file)]);
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
				const queried = await metadata.hot(this.environment, update);
				let with_queried =
					queried === undefined ? undefined : [...update.modules, queried];
				const parsed_again = await queried_data.hot(this.environment, update);
				if (parsed_again !== undefined)
					(with_queried ??= update.modules.slice()).push(parsed_again);
				// a file a fence shows or a plugin read is no module of the document, so nothing else compiles it again
				const showing = shown.docs_showing(file);
				if (showing.length !== 0) {
					// what ctx.cached kept from it goes before the documents compile again
					compiler.invalidate([file]);
					const graph = this.environment.moduleGraph;
					with_queried ??= update.modules.slice();
					for (const doc of showing) {
						const mods = [...(graph.getModulesByFile(doc) ?? [])];
						const data = graph.getModuleById(queried_data.id_of(doc));
						if (data !== undefined) mods.push(data);
						for (const mod of mods) {
							graph.invalidateModule(mod, new Set(), update.timestamp, true);
							if (!with_queried.includes(mod)) with_queried.push(mod);
						}
					}
				}
				if (!in_root && !in_templates) return with_queried;
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
				if (!changed) return with_queried;
				manifest.schedule();

				// names changed, documents compiled against the old set compile again
				const graph = this.environment.moduleGraph;
				const modules = with_queried ?? update.modules.slice();
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
					// joined at run time so no tool reads this text as the map of this file
					const marker = ['//# source', 'MappingURL='].join('');
					const comment = `\n${marker}data:application/json;charset=utf-8;base64,${mapBase64}\n`;

					return { code: code + comment, map: { mappings: '' as const } };
				} finally {
					// keep the entry for reuse but drop the document
					doc.raw = '';
					doc.source = '';
					doc.html = '';
					doc.metadata = undefined;
					doc.template = undefined;
					doc.data = undefined;
					doc.buf = no_records;
					doc.start = 0;
					doc.split = 0;
					doc.end = 0;
				}
			},
		},
	];
}
