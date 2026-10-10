import type { Rollup } from 'vite';
import type { TemplateEntry, TemplateOptions } from './compile';
import { split_exports } from './component_registry';
import { same_names } from './export_tracker';
import type { ExportTracker, Warn } from './export_tracker';
import {
	TEMPLATE_DIRECTIVES_ID,
	TEMPLATE_ID,
	clean_id,
	importer_in,
	shown,
	spec_of,
} from './ids';
import type { MdsvexOptions, TemplateSpec } from './main';
import type { ManifestTemplate } from './manifest';

const has_own = Object.prototype.hasOwnProperty;

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
export function template_registry(
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

export function check_templates(written: Record<string, TemplateSpec>): void {
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
export function templates_for(
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
