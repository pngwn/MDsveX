// a plugin page, one of each shape: a block syntax (tabs), a document-level
// plugin (toc) and a check (link-check). The others open in the finder
import { error } from '@sveltejs/kit';
import { building } from '$app/environment';
import { catalog, PAGES } from '$lib/docs-lab/plugins/catalog.server';

export const prerender = true;

export const entries = () => PAGES.map((name) => ({ name }));

export async function load({ params }) {
	const all = await catalog({ strict: building });
	const plugin = PAGES.includes(params.name) ? all.find((p) => p.id === params.name) : undefined;
	if (!plugin) error(404, `no plugin page for ${params.name} yet`);
	return { plugin, all };
}
