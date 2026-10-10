import type { ComponentSource } from '@mdsvex/render/html-cursor';
import type { Rollup } from 'vite';
import { same_names } from './export_tracker';
import type { ExportTracker, Warn } from './export_tracker';
import {
	COMPONENTS_ID,
	DIRECTIVES_EXPORT,
	DIRECTIVES_ID,
	clean_id,
	importer_in,
	shown,
	spec_of,
} from './ids';
import type { ManifestModule } from './manifest';
import type { ScannedExports } from './scan_exports';

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
export function split_exports(
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
export function component_registry(
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
