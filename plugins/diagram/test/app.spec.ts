import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diagram } from '@mdsvex/plugin-diagram';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import {
	createLogger,
	createServer,
	createServerModuleRunner,
	normalizePath,
} from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FILES = {
	'src/flow.svx': [
		'```mermaid title="Flow" caption="How it goes"',
		'graph TD',
		'  accTitle: How a page is built',
		'  A{Start} --> B',
		'```',
		'',
	].join('\n'),
	'src/broken.svx': ['```mermaid', 'graph TD', '  A --> B -->', '```', ''].join(
		'\n'
	),
};

/** what vite warned of, without colours */
const warned: string[] = [];

async function serve(root: string, main: Plugin[]): Promise<ViteDevServer> {
	const logger = createLogger('silent');
	logger.warn = (message) =>
		void warned.push(message.replace(/\u001b\[[0-9;]*m/g, ''));
	return createServer({
		root,
		configFile: false,
		customLogger: logger,
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

/** server render in a fresh runner, so no module evaluated before is reused */
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
		join(root, 'node_modules/@mdsvex/plugin-diagram/dist', file)
	);
}

describe('with pele in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(
			root,
			mdsvex({ plugins: [diagram({ engine: 'pele' })] })
		);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the server renders the drawn svg, with the source and the caption', async () => {
		const html = await ssr(server, '/src/flow.svx');
		expect(html).toMatch(
			/^<figure class="diagram diagram-pele"><figcaption class="diagram-title">Flow<\/figcaption> <div class="diagram-svg"><svg [^>]*class="pele pele-flowchart"/
		);
		expect(html).toContain(
			'<title id="diagram-title">How a page is built</title>'
		);
		expect(html).toMatch(
			/<details class="diagram-source"><summary>Diagram source<\/summary> <pre><code class="language-mermaid">graph TD/
		);
		expect(html).toMatch(
			/<div class="diagram-caption">How it goes<\/div><\/figure>$/
		);
		expect(warned.filter((m) => m.includes('no highlighter'))).toEqual([]);
	});

	test('a diagram that can not be drawn shows why and its source', async () => {
		const html = await ssr(server, '/src/broken.svx');
		expect(html).toMatch(
			/^<figure class="diagram diagram-pele">\s*<p class="diagram-error">The diagram could not be drawn: /
		);
		expect(html).not.toContain('<svg');
		expect(html).toContain('graph TD');
	});

	test('the client gets the component, which loads no library', async () => {
		const client = server.environments.client;
		const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
		expect(found?.id.replace(/\?.*$/, '')).toBe(installed(root, 'pele.js'));
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-diagram/dist/pele.js'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/diagram\.css"/);
		const component = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-diagram/dist/PeleDiagram.svelte'
		);
		expect(component?.code).toMatch(/svelte.internal.client/);
		expect(component?.code).not.toMatch(
			/from ["'][^"']*(pele|mermaid)[^"']*\/(dist|lib)/
		);
		expect(component?.code).not.toMatch(/import\(\s*["'][^"']*(pele|mermaid)/);
	});
});

describe('with mermaid in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(
			root,
			mdsvex({ plugins: [diagram({ engine: 'mermaid' })] })
		);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('the server renders the code in a figure, the diagram is drawn on the client', async () => {
		const html = await ssr(server, '/src/flow.svx');
		expect(html).toMatch(
			/^<figure class="diagram diagram-mermaid"><figcaption class="diagram-title">Flow<\/figcaption>\s*<pre><code class="language-mermaid">graph TD.*<div class="diagram-caption">How it goes<\/div><\/figure>$/s
		);
		expect(html).not.toContain('<svg');
		expect(warned.filter((m) => m.includes('no highlighter'))).toEqual([]);
	});

	test('the library is imported from the component, lazily, and only by its module', async () => {
		const client = server.environments.client;
		const component = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-diagram/dist/MermaidDiagram.svelte'
		);
		expect(component?.code).toMatch(/import\((["'])[^"']*mermaid[^"']*\1\)/);
		expect(component?.code).not.toMatch(/^import [^(]*mermaid/m);
		const pele = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-diagram/dist/pele.js'
		);
		expect(pele?.code).not.toContain('Mermaid');
	});
});
