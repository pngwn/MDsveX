import { compile } from 'mdsvex/compile';
import type {
	Bundle,
	HeadingIdsOptions,
	NodeView,
	PluginContext,
	TaskContext,
} from 'mdsvex/compile';

import { anchors_of } from './anchors.js';
import { LinkCheckError } from './error.js';
import type { BrokenLink } from './error.js';
import { absolute, normal, shown, target_of } from './urls.js';
import type { Site, Target } from './urls.js';

export { LinkCheckError } from './error.js';
export type { BrokenLink, LinkCheckErrorCode } from './error.js';

/** the key of plugin_data, a strict check is the only one that writes there */
const NAME = 'link-check';
const DEFAULT_EXTENSIONS = ['.md', '.svx'];

export interface LinkCheckOptions {
	/**
	 * checks links to other documents and their ids, which reads them, so it
	 * takes compile_async with a read option or the vite plugin, false checks
	 * the links within a page alone and works under compile
	 *
	 * @default true
	 */
	documents?: boolean;
	/**
	 * how the headings of other documents get their ids, give it the
	 * heading_ids option of mdsvex when that is not true, the ids of the
	 * document being checked are the ones its compile made
	 *
	 * @default true
	 */
	heading_ids?: boolean | HeadingIdsOptions;
	/**
	 * the directory whose documents are routes, as links.routes of mdsvex,
	 * absolute or relative to the working directory, a root url such as
	 * /guide#install is then checked against the document of that route
	 *
	 * @example
	 * link_check({ routes: 'src/routes' })
	 */
	routes?: string;
	/** the extensions of documents, as links.extensions, .md and .svx when left out */
	extensions?: string[];
	/** the base path, as a string links.base, a root url written with it has it taken off */
	base?: string;
	/**
	 * true for a url that is not checked, such as an id a component makes
	 *
	 * @example
	 * ignore: (href) => href.startsWith('#bib-')
	 */
	ignore?: (href: string, filename: string | undefined) => boolean;
	/**
	 * a document with a link that goes nowhere fails its compile with a
	 * LinkCheckError that lists each, after it warned about them, for a build
	 * that must not ship one
	 *
	 * @example
	 * defineConfig(({ command }) => ({
	 *   plugins: [mdsvex({ plugins: [link_check({ strict: command === 'build' })] })],
	 * }));
	 */
	strict?: boolean;
}

declare module 'mdsvex/compile' {
	interface PluginData {
		/** only a strict check writes it, for a document it fails */
		'link-check'?: { broken?: BrokenLink[] };
	}
}

function option_error(message: string): never {
	throw new LinkCheckError('option', message);
}

function site_of(options: LinkCheckOptions): Site {
	let routes: string | null = null;
	if (options.routes !== undefined) {
		if (typeof options.routes !== 'string' || options.routes.trim() === '')
			option_error(
				`routes must be the path of a directory, got ${JSON.stringify(options.routes)}`
			);
		routes = absolute(options.routes) ?? null;
		if (routes === null)
			option_error(
				`routes ${JSON.stringify(options.routes)} is relative and there is no working directory here, give an absolute path`
			);
	}
	let extensions = DEFAULT_EXTENSIONS;
	if (options.extensions !== undefined) {
		if (
			!Array.isArray(options.extensions) ||
			options.extensions.some((ext) => typeof ext !== 'string' || ext === '')
		)
			option_error('extensions must be an array of extensions such as .md');
		extensions = options.extensions.map((ext) =>
			ext.startsWith('.') ? ext : '.' + ext
		);
	}
	let base: string | null = null;
	if (options.base !== undefined) {
		if (typeof options.base !== 'string')
			option_error(
				`base must be a string, got ${JSON.stringify(options.base)}`
			);
		const trimmed = options.base.replace(/\/+$/, '');
		if (trimmed !== '')
			base = trimmed.startsWith('/') ? trimmed : '/' + trimmed;
	}
	return { routes, extensions, base };
}

/** the ids of another document, as a compile of it with the heading_ids option gives them */
function index_of(
	text: string,
	file: string,
	heading_ids: boolean | HeadingIdsOptions
): Set<string> {
	const ids = new Set<string>();
	compile(text, {
		filename: file,
		heading_ids,
		parse_plugins: [{ name: NAME, document: (root) => anchors_of(root, ids) }],
		// what a component would do with a directive is not known here
		strict_directives: false,
		footnotes: { strict: false },
	});
	return ids;
}

/** the ids of a document, or why it could not be read, read once for every document a compiler takes */
async function ids_in(
	task: TaskContext,
	file: string,
	heading_ids: boolean | HeadingIdsOptions
): Promise<Set<string> | { error: string; missing: boolean }> {
	try {
		return await task.cached(file, async () => {
			let reading: Promise<string>;
			try {
				reading = task.read(file);
			} catch {
				throw new LinkCheckError(
					'no_reader',
					`${task.filename ?? 'the document'} links to ${file} and the compile can not read it, it was given no read option, the vite plugin has one, compile_async takes one, or check links within a page alone with documents: false`
				);
			}
			return index_of(await reading, file, heading_ids);
		});
	} catch (error) {
		if (error instanceof LinkCheckError) throw error;
		// a load that failed is not kept, so the next document reads it again
		const message = (error as Error)?.message ?? String(error);
		return {
			error: message,
			missing:
				(error as { code?: unknown })?.code === 'ENOENT' ||
				message.startsWith('ENOENT'),
		};
	}
}

/** where a node is, for a strict check, nothing over the wire */
function broken(node: NodeView, href: string, message: string): BrokenLink {
	const at = node.position?.start;
	return at === undefined
		? { href, message }
		: { href, message, line: at.line, column: at.column };
}

/** true when the fragment names an id the ids do not have */
function missing(fragment: string | null, ids: Set<string>): boolean {
	// an empty fragment and #top go to the top of the page without an id
	return (
		fragment !== null &&
		fragment !== '' &&
		!ids.has(fragment) &&
		fragment.toLowerCase() !== 'top'
	);
}

/**
 * reports links that go nowhere, a `#fragment` no element of the page has,
 * and links to other documents by file, `./guide.md#install`, or by route,
 * `/guide#install`, that do not exist or have no such id
 *
 * @example
 * import { link_check } from '@mdsvex/plugin-link-check';
 *
 * mdsvex({ heading_ids: true, plugins: [link_check({ routes: 'src/routes' })] });
 */
export function link_check(options: LinkCheckOptions = {}): Bundle {
	if (typeof options !== 'object' || options === null)
		option_error('the options must be an object');
	const site = site_of(options);
	const documents = options.documents ?? true;
	const heading_ids = options.heading_ids ?? true;
	const strict = options.strict ?? false;
	const ignore = options.ignore;
	if (typeof documents !== 'boolean')
		option_error(
			`documents must be true or false, got ${JSON.stringify(documents)}`
		);
	if (typeof strict !== 'boolean')
		option_error(`strict must be true or false, got ${JSON.stringify(strict)}`);
	if (ignore !== undefined && typeof ignore !== 'function')
		option_error('ignore must be a function');
	if (
		typeof heading_ids !== 'boolean' &&
		(typeof heading_ids !== 'object' || heading_ids === null)
	)
		option_error(
			'heading_ids must be true, false or an object with a slug function'
		);

	/** where the link goes, null for one that is not checked, ignore is asked later */
	function target(href: unknown, ctx: PluginContext): Target | null {
		if (typeof href !== 'string') return null;
		const filename =
			ctx.filename === undefined ? undefined : absolute(ctx.filename);
		return target_of(href, filename, site);
	}

	function ignored(href: string, ctx: PluginContext): boolean {
		return ignore !== undefined && ignore(href, ctx.filename) === true;
	}

	/** another document or route, looked up once the link is final */
	function check(node: NodeView, ctx: PluginContext, href: string, to: Target) {
		ctx.defer(node, async (node, task) => {
			const files =
				to.kind === 'file' ? [to.file] : to.kind === 'route' ? to.files : [];
			let ids: Set<string> | null = null;
			let found = '';
			let error: { error: string; missing: boolean } | null = null;
			for (const file of files) {
				const read = await ids_in(task, file, heading_ids);
				if (read instanceof Set) {
					ids = read;
					found = file;
					break;
				}
				// a document that is made later is a reason to look again
				task.depend(file);
				error ??= read;
			}
			let message: string;
			let code: string;
			if (ids === null) {
				// a root url with no document may be a page that is no document
				if (to.kind === 'route') return;
				code = 'missing_document';
				message = error!.missing
					? `${href} links to ${shown(files[0])}, which does not exist`
					: `${href} links to ${shown(files[0])}, which could not be read: ${error!.error}`;
			} else if (missing(to.fragment, ids)) {
				code = 'missing_anchor';
				message = `${href} links to ${shown(found)}, which has no element with the id ${JSON.stringify(to.fragment)}`;
			} else return;
			task.warn(code, message, node);
			if (strict) task.add('broken', broken(node, href, message));
		});
	}

	return {
		name: NAME,
		parse: {
			// the url of a link is final at its close, and a link that is revoked takes its task along
			link: {
				parse(node, ctx) {
					if (!documents) return;
					return () => {
						const href = node.attrs.href;
						const to = target(href, ctx);
						if (to !== null && to.kind !== 'page' && !ignored(href, ctx))
							check(node, ctx, href, to);
					};
				},
			},
			// an id can come after the link to it, so links within the page wait for the whole tree
			document(root, ctx) {
				const ids = new Set<string>();
				const links: NodeView[] = [];
				anchors_of(root, ids, links);
				const problems: BrokenLink[] = [];
				for (const link of links) {
					const href = link.attrs.href;
					const to = target(href, ctx);
					if (
						to === null ||
						to.kind !== 'page' ||
						!missing(to.fragment, ids) ||
						ignored(href, ctx)
					)
						continue;
					const message = `${href} links to no element of this document, none has the id ${JSON.stringify(to.fragment)}`;
					ctx.warn('missing_anchor', message, link);
					if (strict) problems.push(broken(link, href, message));
				}
				if (!strict) return;
				const others =
					(ctx.data.broken as unknown as BrokenLink[] | undefined) ?? [];
				const all = [...problems, ...others].sort(
					(a, b) =>
						(a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0)
				);
				if (all.length === 0) return;
				const name =
					ctx.filename === undefined
						? 'the document'
						: shown(normal(ctx.filename));
				throw new LinkCheckError(
					'broken',
					`${name} has ${all.length === 1 ? 'a link that goes' : `${all.length} links that go`} nowhere:\n` +
						all
							.map(
								(link) =>
									(link.line === undefined
										? ''
										: `${link.line}:${(link.column ?? 0) + 1} `) + link.message
							)
							.join('\n'),
					all
				);
			},
		},
	};
}
