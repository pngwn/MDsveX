export {
	COMPONENTS_ID,
	DIRECTIVES_ID,
	DIRECTIVES_EXPORT,
	TEMPLATE_ID,
	TEMPLATE_DIRECTIVES_ID,
	PLUGIN_ID,
	PLUGIN_COMPONENTS_ID,
	METADATA_ID,
	DATA_ID,
} from './virtual_ids.js';

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
