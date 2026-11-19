import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { figures } from '@mdsvex/plugin-figures';
import { numbering } from '@mdsvex/plugin-numbering';
import { mdsvex } from 'mdsvex';
import type { Component } from 'svelte';
import { createServer, createServerModuleRunner } from 'vite';
import type { ViteDevServer } from 'vite';
import type { ModuleRunner } from 'vite/module-runner';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FIGURES = join(dirname(PACKAGE), 'figures');

/** documents streamed here and compiled as a page, by the name of their file */
const DOCS: Record<string, string> = {
	// every reference comes before its target
	forward: [
		'See :ref[fig:a], :ref[fig:a, fig:b] and :ref[tbl:t].',
		'',
		':::figure[First](id=fig:a)',
		'One.',
		':::',
		'',
		':::table[Plans](id=tbl:t)',
		'| plan |',
		'| --- |',
		'| free |',
		':::',
		'',
		'::figure[Second](id=fig:b)',
		'',
	].join('\n'),
	backward: [
		':::figure[First](id=fig:a)',
		'One.',
		':::',
		'',
		'After it, :ref[fig:a].',
		'',
	].join('\n'),
	revoked: '*open :ref[fig:a]\n\n::figure[First](id=fig:a)\n',
};

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

let root: string;
let server: ViteDevServer;
let runner: ModuleRunner;
let m: {
	render: typeof import('svelte/server').render;
	parse: typeof import('@mdsvex/parse');
	stream: typeof import('@mdsvex/render/stream');
	Node: Component<any>;
	directives: Record<string, Component<any>>;
	plugin: typeof import('@mdsvex/plugin-numbering');
};

beforeAll(async () => {
	const files: Record<string, string> = {};
	for (const [name, source] of Object.entries(DOCS))
		files[`src/${name}.svx`] = source;
	root = write_app(HERE, files, [PACKAGE, FIGURES]);
	server = await createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: [
			mdsvex({
				plugins: [figures(), numbering()],
			}),
			svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
		],
	});
	runner = createServerModuleRunner(server.environments.ssr, { hmr: false });
	m = {
		render: (await runner.import('svelte/server')).render,
		parse: await runner.import('@mdsvex/parse'),
		stream: await runner.import('@mdsvex/render/stream'),
		Node: (await runner.import('@mdsvex/render/Node.svelte')).default,
		directives: {
			...(await runner.import('@mdsvex/plugin-numbering/directives')),
			...(await runner.import('@mdsvex/plugin-figures/directives')),
		},
		plugin: await runner.import('@mdsvex/plugin-numbering'),
	};
});

afterAll(async () => {
	await runner?.close();
	await server?.close();
	rmSync(root, { recursive: true, force: true });
});

/** the wire batches of a document fed in pieces, the last one from finish */
function batches_of(source: string, chunk: number): unknown[][][] {
	const emitter = new m.parse.WireEmitter();
	const parser = new m.parse.PFMParser(emitter);
	parser.init();
	const out: unknown[][][] = [];
	for (let i = 0; i < source.length; i += chunk) {
		emitter.set_source(source.slice(0, i + chunk));
		parser.feed(source.slice(i, i + chunk));
		out.push(emitter.flush());
	}
	emitter.set_source(source);
	parser.finish();
	out.push(emitter.flush());
	return out;
}

type Stream = InstanceType<typeof m.stream.PluginStream>;

function stream_of(): Stream {
	const bundle = m.plugin.numbering();
	return new m.stream.PluginStream({
		plugins: [{ name: bundle.name, ...bundle.parse! }],
		directive_handlers: [{ name: bundle.name, directives: bundle.directives! }],
	});
}

const clean = (html: string) =>
	html.replace(/<!--[^]*?-->/g, '').replace(/>\s+</g, '><');

function html_of(stream: Stream): string {
	return clean(
		m.render(m.Node, {
			props: {
				buf: stream.buffer,
				idx: 0,
				source: '',
				directives: m.directives,
				plugin_data: stream.data,
			},
		}).body
	);
}

async function page_of(name: string): Promise<string> {
	const page = await runner.import(`/src/${name}.svx`);
	return clean(m.render(page.default).body);
}

/** what each reference and caption reads as, in order */
function read(html: string): string {
	const refs = [...html.matchAll(/<span class="ref">([^]*?)<\/span>/g)].map(
		([, inner]) => inner.replace(/<a href="([^"]+)">([^<]*)<\/a>/g, '[$2]($1)')
	);
	const captions = [
		...html.matchAll(/<figcaption[^>]*>([^]*?)<\/figcaption>/g),
	].map(([, inner]) =>
		inner
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
	return [...refs, '|', ...captions].join(' / ');
}

async function streamed(source: string, chunk: number) {
	const stream = stream_of();
	const seen: string[] = [];
	for (const batch of batches_of(source, chunk)) {
		stream.apply(batch);
		await turn();
		const now = read(html_of(stream));
		if (seen[seen.length - 1] !== now) seen.push(now);
	}
	await stream.end();
	return { seen, html: html_of(stream) };
}

describe('in a stream', () => {
	test('a forward reference reads ? until its target closes, then its number', async () => {
		const { seen } = await streamed(DOCS.forward, 1000);
		expect(seen[seen.length - 1]).toBe(
			'[Figure 1](#fig:a) / Figures [1](#fig:a) and [2](#fig:b) / [Table 1](#tbl:t) / | / Figure 1: First / Table 1: Plans / Figure 2: Second'
		);
		const { seen: fed } = await streamed(DOCS.forward, 8);
		expect(fed).toContain('Figure ? / Figures ? and ? / Table ? / |');
		expect(fed).toContain(
			'[Figure 1](#fig:a) / Figures [1](#fig:a) and ? / Table ? / | / Figure 1: First'
		);
		expect(fed[fed.length - 1]).toBe(seen[seen.length - 1]);
	});

	test(
		'in every chunk size, ending as the compiled page does',
		{ timeout: 20_000 },
		async () => {
			for (const name of Object.keys(DOCS)) {
				const page = await page_of(name);
				for (const chunk of [1, 3, 7, 40, 1000]) {
					const { html } = await streamed(DOCS[name], chunk);
					expect(html, `${name} ${chunk}`).toBe(page);
				}
			}
		}
	);

	test('a number never changes once it is shown', async () => {
		for (const chunk of [1, 5]) {
			const { seen } = await streamed(DOCS.forward, chunk);
			for (let i = 1; i < seen.length; i++) {
				const before = seen[i - 1].match(/\[[^\]]+\]\(#[^)]+\)/g) ?? [];
				for (const link of before) expect(seen[i], `${chunk}`).toContain(link);
			}
		}
	});

	test('the compiled page reads the same numbers', async () => {
		expect(read(await page_of('backward'))).toBe(
			'[Figure 1](#fig:a) / | / Figure 1: First'
		);
		expect(read(await page_of('revoked'))).toBe(
			'[Figure 1](#fig:a) / | / Figure 1: First'
		);
	});
});
