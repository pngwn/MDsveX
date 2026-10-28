import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { elements } from '@mdsvex/plugin-elements';
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
	'src/marks.svx':
		'A :mark[_hot_ take], :ins[an addition](datetime=2026-10-28, cite=https://example.com/a), :ins[plain] and :abbr[HTML](title="HyperText Markup Language").\n',
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
		join(root, 'node_modules/@mdsvex/plugin-elements/dist', file)
	);
}

describe('in a vite app', () => {
	let root: string;
	let server: ViteDevServer;

	beforeAll(async () => {
		root = write_app(HERE, FILES, [PACKAGE]);
		server = await serve(root, mdsvex({ plugins: [elements()] }));
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

	test('marks, insertions and abbreviations are the native elements', async () => {
		expect(await ssr(server, '/src/marks.svx')).toBe(
			'<p>A <mark class="mark"><em>hot</em> take</mark>, ' +
				'<ins class="ins" datetime="2026-10-28" cite="https://example.com/a">an addition</ins>, ' +
				'<ins class="ins">plain</ins> and ' +
				'<abbr class="abbr" title="HyperText Markup Language">HTML</abbr>.</p>'
		);
	});

	test('the client gets the components and the stylesheet', async () => {
		const client = server.environments.client;
		const entry = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-elements/dist/directives.js'
		);
		expect(entry?.code).toMatch(/import ".*\/dist\/elements\.css"/);
		const css = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-elements/dist/elements.css'
		);
		expect(css?.code).toContain('.accordion');
		expect(css?.code).toContain('.mark');
		const details = await client.transformRequest(
			'/node_modules/@mdsvex/plugin-elements/dist/Details.svelte'
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
			mdsvex({ plugins: [elements({ css: false })] })
		);
		try {
			const client = server.environments.client;
			const found = await client.pluginContainer.resolveId('mdsvex:plugin/0');
			expect(found?.id.replace(/\?.*$/, '')).toBe(
				installed(root, 'unstyled.js')
			);
			const entry = await client.transformRequest(
				'/node_modules/@mdsvex/plugin-elements/dist/unstyled.js'
			);
			expect(entry?.code).not.toContain('.css');
		} finally {
			await server.close();
		}
	});

	test('a kbd exported by the site replaces the component', async () => {
		const server = await serve(
			root,
			mdsvex({ plugins: [elements()], components: '#lib/markdown.js' })
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
