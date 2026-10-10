// documents import these virtual ids, so output holds no paths and the graph edge is the real file
export const COMPONENTS_ID = 'mdsvex:components';
export const DIRECTIVES_ID = 'mdsvex:directives';
/** the namespace export of a replacement module that holds its directives */
export const DIRECTIVES_EXPORT = 'directives';
export const TEMPLATE_ID = 'mdsvex:template/';
export const TEMPLATE_DIRECTIVES_ID = 'mdsvex:template-directives/';

/** a URL as a path, a string as written */
export async function spec_of(entry: string | URL): Promise<string> {
	const spec = typeof entry === 'string' ? entry : entry.href;
	if (!spec.startsWith('file:')) return spec;
	const url = await import('node:url');
	return url.fileURLToPath(spec);
}

export function shown(entry: string | URL): string {
	return JSON.stringify(typeof entry === 'string' ? entry : entry.href);
}

/** the directory documents resolve configured specifiers from */
export function importer_in(root: string): string {
	const base = root || (globalThis as any).process?.cwd?.() || '';
	return base.replace(/\/$/, '') + '/vite.config';
}

export function clean_id(id: string): string {
	const q = id.indexOf('?');
	return q < 0 ? id : id.slice(0, q);
}

/** a vite-plugin-svelte sub-request of a document, ?svelte&type=style holds its css */
export function svelte_request(id: string, q: number): boolean {
	return new URLSearchParams(id.slice(q + 1)).has('svelte');
}

/** vite loads these as a js module of its own, not as the document */
export const VITE_QUERY = /[?&](?:raw|url|worker|sharedworker)\b/;
