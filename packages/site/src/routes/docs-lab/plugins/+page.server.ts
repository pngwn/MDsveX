// the finder, every first-party plugin read from its package and compiled
// with its plugin on, once, when the site builds
import { building } from '$app/environment';
import { catalog, terms_of } from '$lib/docs-lab/plugins/catalog.server';

export const prerender = true;

export async function load() {
	const plugins = await catalog({ strict: building });
	return { plugins, terms: Object.fromEntries(plugins.map((p) => [p.id, terms_of(p)])) };
}
