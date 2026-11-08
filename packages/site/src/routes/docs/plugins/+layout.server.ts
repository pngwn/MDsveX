// a plugin's page gets its plate: the plugin whose docs page this is, read from
// its package and built with its example (catalog.server.ts). The index and the
// writing pages get none
import { building } from '$app/environment';
import { catalog } from '$lib/docs/plugins/catalog.server';

export async function load({ url }) {
	const all = await catalog({ strict: building });
	return { plugin: all.find((p) => p.href === url.pathname.replace(/\/$/, '')) ?? null };
}
