// the workbook's compile in the browser, real mdsvex: loaded on a reader's
// first touch of an example (docs plan decision 7, embeds are static until
// then), never before. One load serves every bench on the page. For a
// contrast it also loads micromark, and Svelte's compiler to render what
// mdsvex gives, the same render the build uses (build/examples.js)
import { commonmark } from '../commonmark';
import { options_for, segments_of } from '../setup';
import type { Segment } from '$lib/design/atlas/types';
import type { Setup } from '../types';

export interface Compiled {
	code: string;
	segments: Segment[];
	error?: string;
}

let core: Promise<typeof import('mdsvex/compile')> | null = null;
let renderer: Promise<{
	rendered: (source: string) => string;
	pretty: (html: string) => string;
	commonmark: (source: string, gfm: boolean) => string;
}> | null = null;

/** wake the compiler: mdsvex alone */
export function wake() {
	core ??= import('mdsvex/compile');
	return core;
}

export async function compile_live(source: string, setup: Setup, file?: string): Promise<Compiled> {
	const { compile } = await wake();
	try {
		const result = compile(source, { ...options_for(setup, file), sourcemap: true });
		return { code: result.code, segments: segments_of(result) };
	} catch (error) {
		return { code: '', segments: [], error: (error as Error).message };
	}
}

/** wake what a contrast needs: micromark, and Svelte to render mdsvex's output */
export function wake_render() {
	renderer ??= Promise.all([import('./render.js'), commonmark()]).then(([examples, read]) => ({
		rendered: examples.rendered,
		pretty: examples.pretty,
		commonmark: read,
	}));
	return renderer;
}

export interface LiveReadings {
	commonmark: string;
	mdsvex: string;
	error?: string;
}

export async function read_both(source: string, gfm: boolean): Promise<LiveReadings> {
	const { rendered, pretty, commonmark } = await wake_render();
	const cm = pretty(commonmark(source, gfm).trim());
	try {
		return { commonmark: cm, mdsvex: rendered(source) };
	} catch (error) {
		return { commonmark: cm, mdsvex: '', error: (error as Error).message };
	}
}

/**
 * html a reader typed, made safe to show: scripts, frames and handlers out.
 * It only ever shows the reader's own typing back to them, in their browser
 */
export function safe(html: string): string {
	const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
	for (const el of doc.body.querySelectorAll('script, iframe, object, embed, style, link, meta')) el.remove();
	for (const el of doc.body.querySelectorAll('*'))
		for (const attr of [...el.attributes])
			if (attr.name.startsWith('on') || /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
	return doc.body.innerHTML;
}
