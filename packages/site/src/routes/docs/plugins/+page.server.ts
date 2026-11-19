// the finder's data: every plugin the site depends on, read from its package
// and compiled with its example when the site builds
import { building } from '$app/environment';
import { catalog, terms_of } from '$lib/docs/plugins/catalog.server';

export async function load() {
	const plugins = await catalog({ strict: building });
	return { plugins, terms: Object.fromEntries(plugins.map((p) => [p.id, terms_of(p)])) };
}
