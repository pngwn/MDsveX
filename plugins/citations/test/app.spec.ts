import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { citations } from '@mdsvex/plugin-citations';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { compile_async, mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
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
		'container-title': 'Scientific Memoirs',
		volume: 3,
		page: '666-731',
	},
	{
		id: 'turing1936',
		title: 'On Computable Numbers',
		author: [{ family: 'Turing', given: 'Alan' }],
		issued: { 'date-parts': [[1936]] },
		DOI: '10.1112/plms/s2-42.1.230',
	},
]);

const FILES = {
	'src/refs.json': REFS,
	'src/doc.svx': [
		'---',
		'bibliography: ./refs.json',
		'---',
		'',
		'Engines :cite[lovelace1843, turing1936] and :cite[lovelace1843].',
		'',
		'::bibliography[Works *cited*]',
		'',
	].join('\n'),
	'src/unknown.svx':
		'---\nbibliography: ./refs.json\n---\n\nSee :cite[nope].\n',
	'src/posts/post.svx': [
		'---',
		'template: post',
		'bibliography: ../refs.json',
		'---',
		'',
		'Text :cite[turing1936].',
		'',
	].join('\n'),
	'src/Post.svelte': [
		'<script>',
		"  import Bibliography from '@mdsvex/plugin-citations/Bibliography.svelte';",
		'  let { plugin_data, children } = $props();',
		'</script>',
		'<main>{@render children()}</main>',
		'<Bibliography data={plugin_data?.citations} style="author-date" />',
	].join('\n'),
	'src/list.js':
		"export const posts = import.meta.glob('./posts/*.svx', { query: '?data', import: 'plugin_data', eager: true });\n",
};

async function serve(root: string, main: Plugin[]): Promise<ViteDevServer> {
	return createServer({
		root,
		configFile: false,
		logLevel: 'silent',
		appType: 'custom',
		cacheDir: join(root, '.vite'),
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true, hmr: false, watch: null },
		plugins: [
			main,
			svelte({ configFile: false, extensions: ['.svelte', '.svx'] }),
		],
	});
}

/** server render in a fresh runner, the ids of a component are numbered from s1 in each render */
async function ssr(server: ViteDevServer, url: string): Promise<string> {
	const runner = createServerModuleRunner(server.environments.ssr, {
		hmr: false,
	});
	try {
		const { render } = await runner.import('svelte/server');
		const mod = await runner.import(url);
		return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
	} finally {
		await runner.close();
	}
}

const LOVELACE =
	'Ada Lovelace. <cite>Notes on the Analytical Engine.</cite> Scientific Memoirs 3, 666-731. 1843.';
const TURING =
	'Alan Turing. <cite>On Computable Numbers.</cite> 1936. <a href="https://doi.org/10.1112/plms/s2-42.1.230">https://doi.org/10.1112/plms/s2-42.1.230</a>';

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;
	let plugins: Plugin[];

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		plugins = mdsvex({
			plugins: [citations()],
			templates: { post: './src/Post.svelte' },
		});
		server = await serve(root, plugins);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('citations link to the list and the list links back to each of them', async () => {
		expect(await ssr(server, '/src/doc.svx')).toBe(
			'<p>Engines <span class="citation">[' +
				'<a href="#bib-lovelace1843" id="cite-1" role="doc-biblioref">1</a>, ' +
				'<a href="#bib-turing1936" id="cite-2" role="doc-biblioref">2</a>]</span>' +
				' and <span class="citation">[<a href="#bib-lovelace1843" id="cite-3" role="doc-biblioref">1</a>]</span>.</p>' +
				'<section role="doc-bibliography" aria-labelledby="s1-label" class="bibliography">' +
				'<p class="bibliography-label" id="s1-label">Works <strong>cited</strong></p>' +
				'<ol>' +
				`<li id="bib-lovelace1843">${LOVELACE}` +
				' <a href="#cite-1" role="doc-backlink" aria-label="Back to citation 1">↩︎</a>' +
				' <a href="#cite-3" role="doc-backlink" aria-label="Back to citation 3">↩︎</a></li>' +
				`<li id="bib-turing1936">${TURING}` +
				' <a href="#cite-2" role="doc-backlink" aria-label="Back to citation 2">↩︎</a></li>' +
				'</ol>' +
				'</section>'
		);
	});

	test('an unknown key shows as written, with no link', async () => {
		expect(await ssr(server, '/src/unknown.svx')).toBe(
			'<p>See <span class="citation">[nope]</span>.</p>'
		);
	});

	test('a template renders the list from the plugin_data prop', async () => {
		expect(await ssr(server, '/src/posts/post.svx')).toBe(
			'<main><p>Text <span class="citation">[<a href="#bib-turing1936" id="cite-1" role="doc-biblioref">1</a>]</span>.</p></main> ' +
				'<section role="doc-bibliography" aria-label="References" class="bibliography"><ul>' +
				'<li id="bib-turing1936">Alan Turing (1936). <cite>On Computable Numbers.</cite> ' +
				'<a href="https://doi.org/10.1112/plms/s2-42.1.230">https://doi.org/10.1112/plms/s2-42.1.230</a>' +
				' <a href="#cite-1" role="doc-backlink" aria-label="Back to citation 1">↩︎</a></li>' +
				'</ul></section>'
		);
	});

	test('a ?data import has the entries without a render', async () => {
		const runner = createServerModuleRunner(server.environments.ssr, {
			hmr: false,
		});
		try {
			const { posts } = await runner.import('/src/list.js');
			expect(posts['./posts/post.svx'].citations.cited).toEqual(['turing1936']);
			expect(
				posts['./posts/post.svx'].citations['entry:turing1936'].short
			).toBe('Turing');
		} finally {
			await runner.close();
		}
	});

	test('a change to the file compiles the documents that cite from it again', async () => {
		const ssr_env = server.environments.ssr;
		expect((await ssr_env.transformRequest('/src/doc.svx'))!.code).toContain(
			'Notes on the Analytical Engine'
		);
		const file = normalizePath(join(root, 'src/refs.json'));
		const changed = REFS.replace(
			'Notes on the Analytical Engine',
			'Sketch of the Engine'
		);
		writeFileSync(file, changed);
		try {
			ssr_env.moduleGraph.onFileChange(file);
			const hot = plugins[0].hotUpdate as Function;
			const modules = await hot.call(
				{ environment: ssr_env },
				{
					type: 'update',
					file,
					timestamp: Date.now(),
					modules: [],
					read: async () => changed,
					server,
				}
			);
			expect((modules ?? []).map((m: any) => m.id)).toContain(
				normalizePath(join(root, 'src/doc.svx'))
			);
			expect((await ssr_env.transformRequest('/src/doc.svx'))!.code).toContain(
				'Sketch of the Engine'
			);
		} finally {
			writeFileSync(file, REFS);
		}
	});

	test('the client gets the components and none of the compiler', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/doc.svx');
		expect(doc?.code).toMatch(
			/import \{\s*cite as Cite_MDSVEX_D_G,\s*bibliography as Bibliography_MDSVEX_D_G\s*\} from "\/node_modules\/@mdsvex\/plugin-citations\/dist\/directives\.js(\?[^"]*)?";/
		);
		const component = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-citations/dist/Bibliography.svelte'
		);
		expect(component?.code).toMatch(/svelte.internal.client/);
		expect(component?.code).toMatch(/from ".*\/dist\/list\.js/);
		for (const file of ['index.js', 'list.js', 'csl.js']) {
			const module = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-citations/dist/' + file
			);
			expect(module?.code).not.toMatch(/from ["']mdsvex/);
		}
	});
});

describe('as published', () => {
	test('the files it publishes are the ones its exports name', async () => {
		const root = write_app(HERE, {}, [PACKAGE]);
		try {
			const require = createRequire(join(root, 'index.js'));
			const entry = require.resolve('@mdsvex/plugin-citations');
			expect(entry).toBe(
				join(
					root,
					'node_modules',
					'@mdsvex',
					'plugin-citations',
					'dist',
					'index.js'
				)
			);
			const published = await import(pathToFileURL(entry).href);
			const { data } = await compile_async(':cite[a]\n', {
				filename: '/doc.svx',
				plugins: [published.citations({ bibliography: '/refs.json' })],
				read: async () => '[{"id":"a","title":"A"}]',
			});
			expect(published.bibliography_of(data!.citations)[0].label).toBe('1');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
