// every construct through mdsvex's real compile, once, when the site builds
import { compile_all } from '$lib/design/atlas/compile.server';

export const prerender = true;

export async function load() {
	return { entries: await compile_all() };
}
