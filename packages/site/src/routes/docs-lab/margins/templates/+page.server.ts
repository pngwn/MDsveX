// the page's prose, examples and contrasts, compiled when the site is built
import { build_page } from '$lib/docs-lab/build.server';

export async function load() {
	return { page: await build_page('templates') };
}
