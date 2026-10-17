// a walk over the finished tree, only for a compile with rewrite or links

import type { NodeBuffer } from '@mdsvex/parse/utils';
import { K_IMAGE, K_LINK } from '@mdsvex/render/html-cursor';
import type { UrlLookup, UrlSource } from '@mdsvex/render/html-cursor';
import { decoded_references, js_string } from './image_imports.js';

/** what rewrite is told about a url */
export interface RewriteContext {
	/** the document, as the filename option has it */
	filename: string | undefined;
	/** link for the href of a markdown link, image for the src of a markdown image */
	type: 'link' | 'image';
	/** the url as the document has it, before links.routes made it a route */
	written: string;
}

/**
 * called for the url of every markdown link and of every markdown image that
 * is not imported, a string replaces the url, nothing keeps it
 *
 * @example
 * rewrite: (url) => (url.startsWith('gh:') ? 'https://github.com/' + url.slice(3) : undefined)
 */
export type Rewrite = (
	url: string,
	ctx: RewriteContext
) => string | null | undefined | void;

/** a function a document imports and calls with a root url where it renders */
export interface BaseImport {
	/** the name of the export, default for the default export */
	import: string;
	/** emitted verbatim as an import specifier */
	from: string;
}

export interface LinkOptions {
	/**
	 * the directory whose files are served by path, a relative link to a
	 * document in it becomes the route of that document, the extension goes,
	 * as do a last index or +page and any (group), the query and fragment
	 * stay, it is compared with filename as written, so both are absolute or
	 * both relative to one directory
	 *
	 * @example
	 * // in src/routes/guide/+page.md, [setup](../setup/+page.md#install) links to /setup#install
	 * links: { routes: 'src/routes' }
	 */
	routes?: string;
	/** the extensions of documents, .md and .svx when left out */
	extensions?: string[];
	/**
	 * goes in front of every url that starts with one slash, of links and of
	 * images, a string is a fixed prefix, { import, from } names a function
	 * that adds it where the page renders
	 *
	 * @example
	 * links: { base: '/docs' }
	 * @example
	 * links: { base: { import: 'resolve', from: '$app/paths' } }
	 */
	base?: string | BaseImport;
}

/** @internal the rewrite and links options as a compile reads them */
export interface Links {
	rewrite: Rewrite | undefined;
	/** the segments of the routes directory, null without one */
	routes: string[] | null;
	extensions: string[];
	/** a fixed prefix, null for none */
	base: string | null;
	/** the function that adds the base at run time, null for none */
	resolver: BaseImport | null;
}

/** @internal what a render with rewritten urls is given */
export interface LinkUrls {
	/** the import of the base function, undefined when no url needs it */
	lines: string[] | undefined;
	/** for renderer.urls */
	lookup: UrlLookup;
}

// must equal NONE in @mdsvex/parse
const NONE = 0xffffffff;

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const PAGE = /^\+page(?:@.*)?$/;
const DEFAULT_EXTENSIONS = ['.md', '.svx'];

/** the segments of a path, either slash separates, . and empty ones go, null when .. climbs out */
function segments(path: string, onto: string[]): string[] | null {
	let start = 0;
	const len = path.length;
	for (let i = 0; i <= len; i++) {
		const ch = i === len ? 47 : path.charCodeAt(i);
		if (ch !== 47 && ch !== 92) continue;
		const seg = path.slice(start, i);
		start = i + 1;
		if (seg === '' || seg === '.') continue;
		if (seg === '..') {
			if (onto.length === 0) return null;
			onto.pop();
		} else onto.push(seg);
	}
	return onto;
}

const prepared = new WeakMap<LinkOptions, Links>();

function prepare(options: LinkOptions): Links {
	if (typeof options !== 'object' || options === null)
		throw new Error('[mdsvex] links must be an object');
	const written = options.routes;
	let routes: string[] | null = null;
	if (written !== undefined) {
		if (typeof written !== 'string' || written === '')
			throw new Error('[mdsvex] links.routes must be a directory path');
		routes = segments(written, []);
		if (routes === null)
			throw new Error('[mdsvex] links.routes must be a directory path');
	}
	let extensions = DEFAULT_EXTENSIONS;
	if (options.extensions !== undefined) {
		if (!Array.isArray(options.extensions))
			throw new Error('[mdsvex] links.extensions must be an array');
		extensions = options.extensions.map((ext) =>
			ext.startsWith('.') ? ext : '.' + ext
		);
	}
	const given = options.base as unknown;
	let base: string | null = null;
	let resolver: BaseImport | null = null;
	if (given === true)
		throw new Error(
			'[mdsvex] links.base: true takes the vite plugin, which reads the base of vite'
		);
	if (typeof given === 'string') {
		let end = given.length;
		while (end > 0 && given.charCodeAt(end - 1) === 47) end--;
		if (end !== 0) base = given.slice(0, end);
	} else if (given !== undefined) {
		const b = given as Partial<BaseImport> | null;
		if (
			typeof b !== 'object' ||
			b === null ||
			typeof b.import !== 'string' ||
			typeof b.from !== 'string' ||
			b.from === ''
		)
			throw new Error(
				'[mdsvex] links.base must be a string or { import, from }'
			);
		if (!IDENTIFIER.test(b.import))
			throw new Error(
				'[mdsvex] links.base.import must be the name of an export'
			);
		resolver = { import: b.import, from: b.from };
	}
	return { rewrite: undefined, routes, extensions, base, resolver };
}

/** @internal undefined when neither option asks for anything */
export function links_of(
	rewrite: Rewrite | undefined,
	options: LinkOptions | undefined
): Links | undefined {
	if (rewrite !== undefined && typeof rewrite !== 'function')
		throw new Error('[mdsvex] rewrite must be a function');
	if (options === undefined) {
		return rewrite === undefined
			? undefined
			: {
					rewrite,
					routes: null,
					extensions: DEFAULT_EXTENSIONS,
					base: null,
					resolver: null,
				};
	}
	let links = prepared.get(options);
	if (links === undefined) {
		links = prepare(options);
		prepared.set(options, links);
	}
	if (rewrite !== undefined) return { ...links, rewrite };
	return links.routes === null && links.base === null && links.resolver === null
		? undefined
		: links;
}

/**
 * the route of a relative link to a document under the routes directory,
 * null for any other url
 */
function route_of(url: string, links: Links, dir: string[]): string | null {
	const first = url.charCodeAt(0);
	// a root path, a fragment or a query alone
	if (first === 47 || first === 35 || first === 63) return null;
	if (SCHEME.test(url)) return null;
	let end = url.length;
	for (let i = 0; i < end; i++) {
		const ch = url.charCodeAt(i);
		if (ch === 63 || ch === 35) end = i;
		// a reference or a backslash, nothing here knows which file it names
		else if (ch === 38 || ch === 92) return null;
	}
	const path = url.slice(0, end);
	const extensions = links.extensions;
	let ext = -1;
	for (let i = 0; i < extensions.length; i++) {
		const e = extensions[i];
		if (path.length > e.length && path.endsWith(e)) {
			ext = e.length;
			break;
		}
	}
	if (ext === -1) return null;
	const file = segments(path.slice(0, path.length - ext), dir.slice());
	if (file === null) return null;
	const routes = links.routes!;
	if (file.length < routes.length) return null;
	for (let i = 0; i < routes.length; i++)
		if (file[i] !== routes[i]) return null;
	let route = '';
	const last = file.length - 1;
	for (let i = routes.length; i <= last; i++) {
		const seg = file[i];
		if (seg.indexOf('[') !== -1) return null;
		if (i === last && (seg === 'index' || PAGE.test(seg))) break;
		if (seg.charCodeAt(0) === 40 && seg.charCodeAt(seg.length - 1) === 41)
			continue;
		route += '/' + seg;
	}
	return (route === '' ? '/' : route) + url.slice(end);
}

const PREFIX = '__mdsvex_base';

/**
 * what the urls of a document become, null when every one stays as written,
 * taken answers for the images that are imported
 */
export function link_urls(
	links: Links,
	buf: NodeBuffer,
	source: string,
	filename: string | undefined,
	taken: UrlLookup | null
): LinkUrls | null {
	let of_links: Map<string, UrlSource> | null = null;
	let of_images: Map<string, UrlSource> | null = null;
	let seen_links: Set<string> | null = null;
	let seen_images: Set<string> | null = null;
	// the directory of the document, false once it is known to have none
	let dir: string[] | null | false =
		links.routes === null || filename === undefined ? false : null;
	let name: string | null = null;
	const rewrite = links.rewrite;
	const base = links.base;
	const resolver = links.resolver;

	let node = buf.first_child_at(0);
	while (node !== NONE) {
		const kind = buf.kind_at(node) as number;
		const image = kind === K_IMAGE;
		// the children of an image are its alt, a link in there never renders
		const down = image ? NONE : buf.first_child_at(node);
		if (image || kind === K_LINK) {
			const meta = buf.metadata_at(node);
			const url = image ? meta?.src : meta?.href;
			const seen = image
				? (seen_images ??= new Set())
				: (seen_links ??= new Set());
			if (
				typeof url === 'string' &&
				url !== '' &&
				!seen.has(url) &&
				// a svelte expression is live
				url.indexOf('{') === -1 &&
				(!image || taken === null || taken(url, true) == null)
			) {
				seen.add(url);
				let to = url;
				if (!image && dir !== false) {
					if (dir === null) {
						dir = segments(filename!, []) ?? false;
						if (dir !== false) dir.pop();
					}
					if (dir !== false) to = route_of(url, links, dir) ?? url;
				}
				if (rewrite !== undefined) {
					const out = rewrite(to, {
						filename,
						type: image ? 'image' : 'link',
						written: url,
					});
					if (typeof out === 'string') to = out;
					else if (out != null)
						throw new Error(
							`[mdsvex] rewrite must return a string or nothing, it returned ${typeof out} for ${JSON.stringify(url)}`
						);
				}
				let swap: UrlSource | null = to === url ? null : to;
				if (
					(base !== null || resolver !== null) &&
					to.charCodeAt(0) === 47 &&
					to.charCodeAt(1) !== 47 &&
					to.indexOf('{') === -1
				) {
					if (base !== null) swap = base + to;
					else {
						// svelte decodes no reference inside an expression
						const plain = decoded_references(to);
						if (plain !== null) {
							if (name === null) {
								name = PREFIX;
								while (source.indexOf(name) !== -1) name += '_';
							}
							swap = {
								type: 'expression',
								value: name + '(' + js_string(plain) + ')',
							};
						}
					}
				}
				if (swap !== null) {
					if (image) (of_images ??= new Map()).set(url, swap);
					else (of_links ??= new Map()).set(url, swap);
				}
			}
		}
		if (down !== NONE) {
			node = down;
			continue;
		}
		// the next node in document order
		for (;;) {
			const next = buf.next_at(node);
			const parent = buf.parent_at(node);
			if (next !== NONE && buf.parent_at(next) === parent) {
				node = next;
				break;
			}
			if (parent === 0 || parent === NONE) {
				node = NONE;
				break;
			}
			node = parent;
		}
	}
	if (of_links === null && of_images === null) return null;
	const linked = of_links;
	const pictured = of_images;
	return {
		lines:
			name === null
				? undefined
				: [
						(resolver!.import === 'default'
							? 'import ' + name
							: 'import { ' + resolver!.import + ' as ' + name + ' }') +
							' from ' +
							js_string(resolver!.from) +
							';',
					],
		lookup: (url, image) =>
			image
				? pictured === null
					? undefined
					: pictured.get(url)
				: linked === null
					? undefined
					: linked.get(url),
	};
}

/** @internal the imports and lookup of a render that has image imports and rewritten urls */
export function with_images(
	images: { lines: readonly string[] | undefined; lookup: UrlLookup } | null,
	links: LinkUrls | null
): { lines: readonly string[] | undefined; lookup: UrlLookup } | null {
	if (links === null) return images;
	if (images === null) return links;
	const first = images.lookup;
	const second = links.lookup;
	const a = images.lines;
	const b = links.lines;
	return {
		lines: a === undefined ? b : b === undefined ? a : a.concat(b),
		lookup: (url, image) =>
			(image ? first(url, true) : undefined) ?? second(url, image),
	};
}
