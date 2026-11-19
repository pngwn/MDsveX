import { error } from '@sveltejs/kit';
import { DEFAULT_EXAMPLE, get_example } from '$lib/playground/examples';

// edits live in the url hash, which only the browser can read
export const ssr = false;

export function load({ params }) {
	const slug = params.example ?? DEFAULT_EXAMPLE;
	const example = get_example(slug);
	if (!example) error(404, `There is no example called '${slug}'`);
	return { example };
}
