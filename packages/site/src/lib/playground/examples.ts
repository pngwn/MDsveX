import type { ReplState } from '@mdsvex/repl';

export interface Example {
	slug: string;
	title: string;
	state: ReplState;
}

const raw = import.meta.glob('./examples/*/**/*', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

const ORDER: [slug: string, title: string][] = [
	['basics', 'Basics'],
	['components', 'Components'],
	['templates', 'Templates'],
];

/** the entry and config lead, everything else keeps its path order */
function rank(name: string) {
	if (/^App\.(svx|md|svelte)$/.test(name)) return 0;
	if (name === 'mdsvex.config.json') return 2;
	return 1;
}

function files_for(slug: string) {
	const prefix = `./examples/${slug}/`;
	return Object.entries(raw)
		.filter(([path]) => path.startsWith(prefix))
		.map(([path, contents]) => ({ name: path.slice(prefix.length), contents }))
		.sort(
			(a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
		);
}

export const examples: Example[] = ORDER.map(([slug, title]) => ({
	slug,
	title,
	state: { files: files_for(slug) },
}));

export const DEFAULT_EXAMPLE = examples[0].slug;

export function get_example(slug: string) {
	return examples.find((example) => example.slug === slug);
}
