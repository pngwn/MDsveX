import type {
	EnvironmentModuleGraph,
	EnvironmentModuleNode,
	ResolvedConfig,
	Rollup,
} from 'vite';
import type { FrontmatterOptions } from './frontmatter';
import { DATA_ID, METADATA_ID, clean_id } from './ids';
import { metadata_module } from './query_modules';

export {
	data_module,
	frontmatter_bounds,
	metadata_module,
	read_metadata,
} from './query_modules';

// vite-plugin-svelte compiles any id that ends in a document extension, even after
// \0, and the dep scanner reads an id that looks like a path from disk
const SUFFIX = '.js';
const METADATA_QUERY = /[?&]metadata(?:&|$)/;
/** the query of an import that parses a document for what its plugins left */
export const DATA_QUERY = 'data';
const DATA_QUERY_TEST = new RegExp(`[?&]${DATA_QUERY}(?:&|$)`);

/** vite sets environment, the rollup type has none */
type Context = Rollup.PluginContext & {
	environment?: { name: string; config?: { consumer?: string } };
};

/** what load takes from a dev server */
export interface MetadataDev {
	config: ResolvedConfig;
	/** vite watches its root, a document outside it needs adding */
	watch(file: string): void;
}

/** documents imported with ?metadata, which load their frontmatter and compile nothing */
export function metadata_query(
	extensions: string[],
	parse: FrontmatterOptions['parse']
) {
	return document_query(extensions, METADATA_ID, METADATA_QUERY, {
		module: (raw) => metadata_module(raw, parse),
	});
}

/** how a query turns a document into its module */
export interface QueryModule {
	/** file is the path of the document, a promise when its plugins deferred work */
	module(raw: string, file: string): string | Promise<string>;
	/** awaited before module in a load */
	ready?(ctx: Rollup.PluginContext): Promise<unknown> | undefined;
	/** false when module can not run outside a load, an edit then reloads unasked */
	settled?(): boolean;
}

/**
 * documents imported with ?data, which parse without a render and load their
 * metadata and what their plugins left
 */
export function data_query(extensions: string[], build: QueryModule) {
	return document_query(extensions, DATA_ID, DATA_QUERY_TEST, build);
}

/** documents imported with a query that loads a module made from their source */
function document_query(
	extensions: string[],
	virtual_id: string,
	QUERY: RegExp,
	build: QueryModule
) {
	const VIRTUAL = '\0' + virtual_id;
	/** the module each dev environment last loaded for a document */
	const loaded = new Map<string, string>();
	const key_of = (environment: string | undefined, file: string) =>
		(environment ?? '') + '\0' + file;
	const is_document = (path: string) =>
		extensions.some((ext) => path.endsWith(ext));

	async function may_serve(
		ctx: Context,
		dev: MetadataDev,
		file: string
	): Promise<boolean> {
		// vite reads any file for a server environment, only its own process asks
		if (ctx.environment?.config?.consumer === 'server') return true;
		const [vite, path] = await Promise.all([
			import('vite'),
			import('node:path'),
		]);
		// the check of vite is a prefix test, it takes .. segments as written
		if (vite.normalizePath(path.resolve(file)) !== file) return false;
		return vite.isFileLoadingAllowed(dev.config, file);
	}

	return {
		/** undefined unless id is a document imported with the query */
		resolve(
			ctx: Rollup.PluginContext,
			id: string,
			importer: string | undefined
		): Promise<string | null> | undefined {
			const q = id.indexOf('?');
			if (q < 0 || !QUERY.test(id.slice(q))) return;
			const path = id.slice(0, q);
			if (!is_document(path)) return;
			return ctx
				.resolve(path, importer, { skipSelf: true })
				.then((resolved) =>
					resolved === null || resolved.external
						? null
						: VIRTUAL + clean_id(resolved.id) + SUFFIX
				);
		},

		is(id: string): boolean {
			return id.startsWith(VIRTUAL);
		},

		/** undefined for a path that is not a document or that dev may not serve, as for an id nothing loads */
		async load(
			ctx: Context,
			id: string,
			dev: MetadataDev | null
		): Promise<string | undefined> {
			const file = id.slice(VIRTUAL.length, -SUFFIX.length);
			// a request can name any id, resolve need not have made this one
			if (!id.endsWith(SUFFIX) || !is_document(file)) return;
			if (dev !== null && !(await may_serve(ctx, dev, file))) return;
			// in dev addWatchFile makes this module an importer of the document, so an
			// edit of its body would reach the importers of the metadata
			if (dev === null) ctx.addWatchFile(file);
			else dev.watch(file);
			const fs = await import('node:fs/promises');
			const raw = await fs.readFile(file, 'utf8');
			const key = key_of(ctx.environment?.name, file);
			await build.ready?.(ctx);
			let code: string;
			try {
				code = await build.module(raw, file);
			} catch (e: any) {
				loaded.delete(key);
				// vite adds these to what a transform throws, a load has no file of its own
				if (e !== null && typeof e === 'object') {
					e.id ??= file;
					if (e.loc == null && e.line && e.column)
						e.loc = { file, line: e.line, column: e.column };
				}
				throw e;
			}
			if (dev !== null) loaded.set(key, code);
			return code;
		},

		/** the module of an edited document, invalidated, when the edit changed it */
		async hot(
			environment: { name: string; moduleGraph: EnvironmentModuleGraph },
			update: {
				file: string;
				timestamp: number;
				read: () => string | Promise<string>;
			}
		): Promise<EnvironmentModuleNode | undefined> {
			const graph = environment.moduleGraph;
			// no file leads vite to a virtual module
			const mod = graph.getModuleById(VIRTUAL + update.file + SUFFIX);
			if (mod === undefined) return;
			const key = key_of(environment.name, update.file);
			const before = loaded.get(key);
			if (before !== undefined && build.settled?.() !== false) {
				let now: string | undefined;
				try {
					now = await build.module(await update.read(), update.file);
				} catch {
					// the load reports it
				}
				// an edit that leaves the module as it was leaves the importers alone
				if (now === before) return;
			}
			loaded.delete(key);
			graph.invalidateModule(mod, new Set(), update.timestamp, true);
			return mod;
		},
	};
}
