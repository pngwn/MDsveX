import type { ParsePlugin } from '@mdsvex/parse';
import type { ComponentSource } from '@mdsvex/render/html-cursor';
import type { Plugin, PluginOption, Rollup } from 'vite';
import remapping from '@ampproject/remapping';
import { CompilerSession } from './compile';
import type { ComponentMode, TemplateEntry, TemplateOptions } from './compile';
import type { FrontmatterOptions } from './frontmatter';
import { MANIFEST_VERSION, manifest_writer } from './manifest';
import type {
	ManifestModule,
	ManifestTemplate,
	MdsvexManifest,
} from './manifest';
import { scope_of } from './root_scope';
import type { ScannedExports } from './scan_exports';
import type {
	HighlightConfig,
	Highlighter,
	HighlightOption,
} from './highlight_run';
import type { HighlightOptions, HtmlHighlighter } from './highlight';
import { export_tracker, same_names } from './export_tracker';
import type { ExportTracker, Warn } from './export_tracker';
import {
	COMPONENTS_ID,
	DIRECTIVES_EXPORT,
	DIRECTIVES_ID,
	TEMPLATE_DIRECTIVES_ID,
	TEMPLATE_ID,
	VITE_QUERY,
	clean_id,
	importer_in,
	shown,
	spec_of,
	svelte_request,
} from './ids';
import { base64_utf8, chained_base64, pfm_map } from './sourcemap_chain';
import type { StoredDocument } from './sourcemap_chain';

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

const has_own = Object.prototype.hasOwnProperty;

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
async function plugin_highlight(
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
function has_code(code: string): boolean {
	return code.includes('```') || code.includes('~~~') || code.includes('`#!');
}

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
