// what a link points at, worked out from its url alone, nothing is read here

const ABSOLUTE = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;
const ROOT = /^(?:[A-Za-z]:\/|\/\/[^/]+\/[^/]+\/|\/)/;
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const PAGE = /^\+page(?:@.*)?$/;

/** forward slashes, as vite names a file, with no dot segments */
export function normal(path: string): string {
	const slashed = path.replace(/\\/g, '/');
	const root = ROOT.exec(slashed)?.[0] ?? '';
	const out: string[] = [];
	for (const part of slashed.slice(root.length).split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') out.pop();
		else out.push(part);
	}
	return root + out.join('/');
}

function directory(path: string): string {
	return path.slice(0, path.lastIndexOf('/') + 1);
}

function cwd(): string | undefined {
	return (globalThis as { process?: { cwd?(): string } }).process?.cwd?.();
}

/** a path made absolute against the working directory, undefined where there is none */
export function absolute(path: string): string | undefined {
	if (ABSOLUTE.test(path)) return normal(path);
	const from = cwd();
	return from === undefined ? undefined : normal(from + '/' + path);
}

/** a path as a message shows it, relative to the working directory when it is inside it */
export function shown(path: string): string {
	const from = cwd();
	if (from === undefined) return path;
	const dir = normal(from) + '/';
	return path.startsWith(dir) ? path.slice(dir.length) : path;
}

/** the url as it reads, a reference that does not decode stays as written */
function decoded(text: string): string {
	try {
		return decodeURIComponent(text);
	} catch {
		return text;
	}
}

/** the documents and routes of a site, as the plugin was told them */
export interface Site {
	/** the absolute directory whose documents are routes, null for none */
	routes: string | null;
	/** the extensions of documents, each with its dot */
	extensions: string[];
	/** the base path in front of root urls, null for none */
	base: string | null;
}

/** where a link goes, the fragment decoded, null for no fragment */
export type Target =
	| { kind: 'page'; fragment: string | null }
	| { kind: 'file'; file: string; fragment: string | null }
	| { kind: 'route'; route: string; files: string[]; fragment: string | null };

/** the route of a document under the routes directory, null for one outside it */
export function route_of(file: string, site: Site): string | null {
	const routes = site.routes;
	if (routes === null || !file.startsWith(routes + '/')) return null;
	const ext = site.extensions.find((e) => file.endsWith(e));
	if (ext === undefined) return null;
	const parts = file
		.slice(routes.length + 1, file.length - ext.length)
		.split('/');
	let route = '';
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (i === parts.length - 1 && (part === 'index' || PAGE.test(part))) break;
		if (part.startsWith('(') && part.endsWith(')')) continue;
		route += '/' + part;
	}
	return route === '' ? '/' : route;
}

/**
 * the documents a route can be, in the order they are tried, a route under a
 * (group) or with a [param] is none of them
 */
function files_of(route: string, site: Site): string[] {
	const dir = site.routes + (route === '/' ? '' : route);
	const files: string[] = [];
	for (const ext of site.extensions) {
		if (route !== '/') files.push(dir + ext);
		files.push(dir + '/+page' + ext, dir + '/index' + ext);
	}
	return files;
}

/**
 * what a link goes to, this page, another document by its file, or a route
 * that may be a document, null for a url this plugin does not check, a url
 * with a scheme, one with a svelte expression, a relative link to anything
 * but a document, a root url with no fragment or with no routes to look in
 */
export function target_of(
	href: string,
	filename: string | undefined,
	site: Site
): Target | null {
	if (href === '' || href.indexOf('{') !== -1) return null;
	const hash = href.indexOf('#');
	const fragment = hash === -1 ? null : decoded(href.slice(hash + 1));
	let path = hash === -1 ? href : href.slice(0, hash);
	const query = path.indexOf('?');
	if (query !== -1) path = path.slice(0, query);
	if (path === '') return hash === 0 ? { kind: 'page', fragment } : null;
	if (SCHEME.test(path) || path.startsWith('//')) return null;
	path = decoded(path);
	if (path.startsWith('/')) {
		if (fragment === null || site.routes === null) return null;
		const base = site.base;
		if (base !== null && (path === base || path.startsWith(base + '/')))
			path = path.slice(base.length) || '/';
		const route =
			path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
		if (filename !== undefined && route_of(filename, site) === route)
			return { kind: 'page', fragment };
		return { kind: 'route', route, files: files_of(route, site), fragment };
	}
	if (filename === undefined) return null;
	if (!site.extensions.some((ext) => path.endsWith(ext))) return null;
	const file = normal(directory(filename) + path);
	if (file === filename) return { kind: 'page', fragment };
	return { kind: 'file', file, fragment };
}
