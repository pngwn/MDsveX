import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { figures } from '@mdsvex/plugin-figures';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FILES = {
	'src/figures.svx': [
		':::figure[Sales by *month*](id=fig:sales)',
		'![A chart](./chart.png "A title")',
		':::',
		'',
		':::figure',
		'![No caption](/plain.png)',
		':::',
		'',
	].join('\n'),
	// as a numbering plugin would hand the figure its number
	'src/Numbered.svelte': [
		'<script>',
		"  import { setContext } from 'svelte';",
		"  import Doc from './figures.svx';",
		"  setContext(Symbol.for('mdsvex.plugin_data'), { current: { numbering: { 'target:fig:sales': { kind: 'fig', number: '3', text: 'Figure 3' } } } });",
		'</script>',
		'<Doc />',
	].join('\n'),
	'src/bare.svx': [
		':::figure(id=fig:bare)',
		'![Numbered](/n.png)',
		':::',
		'',
		':::figure[](id=fig:empty)',
		'![Empty brackets](/e.png)',
		':::',
		'',
		':::figure(id=fig:none)',
		'![Not numbered](/x.png)',
		':::',
		'',
	].join('\n'),
	'src/NumberedBare.svelte': [
		'<script>',
		"  import { setContext } from 'svelte';",
		"  import Doc from './bare.svx';",
		"  setContext(Symbol.for('mdsvex.plugin_data'), { current: { numbering: {",
		"    'target:fig:bare': { kind: 'fig', number: '2', text: 'Figure 2' },",
		"    'target:fig:empty': { kind: 'fig', number: '3', text: 'Figure 3' },",
		'  } } });',
		'</script>',
		'<Doc />',
	].join('\n'),
	'src/chart.png': '',
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
		join(root, 'node_modules/@mdsvex/plugin-figures/dist', file)
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(
			root,
			mdsvex({ unwrap_images: true, plugins: [figures()] })
		);
	});

	afterAll(async () => {
		await server?.close();
		rmSync(root, { recursive: true, force: true });
	});

	test('a figure holds its content and the label is the caption', async () => {
		expect(await ssr(server, '/src/figures.svx')).toBe(
			'<figure class="figure" id="fig:sales"><img src="/src/chart.png" alt="A chart" title="A title"/> ' +
				'<figcaption class="figure-caption">Sales by <strong>month</strong></figcaption></figure>' +
				'<figure class="figure"><img src="/plain.png" alt="No caption"/> </figure>'
		);
	});

	test('a number in the plugin data of a numbering plugin goes in front of the caption', async () => {
		expect(await ssr(server, '/src/Numbered.svelte')).toContain(
			'<figcaption class="figure-caption"><span class="figure-number">Figure 3</span>: Sales by <strong>month</strong></figcaption>'
		);
	});

	test('a numbered figure with no caption has the number alone as its caption', async () => {
		expect(await ssr(server, '/src/NumberedBare.svelte')).toBe(
			'<figure class="figure" id="fig:bare"><img src="/n.png" alt="Numbered"/> ' +
				'<figcaption class="figure-caption"><span class="figure-number">Figure 2</span></figcaption></figure>' +
				'<figure class="figure" id="fig:empty"><img src="/e.png" alt="Empty brackets"/> ' +
				'<figcaption class="figure-caption"><span class="figure-number">Figure 3</span></figcaption></figure>' +
				'<figure class="figure" id="fig:none"><img src="/x.png" alt="Not numbered"/> </figure>'
		);
	});

	test('the client gets the component and its stylesheet', async () => {
		const client = server.environments.client;
		const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
		expect(found?.id.replace(/\?.*$/, '')).toBe(
			installed(root, 'directives.js')
		);
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-figures/dist/directives.js'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/figures\.css"/);
	});
});
