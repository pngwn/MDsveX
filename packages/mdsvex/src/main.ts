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
} from './compile';
import type { Bundle, ComponentMode, Parsed } from './compile';
import { slug_of } from './heading_ids';
import type { HeadingOptions } from './heading_ids';
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
import { metadata_query } from './metadata_query';
import type { MetadataDev } from './metadata_query';

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

export interface MdsvexOptions extends SyntaxOptions, HeadingOptions {
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
}

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
	if (
		options.import_images !== undefined &&
		typeof options.import_images !== 'boolean'
	)
		throw new Error('[mdsvex] import_images must be true or false');
	inputs.import_images = options.import_images !== false;

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

	const no_templates = templates === null && select === undefined;
	const metadata = metadata_query(extensions, options.frontmatter?.parse);
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
			if (plugins !== null) {
				const described = plugins.describe();
				if (described.length !== 0) out.plugins = described;
			}
			// a slug function can not be written, an editor slugs as the default does
			if (inputs.heading_ids !== undefined) out.heading_ids = true;
			// left out for temml without options, the default
			const math = manifest_math(written_math);
			if (math !== undefined) out.math = math;
			return out;
		},
		(message) => log(message)
	);

	/** parsed is a document that only has to render again */
	function compile_doc(
		ctx: Rollup.TransformPluginContext,
		code: string,
		id: string,
		parsed: Parsed | undefined
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
				data: undefined,
				buf: no_records,
				start: 0,
				split: 0,
				end: 0,
			};
			stored.set(id, doc);
		}
		// raw last, so a compile that throws leaves no document for post
		doc.raw = '';
		// without templates or a selector a query has nothing to pick
		if (!no_templates) inputs.templates = templates_for(templates, select, id);
		inputs.filename = clean_id(id);
		if (parsed === undefined) compiler.compile_into(code, inputs, doc);
		else compiler.render_into(parsed, inputs, doc);
		doc.raw = code;
		if (doc.warnings !== undefined) {
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
		return rerender(code, id, (parsed) => compile_doc(ctx, code, id, parsed));
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
				const queried = metadata.resolve(this, id, importer);
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
				if (metadata.is(id)) return metadata.load(this, id, dev);
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
						return math_needed ? recompile(this, code, id) : result;
					}
					return Promise.all(waits).then(() => {
						const result = compile_doc(this, code, id, undefined);
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
				const with_queried =
					queried === undefined ? undefined : [...update.modules, queried];
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
					const comment = `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapBase64}\n`;

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
