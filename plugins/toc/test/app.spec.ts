import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { toc } from '@mdsvex/plugin-toc';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { compile, mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const DOC = [
	'# Title',
	'',
	'::toc[On *this* page]',
	'',
	'## Install',
	'',
	'### With `pnpm`',
	'',
	'### With npm',
	'',
	'## Configure & run',
	'',
].join('\n');

const FILES = {
	'src/doc.svx': DOC,
	'src/short.svx': '::toc(max_depth=2, class=side)\n\n## One\n\n### Two\n',
	'src/empty.svx': '::toc[Nothing]\n\ntext\n',
	'src/posts/post.svx':
		'---\ntemplate: post\n---\n\n# Post\n\n## First\n\n#### Deep\n\n## Second\n',
	'src/posts/bare.svx': '---\ntemplate: post\n---\n\ntext\n',
	'src/Post.svelte': [
		'<script>',
		"  import Toc from '@mdsvex/plugin-toc/Toc.svelte';",
		'  let { plugin_data, children } = $props();',
		'</script>',
		'<aside><Toc headings={plugin_data?.toc?.headings} aria-label="On this page" /></aside>',
		'<main>{@render children()}</main>',
	].join('\n'),
	'src/Tree.svelte': [
		'<script>',
		"  import { toc_tree } from '@mdsvex/plugin-toc';",
		"  import { plugin_data } from './doc.svx';",
		'  const tree = toc_tree(plugin_data.toc.headings);',
		'</script>',
		'{#each tree as node}<b>{node.text}: {node.children.length}</b>{/each}',
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

/**
 * server render in a fresh runner, so no module evaluated before is reused,
 * the ids of a component are numbered from s1 in each render
 */
async function ssr(server: ViteDevServer, url: string): Promise<string> {
	const runner = createServerModuleRunner(server.environments.ssr, {
		hmr: false,
	});
	try {
		// the component and the renderer must share one svelte instance
		const { render } = await runner.import('svelte/server');
		const mod = await runner.import(url);
		return render(mod.default).body.replace(/<!--[^]*?-->/g, '');
	} finally {
		await runner.close();
	}
}

/** the package as installed, a copy of what it publishes */
function installed(root: string, file: string): string {
	return normalizePath(
		join(root, 'node_modules/@mdsvex/plugin-toc/dist', file)
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(
			root,
			mdsvex({
				heading_ids: true,
				plugins: [toc()],
				templates: { post: './src/Post.svelte' },
			})
		);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the module resolves to the installed package, in both environments', async () => {
		for (const env of [server.environments.client, server.environments.ssr]) {
			const found = await env.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'directives.js')
			);
			expect(found?.external).toBeFalsy();
		}
	});

	test('::toc renders a nested list of links, named by its label', async () => {
		expect(await ssr(server, '/src/doc.svx')).toBe(
			'<h1 id="title">Title</h1>' +
				'<nav aria-labelledby="s1-label" class="toc">' +
				'<p class="toc-label" id="s1-label">On <strong>this</strong> page</p>' +
				'<ul>' +
				'<li><a href="#install">Install</a>' +
				'<ul>' +
				'<li><a href="#with-pnpm">With pnpm</a></li>' +
				'<li><a href="#with-npm">With npm</a></li>' +
				'</ul>' +
				'</li>' +
				'<li><a href="#configure--run">Configure &amp; run</a></li>' +
				'</ul>' +
				'</nav>' +
				'<h2 id="install">Install</h2>' +
				'<h3 id="with-pnpm">With <code>pnpm</code></h3>' +
				'<h3 id="with-npm">With npm</h3>' +
				'<h2 id="configure--run">Configure &amp; run</h2>'
		);
	});

	test('its args narrow the list and the others are attributes of the nav', async () => {
		expect(await ssr(server, '/src/short.svx')).toBe(
			'<nav class="toc side"><ul><li><a href="#one">One</a></li></ul></nav>' +
				'<h2 id="one">One</h2><h3 id="two">Two</h3>'
		);
	});

	test('with nothing to list it renders nothing', async () => {
		expect(await ssr(server, '/src/empty.svx')).toBe('<p>text</p>');
	});

	test('a template renders the component from the plugin_data prop', async () => {
		expect(await ssr(server, '/src/posts/post.svx')).toBe(
			'<aside>' +
				'<nav aria-label="On this page" class="toc">' +
				'<ul>' +
				'<li><a href="#first">First</a></li>' +
				'<li><a href="#second">Second</a></li>' +
				'</ul>' +
				'</nav>' +
				'</aside> ' +
				'<main><h1 id="post">Post</h1><h2 id="first">First</h2><h4 id="deep">Deep</h4><h2 id="second">Second</h2></main>'
		);
		expect(await ssr(server, '/src/posts/bare.svx')).toBe(
			'<aside></aside> <main><p>text</p></main>'
		);
	});

	test('toc_tree nests the exported list', async () => {
		expect(await ssr(server, '/src/Tree.svelte')).toBe(
			'<b>Install: 2</b><b>Configure &amp; run: 0</b>'
		);
	});

	test('a ?data import has the list without a render', async () => {
		const runner = createServerModuleRunner(server.environments.ssr, {
			hmr: false,
		});
		try {
			const { posts } = await runner.import('/src/list.js');
			expect(Object.keys(posts)).toEqual([
				'./posts/bare.svx',
				'./posts/post.svx',
			]);
			expect(posts['./posts/bare.svx']).toBeUndefined();
			expect(
				posts['./posts/post.svx'].toc.headings.map(
					(heading: { id: string }) => heading.id
				)
			).toEqual(['first', 'second']);
		} finally {
			await runner.close();
		}
	});

	test('the client gets the component and none of the compiler', async () => {
		const client = server.environments.client;
		const doc = await client.transformRequest('/src/doc.svx');
		expect(doc?.code).toMatch(
			/import \{ toc as Toc_MDSVEX_D_G \} from "\/node_modules\/@mdsvex\/plugin-toc\/dist\/directives\.js(\?[^"]*)?";/
		);
		const component = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-toc/dist/Toc.svelte'
		);
		expect(component?.code).toMatch(/svelte.internal.client/);
		expect(component?.code).toMatch(/from ".*\/dist\/tree\.js/);
		for (const file of ['index.js', 'tree.js']) {
			const module = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-toc/dist/' + file
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
			const entry = require.resolve('@mdsvex/plugin-toc');
			expect(entry).toBe(
				join(root, 'node_modules', '@mdsvex', 'plugin-toc', 'dist', 'index.js')
			);
			const published = await import(pathToFileURL(entry).href);
			const { data } = compile('## A\n', {
				heading_ids: true,
				plugins: [published.toc()],
			});
			expect((data!.toc as any).headings[0].id).toBe('a');
			expect(published.toc_tree([{ depth: 2, id: 'a', text: 'A' }])).toEqual([
				{ depth: 2, id: 'a', text: 'A', children: [] },
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
