import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { citations } from '@mdsvex/plugin-citations';
import { mdsvex } from 'mdsvex';
import type { Component } from 'svelte';
import { createServer, createServerModuleRunner } from 'vite';
import type { ViteDevServer } from 'vite';
import type { ModuleRunner } from 'vite/module-runner';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const REFS = JSON.stringify([
	{
		id: 'lovelace1843',
		title: 'Notes on the Analytical Engine',
		author: [{ family: 'Lovelace', given: 'Ada' }],
		issued: { 'date-parts': [[1843]] },
	},
	{
		id: 'turing1936',
		title: 'On Computable Numbers',
		author: [{ family: 'Turing', given: 'Alan' }],
		issued: { 'date-parts': [[1936]] },
		DOI: '10.1112/plms/s2-42.1.230',
	},
	{
		id: 'babbage1864',
		title: 'Passages from the Life of a Philosopher',
		author: [{ family: 'Babbage', given: 'Charles' }],
		issued: { 'date-parts': [[1864]] },
	},
]);

/** documents streamed here and compiled as a page, by the name of their file */
const DOCS: Record<string, string> = {
	// the list is written before what it lists, so it has to grow after its block rendered
	growing: [
		'::bibliography[Works *cited*]',
		'',
		'Engines :cite[lovelace1843].',
		'',
		'Numbers :cite[turing1936, lovelace1843].',
		'',
		'A life :cite[babbage1864].',
		'',
	].join('\n'),
	two_lists: [
		':cite[turing1936]',
		'',
		'::bibliography',
		'',
		':cite[lovelace1843]',
		'',
		'::bibliography',
		'',
	].join('\n'),
	// an emphasis that never closes is revoked, the citations in it stay
	revoked:
		'::bibliography\n\n*open :cite[turing1936] and :cite[lovelace1843]\n',
	link: '::bibliography\n\n[open :cite[turing1936] and :cite[lovelace1843]\n',
	note: '::bibliography\n\n:note[open :cite[turing1936] and :cite[lovelace1843]\n',
	tight: '::bibliography\n\n- :cite[turing1936]\n- :cite[lovelace1843]\n',
	element: '::bibliography\n\n<span>:cite[turing1936]\n\n:cite[lovelace1843]\n',
};

/** the next turns of the event loop, where tasks settle */
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

let root: string;
let server: ViteDevServer;
let runner: ModuleRunner;
// one copy of svelte for the components, the stream and the render, as in an app
let m: {
	render: typeof import('svelte/server').render;
	parse: typeof import('@mdsvex/parse');
	stream: typeof import('@mdsvex/render/stream');
	Node: Component<any>;
	Bibliography: Component<any>;
	directives: Record<string, Component<any>>;
	plugin: typeof import('@mdsvex/plugin-citations');
};

beforeAll(async () => {
	const files: Record<string, string> = { 'src/refs.json': REFS };
	for (const [name, source] of Object.entries(DOCS))
		files[`src/${name}.svx`] = source;
	root = write_app(HERE, files, [PACKAGE]);
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
				plugins: [citations({ bibliography: join(root, 'src/refs.json') })],
				strict_directives: false,
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
		Bibliography: (
			await runner.import('@mdsvex/plugin-citations/Bibliography.svelte')
		).default,
		directives: await runner.import('@mdsvex/plugin-citations/directives'),
		plugin: await runner.import('@mdsvex/plugin-citations'),
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

/** a stream with the plugin as mdsvex gives it to the parser, the file comes from read */
function stream_of(
	read: () => Promise<string> = async () => REFS,
	style?: 'author-date'
): Stream {
	const bundle = m.plugin.citations({ bibliography: '/refs.json', style });
	return new m.stream.PluginStream({
		plugins: [{ name: bundle.name, ...bundle.parse! }],
		directive_handlers: [{ name: bundle.name, directives: bundle.directives! }],
		document: { filename: '/doc.svx', read },
	});
}

/** comments out, and the space between list items that a compiled page keeps and Node.svelte does not */
const clean = (html: string) =>
	html.replace(/<!--[^]*?-->/g, '').replace(/<\/li>\s+<li>/g, '</li><li>');

/** the document as Node.svelte renders it with the live data */
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

/** the document compiled as a page and rendered, what a batch compile shows */
async function page_of(name: string): Promise<string> {
	const page = await runner.import(`/src/${name}.svx`);
	return clean(m.render(page.default).body);
}

/** each item of each list in the html, its key, authors and back links, `-` for no list */
function lists_of(html: string): string {
	const lists = [...html.matchAll(/<section[^]*?<\/section>/g)].map(
		([section]) =>
			[...section.matchAll(/<li id="bib-([^"]+)">([^<]*)([^]*?)<\/li>/g)]
				.map(([, key, text, rest]) => {
					const back = [...rest.matchAll(/href="#(cite-\d+)"/g)];
					return `${key} ${text.trim()} ${back.map((b) => b[1]).join(',')}`;
				})
				.join(' | ')
	);
	return lists.length === 0 ? '-' : lists.join(' || ');
}

/** streams a document, the lists after each chunk, a state once, then what end leaves */
async function stream_lists(
	source: string,
	chunk: number,
	stream = stream_of()
): Promise<{ seen: string[]; html: string }> {
	const seen: string[] = [];
	const look = () => {
		const lists = lists_of(html_of(stream));
		if (seen[seen.length - 1] !== lists) seen.push(lists);
	};
	for (const batch of batches_of(source, chunk)) {
		stream.apply(batch);
		// a lookup lands a turn after its citation closes
		await turn();
		look();
	}
	await stream.end();
	look();
	return { seen, html: html_of(stream) };
}

const LOVELACE = 'lovelace1843 Ada Lovelace.';
const TURING = 'turing1936 Alan Turing.';
const BABBAGE = 'babbage1864 Charles Babbage.';
const ALL = `${LOVELACE} cite-1,cite-3 | ${TURING} cite-2 | ${BABBAGE} cite-4`;

describe('the list in a stream', () => {
	test('grows after each chunk as citations close and their entries load', async () => {
		const { seen } = await stream_lists(DOCS.growing, 3);
		expect(seen).toEqual([
			'-',
			`${LOVELACE} cite-1`,
			`${LOVELACE} cite-1,cite-3 | ${TURING} cite-2`,
			ALL,
		]);
	});

	// each chunk waits a timer, which a slow runner rounds up to its tick
	test(
		'in every chunk size, ending as the compiled page does',
		{ timeout: 20_000 },
		async () => {
			const page = await page_of('growing');
			expect(lists_of(page)).toBe(ALL);
			for (const chunk of [1, 2, 7, 40, 1000]) {
				const { seen, html } = await stream_lists(DOCS.growing, chunk);
				expect(html, String(chunk)).toBe(page);
				for (let i = 1; i < seen.length; i++)
					for (const item of seen[i - 1].split(' | ').slice(0, -1))
						expect(seen[i], String(chunk)).toContain(item);
			}
		}
	);

	test('an entry shows once its lookup lands, before the stream ends', async () => {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const stream = stream_of(() => gate.then(() => REFS));
		for (const batch of batches_of(DOCS.growing, 5)) {
			stream.apply(batch);
			await turn();
			expect(lists_of(html_of(stream))).toBe('-');
		}
		expect(stream.data.current?.citations?.cited).toHaveLength(4);
		open();
		await turn();
		await turn();
		expect(lists_of(html_of(stream))).toBe(ALL);
		await stream.end();
		expect(html_of(stream)).toBe(await page_of('growing'));
	});

	test('author-date sorts what has arrived', async () => {
		const { seen } = await stream_lists(
			DOCS.growing,
			4,
			stream_of(undefined, 'author-date')
		);
		const lovelace = 'lovelace1843 Ada Lovelace (1843).';
		const turing = 'turing1936 Alan Turing (1936). cite-2';
		const babbage = 'babbage1864 Charles Babbage (1864). cite-4';
		expect(seen).toEqual([
			'-',
			`${lovelace} cite-1`,
			`${lovelace} cite-1,cite-3 | ${turing}`,
			`${babbage} | ${lovelace} cite-1,cite-3 | ${turing}`,
		]);
	});

	test('a second list lists nothing while it streams, as when compiled', async () => {
		const { seen, html } = await stream_lists(DOCS.two_lists, 2);
		expect(seen).toEqual([
			'-',
			`${TURING} cite-1`,
			`${TURING} cite-1 | ${LOVELACE} cite-2`,
		]);
		expect(html).toBe(await page_of('two_lists'));
	});

	test(
		'a citation inside a construct that is revoked',
		{ timeout: 20_000 },
		async () => {
			const states = [
				'-',
				`${TURING} cite-1`,
				`${TURING} cite-1 | ${LOVELACE} cite-2`,
			];
			for (const name of ['revoked', 'link', 'note', 'tight', 'element']) {
				const page = await page_of(name);
				expect(lists_of(page), name).toBe(states[2]);
				for (const chunk of [1000, 3, 1]) {
					const { seen, html } = await stream_lists(DOCS[name], chunk);
					const order = seen.map((state) => states.indexOf(state));
					expect(order, `${name} ${chunk}`).toEqual(
						[...new Set(order)].filter((i) => i >= 0).sort()
					);
					expect(seen[seen.length - 1], `${name} ${chunk}`).toBe(states[2]);
					expect(html, `${name} ${chunk}`).toBe(page);
				}
			}
			expect((await stream_lists(DOCS.revoked, 1)).seen).toEqual(states);
		}
	);

	test('a lookup held while its emphasis is revoked lands once', async () => {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const stream = stream_of(() => gate.then(() => REFS));
		for (const batch of batches_of(DOCS.revoked, 2)) {
			stream.apply(batch);
			await turn();
			expect(lists_of(html_of(stream))).toBe('-');
		}
		open();
		await turn();
		await turn();
		expect(lists_of(html_of(stream))).toBe(
			`${TURING} cite-1 | ${LOVELACE} cite-2`
		);
		expect(stream.data.current?.citations?.cited).toEqual([
			'turing1936',
			'lovelace1843',
		]);
		await stream.end();
		expect(html_of(stream)).toBe(await page_of('revoked'));
	});
});

describe('the data the component reads', () => {
	const data = (cited: string[]) => {
		const out: Record<string, unknown> = { cited };
		for (const key of cited)
			out[`entry:${key}`] = { key, short: key, title: key };
		return out;
	};
	const context = (citations: unknown) =>
		new Map([[Symbol.for('mdsvex.plugin_data'), { current: { citations } }]]);
	const keys = (html: string) =>
		[...html.matchAll(/<li id="bib-([^"]+)"/g)].map((match) => match[1]);

	test('the context, when no data prop is given', () => {
		const { body } = m.render(m.Bibliography, {
			context: context(data(['a', 'b'])),
		});
		expect(keys(body)).toEqual(['a', 'b']);
	});

	test('a data prop wins over the context, as an object or json', () => {
		for (const given of [data(['c']), JSON.stringify(data(['c']))]) {
			const { body } = m.render(m.Bibliography, {
				props: { data: given },
				context: context(data(['a', 'b'])),
			});
			expect(keys(body)).toEqual(['c']);
		}
	});

	test('nothing with neither', () => {
		expect(clean(m.render(m.Bibliography).body)).toBe('');
		expect(
			clean(m.render(m.Bibliography, { context: context(undefined) }).body)
		).toBe('');
	});
});
