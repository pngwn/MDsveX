import type { ParsePlugin } from '@mdsvex/parse';
import type { ComponentSource } from '@mdsvex/render/html-cursor';
import type { Plugin, PluginOption, Rollup } from 'vite';
import remapping from '@ampproject/remapping';
import { CompilerSession } from './compile';
import type { ComponentMode } from './compile';
import type { FrontmatterOptions } from './frontmatter';
import { MANIFEST_VERSION, manifest_writer } from './manifest';
import type { MdsvexManifest } from './manifest';
import { scope_of } from './root_scope';
import type { Highlighter, HighlightOption } from './highlight_run';
import type { HighlightOptions } from './highlight';
import { base64_utf8, chained_base64, pfm_map } from './sourcemap_chain';
import type { StoredDocument } from './sourcemap_chain';
import {
	COMPONENTS_ID,
	DIRECTIVES_ID,
	TEMPLATE_DIRECTIVES_ID,
	TEMPLATE_ID,
	VITE_QUERY,
	clean_id,
	svelte_request,
} from './ids';
import { export_tracker } from './export_tracker';
import { component_registry } from './component_registry';
import {
	check_templates,
	template_registry,
	templates_for,
} from './template_registry';
import { has_code, plugin_highlight } from './plugin_highlight';

export * from './compile';
export {
	scan_exports,
	scan_exports_detail,
	module_script,
} from './scan_exports';
export type { ScanKind, ScannedExports } from './scan_exports';
export { MANIFEST_PATH, MANIFEST_VERSION } from './manifest';
export type {
	ManifestModule,
	ManifestTemplate,
	MdsvexManifest,
} from './manifest';

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
	/**
	 * twinkleplop options, every twinkleplop language is loaded the first time
	 * a document has code, a highlighter function, or false for plain code,
	 * import a theme stylesheet such as @twinkleplop/theme-github yourself
	 *
	 * @example
	 * highlight: { languages: { dockerfile: 'bash' }, twoslash: true }
	 */
	highlight?: PluginHighlightOptions | Highlighter | false;
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
	let highlight: HighlightOption | undefined =
		typeof written_highlight === 'function' || written_highlight === false
			? written_highlight
			: undefined;
	let highlight_loading: Promise<void> | null = null;
	function load_highlight(): Promise<void> {
		return (highlight_loading ??= plugin_highlight(
			(written_highlight as PluginHighlightOptions | undefined) ?? {}
		).then(
			(config) => {
				highlight = config;
			},
			(e) => {
				highlight_loading = null;
				throw e;
			}
		));
	}
	// a language goes unknown once per file, not once per compile of it
	const unknown_warned = new Set<string>();
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
				highlight:
					written_highlight === false
						? false
						: typeof written_highlight === 'function'
							? 'custom'
							: 'twinkleplop',
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
			options.component_mode,
			highlight,
			clean_id(id)
		);
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
				const waits: Promise<unknown>[] = [];
				if (highlight === undefined && has_code(code))
					waits.push(load_highlight());
				if (tracker === null) {
					if (waits.length === 0)
						return compile_doc(this, code, id, undefined, undefined);
					return Promise.all(waits).then(() =>
						compile_doc(this, code, id, undefined, undefined)
					);
				}

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
