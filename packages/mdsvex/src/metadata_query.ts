import type {
	EnvironmentModuleGraph,
	EnvironmentModuleNode,
	ResolvedConfig,
	Rollup,
} from 'vite';
import { metadata_export, parse_frontmatter } from './frontmatter';
import type { FrontmatterOptions } from './frontmatter';
import { METADATA_ID, clean_id } from './ids';

const VIRTUAL = '\0' + METADATA_ID;
// vite-plugin-svelte compiles any id that ends in a document extension, even after
// \0, and the dep scanner reads an id that looks like a path from disk
const SUFFIX = '.js';
const QUERY = /[?&]metadata(?:&|$)/;

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

/**
 * the end of the frontmatter value of a normalized source, which starts at 4,
 * -1 without frontmatter, these are the bounds the parser gives the node
 */
export function frontmatter_end(source: string): number {
	if (!source.startsWith('---\n')) return -1;
	// the newline that ends the opening fence also opens a closing one
	let close = source.indexOf('\n---', 3);
	while (close !== -1) {
		const after = source.charCodeAt(close + 4);
		// nan is the end of the source
		if (after === 10 || after !== after) return close + 1;
		close = source.indexOf('\n---', close + 4);
	}
	return -1;
}

/**
 * the module a ?metadata import loads, its metadata is the export of the
 * compiled document, undefined when the document has no frontmatter
 */
export function metadata_module(
	raw: string,
	parse: FrontmatterOptions['parse']
): string {
	// the parser reads \r\n and a lone \r as \n, and so do its offsets
	const source = raw.indexOf('\r') === -1 ? raw : raw.replace(/\r\n?/g, '\n');
	const end = frontmatter_end(source);
	// a compiled document has no export then, this one stays so a named import links
	const named =
		end === -1
			? 'export const metadata = undefined;'
			: metadata_export(parse_frontmatter(source, 4, end, parse));
	return named + '\nexport default metadata;\n';
}

/** documents imported with ?metadata, which load their frontmatter and compile nothing */
export function metadata_query(
	extensions: string[],
	parse: FrontmatterOptions['parse']
) {
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
		/** undefined unless id is a document imported with ?metadata */
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
			let code: string;
			try {
				code = metadata_module(raw, parse);
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

		/** the metadata module of an edited document, invalidated, when its metadata changed */
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
			if (before !== undefined) {
				let now: string | undefined;
				try {
					now = metadata_module(await update.read(), parse);
				} catch {
					// the load reports it
				}
				// an edit below the frontmatter leaves the importers alone
				if (now === before) return;
				loaded.delete(key);
			}
			graph.invalidateModule(mod, new Set(), update.timestamp, true);
			return mod;
		},
	};
}
