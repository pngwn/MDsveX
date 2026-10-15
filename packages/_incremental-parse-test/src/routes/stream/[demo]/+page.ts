import { error } from '@sveltejs/kit';
import { DEFER_DOC, TOC_DOC } from '$lib/stream_docs';
import type { StreamDemo } from '$lib/stream_plugins';

const DEMOS: Record<string, { markdown: string; title: string }> = {
	toc: { markdown: TOC_DOC, title: 'A table of contents that grows' },
	deferred: { markdown: DEFER_DOC, title: 'A lookup that lands later' }
};

export function load({ params }) {
	const demo = DEMOS[params.demo];
	if (demo === undefined) error(404, 'No such demo');
	return { ...demo, demo: params.demo as StreamDemo };
}
