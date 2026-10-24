import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { figures, kit } from '@mdsvex/plugin-kit';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { createServer, createServerModuleRunner, normalizePath } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { write_app } from '../../test/app';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = dirname(HERE);

const FILES = {
	'src/details.svx': [
		':::details[More *info*]',
		'Hidden.',
		':::',
		'',
		':::details[Open](open=true)',
		':::',
		'',
	].join('\n'),
	'src/accordion.svx': [
		':::accordion[FAQ](name=faq)',
		'## One',
		'',
		'Body.',
		'',
		'## Two',
		':::',
		'',
	].join('\n'),
	'src/inline.svx':
		'Press :kbd[Ctrl]+:kbd[C], read :ruby[漢字](rt=かんじ), see :badge[new](tone=tip).\n',
	'src/embeds.svx': [
		'::youtube[A *talk*](id=dQw4w9WgXcQ, start=30)',
		'',
		'::vimeo[A film](id=76979871)',
		'',
		'::youtube[No id]',
		'',
	].join('\n'),
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
		"  setContext(Symbol.for('mdsvex.plugin_data'), { current: { numbering: { targets: [{ id: 'fig:sales', kind: 'fig', number: 3 }] } } });",
		'</script>',
		'<Doc />',
	].join('\n'),
	'src/chart.png': '',
	'src/lib/markdown.js': "export * as directives from './directives.js';",
	'src/lib/directives.js': "export { default as kbd } from './MyKbd.svelte';",
	'src/lib/MyKbd.svelte': [
		'<script>',
		'  let { children } = $props();',
		'</script>',
		'<kbd class="mine">{@render children?.()}</kbd>',
	].join('\n'),
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
		join(root, 'node_modules/@mdsvex/plugin-kit/dist', file)
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(root, mdsvex({ plugins: [kit()] }));
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

	test('details render as details, open when asked', async () => {
		expect(await ssr(server, '/src/details.svx')).toBe(
			'<details class="details">' +
				'<summary class="details-summary">More <strong>info</strong></summary> ' +
				'<div class="details-body"><p>Hidden.</p></div>' +
				'</details>' +
				'<details class="details" open="">' +
				'<summary class="details-summary">Open</summary> ' +
				'<div class="details-body"></div>' +
				'</details>'
		);
	});

	test('an accordion is a set of details that share a name', async () => {
		expect(await ssr(server, '/src/accordion.svx')).toBe(
			'<p class="accordion-label">FAQ</p>' +
				'<div class="accordion">' +
				'<details class="details" name="faq">' +
				'<summary class="details-summary">One</summary> ' +
				'<div class="details-body"><p>Body.</p></div>' +
				'</details>' +
				'<details class="details" name="faq">' +
				'<summary class="details-summary">Two</summary> ' +
				'<div class="details-body"></div>' +
				'</details>' +
				'</div>'
		);
	});

	test('keys, ruby and badges render inline', async () => {
		expect(await ssr(server, '/src/inline.svx')).toBe(
			'<p>Press <kbd class="kbd">Ctrl</kbd>+<kbd class="kbd">C</kbd>, ' +
				'read <ruby class="ruby">漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby>, ' +
				'see <span class="badge" data-tone="tip">new</span>.</p>'
		);
	});

	test('embeds are lazy frames named by their label', async () => {
		const html = await ssr(server, '/src/embeds.svx');
		expect(html).toBe(
			'<div class="embed embed-youtube"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30" title="A talk" loading="lazy" ' +
				'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
				'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe></div>' +
				'<div class="embed embed-vimeo"><iframe src="https://player.vimeo.com/video/76979871?dnt=1" title="A film" loading="lazy" ' +
				'allow="autoplay; fullscreen; picture-in-picture; clipboard-write" ' +
				'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe></div>' +
				'<p>No id</p>'
		);
	});

	test('the client gets the components and the stylesheet', async () => {
		const client = server.environments.client;
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-kit/dist/directives.js'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/kit\.css"/);
		const css = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-kit/dist/kit.css'
		);
		expect(css?.code).toContain('.accordion');
		const details = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-kit/dist/Details.svelte'
		);
		expect(details?.code).toMatch(/svelte.internal.client/);
	});
});

describe('in a vite app with options', () => {
	let root: string;

	beforeAll(() => {
		root = write_app(HERE, FILES, [PACKAGE]);
	});

	afterAll(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('css false leaves the stylesheet out', async () => {
		const server = await serve(
			root,
			mdsvex({ plugins: [kit({ css: false })] })
		);
		try {
			const client = server.environments.client;
			const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'unstyled.js')
			);
			const entry = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-kit/dist/unstyled.js'
			);
			expect(entry?.code).not.toContain('.css');
		} finally {
			await server.close();
		}
	});

	test('a kbd exported by the site replaces the component', async () => {
		const server = await serve(
			root,
			mdsvex({ plugins: [kit()], components: '#lib/markdown.js' })
		);
		try {
			expect(await ssr(server, '/src/inline.svx')).toContain(
				'Press <kbd class="mine">Ctrl</kbd>+<kbd class="mine">C</kbd>, read <ruby class="ruby">'
			);
		} finally {
			await server.close();
		}
	});
});

describe('figures in a vite app', () => {
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

	test('the client gets the component and its stylesheet', async () => {
		const client = server.environments.client;
		const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
		expect(found?.id.replace(/\?.*$/, '')).toBe(installed(root, 'figures.js'));
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-kit/dist/figures.js'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/figures\.css"/);
	});
});
