import type { ComponentSource } from '@mdsvex/render/html-cursor';
import type { Rollup } from 'vite';
import { STATIC_NAMES } from './bundle_statics.js';
import type { StaticBundle } from './bundle_statics.js';
import type { Bundle } from './compile.js';
import {
	PLUGIN_COMPONENTS_ID,
	PLUGIN_ID,
	clean_id,
	importer_in,
} from './ids.js';
import type { ManifestModule, ManifestPlugin } from './manifest.js';
import { scan_file, static_names } from './static_directives.js';
import type { StaticNames } from './static_directives.js';

interface PluginModule {
	/** the id documents import */
	virtual: string;
	/** the specifier the plugin gave */
	spec: string;
	names: string[];
	/** the resolved id without its query, null until resolved */
	file: string | null;
	/** the names a .static. component serves, a directives module only, found at startup */
	statics: StaticNames | null;
	/** the copy of the bundle compile reads, a directives module only */
	bundle: StaticBundle | null;
}

const DIRECTIVE_KINDS = [
	'directive_inline',
	'directive_leaf',
	'directive_container',
] as const;

/**
 * the modules of the plugins option, a plugin names its exports itself, a
 * directives module is scanned once at startup only for the re-exports of
 * .static. components, documents import each through a virtual id that
 * resolves as an import from the vite root would
 */
export function plugin_registry(written: readonly Bundle[]) {
	let root = '';
	const directives: (PluginModule | null)[] = [];
	const components: (PluginModule | null)[] = [];
	const by_id = new Map<string, { module: PluginModule; plugin: string }>();
	/** the plugins as compile takes them, each module replaced by its virtual id */
	let bundles: Bundle[] = [];

	for (let i = 0; i < written.length; i++) {
		const bundle = written[i];
		// compile reports a plugin that is not an object
		if (typeof bundle !== 'object' || bundle === null) {
			bundles.push(bundle);
			directives.push(null);
			components.push(null);
			continue;
		}
		let copy: Bundle | null = null;
		let own: PluginModule | null = null;
		const names =
			typeof bundle.directives === 'object' && bundle.directives !== null
				? Object.keys(bundle.directives)
				: [];
		if (names.length !== 0 && typeof bundle.module === 'string') {
			copy = { ...bundle, module: PLUGIN_ID + i };
			own = {
				virtual: PLUGIN_ID + i,
				spec: bundle.module,
				names,
				file: null,
				statics: null,
				bundle: copy,
			};
			by_id.set(own.virtual, { module: own, plugin: bundle.name });
		}
		let replaced: PluginModule | null = null;
		const source: ComponentSource | undefined = bundle.components;
		if (
			typeof source === 'object' &&
			source !== null &&
			typeof source.specifier === 'string' &&
			Array.isArray(source.names)
		) {
			replaced = {
				virtual: PLUGIN_COMPONENTS_ID + i,
				spec: source.specifier,
				names: source.names,
				file: null,
				statics: null,
				bundle: null,
			};
			by_id.set(replaced.virtual, { module: replaced, plugin: bundle.name });
			copy ??= { ...bundle };
			copy.components = { specifier: replaced.virtual, names: source.names };
		}
		bundles.push(copy ?? bundle);
		directives.push(own);
		components.push(replaced);
	}

	let loading: Promise<void> | null = null;
	let resolved = false;

	async function load(ctx: Rollup.PluginContext): Promise<void> {
		const optimized = new Set<PluginModule>();
		const from = importer_in(root);
		const failed: string[] = [];
		for (const { module, plugin } of by_id.values()) {
			const found = await ctx.resolve(module.spec, from, { skipSelf: true });
			if (found === null || found.external) {
				failed.push(`${JSON.stringify(module.spec)} of plugin ${plugin}`);
				continue;
			}
			module.file = clean_id(found.id);
			const deps = (ctx as { environment?: any }).environment?.depsOptimizer;
			if (deps?.isOptimizedDepFile(found.id)) optimized.add(module);
		}
		if (failed.length !== 0) {
			throw new Error(
				`[mdsvex] could not resolve the module ${failed.join(', ')} ` +
					`from the vite root ${from.slice(0, -'/vite.config'.length)}`
			);
		}
		// a mode is fixed until a restart, the module of a plugin is rarely edited
		for (const module of directives) {
			if (module === null || module.file === null) continue;
			if (optimized.has(module)) {
				ctx.warn(
					`the module ${JSON.stringify(module.spec)} is prebundled by optimizeDeps.include, ` +
						'so its static directives render live, take its package out of optimizeDeps.include'
				);
				continue;
			}
			module.statics = await static_names(
				ctx,
				module.file,
				await scan_file(module.file)
			);
			if (module.statics.names.length !== 0) {
				module.bundle![STATIC_NAMES] = module.statics.names;
				// compile keys what it unpacks by the array
				bundles = bundles.slice();
			}
		}
		resolved = true;
	}

	const manifest_module = (m: PluginModule | null): ManifestModule | null => {
		if (m === null || m.file === null) return null;
		const out: ManifestModule = { id: m.virtual, file: m.file, names: m.names };
		if (m.statics !== null && m.statics.names.length !== 0)
			out.static = m.statics.names;
		return out;
	};
	const static_of = (id: string): PluginModule | undefined => {
		const hit = by_id.get(id)?.module;
		return hit?.statics != null && hit.statics.names.length !== 0
			? hit
			: undefined;
	};

	return {
		/**
		 * the plugins compile option, one array for every document, a new one
		 * once resolved when a plugin serves a static directive
		 */
		get bundles(): Bundle[] {
			return bundles;
		},
		/** a plugin has document wide directive handlers, so one no component takes may still render */
		handles_directives: written.some((bundle) => {
			const parse = bundle?.parse;
			return (
				typeof parse === 'object' &&
				parse !== null &&
				DIRECTIVE_KINDS.some((kind) => parse[kind] !== undefined)
			);
		}),
		set_root(dir: string): void {
			root = dir;
		},
		/** resolves every module once, a failure is kept so it is reported once */
		ensure(ctx: Rollup.PluginContext): Promise<void> {
			if (loading === null) loading = load(ctx);
			return loading;
		},
		resolved(): boolean {
			return resolved;
		},
		/** the component file of a static directive a virtual id serves */
		static_file(id: string, name: string): string | undefined {
			return static_of(id)?.statics!.files[name];
		},
		/** the module of a virtual id that serves a static directive, undefined for none */
		static_module(id: string): string | undefined {
			return static_of(id)?.file ?? undefined;
		},
		/**
		 * the packages of the directives modules, kept out of the dep optimizer
		 * of a dev server, a module named by a path or an import map has none
		 */
		packages(): string[] {
			const out = new Set<string>();
			for (const m of directives) {
				const name = m === null ? null : package_of(m.spec);
				if (name !== null) out.add(name);
			}
			return [...out];
		},
		/** the plugins for the editor manifest, in the order of the option */
		describe(): ManifestPlugin[] {
			const out: ManifestPlugin[] = [];
			for (let i = 0; i < written.length; i++) {
				const own = manifest_module(directives[i]);
				const replaced = manifest_module(components[i]);
				const fences = written[i].fences;
				const claims =
					Array.isArray(fences) && fences.length !== 0 ? fences : null;
				if (own === null && replaced === null && claims === null) continue;
				const entry: ManifestPlugin = {
					name: written[i].name,
					directives: own,
					components: replaced,
				};
				// left out when it claims none, as an entry from before the option is
				if (claims !== null) entry.fences = [...claims];
				out.push(entry);
			}
			return out;
		},
		/** resolved in the environment of ctx, whose conditions may differ */
		resolve(
			ctx: Rollup.PluginContext,
			id: string
		): Promise<Rollup.ResolvedId | null> | undefined {
			const hit = by_id.get(id);
			if (hit === undefined) return undefined;
			return ctx.resolve(hit.module.spec, importer_in(root), {
				skipSelf: true,
			});
		},
	};
}

/** the package name of a bare specifier, null for a path, an import map entry or a url */
function package_of(spec: string): string | null {
	if (/^[./#]|^[a-z][\w+.-]*:/i.test(spec)) return null;
	const parts = spec.split('/');
	if (spec.startsWith('@'))
		return parts.length < 2 ? null : parts[0] + '/' + parts[1];
	return parts[0];
}
